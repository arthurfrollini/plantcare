import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import MockAdapter from 'axios-mock-adapter';
import * as ImagePicker from 'expo-image-picker';
import { CommonActions } from '@react-navigation/native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { User } from '@plantcare/shared';

import { api } from '../api/client';
import { AuthProvider } from '../auth/AuthProvider';
import { clearTokens, loadTokens, saveTokens } from '../auth/session';
import { changeLanguage, currentLanguage, initI18n } from '../i18n';
import { Profile } from './Profile';

const mockNavigate = jest.fn();
const mockDispatch = jest.fn<void, [unknown]>();

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual<object>('@react-navigation/native'),
  useNavigation: () => ({ navigate: mockNavigate, dispatch: mockDispatch, goBack: jest.fn() }),
}));

const user: User = {
  id: 'u1',
  name: 'Ana',
  email: 'ana@example.com',
  language: 'en',
  hasPassword: true,
  hasGoogle: false,
  hasAvatar: false,
  avatarVersion: null,
};

let mock: MockAdapter;

beforeAll(initI18n);

beforeEach(async () => {
  mock = new MockAdapter(api);
  mockNavigate.mockClear();
  mockDispatch.mockClear();
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

async function renderSignedIn(account: User = user) {
  await saveTokens({ accessToken: 'a', refreshToken: 'r' });
  mock.onGet('/me').reply(200, account);
  renderProfile();
  await screen.findByText(account.email ?? '', undefined, { timeout: 5000 });
}

function bodyOf(data: unknown): unknown {
  return JSON.parse(String(data));
}

describe('Profile signed out', () => {
  it('shows only the name row, the language and Sign in', async () => {
    await AsyncStorage.setItem('@plantcare:user', 'Bia Souza');
    renderProfile();

    expect(await screen.findByText('Sign in')).toBeOnTheScreen();
    expect(screen.getByText('Bia Souza')).toBeOnTheScreen();
    expect(screen.getByText('BS')).toBeOnTheScreen();
    expect(screen.getByText('Name')).toBeOnTheScreen();
    expect(screen.getByText('Language')).toBeOnTheScreen();
    expect(screen.queryByText('Sign out')).not.toBeOnTheScreen();
    expect(screen.queryByText('Change password')).not.toBeOnTheScreen();
    expect(screen.queryByText('Delete account')).not.toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Edit photo' })).not.toBeOnTheScreen();
  });

  it('opens the auth screen from Sign in', async () => {
    renderProfile();

    fireEvent.press(await screen.findByText('Sign in'));

    expect(mockNavigate).toHaveBeenCalledWith('Auth', { mode: 'signIn' });
  });

  it('changes the language locally, without calling the API', async () => {
    renderProfile();
    await screen.findByText('Sign in');

    fireEvent.press(screen.getByText('Português (Brasil)'));

    await waitFor(() => expect(currentLanguage()).toBe('pt-BR'));
    expect(mock.history.patch).toHaveLength(0);
  });

  it('edits the name typed on the first screen, without calling the API', async () => {
    await AsyncStorage.setItem('@plantcare:user', 'Bia');
    renderProfile();
    await screen.findByText('Bia');

    fireEvent.press(screen.getByRole('button', { name: 'Edit name' }));
    fireEvent.changeText(screen.getByLabelText('Name'), ' Carla ');
    fireEvent.press(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Saved ✓')).toBeOnTheScreen();
    expect(screen.getByText('Carla')).toBeOnTheScreen();
    expect(await AsyncStorage.getItem('@plantcare:user')).toBe('Carla');
    expect(mock.history.patch).toHaveLength(0);
  });
});

describe('Profile signed in', () => {
  it('shows the email, name, language and every account action', async () => {
    await renderSignedIn();

    expect(screen.getByText('Ana')).toBeOnTheScreen();
    expect(screen.getByText('Language')).toBeOnTheScreen();
    expect(screen.getByText('Change password')).toBeOnTheScreen();
    expect(screen.getByText('Sign out')).toBeOnTheScreen();
    expect(screen.getByText('Delete account')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Edit photo' })).toBeOnTheScreen();
    expect(screen.queryByText('Sign in')).not.toBeOnTheScreen();
  });

  it('hides Change password for an account without a password', async () => {
    await renderSignedIn({ ...user, hasPassword: false, hasGoogle: true });

    expect(screen.queryByText('Change password')).not.toBeOnTheScreen();
    expect(screen.getByText('Delete account')).toBeOnTheScreen();
  });

  it('sends PATCH /me { language } when the language changes', async () => {
    mock.onPatch('/me').reply(200, { ...user, language: 'pt-BR' });
    await renderSignedIn();

    fireEvent.press(screen.getByText('Português (Brasil)'));

    await waitFor(() => expect(mock.history.patch).toHaveLength(1));
    expect(bodyOf(mock.history.patch[0]?.data)).toEqual({ language: 'pt-BR' });
    expect(currentLanguage()).toBe('pt-BR');
  });

  it('signs out', async () => {
    mock.onPost('/auth/logout').reply(204);
    await renderSignedIn();

    fireEvent.press(screen.getByText('Sign out'));

    expect(await screen.findByText('Sign in')).toBeOnTheScreen();
    expect(await loadTokens()).toBeNull();
  });

  describe('name', () => {
    it('restores the stored name on Cancel and keeps Save off for a blank, long or unchanged name', async () => {
      await renderSignedIn();

      fireEvent.press(screen.getByRole('button', { name: 'Edit name' }));
      const input = screen.getByLabelText('Name');
      expect(input.props.value).toBe('Ana');
      expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();

      fireEvent.changeText(input, '   ');
      expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();

      fireEvent.changeText(input, 'a'.repeat(61));
      expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();

      fireEvent.changeText(input, 'a'.repeat(60));
      expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();

      fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
      expect(screen.queryByLabelText('Name')).not.toBeOnTheScreen();
      expect(screen.getByText('Ana')).toBeOnTheScreen();

      fireEvent.press(screen.getByRole('button', { name: 'Edit name' }));
      expect(screen.getByLabelText('Name').props.value).toBe('Ana');
      expect(mock.history.patch).toHaveLength(0);
    });

    it('saves the trimmed name with PATCH /me and says Saved', async () => {
      mock.onPatch('/me').reply(200, user);
      await renderSignedIn({ ...user, name: 'Bia' });

      fireEvent.press(screen.getByRole('button', { name: 'Edit name' }));
      fireEvent.changeText(screen.getByLabelText('Name'), '  Ana ');
      fireEvent.press(screen.getByRole('button', { name: 'Save' }));

      expect(await screen.findByText('Saved ✓', undefined, { timeout: 5000 })).toBeOnTheScreen();
      expect(bodyOf(mock.history.patch[0]?.data)).toEqual({ name: 'Ana' });
      expect(screen.getByText('Ana')).toBeOnTheScreen();
      expect(screen.queryByLabelText('Name')).not.toBeOnTheScreen();
    }, 15000);

    it('keeps editing and shows the error when the save fails', async () => {
      mock.onPatch('/me').networkError();
      await renderSignedIn();

      fireEvent.press(screen.getByRole('button', { name: 'Edit name' }));
      fireEvent.changeText(screen.getByLabelText('Name'), 'Bia');
      fireEvent.press(screen.getByRole('button', { name: 'Save' }));

      expect(
        await screen.findByText(
          "Can't reach the server. Check your connection and try again.",
          undefined,
          { timeout: 5000 },
        ),
      ).toBeOnTheScreen();
      expect(screen.getByLabelText('Name').props.value).toBe('Bia');
    }, 15000);
  });

  describe('password', () => {
    function fillPassword(current: string, next: string, confirm: string) {
      fireEvent.changeText(screen.getByLabelText('Current password'), current);
      fireEvent.changeText(screen.getByLabelText('New password'), next);
      fireEvent.changeText(screen.getByLabelText('Confirm new password'), confirm);
    }

    it('enables Save only when every field is filled, the rule is met and both match', async () => {
      await renderSignedIn();

      fireEvent.press(screen.getByText('Change password'));
      expect(screen.getByText('At least 8 characters.')).toBeOnTheScreen();
      expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();

      fillPassword('old-password', 'short', 'short');
      expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();

      fillPassword('old-password', 'new-password', 'new-passwort');
      expect(screen.getByText("The new passwords don't match.")).toBeOnTheScreen();
      expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();

      fillPassword('', 'new-password', 'new-password');
      expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();

      fillPassword('old-password', 'new-password', 'new-password');
      expect(screen.queryByText("The new passwords don't match.")).not.toBeOnTheScreen();
      expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
    });

    it('shows a wrong current password in the sheet and stays signed in', async () => {
      mock
        .onPost('/me/password')
        .reply(403, { error: { code: 'wrong_password', message: 'Wrong password' } });
      await renderSignedIn();

      fireEvent.press(screen.getByText('Change password'));
      fillPassword('not-it', 'new-password', 'new-password');
      fireEvent.press(screen.getByRole('button', { name: 'Save' }));

      expect(
        await screen.findByText('The current password is wrong.', undefined, { timeout: 5000 }),
      ).toBeOnTheScreen();
      expect(screen.getByLabelText('Current password')).toBeOnTheScreen();
      expect(screen.getByText('Sign out')).toBeOnTheScreen();
      expect(await loadTokens()).toEqual({ accessToken: 'a', refreshToken: 'r' });
    }, 15000);

    it('closes the sheet and says Password changed on success', async () => {
      mock.onPost('/me/password').reply(204);
      await renderSignedIn();

      fireEvent.press(screen.getByText('Change password'));
      fillPassword('old-password', 'new-password', 'new-password');
      fireEvent.press(screen.getByRole('button', { name: 'Save' }));

      // The toast lives about 1.7 s; the sheet close can take longer on a slow runner.
      expect(
        await screen.findByText('Password changed ✓', undefined, { timeout: 5000 }),
      ).toBeOnTheScreen();
      await waitFor(
        () => expect(screen.queryByLabelText('Current password')).not.toBeOnTheScreen(),
        { timeout: 10000 },
      );
      expect(bodyOf(mock.history.post[0]?.data)).toEqual({
        currentPassword: 'old-password',
        newPassword: 'new-password',
        refreshToken: 'r',
      });
      expect(screen.getByText('Sign out')).toBeOnTheScreen();
    }, 20000);
  });

  describe('delete account', () => {
    it('enables Confirm only for DELETE after trimming, case-sensitive', async () => {
      await renderSignedIn();

      fireEvent.press(screen.getByText('Delete account'));
      expect(screen.getByText('Delete your account?')).toBeOnTheScreen();
      const input = screen.getByLabelText('DELETE');
      expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled();

      fireEvent.changeText(input, 'delete');
      expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled();

      fireEvent.changeText(input, ' DELETE ');
      expect(screen.getByRole('button', { name: 'Confirm' })).toBeEnabled();
    });

    it('accepts only EXCLUIR in Portuguese', async () => {
      await changeLanguage('pt-BR');
      await renderSignedIn({ ...user, language: 'pt-BR' });

      fireEvent.press(screen.getByText('Excluir conta'));
      expect(screen.getByText(/Digite EXCLUIR para confirmar\./)).toBeOnTheScreen();
      const input = screen.getByLabelText('EXCLUIR');

      fireEvent.changeText(input, 'DELETE');
      expect(screen.getByRole('button', { name: 'Confirmar' })).toBeDisabled();

      fireEvent.changeText(input, 'excluir');
      expect(screen.getByRole('button', { name: 'Confirmar' })).toBeDisabled();

      fireEvent.changeText(input, 'EXCLUIR');
      expect(screen.getByRole('button', { name: 'Confirmar' })).toBeEnabled();
    });

    it('deletes the account, signs out and goes back to Welcome', async () => {
      mock.onDelete('/me').reply(204);
      await AsyncStorage.setItem('@plantcare:user', 'Ana');
      await renderSignedIn();

      fireEvent.press(screen.getByText('Delete account'));
      fireEvent.changeText(screen.getByLabelText('DELETE'), 'DELETE');
      fireEvent.press(screen.getByRole('button', { name: 'Confirm' }));

      await waitFor(() => expect(mockDispatch).toHaveBeenCalledTimes(1), { timeout: 5000 });
      expect(mockDispatch).toHaveBeenCalledWith(
        CommonActions.reset({ index: 0, routes: [{ name: 'Welcome' }] }),
      );
      expect(mock.history.delete).toHaveLength(1);
      expect(await loadTokens()).toBeNull();
      expect(await AsyncStorage.getItem('@plantcare:user')).toBeNull();
    }, 15000);

    it('shows the error and stays signed in when the delete fails', async () => {
      mock.onDelete('/me').reply(500);
      await renderSignedIn();

      fireEvent.press(screen.getByText('Delete account'));
      fireEvent.changeText(screen.getByLabelText('DELETE'), 'DELETE');
      fireEvent.press(screen.getByRole('button', { name: 'Confirm' }));

      expect(
        await screen.findByText('Something went wrong. Try again.', undefined, { timeout: 5000 }),
      ).toBeOnTheScreen();
      expect(screen.getByLabelText('DELETE')).toBeOnTheScreen();
      expect(mockDispatch).not.toHaveBeenCalled();
      expect(await loadTokens()).toEqual({ accessToken: 'a', refreshToken: 'r' });
      expect(screen.getByText('Sign out')).toBeOnTheScreen();
    }, 15000);
  });

  describe('photo', () => {
    it('opens the photo sheet from the pencil, without Remove when there is no photo', async () => {
      await renderSignedIn();

      fireEvent.press(screen.getByRole('button', { name: 'Edit photo' }));

      expect(screen.getByRole('button', { name: 'Take a photo' })).toBeOnTheScreen();
      expect(screen.getByRole('button', { name: 'Choose from gallery' })).toBeOnTheScreen();
      expect(screen.queryByRole('button', { name: 'Remove photo' })).not.toBeOnTheScreen();
    });

    it('shows the avatar, falls back to the initials when it fails, and removes it', async () => {
      const withAvatar = { ...user, hasAvatar: true, avatarVersion: 'v1' };
      mock.onDelete('/me/avatar').reply(200, user);
      await renderSignedIn(withAvatar);

      const image = await screen.findByTestId('profile-avatar', undefined, { timeout: 5000 });
      fireEvent(image, 'error');
      expect(await screen.findByText('A')).toBeOnTheScreen();

      fireEvent.press(screen.getByRole('button', { name: 'Edit photo' }));
      fireEvent.press(screen.getByRole('button', { name: 'Remove photo' }));

      await waitFor(() => expect(mock.history.delete).toHaveLength(1), { timeout: 10000 });
      expect(await screen.findByText('Photo removed ✓')).toBeOnTheScreen();
    }, 20000);

    it('says Photo updated after a new photo is saved', async () => {
      jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValueOnce({
        canceled: false,
        assets: [{ uri: 'file:///tmp/me.jpg', mimeType: 'image/jpeg', width: 800, height: 800 }],
      });
      mock.onPost('/me/avatar').reply(200, { ...user, hasAvatar: true, avatarVersion: 'v2' });
      await renderSignedIn();

      fireEvent.press(screen.getByRole('button', { name: 'Edit photo' }));
      fireEvent.press(screen.getByRole('button', { name: 'Choose from gallery' }));

      expect(await screen.findByText('Photo updated ✓', undefined, { timeout: 5000 })).toBeOnTheScreen();
    }, 20000);

    it('enlarges the photo on tap', async () => {
      await renderSignedIn({ ...user, hasAvatar: true, avatarVersion: 'v1' });

      fireEvent.press(await screen.findByRole('imagebutton', { name: 'View photo' }));

      expect(await screen.findByTestId('viewer-photo')).toBeOnTheScreen();
    });
  });
});
