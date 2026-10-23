import React from 'react';
import { Alert, AppState, type AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import MockAdapter from 'axios-mock-adapter';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { UserPlant } from '@plantcare/shared';

import { api } from '../api/client';
import { AuthProvider } from '../auth/AuthProvider';
import { clearTokens, saveTokens } from '../auth/session';
import { changeLanguage, initI18n } from '../i18n';
import { resetCapWarning } from '../reminders/sync';
import { MY_PLANTS_CACHE_KEY } from '../plants/myPlantsCache';
import { accountFixture, userPlantFixture } from '../plants/testFixtures';
import { MyPlants } from './MyPlants';

const mockNavigate = jest.fn();

jest.mock('react-native-svg', () => {
  const { createElement } = jest.requireActual<typeof import('react')>('react');
  return { SvgFromUri: (props: object) => createElement('SvgFromUri', { testID: 'plant-illustration', ...props }) };
});

jest.mock('@react-navigation/native', () => {
  const { useEffect } = jest.requireActual<typeof import('react')>('react');
  return {
    ...jest.requireActual<object>('@react-navigation/native'),
    useNavigation: () => ({ navigate: mockNavigate, goBack: jest.fn() }),
    useFocusEffect: (effect: () => void) => useEffect(effect, [effect]),
  };
});

let mock: MockAdapter;

// Only the clock is fake; timers, promises and animations run for real.
function setToday(date: Date) {
  jest.useFakeTimers({
    doNotFake: [
      'nextTick',
      'setImmediate',
      'setTimeout',
      'clearTimeout',
      'setInterval',
      'clearInterval',
      'queueMicrotask',
      'requestAnimationFrame',
      'cancelAnimationFrame',
    ],
  });
  jest.setSystemTime(date);
}

beforeAll(initI18n);

beforeEach(async () => {
  // Wednesday 2026-10-21: the fixture (Mondays and Thursdays) has nothing due, so its name shows once.
  setToday(new Date(2026, 9, 21, 12, 0));
  mock = new MockAdapter(api);
  mockNavigate.mockClear();
  resetCapWarning();
  await clearTokens();
  await AsyncStorage.clear();
  await changeLanguage('en');
});

afterEach(() => {
  mock.restore();
  jest.restoreAllMocks();
  jest.useRealTimers();
});

function renderScreen() {
  return render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <AuthProvider>
        <MyPlants />
      </AuthProvider>
    </SafeAreaProvider>,
  );
}

async function signIn() {
  await saveTokens({ accessToken: 'acc', refreshToken: 'ref' });
  mock.onGet('/me').reply(200, accountFixture);
}

describe('MyPlants', () => {
  it('shows the species name, not the nickname, and caches the list', async () => {
    await signIn();
    mock.onGet('/me/plants').reply(200, [userPlantFixture]);
    renderScreen();

    expect(await screen.findAllByText('Monstera')).not.toHaveLength(0);
    expect(await screen.findByText('Nothing to water today 🌱')).toBeTruthy();
    expect(screen.getByText('Next: Monstera tomorrow at 09:30')).toBeTruthy();
    expect(screen.queryByText(/Pikachu/)).toBeNull();
    await waitFor(async () =>
      expect(await AsyncStorage.getItem(MY_PLANTS_CACHE_KEY)).toContain('Pikachu'),
    );
  });

  it('shows the cached list with the offline notice and no remove action when unreachable', async () => {
    await signIn();
    await AsyncStorage.setItem(MY_PLANTS_CACHE_KEY, JSON.stringify([userPlantFixture]));
    mock.onGet('/me/plants').networkError();
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    renderScreen();

    expect(
      await screen.findByText('Showing your last synced plants. Changes need a connection.'),
    ).toBeTruthy();
    expect(screen.getByText('Monstera')).toBeTruthy();
    expect(screen.queryByLabelText('Remove')).toBeNull();

    fireEvent.press(screen.getByText('Monstera'));
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(alert).toHaveBeenCalledWith(
      'Showing your last synced plants. Changes need a connection.',
    );
  });

  it('opens the plant detail when online', async () => {
    await signIn();
    mock.onGet('/me/plants').reply(200, [userPlantFixture]);
    renderScreen();

    fireEvent.press(await screen.findByText('Monstera'));

    expect(mockNavigate).toHaveBeenCalledWith('PlantDetail', { userPlantId: 'p1' });
  });

  it('removes a plant after the confirm dialog', async () => {
    await signIn();
    mock.onGet('/me/plants').reply(200, [userPlantFixture]);
    mock.onDelete('/me/plants/p1').reply(204);
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    renderScreen();

    fireEvent.press(await screen.findByLabelText('Remove'));
    const buttons = alert.mock.calls[0]?.[2];
    buttons?.find((b) => b.text === 'Remove')?.onPress?.();

    await waitFor(() => expect(screen.queryByText('Monstera')).not.toBeOnTheScreen(), {
      timeout: 5000,
    });
    expect(mock.history.delete[0]?.headers?.['Content-Type']).toBeUndefined();
  });

  it('gives a plant photo the Authorization header and a cache key with the photo version', async () => {
    await signIn();
    const plant = { ...userPlantFixture, hasPhoto: true, photoVersion: '2026-10-22T10:00:00.000Z' };
    mock.onGet('/me/plants').reply(200, [plant]);
    renderScreen();

    const photo = await screen.findByTestId('plant-photo');
    expect(photo.props.source).toEqual(
      expect.objectContaining({
        headers: { Authorization: 'Bearer acc' },
        cacheKey: 'p1-2026-10-22T10:00:00.000Z',
      }),
    );
  });

  it('shows a Sign in prompt when signed out', async () => {
    renderScreen();

    fireEvent.press(await screen.findByText('Sign in'));

    expect(mockNavigate).toHaveBeenCalledWith('Auth', { mode: 'signIn' });
    expect(mock.history.get).toHaveLength(0);
  });

  it('shows an error with Retry on a server error', async () => {
    await signIn();
    mock.onGet('/me/plants').replyOnce(500, { error: { code: 'internal', message: 'boom' } });
    mock.onGet('/me/plants').reply(200, [userPlantFixture]);
    renderScreen();

    fireEvent.press(await screen.findByText('Try again'));

    expect(await screen.findByText('Monstera')).toBeTruthy();
  });

  it('keeps the card and says so when the delete fails', async () => {
    await signIn();
    mock.onGet('/me/plants').reply(200, [userPlantFixture]);
    mock.onDelete('/me/plants/p1').reply(500, { error: { code: 'internal', message: 'boom' } });
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    renderScreen();

    fireEvent.press(await screen.findByLabelText('Remove'));
    alert.mock.calls[0]?.[2]?.find((b) => b.text === 'Remove')?.onPress?.();

    await waitFor(() =>
      expect(alert).toHaveBeenCalledWith("Couldn't remove the plant. Try again."),
    );
    expect(screen.getByText('Monstera')).toBeTruthy();
  });

  it('retries a failed photo once with a fresh token, then the illustration, then the mascot', async () => {
    await signIn();
    const plant = {
      ...userPlantFixture,
      hasPhoto: true,
      photoVersion: 'v1',
      imageUrl: '/img/monstera.svg',
    };
    mock.onGet('/me/plants').reply(200, [plant]);
    renderScreen();

    const photo = await screen.findByTestId('plant-photo');
    // The launch sync and the screen's own load have both finished.
    await waitFor(() =>
      expect(mock.history.get.filter((r) => r.url === '/me/plants')).toHaveLength(2),
    );
    // The retry's list call finds the token expired; the client refreshes it.
    mock.resetHandlers();
    mock.onGet('/me/plants').replyOnce(401, { error: { code: 'unauthorized', message: 'x' } });
    mock.onPost('/auth/refresh').reply(200, {
      accessToken: 'new-a',
      refreshToken: 'new-r',
      user: accountFixture,
    });
    mock.onGet('/me/plants').reply(200, [plant]);

    await act(async () => photo.props.onError());
    await waitFor(() =>
      expect(screen.getByTestId('plant-photo').props.source.headers).toEqual({
        Authorization: 'Bearer new-a',
      }),
    );
    expect(screen.queryByTestId('plant-illustration')).toBeNull();

    await act(async () => screen.getByTestId('plant-photo').props.onError());
    const illustration = await screen.findByTestId('plant-illustration');
    expect(screen.queryByTestId('plant-photo')).toBeNull();

    await act(async () => illustration.props.onError());
    expect(await screen.findByTestId('plant-mascot')).toBeTruthy();
  });

  it('goes straight to the illustration when the retry brings no new token', async () => {
    await signIn();
    const plant = { ...userPlantFixture, hasPhoto: true, photoVersion: 'v1', imageUrl: '/img/m.svg' };
    mock.onGet('/me/plants').reply(200, [plant]);
    renderScreen();

    const photo = await screen.findByTestId('plant-photo');
    await act(async () => photo.props.onError());

    expect(await screen.findByTestId('plant-illustration')).toBeTruthy();
    expect(screen.queryByTestId('plant-photo')).toBeNull();
  });
});

describe('MyPlants Today card', () => {
  const today = '2026-10-22';
  const daily = { times: 1, per: 'day' } as const;
  // Monstera (Mondays and Thursdays, 09:30) is late at noon; Cactus is done; Imbé is still to come.
  const monstera = userPlantFixture;
  const cactus: UserPlant = {
    ...userPlantFixture,
    id: 'p2',
    speciesName: 'Cactus',
    frequency: daily,
    reminderTime: '13:00',
    lastWateredOn: today,
  };
  const imbe: UserPlant = {
    ...userPlantFixture,
    id: 'p3',
    speciesName: 'Imbé',
    frequency: daily,
    reminderTime: '18:30',
  };

  beforeEach(() => {
    // Thursday 2026-10-22, noon.
    setToday(new Date(2026, 9, 22, 12, 0));
  });

  async function card() {
    return within(await screen.findByTestId('today-card'));
  }

  async function row(name: string) {
    const rows = (await card()).getAllByTestId('today-row');
    const found = rows.find((r) => within(r).queryByText(name));
    if (!found) throw new Error(`no row for ${name}`);
    return within(found);
  }

  it('lists today\'s plants in time order with their times and progress', async () => {
    await signIn();
    mock.onGet('/me/plants').reply(200, [imbe, cactus, monstera]);
    renderScreen();

    const todayCard = await card();
    expect(todayCard.getAllByTestId('today-name').map((name) => name.props.children)).toEqual([
      'Monstera',
      'Cactus',
      'Imbé',
    ]);
    expect(todayCard.getAllByTestId('today-time').map((time) => time.props.children)).toEqual([
      '09:30',
      '13:00',
      '18:30',
    ]);
    expect(todayCard.getByText('1 of 3')).toBeOnTheScreen();
  });

  it('shows "late" only on the unticked row whose time has passed', async () => {
    await signIn();
    mock.onGet('/me/plants').reply(200, [monstera, cactus, imbe]);
    renderScreen();

    expect((await row('Monstera')).getByText('late')).toBeOnTheScreen();
    expect((await card()).getAllByText('late')).toHaveLength(1);
  });

  it('records a watering for today and shows the row as done', async () => {
    await signIn();
    mock.onGet('/me/plants').reply(200, [monstera, cactus, imbe]);
    mock.onPost('/me/plants/p3/waterings').reply(201, { ...imbe, lastWateredOn: today });
    renderScreen();

    fireEvent.press((await row('Imbé')).getByText('Watered ✓'));

    await waitFor(() => expect(mock.history.post).toHaveLength(1));
    expect(JSON.parse(String(mock.history.post[0]?.data))).toEqual({ wateredOn: today });
    expect(await (await row('Imbé')).findByText('✓ Watered')).toBeOnTheScreen();
    expect((await card()).getByText('2 of 3')).toBeOnTheScreen();
  });

  it('undoes today\'s watering from the done row', async () => {
    await signIn();
    mock.onGet('/me/plants').reply(200, [monstera, cactus, imbe]);
    mock.onDelete(`/me/plants/p2/waterings/${today}`).reply(200, { ...cactus, lastWateredOn: null });
    renderScreen();

    fireEvent.press((await row('Cactus')).getByText('✓ Watered'));

    expect(await (await row('Cactus')).findByText('Watered ✓')).toBeOnTheScreen();
    expect(mock.history.delete).toHaveLength(1);
    expect((await card()).getByText('0 of 3')).toBeOnTheScreen();
  });

  it('says so when every plant is watered', async () => {
    await signIn();
    mock.onGet('/me/plants').reply(200, [cactus, { ...imbe, lastWateredOn: today }]);
    renderScreen();

    expect(await (await card()).findByText('All watered today 🌱')).toBeOnTheScreen();
    expect((await card()).getByText('2 of 2')).toBeOnTheScreen();
  });

  it('shows the error toast and keeps the button when saving fails', async () => {
    await signIn();
    mock.onGet('/me/plants').reply(200, [monstera, cactus, imbe]);
    mock.onPost('/me/plants/p3/waterings').reply(500, { error: { code: 'internal', message: 'x' } });
    renderScreen();

    fireEvent.press((await row('Imbé')).getByText('Watered ✓'));

    expect(
      await screen.findByText("Couldn't save. Try again.", {}, { timeout: 5000 }),
    ).toBeOnTheScreen();
    expect((await row('Imbé')).getByText('Watered ✓')).toBeOnTheScreen();
    expect((await card()).getByText('1 of 3')).toBeOnTheScreen();
  });

  it('opens a plant from its row', async () => {
    await signIn();
    mock.onGet('/me/plants').reply(200, [monstera, cactus, imbe]);
    renderScreen();

    fireEvent.press((await row('Imbé')).getByText('Imbé'));

    expect(mockNavigate).toHaveBeenCalledWith('PlantDetail', { userPlantId: 'p3' });
  });

  it('keeps the garden below, titled "My garden", with every card', async () => {
    await signIn();
    mock.onGet('/me/plants').reply(200, [monstera, cactus, imbe]);
    renderScreen();

    expect(await screen.findByText('My garden')).toBeOnTheScreen();
    expect(screen.getAllByText('Water at')).toHaveLength(3);
    expect(screen.getAllByLabelText('Remove')).toHaveLength(3);
  });

  it('works out "today" again when the app comes back on another day', async () => {
    const listeners: ((state: AppStateStatus) => void)[] = [];
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, handler) => {
      listeners.push(handler);
      return { remove: jest.fn() };
    });
    await signIn();
    mock.onGet('/me/plants').reply(200, [monstera, cactus, imbe]);
    renderScreen();
    expect((await card()).getByText('1 of 3')).toBeOnTheScreen();

    // Friday: Monstera is not due, and yesterday's watering of Cactus no longer counts.
    jest.setSystemTime(new Date(2026, 9, 23, 8, 0));
    act(() => listeners.forEach((listener) => listener('active')));

    expect(await (await card()).findByText('0 of 2')).toBeOnTheScreen();
    expect((await card()).queryByText('Monstera')).not.toBeOnTheScreen();
  });

  it('speaks Portuguese', async () => {
    await changeLanguage('pt-BR');
    await signIn();
    mock.onGet('/me/plants').reply(200, [monstera, cactus, imbe]);
    renderScreen();

    const todayCard = await card();
    expect(todayCard.getByText('Hoje')).toBeOnTheScreen();
    expect(todayCard.getByText('1 de 3')).toBeOnTheScreen();
    expect(todayCard.getAllByText('Reguei ✓')).toHaveLength(2);
    expect(todayCard.getByText('✓ Regada')).toBeOnTheScreen();
    expect(todayCard.getByText('atrasada')).toBeOnTheScreen();
    expect(screen.getByText('Meu jardim')).toBeOnTheScreen();
  });

  it('speaks Portuguese on a day with nothing to water', async () => {
    await changeLanguage('pt-BR');
    setToday(new Date(2026, 9, 21, 12, 0));
    await signIn();
    mock.onGet('/me/plants').reply(200, [monstera]);
    renderScreen();

    expect(await (await card()).findByText('Nada pra regar hoje 🌱')).toBeOnTheScreen();
    expect((await card()).getByText('Próxima: Monstera amanhã às 09:30')).toBeOnTheScreen();
  });
});
