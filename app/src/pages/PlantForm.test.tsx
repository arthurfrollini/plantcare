import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import MockAdapter from 'axios-mock-adapter';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { api } from '../api/client';
import { AuthProvider } from '../auth/AuthProvider';
import { clearTokens, saveTokens } from '../auth/session';
import { changeLanguage, initI18n } from '../i18n';
import { accountFixture, userPlantFixture } from '../plants/testFixtures';
import { PlantForm } from './PlantForm';

const mockNavigate = jest.fn();
const mockDispatch = jest.fn();
const mockParams = { userPlantId: 'p1' };

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual<object>('@react-navigation/native'),
  useNavigation: () => ({ navigate: mockNavigate, dispatch: mockDispatch }),
  useRoute: () => ({ params: mockParams }),
}));

let mock: MockAdapter;

beforeAll(initI18n);

beforeEach(async () => {
  mock = new MockAdapter(api);
  mockNavigate.mockClear();
  mockDispatch.mockClear();
  await clearTokens();
  await AsyncStorage.clear();
  await changeLanguage('en');
  mock.onGet('/me/plants').reply(200, [userPlantFixture]);
  mock.onPatch('/me/plants/p1').reply(200, userPlantFixture);
});

afterEach(() => mock.restore());

async function signIn() {
  await saveTokens({ accessToken: 'a', refreshToken: 'r' });
  mock.onGet('/me').reply(200, accountFixture);
}

function renderForm() {
  return render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <AuthProvider>
        <PlantForm />
      </AuthProvider>
    </SafeAreaProvider>,
  );
}

describe('PlantForm', () => {
  it('shows the species and the saved care plan', async () => {
    await signIn();
    renderForm();

    expect(await screen.findByText('Monstera')).toBeTruthy();
    expect(screen.getByDisplayValue('Pikachu')).toBeTruthy();
    expect(screen.getByLabelText('2 times a week').props.accessibilityState.selected).toBe(true);
    expect(screen.getByLabelText('Partial shade').props.accessibilityState.selected).toBe(true);
    expect(screen.getByText('Save changes')).toBeTruthy();
  });

  it('says "1 time", not "1 times", in the frequency chip label', async () => {
    await signIn();
    renderForm();

    expect(await screen.findByLabelText('1 time a week')).toBeTruthy();
    expect(screen.queryByLabelText('1 times a week')).toBeNull();
  });

  it('saves once when Save is double tapped, then confirms', async () => {
    await signIn();
    renderForm();
    await screen.findByText('Monstera');
    await waitFor(() => expect(screen.getByText('Save changes')).toBeEnabled());

    fireEvent.changeText(screen.getByLabelText('Nickname (optional)'), 'Bulbasaur');
    const save = screen.getByText('Save changes');
    fireEvent.press(save);
    fireEvent.press(save);

    await waitFor(() => expect(mockDispatch).toHaveBeenCalledTimes(1));
    expect(mock.history.patch).toHaveLength(1);
    expect(JSON.parse(String(mock.history.patch[0]?.data))).toEqual({ nickname: 'Bulbasaur' });
  });

  it('says why there is no photo when the permission is denied', async () => {
    await signIn();
    jest.mocked(ImagePicker.requestCameraPermissionsAsync).mockResolvedValueOnce({
      status: ImagePicker.PermissionStatus.DENIED,
      granted: false,
      canAskAgain: false,
      expires: 'never',
    });
    renderForm();
    await screen.findByText('Monstera');

    fireEvent.press(screen.getByText('Take a photo'));

    expect(await screen.findByText(/PlantCare isn't allowed to use your camera or photos/)).toBeTruthy();
  });

  it('shows the network message and keeps Save available as a retry', async () => {
    await signIn();
    mock.resetHandlers();
    mock.onGet('/me').reply(200, accountFixture);
    mock.onGet('/me/plants').reply(200, [userPlantFixture]);
    mock.onPatch('/me/plants/p1').networkErrorOnce();
    mock.onPatch('/me/plants/p1').reply(200, userPlantFixture);
    renderForm();
    await screen.findByText('Monstera');
    await waitFor(() => expect(screen.getByText('Save changes')).toBeEnabled());

    fireEvent.changeText(screen.getByLabelText('Nickname (optional)'), 'Bulbasaur');
    fireEvent.press(screen.getByText('Save changes'));

    expect(
      await screen.findByText("Can't reach the server. Check your connection and try again."),
    ).toBeTruthy();
    fireEvent.press(screen.getByText('Try again'));
    await waitFor(() => expect(mockDispatch).toHaveBeenCalledTimes(1));
  });

  it('shows a retry instead of a spinner when the plant cannot be loaded', async () => {
    await signIn();
    mock.resetHandlers();
    mock.onGet('/me').reply(200, accountFixture);
    mock.onGet('/me/plants').networkErrorOnce();
    mock.onGet('/me/plants').reply(200, [userPlantFixture]);
    renderForm();

    fireEvent.press(await screen.findByText('Try again'));

    expect(await screen.findByText('Monstera')).toBeTruthy();
  });
});
