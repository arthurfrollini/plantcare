import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import MockAdapter from 'axios-mock-adapter';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { api } from '../api/client';
import { AuthProvider, useAuth } from '../auth/AuthProvider';
import { clearTokens, saveTokens } from '../auth/session';
import { changeLanguage, initI18n } from '../i18n';
import { accountFixture } from '../plants/testFixtures';
import Welcome from './Welcome';

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

function AuthStatus() {
  const { status } = useAuth();
  return <>{status === 'loading' ? null : <Welcome />}</>;
}

function renderScreen() {
  return render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <AuthProvider>
        <AuthStatus />
      </AuthProvider>
    </SafeAreaProvider>,
  );
}

async function pressStart() {
  fireEvent.press(await screen.findByLabelText('Get started'));
}

describe('Welcome', () => {
  it('asks for a name when there is no account and no saved name', async () => {
    renderScreen();

    await pressStart();

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('UserIdentification'));
  });

  it('goes straight to the catalog when signed in', async () => {
    await saveTokens({ accessToken: 'acc', refreshToken: 'ref' });
    mock.onGet('/me').reply(200, accountFixture);
    renderScreen();

    await pressStart();

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('PlantSelect'));
    expect(mockNavigate).not.toHaveBeenCalledWith('UserIdentification');
  });

  it('goes straight to the catalog when a name was already saved', async () => {
    await AsyncStorage.setItem('@plantcare:user', 'Arthur');
    renderScreen();

    await pressStart();

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('PlantSelect'));
    expect(mockNavigate).not.toHaveBeenCalledWith('UserIdentification');
  });

  it('has no separate sign-in button', async () => {
    renderScreen();
    await screen.findByLabelText('Get started');

    expect(screen.queryByText('I already have an account')).toBeNull();
  });
});
