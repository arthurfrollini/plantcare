import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import MockAdapter from 'axios-mock-adapter';
import { Alert } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { api } from '../api/client';
import { AuthProvider } from '../auth/AuthProvider';
import { clearTokens, saveTokens } from '../auth/session';
import { changeLanguage, initI18n } from '../i18n';
import { PENDING_SAVE_KEY } from '../plants/pendingSave';
import { accountFixture, catalogFixture, userPlantFixture } from '../plants/testFixtures';
import { PlantSelect } from './PlantSelect';

const mockNavigate = jest.fn();
const mockDispatch = jest.fn();
const mockGoBack = jest.fn();

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual<object>('@react-navigation/native'),
  useNavigation: () => ({ navigate: mockNavigate, dispatch: mockDispatch, goBack: mockGoBack }),
}));

const cactusFixture = {
  ...catalogFixture,
  id: 'c2',
  slug: 'cactus',
  name: 'Cactus',
  light: 'full_sun' as const,
  frequency: { times: 1, per: 'week' as const },
};

let mock: MockAdapter;

beforeAll(initI18n);

beforeEach(async () => {
  mock = new MockAdapter(api);
  mockNavigate.mockClear();
  mockDispatch.mockClear();
  mockGoBack.mockClear();
  await clearTokens();
  await AsyncStorage.clear();
  await changeLanguage('en');
});

afterEach(() => mock.restore());

function renderScreen() {
  return render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <AuthProvider>
        <PlantSelect />
      </AuthProvider>
    </SafeAreaProvider>,
  );
}

describe('PlantSelect', () => {
  it('selects a species on tap and unselects it on a second tap', async () => {
    mock.onGet('/plants').reply(200, { items: [catalogFixture], nextPage: null });
    renderScreen();

    fireEvent.press(await screen.findByText('Monstera'));

    expect(screen.getByRole('button', { name: 'Monstera', selected: true })).toBeTruthy();
    expect(screen.getByText('Add plant')).toBeTruthy();

    fireEvent.press(screen.getByText('Monstera'));

    expect(screen.queryByText('Add plant')).toBeNull();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('opens on the catalog, with Add with AI as a tab that is coming soon', async () => {
    mock.onGet('/plants').reply(200, { items: [catalogFixture], nextPage: null });
    renderScreen();

    expect(await screen.findByText('Monstera')).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Catalog', selected: true })).toBeTruthy();

    fireEvent.press(screen.getByRole('tab', { name: 'Add with AI' }));

    expect(screen.getByText('Soon')).toBeTruthy();
    expect(screen.queryByText('Monstera')).toBeNull();
    expect(screen.queryByText('Add plant(s)')).toBeNull();
  });

  it('goes back from either tab', async () => {
    mock.onGet('/plants').reply(200, { items: [catalogFixture], nextPage: null });
    renderScreen();
    await screen.findByText('Monstera');

    fireEvent.press(screen.getByRole('tab', { name: 'Add with AI' }));
    fireEvent.press(screen.getByLabelText('Back'));

    expect(mockGoBack).toHaveBeenCalledTimes(1);
  });

  it('keeps the add button in place but off until a plant is picked', async () => {
    mock.onGet('/plants').reply(200, { items: [catalogFixture], nextPage: null });
    renderScreen();
    await screen.findByText('Monstera');

    expect(screen.getByRole('button', { name: 'Add plant(s)', disabled: true })).toBeTruthy();
    expect(screen.queryByText('Clear')).toBeNull();

    fireEvent.press(screen.getByText('Monstera'));

    expect(screen.getByRole('button', { name: 'Add plant', disabled: false })).toBeTruthy();
    expect(screen.getByText('Clear')).toBeTruthy();
  });

  it('counts the selection in the button and Clear empties it', async () => {
    mock.onGet('/plants').reply(200, { items: [catalogFixture, cactusFixture], nextPage: null });
    renderScreen();

    fireEvent.press(await screen.findByText('Monstera'));
    fireEvent.press(screen.getByText('Cactus'));

    expect(screen.getByText('Add 2 plants')).toBeTruthy();

    fireEvent.press(screen.getByText('Clear'));

    expect(screen.queryByText('Add 2 plants')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Monstera', selected: true })).toBeNull();
  });

  it('keeps the selection while searching', async () => {
    mock.onGet('/plants').reply((config) => {
      const search = (config.params as { search?: string } | undefined)?.search;
      const items = search ? [cactusFixture] : [catalogFixture, cactusFixture];
      return [200, { items, nextPage: null }];
    });
    renderScreen();

    fireEvent.press(await screen.findByText('Monstera'));
    fireEvent.changeText(screen.getByLabelText('Search plants'), 'cac');
    // The search is debounced, so the new results take a moment.
    await waitFor(() => expect(screen.queryByText('Monstera')).toBeNull(), { timeout: 3000 });
    fireEvent.press(screen.getByText('Cactus'));

    expect(screen.getByText('Add 2 plants')).toBeTruthy();
  });

  it('adds every selected species with its care plan, then confirms', async () => {
    await saveTokens({ accessToken: 'acc', refreshToken: 'ref' });
    mock.onGet('/me').reply(200, accountFixture);
    mock.onGet('/me/plants').reply(200, [userPlantFixture]);
    mock.onPost('/me/plants').reply(201, userPlantFixture);
    mock.onGet('/plants').reply(200, { items: [catalogFixture, cactusFixture], nextPage: null });
    renderScreen();

    fireEvent.press(await screen.findByText('Monstera'));
    fireEvent.press(screen.getByText('Cactus'));
    fireEvent.press(screen.getByText('Add 2 plants'));

    await waitFor(() => expect(mockDispatch).toHaveBeenCalledTimes(1));
    expect(mock.history.post.map((r) => JSON.parse(String(r.data)) as unknown)).toEqual([
      expect.objectContaining({
        catalogPlantId: 'c1',
        light: 'partial_shade',
        reminderTime: '08:00',
      }),
      expect.objectContaining({ catalogPlantId: 'c2', light: 'full_sun', reminderTime: '08:00' }),
    ]);
    expect(mockDispatch.mock.calls[0]?.[0]).toMatchObject({
      type: 'REPLACE',
      payload: { name: 'Confirmation', params: { nextScreen: 'MyPlants' } },
    });
  });

  it('asks for an account first when signed out, keeping the selection for after', async () => {
    mock.onGet('/plants').reply(200, { items: [catalogFixture], nextPage: null });
    renderScreen();

    fireEvent.press(await screen.findByText('Monstera'));
    fireEvent.press(screen.getByText('Add plant'));

    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith('Auth', {
        mode: 'signUp',
        afterAuth: 'savePendingPlant',
      }),
    );
    expect(JSON.parse(String(await AsyncStorage.getItem(PENDING_SAVE_KEY)))).toEqual({
      plants: [
        { catalogPlantId: 'c1', frequency: { times: 2, per: 'week' }, light: 'partial_shade' },
      ],
    });
    expect(mock.history.post).toHaveLength(0);
  });

  it('keeps the ones that failed selected and says how many were added', async () => {
    await saveTokens({ accessToken: 'acc', refreshToken: 'ref' });
    mock.onGet('/me').reply(200, accountFixture);
    mock.onGet('/me/plants').reply(200, [userPlantFixture]);
    mock
      .onPost('/me/plants')
      .replyOnce(201, userPlantFixture)
      .onPost('/me/plants')
      .replyOnce(500, { error: { code: 'internal', message: 'boom' } });
    mock.onGet('/plants').reply(200, { items: [catalogFixture, cactusFixture], nextPage: null });
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    renderScreen();

    fireEvent.press(await screen.findByText('Monstera'));
    fireEvent.press(screen.getByText('Cactus'));
    fireEvent.press(screen.getByText('Add 2 plants'));

    await waitFor(() =>
      expect(alert).toHaveBeenCalledWith(
        'Added 1 of 2 plants. The rest are still selected, so you can try again.',
      ),
    );
    expect(screen.getByText('Add plant')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Cactus', selected: true })).toBeTruthy();
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it('sends both filters together, from page 1, with translated labels', async () => {
    mock.onGet('/plants').reply(200, { items: [catalogFixture], nextPage: null });
    renderScreen();
    await screen.findByText('Monstera');

    fireEvent.press(screen.getByLabelText('Filters'));
    fireEvent.press(screen.getByText('Shade'));
    fireEvent.press(screen.getByText('Hard'));

    await waitFor(() => {
      const last = mock.history.get[mock.history.get.length - 1];
      expect(last?.params).toMatchObject({ light: 'shade', difficulty: 'hard' });
      expect(last?.params).not.toHaveProperty('page', expect.anything());
    });
  });

  it('shows how many filters are on, and Clear turns both off', async () => {
    mock.onGet('/plants').reply(200, { items: [catalogFixture], nextPage: null });
    renderScreen();
    await screen.findByText('Monstera');

    expect(screen.queryByText('Shade')).toBeNull();

    fireEvent.press(screen.getByLabelText('Filters'));
    fireEvent.press(screen.getByText('Shade'));
    fireEvent.press(screen.getByText('Done'));

    await waitFor(() => expect(screen.queryByText('Done')).toBeNull(), { timeout: 3000 });
    expect(screen.getByLabelText('Filters, 1 active')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('Filters, 1 active'));
    fireEvent.press(screen.getByText('Hard'));
    expect(screen.getByLabelText('Filters, 2 active')).toBeTruthy();

    fireEvent.press(screen.getByText('Clear'));

    expect(screen.getByLabelText('Filters')).toBeTruthy();
    await waitFor(() => {
      const last = mock.history.get[mock.history.get.length - 1];
      expect(last?.params).not.toHaveProperty('light', expect.anything());
      expect(last?.params).not.toHaveProperty('difficulty', expect.anything());
    });
  });

  it('says so when nothing matches', async () => {
    mock.onGet('/plants').reply(200, { items: [], nextPage: null });
    renderScreen();

    expect(await screen.findByText('No plants found.')).toBeTruthy();
  });

  it('shows the network message with Retry, and Retry refetches', async () => {
    mock.onGet('/plants').networkErrorOnce();
    mock.onGet('/plants').reply(200, { items: [catalogFixture], nextPage: null });
    renderScreen();

    expect(
      await screen.findByText("Can't reach the server. Check your connection and try again."),
    ).toBeTruthy();

    fireEvent.press(screen.getByText('Try again'));

    expect(await screen.findByText('Monstera')).toBeTruthy();
    expect(mock.history.get).toHaveLength(2);
  });

  it('uses the new language for labels and the next fetch', async () => {
    mock.onGet('/plants').reply(200, { items: [catalogFixture], nextPage: null });
    renderScreen();
    await screen.findByText('Monstera');

    await act(async () => {
      await changeLanguage('pt-BR');
    });

    fireEvent.press(screen.getByLabelText('Filtros'));
    expect(await screen.findByText('Meia-sombra')).toBeTruthy();
    await waitFor(() => expect(mock.history.get.length).toBeGreaterThanOrEqual(2));
    expect(mock.history.get[mock.history.get.length - 1]?.headers?.['Accept-Language']).toBe('pt-BR');
  });
});
