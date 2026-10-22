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

    await waitFor(() => expect(screen.queryByText('Done')).toBeNull());
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
