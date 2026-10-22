import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import MockAdapter from 'axios-mock-adapter';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { api } from '../api/client';
import { AuthProvider } from '../auth/AuthProvider';
import { clearTokens } from '../auth/session';
import { changeLanguage, initI18n } from '../i18n';
import { catalogFixture } from '../plants/testFixtures';
import { PlantSelect } from './PlantSelect';

const mockNavigate = jest.fn();

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual<object>('@react-navigation/native'),
  useNavigation: () => ({ navigate: mockNavigate, goBack: jest.fn() }),
}));

let mock: MockAdapter;

beforeAll(initI18n);

beforeEach(async () => {
  mock = new MockAdapter(api);
  mockNavigate.mockClear();
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
  it('lists species and opens the form for the tapped one', async () => {
    mock.onGet('/plants').reply(200, { items: [catalogFixture], nextPage: null });
    renderScreen();

    fireEvent.press(await screen.findByText('Monstera'));

    expect(mockNavigate).toHaveBeenCalledWith('PlantForm', {
      mode: 'create',
      catalogPlantId: 'c1',
    });
  });

  it('filters by light and difficulty with translated labels', async () => {
    mock.onGet('/plants').reply(200, { items: [catalogFixture], nextPage: null });
    renderScreen();
    await screen.findByText('Monstera');

    fireEvent.press(screen.getByText('Shade'));
    await waitFor(() =>
      expect(mock.history.get.some((r) => (r.params as { light?: string }).light === 'shade')).toBe(true),
    );
    fireEvent.press(screen.getByText('Hard'));
    await waitFor(() =>
      expect(mock.history.get.some((r) => (r.params as { difficulty?: string }).difficulty === 'hard')).toBe(true),
    );
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

    expect(await screen.findByText('Meia-sombra')).toBeTruthy();
    await waitFor(() => expect(mock.history.get.length).toBeGreaterThanOrEqual(2));
    expect(mock.history.get[mock.history.get.length - 1]?.headers?.['Accept-Language']).toBe('pt-BR');
  });
});
