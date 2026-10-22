import React, { type ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import MockAdapter from 'axios-mock-adapter';
import { StackActions } from '@react-navigation/native';
import { act, renderHook, waitFor } from '@testing-library/react-native';

import { api } from '../api/client';
import { AuthProvider } from '../auth/AuthProvider';
import { clearTokens, saveTokens } from '../auth/session';
import { changeLanguage, initI18n } from '../i18n';
import { PENDING_SAVE_KEY } from './pendingSave';
import { accountFixture, catalogFixture, userPlantFixture } from './testFixtures';
import { deviceTimeZone } from './savePlant';
import { usePlantForm, type PlantFormParams } from './usePlantForm';

const mockNavigate = jest.fn();
const mockDispatch = jest.fn<void, [unknown]>();

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual<object>('@react-navigation/native'),
  useNavigation: () => ({ navigate: mockNavigate, dispatch: mockDispatch }),
}));

let mock: MockAdapter;

beforeAll(initI18n);

beforeEach(async () => {
  mock = new MockAdapter(api);
  mockNavigate.mockClear();
  mockDispatch.mockClear();
  jest.mocked(ImagePicker.launchImageLibraryAsync).mockClear();
  await clearTokens();
  await AsyncStorage.clear();
  await changeLanguage('en');
});

afterEach(() => mock.restore());

function wrapper({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}

async function signIn() {
  await saveTokens({ accessToken: 'a', refreshToken: 'r' });
  mock.onGet('/me').reply(200, accountFixture);
}

const createParams: PlantFormParams = { mode: 'create', catalogPlantId: 'c1' };

async function renderCreate(options: { signedIn: boolean } = { signedIn: true }) {
  if (options.signedIn) await signIn();
  mock.onGet('/plants/c1').reply(200, catalogFixture);
  mock.onGet('/me/plants').reply(200, []);
  const hook = renderHook(() => usePlantForm(createParams), { wrapper });
  await waitFor(() => expect(hook.result.current.load.state).toBe('ready'));
  if (options.signedIn) await waitFor(() => expect(hook.result.current.status).toBe('signedIn'));
  else await waitFor(() => expect(hook.result.current.status).toBe('signedOut'));
  return hook;
}

function lastBody(history: MockAdapter['history']['post']): unknown {
  return JSON.parse(String(history[history.length - 1]?.data));
}

const photoAsset = { uri: 'file:///tmp/leaf.jpg', mimeType: 'image/jpeg', width: 1, height: 1 };

describe('usePlantForm', () => {
  it('pre-fills frequency and light from the species when creating', async () => {
    const { result } = await renderCreate();

    expect(result.current.frequency).toEqual({ times: 2, per: 'week' });
    expect(result.current.light).toBe('partial_shade');
    expect(result.current.nickname).toBe('');
    expect(result.current.species?.name).toBe('Monstera');
  });

  it('posts the plant with the device time zone, then uploads the photo', async () => {
    mock.onPost('/me/plants').reply(201, userPlantFixture);
    mock.onPost('/me/plants/p1/photo').reply(200, { ...userPlantFixture, hasPhoto: true });
    jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValueOnce({
      canceled: false,
      assets: [photoAsset],
    });
    const { result } = await renderCreate();

    act(() => result.current.setNickname('Pikachu'));
    act(() => result.current.setReminderTime('07:15'));
    await act(() => result.current.pickPhoto('gallery'));
    await act(() => result.current.submit());

    expect(lastBody(mock.history.post.filter((r) => r.url === '/me/plants'))).toEqual({
      catalogPlantId: 'c1',
      nickname: 'Pikachu',
      frequency: { times: 2, per: 'week' },
      reminderTime: '07:15',
      timeZone: deviceTimeZone(),
      light: 'partial_shade',
    });
    expect(mock.history.post.map((r) => r.url)).toEqual(['/me/plants', '/me/plants/p1/photo']);
    expect(mockDispatch).toHaveBeenCalledTimes(1);
    expect(mockDispatch.mock.calls[0]?.[0]).toMatchObject({
      type: StackActions.replace('Confirmation').type,
      payload: { name: 'Confirmation', params: { title: 'Done', nextScreen: 'MyPlants' } },
    });
  });

  it('creates once when Save is tapped twice', async () => {
    mock.onPost('/me/plants').reply(201, userPlantFixture);
    const { result } = await renderCreate();

    await act(async () => {
      await Promise.all([result.current.submit(), result.current.submit()]);
    });

    expect(mock.history.post).toHaveLength(1);
  });

  it('stores a pending save and opens sign up when signed out', async () => {
    const { result } = await renderCreate({ signedIn: false });

    act(() => result.current.setNickname('Pikachu'));
    await act(() => result.current.submit());

    expect(mock.history.post).toHaveLength(0);
    expect(mockNavigate).toHaveBeenCalledWith('Auth', {
      mode: 'signUp',
      afterAuth: 'savePendingPlant',
    });
    const stored: unknown = JSON.parse((await AsyncStorage.getItem(PENDING_SAVE_KEY)) ?? 'null');
    expect(stored).toMatchObject({ catalogPlantId: 'c1', nickname: 'Pikachu' });
  });

  it('forces times to 1 per day', async () => {
    const { result } = await renderCreate();

    act(() => result.current.setPer('day'));
    act(() => result.current.setTimes(5));
    expect(result.current.frequency).toEqual({ times: 1, per: 'day' });

    act(() => result.current.setPer('week'));
    act(() => result.current.setTimes(5));
    expect(result.current.frequency).toEqual({ times: 5, per: 'week' });
  });

  it('pre-fills from the saved plant and sends only the changed fields when editing', async () => {
    await signIn();
    mock.onGet('/me/plants').reply(200, [userPlantFixture]);
    mock.onPatch('/me/plants/p1').reply(200, userPlantFixture);
    const { result } = renderHook(() => usePlantForm({ mode: 'edit', userPlantId: 'p1' }), {
      wrapper,
    });
    await waitFor(() => expect(result.current.load.state).toBe('ready'));
    await waitFor(() => expect(result.current.status).toBe('signedIn'));

    expect(result.current.nickname).toBe('Pikachu');
    expect(result.current.reminderTime).toBe('09:30');
    expect(result.current.frequency).toEqual({ times: 2, per: 'week' });

    act(() => result.current.setNotes('Near the window'));
    await act(() => result.current.submit());

    expect(JSON.parse(String(mock.history.patch[0]?.data))).toEqual({ notes: 'Near the window' });
    expect(mockDispatch).toHaveBeenCalledTimes(1);
  });

  it('saves without a photo and says why when the permission is denied', async () => {
    jest.mocked(ImagePicker.requestMediaLibraryPermissionsAsync).mockResolvedValueOnce({
      status: ImagePicker.PermissionStatus.DENIED,
      granted: false,
      canAskAgain: false,
      expires: 'never',
    });
    mock.onPost('/me/plants').reply(201, userPlantFixture);
    const { result } = await renderCreate();

    await act(() => result.current.pickPhoto('gallery'));
    expect(result.current.photoMessage).toBe('denied');
    expect(result.current.photo).toBeNull();
    expect(ImagePicker.launchImageLibraryAsync).not.toHaveBeenCalled();

    await act(() => result.current.submit());
    expect(mock.history.post.map((r) => r.url)).toEqual(['/me/plants']);
    expect(mockDispatch).toHaveBeenCalledTimes(1);
  });

  it('saves without a photo and says why when the picker is cancelled', async () => {
    mock.onPost('/me/plants').reply(201, userPlantFixture);
    const { result } = await renderCreate();

    await act(() => result.current.pickPhoto('gallery'));
    expect(result.current.photoMessage).toBe('cancelled');

    await act(() => result.current.submit());
    expect(mock.history.post.map((r) => r.url)).toEqual(['/me/plants']);
  });

  it('still confirms, with a notice, when the photo upload fails, and does not create again', async () => {
    mock.onPost('/me/plants').reply(201, userPlantFixture);
    mock.onPost('/me/plants/p1/photo').reply(500);
    jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValueOnce({
      canceled: false,
      assets: [photoAsset],
    });
    const { result } = await renderCreate();

    await act(() => result.current.pickPhoto('gallery'));
    await act(() => result.current.submit());

    expect(mock.history.post.filter((r) => r.url === '/me/plants')).toHaveLength(1);
    expect(mockDispatch.mock.calls[0]?.[0]).toMatchObject({
      payload: { name: 'Confirmation' },
    });
    expect(JSON.stringify(mockDispatch.mock.calls[0]?.[0])).toContain("the photo wasn't");
  });

  it('shows the network error and lets Save run again', async () => {
    mock.onPost('/me/plants').networkErrorOnce();
    mock.onPost('/me/plants').reply(201, userPlantFixture);
    const { result } = await renderCreate();

    await act(() => result.current.submit());
    expect(result.current.error).toBe('network');
    expect(result.current.saving).toBe(false);
    expect(mockDispatch).not.toHaveBeenCalled();

    await act(() => result.current.submit());
    expect(result.current.error).toBeNull();
    expect(mockDispatch).toHaveBeenCalledTimes(1);
  });

  it('reports a load failure with a retry', async () => {
    mock.onGet('/plants/c1').networkErrorOnce();
    mock.onGet('/plants/c1').reply(200, catalogFixture);
    const { result } = renderHook(() => usePlantForm(createParams), { wrapper });

    await waitFor(() => expect(result.current.load).toEqual({ state: 'error', error: 'network' }));
    act(() => result.current.retryLoad());
    await waitFor(() => expect(result.current.load.state).toBe('ready'));
  });
});
