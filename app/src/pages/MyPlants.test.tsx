import React from 'react';
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import MockAdapter from 'axios-mock-adapter';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

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

beforeAll(initI18n);

beforeEach(async () => {
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
  it('shows the nickname over the species name and caches the list', async () => {
    await signIn();
    mock.onGet('/me/plants').reply(200, [userPlantFixture]);
    renderScreen();

    expect(await screen.findAllByText('Pikachu')).not.toHaveLength(0);
    expect(screen.getByText('Monstera')).toBeTruthy();
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

  it('opens the form in edit mode when online', async () => {
    await signIn();
    mock.onGet('/me/plants').reply(200, [userPlantFixture]);
    renderScreen();

    fireEvent.press(await screen.findByText('Monstera'));

    expect(mockNavigate).toHaveBeenCalledWith('PlantForm', { userPlantId: 'p1' });
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

    await waitFor(() => expect(screen.queryByText('Monstera')).toBeNull());
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
