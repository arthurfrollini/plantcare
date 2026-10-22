import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import MockAdapter from 'axios-mock-adapter';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { api } from '../api/client';
import { AuthProvider } from '../auth/AuthProvider';
import { clearTokens, loadTokens, saveTokens } from '../auth/session';
import { changeLanguage, currentLanguage, initI18n } from '../i18n';
import { Profile } from './Profile';

const mockNavigate = jest.fn();

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual<object>('@react-navigation/native'),
  useNavigation: () => ({ navigate: mockNavigate, goBack: jest.fn() }),
}));

const user = {
  id: 'u1',
  name: 'Ana',
  email: 'ana@example.com',
  language: 'en',
  hasPassword: true,
  hasGoogle: false,
};

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

function renderProfile() {
  return render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <AuthProvider>
        <Profile />
      </AuthProvider>
    </SafeAreaProvider>,
  );
}

describe('Profile', () => {
  it('offers Sign in when signed out, and opens the auth screen', async () => {
    renderProfile();

    fireEvent.press(await screen.findByText('Sign in'));

    expect(mockNavigate).toHaveBeenCalledWith('Auth', { mode: 'signIn' });
    expect(screen.queryByText('Sign out')).toBeNull();
  });

  it('changes the language locally when signed out, without calling the API', async () => {
    renderProfile();
    await screen.findByText('Sign in');

    fireEvent.press(screen.getByText('Português (Brasil)'));

    await waitFor(() => expect(currentLanguage()).toBe('pt-BR'));
    expect(mock.history.patch).toHaveLength(0);
  });

  it('shows the email and Sign out when signed in', async () => {
    await saveTokens({ accessToken: 'a', refreshToken: 'r' });
    mock.onGet('/me').reply(200, user);
    renderProfile();

    expect(await screen.findByText('ana@example.com')).toBeTruthy();
    expect(screen.getByText('Sign out')).toBeTruthy();
    expect(screen.queryByText('Sign in')).toBeNull();
  });

  it('sends PATCH /me { language } when the language changes while signed in', async () => {
    await saveTokens({ accessToken: 'a', refreshToken: 'r' });
    mock.onGet('/me').reply(200, user);
    mock.onPatch('/me').reply(200, { ...user, language: 'pt-BR' });
    renderProfile();
    await screen.findByText('ana@example.com');

    fireEvent.press(screen.getByText('Português (Brasil)'));

    await waitFor(() => expect(mock.history.patch).toHaveLength(1));
    expect(JSON.parse(String(mock.history.patch[0]?.data))).toEqual({ language: 'pt-BR' });
    expect(currentLanguage()).toBe('pt-BR');
  });

  it('signs out', async () => {
    await saveTokens({ accessToken: 'a', refreshToken: 'r' });
    mock.onGet('/me').reply(200, user);
    mock.onPost('/auth/logout').reply(204);
    renderProfile();

    fireEvent.press(await screen.findByText('Sign out'));

    expect(await screen.findByText('Sign in')).toBeTruthy();
    expect(await loadTokens()).toBeNull();
  });
});
