import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import MockAdapter from 'axios-mock-adapter';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { api } from '../api/client';
import { AuthProvider } from '../auth/AuthProvider';
import { clearTokens, loadTokens } from '../auth/session';
import { changeLanguage, initI18n } from '../i18n';
import { Auth } from './Auth';

const mockNavigate = jest.fn();
let mockParams: { mode: 'signIn' | 'signUp' } = { mode: 'signIn' };

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual<object>('@react-navigation/native'),
  useNavigation: () => ({ navigate: mockNavigate, goBack: jest.fn() }),
  useRoute: () => ({ params: mockParams }),
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
  mockParams = { mode: 'signIn' };
  await clearTokens();
  await AsyncStorage.clear();
  await changeLanguage('en');
});

afterEach(() => mock.restore());

function renderAuth() {
  return render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <AuthProvider>
        <Auth />
      </AuthProvider>
    </SafeAreaProvider>,
  );
}

function fill(email: string, password: string) {
  fireEvent.changeText(screen.getByLabelText('Email'), email);
  fireEvent.changeText(screen.getByLabelText('Password'), password);
}

describe('Auth', () => {
  it('signs in and moves on to the catalog', async () => {
    mock.onPost('/auth/login').reply(200, { accessToken: 'a', refreshToken: 'r', user });
    renderAuth();

    fill('ana@example.com', 'secret123');
    fireEvent.press(screen.getByText('Sign in'));

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('PlantSelect'));
    expect(await loadTokens()).toEqual({ accessToken: 'a', refreshToken: 'r' });
  });

  it('shows the invalid_credentials message and stays on the screen', async () => {
    mock.onPost('/auth/login').reply(401, {
      error: { code: 'invalid_credentials', message: 'Wrong' },
    });
    renderAuth();

    fill('ana@example.com', 'wrong-pass');
    fireEvent.press(screen.getByText('Sign in'));

    expect(await screen.findByText('Wrong email or password.')).toBeTruthy();
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(await loadTokens()).toBeNull();
  });

  it('shows the network message when the API is unreachable', async () => {
    mock.onPost('/auth/login').networkError();
    renderAuth();

    fill('ana@example.com', 'secret123');
    fireEvent.press(screen.getByText('Sign in'));

    expect(
      await screen.findByText("Can't reach the server. Check your connection and try again."),
    ).toBeTruthy();
  });

  it('pre-fills the typed name on sign up and sends it', async () => {
    mockParams = { mode: 'signUp' };
    await AsyncStorage.setItem('@plantcare:user', 'Ana');
    mock.onPost('/auth/register').reply(201, { accessToken: 'a', refreshToken: 'r', user });
    renderAuth();

    await waitFor(() => expect(screen.getByLabelText('Your name').props.value).toBe('Ana'));
    fill('ana@example.com', 'secret123');
    fireEvent.press(screen.getByText('Create account'));

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('PlantSelect'));
    const body: unknown = JSON.parse(String(mock.history.post[0]?.data));
    expect(body).toMatchObject({ name: 'Ana', language: 'en' });
  });

  it('maps email_taken', async () => {
    mockParams = { mode: 'signUp' };
    mock.onPost('/auth/register').reply(409, {
      error: { code: 'email_taken', message: 'taken' },
    });
    renderAuth();

    fireEvent.changeText(screen.getByLabelText('Your name'), 'Ana');
    fill('ana@example.com', 'secret123');
    fireEvent.press(screen.getByText('Create account'));

    expect(
      await screen.findByText('That email already has an account. Try signing in.'),
    ).toBeTruthy();
  });

  it('rejects a short password on sign up without calling the API', async () => {
    mockParams = { mode: 'signUp' };
    renderAuth();

    fireEvent.changeText(screen.getByLabelText('Your name'), 'Ana');
    fill('ana@example.com', 'short');
    fireEvent.press(screen.getByText('Create account'));

    expect(
      await screen.findByText('Check your details. The password needs at least 8 characters.'),
    ).toBeTruthy();
    expect(mock.history.post).toHaveLength(0);
  });

  it('shows a loading state and ignores a second tap while submitting', async () => {
    let release: () => void = () => undefined;
    mock.onPost('/auth/login').reply(
      () =>
        new Promise((resolve) => {
          release = () => resolve([200, { accessToken: 'a', refreshToken: 'r', user }]);
        }),
    );
    renderAuth();

    fill('ana@example.com', 'secret123');
    fireEvent.press(screen.getByText('Sign in'));

    await waitFor(() => expect(screen.queryByText('Sign in')).toBeNull());
    expect(screen.getByLabelText('Please wait')).toBeTruthy();
    release();
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('PlantSelect'));
    expect(mock.history.post).toHaveLength(1);
  });

  it('does not render the Google button without a provider', async () => {
    renderAuth();
    await act(async () => undefined);
    expect(screen.queryByText('Continue with Google')).toBeNull();
  });

  it('switches between sign in and sign up', async () => {
    renderAuth();
    fireEvent.press(screen.getByText('New here? Create an account'));
    expect(screen.getByText('Create your account')).toBeTruthy();
    await act(async () => undefined);
  });
});
