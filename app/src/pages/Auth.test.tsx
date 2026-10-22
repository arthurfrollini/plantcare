import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import MockAdapter from 'axios-mock-adapter';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { StackActions } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { api } from '../api/client';
import { AuthProvider } from '../auth/AuthProvider';
import { clearTokens, loadTokens, saveTokens } from '../auth/session';
import { changeLanguage, initI18n } from '../i18n';
import { PENDING_SAVE_KEY, setPendingSave, type PendingSave } from '../plants/pendingSave';
import { userPlantFixture } from '../plants/testFixtures';
import { Auth } from './Auth';

const mockDispatch = jest.fn();
const mockGoBack = jest.fn();
let mockParams: { mode: 'signIn' | 'signUp'; afterAuth?: 'savePendingPlant' } = { mode: 'signIn' };

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual<object>('@react-navigation/native'),
  useNavigation: () => ({ dispatch: mockDispatch, goBack: mockGoBack }),
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
  mockDispatch.mockClear();
  mockGoBack.mockClear();
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

    await waitFor(() => expect(mockDispatch).toHaveBeenCalledWith(StackActions.popTo('PlantSelect')));
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
    expect(mockDispatch).not.toHaveBeenCalled();
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

    await waitFor(() => expect(mockDispatch).toHaveBeenCalledWith(StackActions.popTo('PlantSelect')));
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

  it('shows a loading state and sends one request for two taps in the same frame', async () => {
    let release: () => void = () => undefined;
    mock.onPost('/auth/login').reply(
      () =>
        new Promise((resolve) => {
          release = () => resolve([200, { accessToken: 'a', refreshToken: 'r', user }]);
        }),
    );
    renderAuth();

    fill('ana@example.com', 'secret123');
    const button = screen.getByText('Sign in');
    act(() => {
      fireEvent.press(button);
      fireEvent.press(button);
    });

    await waitFor(() => expect(screen.queryByText('Sign in')).toBeNull());
    expect(screen.getByLabelText('Please wait')).toBeTruthy();
    release();
    await waitFor(() => expect(mockDispatch).toHaveBeenCalled());
    expect(mock.history.post).toHaveLength(1);
  });

  it('shows the form again, not a spinner, after a successful sign in', async () => {
    mock.onPost('/auth/login').reply(200, { accessToken: 'a', refreshToken: 'r', user });
    renderAuth();

    fill('ana@example.com', 'secret123');
    fireEvent.press(screen.getByText('Sign in'));

    await waitFor(() => expect(mockDispatch).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText('Sign in')).toBeTruthy());
  });

  it('leaves for the catalog when opened while already signed in', async () => {
    await saveTokens({ accessToken: 'a', refreshToken: 'r' });
    mock.onGet('/me').reply(200, user);
    renderAuth();

    await waitFor(() =>
      expect(mockDispatch).toHaveBeenCalledWith(StackActions.popTo('PlantSelect')),
    );
  });

  it('asks for every field in sign in mode instead of the password length', async () => {
    renderAuth();

    fireEvent.press(screen.getByText('Sign in'));

    expect(await screen.findByText('Fill in every field.')).toBeTruthy();
    expect(mock.history.post).toHaveLength(0);
  });

  it.each([
    [429, 'rate_limited', 'Too many tries. Wait a bit and try again.'],
    [
      400,
      'validation_error',
      'Check your details. The password needs at least 8 characters.',
    ],
    [500, 'internal', 'Something went wrong. Try again.'],
  ])('maps a %i %s answer to its message', async (status, code, message) => {
    mock.onPost('/auth/login').reply(status, { error: { code, message: 'server text' } });
    renderAuth();

    fill('ana@example.com', 'secret123');
    fireEvent.press(screen.getByText('Sign in'));

    expect(await screen.findByText(message)).toBeTruthy();
    expect(screen.queryByText('server text')).toBeNull();
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
  describe('after sign up with a pending plant', () => {
    const pending: PendingSave = {
      plants: [
        { catalogPlantId: 'c1' },
        { catalogPlantId: 'c2' },
      ],
    };
    const onePlant: PendingSave = {
      plants: [{ catalogPlantId: 'c1' }],
    };

    beforeEach(() => {
      mockParams = { mode: 'signUp', afterAuth: 'savePendingPlant' };
      mock.onPost('/auth/register').reply(201, { accessToken: 'a', refreshToken: 'r', user });
      mock.onGet('/me/plants').reply(200, []);
    });

    function signUp() {
      fireEvent.changeText(screen.getByLabelText('Your name'), 'Ana');
      fill('ana@example.com', 'secret123');
      fireEvent.press(screen.getByText('Create account'));
    }

    it('creates each picked plant exactly once, clears the pending save and confirms', async () => {
      await setPendingSave(pending);
      mock.onPost('/me/plants').reply(201, userPlantFixture);
      const view = renderAuth();

      signUp();
      await waitFor(() => expect(mockDispatch).toHaveBeenCalledTimes(1));
      view.rerender(<></>);

      const created = mock.history.post.filter((r) => r.url === '/me/plants');
      expect(created.map((r) => JSON.parse(String(r.data)) as unknown)).toEqual([
        expect.objectContaining({ catalogPlantId: 'c1', reminderTime: '08:00' }),
        expect.objectContaining({ catalogPlantId: 'c2', reminderTime: '08:00' }),
      ]);
      expect(await AsyncStorage.getItem(PENDING_SAVE_KEY)).toBeNull();
      // Reset, so Back from the confirmation cannot reach the catalog or this screen.
      expect(mockDispatch.mock.calls[0]?.[0]).toMatchObject({
        type: 'RESET',
        payload: {
          index: 1,
          routes: [
            { name: 'PlantSelect' },
            {
              name: 'Confirmation',
              params: {
                nextScreen: 'MyPlants',
                subtitle:
                  "Your 2 plants are in your garden. We'll remind you when it's time to water them.",
              },
            },
          ],
        },
      });
    });

    it('confirms the plants that were added and names the ones that were not', async () => {
      await setPendingSave(pending);
      mock
        .onPost('/me/plants')
        .replyOnce(201, userPlantFixture)
        .onPost('/me/plants')
        .replyOnce(500, { error: { code: 'internal', message: 'boom' } });
      renderAuth();

      signUp();
      await waitFor(() => expect(mockDispatch).toHaveBeenCalledTimes(1));

      expect(mockDispatch.mock.calls[0]?.[0]).toMatchObject({
        payload: {
          routes: [
            { name: 'PlantSelect' },
            {
              name: 'Confirmation',
              params: {
                subtitle:
                  "Your plant is in your garden. We'll remind you when it's time to water it.\n\n" +
                  "1 plant couldn't be added. Pick it again in the catalog.",
              },
            },
          ],
        },
      });
    });

    it('goes to the catalog when nothing is pending', async () => {
      renderAuth();

      signUp();

      await waitFor(() => expect(mockDispatch).toHaveBeenCalledWith(StackActions.popTo('PlantSelect')));
      expect(mock.history.post.filter((r) => r.url === '/me/plants')).toHaveLength(0);
    });

    it('shows progress, not the sign up form, while the plant saves', async () => {
      await setPendingSave(pending);
      mock.onPost('/me/plants').reply(
        () => new Promise((resolve) => setTimeout(() => resolve([201, userPlantFixture]), 50)),
      );
      renderAuth();

      signUp();

      expect(await screen.findByLabelText('Saving')).toBeTruthy();
      expect(screen.queryByText('Create account')).toBeNull();
      await waitFor(() => expect(mockDispatch).toHaveBeenCalledTimes(1));
    });

    it('does not create twice when the effect re-fires mid-save', async () => {
      await setPendingSave(onePlant);
      mock.onPost('/me/plants').reply(
        () => new Promise((resolve) => setTimeout(() => resolve([201, userPlantFixture]), 50)),
      );
      renderAuth();

      signUp();
      await screen.findByLabelText('Saving');
      // A new translate function makes the finishing callback, and so the effect, run again.
      await act(() => changeLanguage('pt-BR'));
      await waitFor(() => expect(mockDispatch).toHaveBeenCalledTimes(1));

      expect(mock.history.post.filter((r) => r.url === '/me/plants')).toHaveLength(1);
    });

    it('retries from memory when the pending save cannot be written back', async () => {
      await setPendingSave(onePlant);
      let attempts = 0;
      mock.onPost('/me/plants').reply(() => {
        attempts += 1;
        if (attempts > 1) return [201, userPlantFixture];
        // The write that puts the form back fails right after the create does.
        jest.mocked(AsyncStorage.setItem).mockRejectedValueOnce(new Error('disk full'));
        return Promise.reject(new Error('boom'));
      });
      renderAuth();

      signUp();
      fireEvent.press(await screen.findByText('Try again'));

      await waitFor(() => expect(mockDispatch).toHaveBeenCalledTimes(1));
      expect(mock.history.post.filter((r) => r.url === '/me/plants')).toHaveLength(2);
    });

    it('offers a way out next to the retry when the create fails', async () => {
      await setPendingSave(onePlant);
      mock.onPost('/me/plants').networkError();
      renderAuth();

      signUp();
      expect(await screen.findByText('Try again')).toBeTruthy();
      fireEvent.press(screen.getByText('Back'));

      expect(mockGoBack).toHaveBeenCalledTimes(1);
    });

    it('keeps the form and offers a retry when the create fails', async () => {
      await setPendingSave(onePlant);
      mock.onPost('/me/plants').networkErrorOnce();
      mock.onPost('/me/plants').reply(201, userPlantFixture);
      renderAuth();

      signUp();
      expect(await screen.findByText('Try again')).toBeTruthy();
      expect(screen.queryByText('Create account')).toBeNull();
      expect(await AsyncStorage.getItem(PENDING_SAVE_KEY)).not.toBeNull();

      fireEvent.press(screen.getByText('Try again'));

      await waitFor(() => expect(mockDispatch).toHaveBeenCalledTimes(1));
      expect(mock.history.post.filter((r) => r.url === '/me/plants')).toHaveLength(2);
      expect(await AsyncStorage.getItem(PENDING_SAVE_KEY)).toBeNull();
    });
  });
});
