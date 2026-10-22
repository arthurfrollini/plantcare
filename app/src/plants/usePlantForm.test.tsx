import React, { type ReactNode } from 'react';
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import MockAdapter from 'axios-mock-adapter';
import { StackActions } from '@react-navigation/native';
import { act, renderHook, waitFor } from '@testing-library/react-native';

import { api } from '../api/client';
import { AuthProvider } from '../auth/AuthProvider';
import { clearTokens, saveTokens } from '../auth/session';
import { plantPhotoSource } from '../api/endpoints';
import { changeLanguage, initI18n } from '../i18n';
import { accountFixture, userPlantFixture } from './testFixtures';
import { resetCapWarning } from '../reminders/sync';
import { deviceTimeZone, normalizeTimeZone } from './savePlant';
import { usePlantForm } from './usePlantForm';

const mockDispatch = jest.fn<void, [unknown]>();

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual<object>('@react-navigation/native'),
  useNavigation: () => ({ dispatch: mockDispatch }),
}));

let mock: MockAdapter;

beforeAll(initI18n);

beforeEach(async () => {
  mock = new MockAdapter(api);
  mockDispatch.mockClear();
  resetCapWarning();
  jest.mocked(ImagePicker.launchImageLibraryAsync).mockClear();
  await clearTokens();
  await AsyncStorage.clear();
  await changeLanguage('en');
});

afterEach(() => {
  mock.restore();
  jest.restoreAllMocks();
});

function wrapper({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}

async function signIn() {
  await saveTokens({ accessToken: 'a', refreshToken: 'r' });
  mock.onGet('/me').reply(200, accountFixture);
}

async function renderEdit(plant = userPlantFixture) {
  await signIn();
  mock.onGet('/me/plants').reply(200, [plant]);
  mock.onPatch('/me/plants/p1').reply(200, plant);
  const hook = renderHook(() => usePlantForm({ userPlantId: 'p1' }), { wrapper });
  await waitFor(() => expect(hook.result.current.load.state).toBe('ready'));
  await waitFor(() => expect(hook.result.current.status).toBe('signedIn'));
  return hook;
}

const photoAsset = { uri: 'file:///tmp/leaf.jpg', mimeType: 'image/jpeg', width: 1, height: 1 };

describe('usePlantForm', () => {
  it('pre-fills from the saved plant and sends only the changed fields', async () => {
    const { result } = await renderEdit();

    expect(result.current.nickname).toBe('Pikachu');
    expect(result.current.reminderTime).toBe('09:30');
    expect(result.current.frequency).toEqual({ times: 2, per: 'week' });

    act(() => result.current.setNotes('Near the window'));
    await act(() => result.current.submit());

    expect(JSON.parse(String(mock.history.patch[0]?.data))).toEqual({ notes: 'Near the window' });
    expect(mockDispatch).toHaveBeenCalledTimes(1);
    expect(mockDispatch.mock.calls[0]?.[0]).toMatchObject({
      type: StackActions.replace('Confirmation').type,
      payload: { name: 'Confirmation', params: { title: 'Done', nextScreen: 'MyPlants' } },
    });
  });

  it('warns once that only 60 reminders fit when a save hits the cap', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const daily = { ...userPlantFixture, frequency: { times: 1, per: 'day' as const } };
    const { result } = await renderEdit();
    mock.onGet('/me/plants').reply(
      200,
      Array.from({ length: 62 }, (_, i) => ({ ...daily, id: `d${i}` })),
    );

    act(() => result.current.setNotes('a'));
    await act(() => result.current.submit());
    act(() => result.current.setNotes('b'));
    await act(() => result.current.submit());

    expect(alert).toHaveBeenCalledTimes(1);
    expect(alert).toHaveBeenCalledWith(expect.stringContaining('60 reminders'));
  });

  it('does not warn when the reminders all fit', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const { result } = await renderEdit();

    act(() => result.current.setNotes('Near the window'));
    await act(() => result.current.submit());

    expect(alert).not.toHaveBeenCalled();
  });

  it('saves once when Save is tapped twice', async () => {
    const { result } = await renderEdit();

    act(() => result.current.setNotes('Near the window'));
    await act(async () => {
      await Promise.all([result.current.submit(), result.current.submit()]);
    });

    expect(mock.history.patch).toHaveLength(1);
  });

  it('forces times to 1 per day', async () => {
    const { result } = await renderEdit();

    act(() => result.current.setPer('day'));
    act(() => result.current.setTimes(5));
    expect(result.current.frequency).toEqual({ times: 1, per: 'day' });

    act(() => result.current.setPer('week'));
    act(() => result.current.setTimes(5));
    expect(result.current.frequency).toEqual({ times: 5, per: 'week' });
  });

  it('saves without a photo and says why when the permission is denied', async () => {
    jest.mocked(ImagePicker.requestMediaLibraryPermissionsAsync).mockResolvedValueOnce({
      status: ImagePicker.PermissionStatus.DENIED,
      granted: false,
      canAskAgain: false,
      expires: 'never',
    });
    const { result } = await renderEdit();

    await act(() => result.current.pickPhoto('gallery'));
    expect(result.current.photoMessage).toBe('denied');
    expect(result.current.photo).toBeNull();
    expect(ImagePicker.launchImageLibraryAsync).not.toHaveBeenCalled();

    act(() => result.current.setNotes('Near the window'));
    await act(() => result.current.submit());
    expect(mock.history.post).toHaveLength(0);
    expect(mockDispatch).toHaveBeenCalledTimes(1);
  });

  it('says why there is no photo when the picker is cancelled', async () => {
    const { result } = await renderEdit();

    await act(() => result.current.pickPhoto('gallery'));

    expect(result.current.photoMessage).toBe('cancelled');
  });

  it('shows the network error and lets Save run again', async () => {
    // Registered before renderEdit's own PATCH reply, so the first save hits it.
    mock.onPatch('/me/plants/p1').networkErrorOnce();
    const { result } = await renderEdit();

    act(() => result.current.setNotes('Near the window'));
    await act(() => result.current.submit());
    expect(result.current.error).toBe('network');
    expect(result.current.saving).toBe(false);
    expect(mockDispatch).not.toHaveBeenCalled();

    await act(() => result.current.submit());
    expect(result.current.error).toBeNull();
    expect(mockDispatch).toHaveBeenCalledTimes(1);
  });

  it('reports a load failure with a retry', async () => {
    await signIn();
    mock.onGet('/me/plants').networkErrorOnce();
    mock.onGet('/me/plants').reply(200, [userPlantFixture]);
    const { result } = renderHook(() => usePlantForm({ userPlantId: 'p1' }), { wrapper });

    await waitFor(() => expect(result.current.load).toEqual({ state: 'error', error: 'network' }));
    act(() => result.current.retryLoad());
    await waitFor(() => expect(result.current.load.state).toBe('ready'));
  });

  it('asks iOS for the compatible representation so HEIC arrives as JPEG', async () => {
    const { result } = await renderEdit();

    await act(() => result.current.pickPhoto('gallery'));

    expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledWith(
      expect.objectContaining({ preferredAssetRepresentationMode: 'compatible' }),
    );
  });

  it('rejects an unsupported photo type with its own message and keeps no photo', async () => {
    jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValueOnce({
      canceled: false,
      assets: [{ ...photoAsset, uri: 'file:///tmp/leaf.heic', mimeType: 'image/heic' }],
    });
    const { result } = await renderEdit();

    await act(() => result.current.pickPhoto('gallery'));

    expect(result.current.photoMessage).toBe('unsupported');
    expect(result.current.photo).toBeNull();
  });

  it('accepts a photo without a mime type when the extension is known', async () => {
    jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: 'file:///tmp/leaf.PNG', width: 1, height: 1 }],
    });
    const { result } = await renderEdit();

    await act(() => result.current.pickPhoto('gallery'));

    expect(result.current.photo).toEqual({ uri: 'file:///tmp/leaf.PNG', mimeType: 'image/png' });
  });

  describe('editing', () => {
    it('sends the time zone with a changed reminder time, and nothing else', async () => {
      const { result } = await renderEdit();

      act(() => result.current.setReminderTime('06:45'));
      await act(() => result.current.submit());

      expect(JSON.parse(String(mock.history.patch[0]?.data))).toEqual({
        reminderTime: '06:45',
        timeZone: deviceTimeZone(),
      });
    });

    it('only uploads when just the photo changed', async () => {
      mock.onPost('/me/plants/p1/photo').reply(200, { ...userPlantFixture, hasPhoto: true });
      jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValueOnce({
        canceled: false,
        assets: [photoAsset],
      });
      const { result } = await renderEdit();

      await act(() => result.current.pickPhoto('gallery'));
      await act(() => result.current.submit());

      expect(mock.history.patch).toHaveLength(0);
      expect(mock.history.post.map((r) => r.url)).toEqual(['/me/plants/p1/photo']);
      expect(mockDispatch).toHaveBeenCalledTimes(1);
    });

    it('confirms with the photo notice when the upload fails', async () => {
      mock.onPost('/me/plants/p1/photo').reply(500);
      jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValueOnce({
        canceled: false,
        assets: [photoAsset],
      });
      const { result } = await renderEdit();

      act(() => result.current.setNotes('Near the window'));
      await act(() => result.current.pickPhoto('gallery'));
      await act(() => result.current.submit());

      expect(mock.history.patch).toHaveLength(1);
      expect(JSON.stringify(mockDispatch.mock.calls[0]?.[0])).toContain("the photo wasn't");
    });

    it('says nothing about a missing photo when the picker is cancelled over a saved one', async () => {
      const { result } = await renderEdit({ ...userPlantFixture, hasPhoto: true, photoVersion: 'v1' });

      await act(() => result.current.pickPhoto('gallery'));

      expect(result.current.photoMessage).toBeNull();
    });

    it('refreshes once when the saved photo fails, then gives up on it', async () => {
      const { result } = await renderEdit({ ...userPlantFixture, hasPhoto: true, photoVersion: 'v1' });
      const lists = () => mock.history.get.filter((r) => r.url === '/me/plants').length;
      expect(result.current.savedPhoto).not.toBeNull();
      // One list for the form's own load, one for the reminder sync the provider runs at launch.
      await waitFor(() => expect(lists()).toBe(2));

      await act(() => result.current.handleSavedPhotoError());
      expect(lists()).toBe(3);
      expect(result.current.savedPhoto).not.toBeNull();

      await act(() => result.current.handleSavedPhotoError());
      expect(lists()).toBe(3);
      expect(result.current.savedPhoto).toBeNull();
    });

    it('says nothing about a missing photo when the picker is cancelled after one was picked', async () => {
      jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValueOnce({
        canceled: false,
        assets: [photoAsset],
      });
      const { result } = await renderEdit();

      await act(() => result.current.pickPhoto('gallery'));
      await act(() => result.current.pickPhoto('gallery'));

      expect(result.current.photo).not.toBeNull();
      expect(result.current.photoMessage).toBeNull();
    });

    it('builds the saved photo source with the token as it is after the list request', async () => {
      await signIn();
      const saved = { ...userPlantFixture, hasPhoto: true, photoVersion: 'v1' };
      mock.onGet('/me/plants').reply(async () => {
        // A refresh during the list request leaves a newer token behind.
        await saveTokens({ accessToken: 'fresh', refreshToken: 'r2' });
        return [200, [saved]];
      });
      const { result } = renderHook(() => usePlantForm({ userPlantId: 'p1' }), {
        wrapper,
      });
      await waitFor(() => expect(result.current.load.state).toBe('ready'));

      expect(result.current.savedPhoto).toEqual(plantPhotoSource(saved, 'fresh'));
    });
  });

  it('falls back to UTC for a time zone the API would reject', () => {
    expect(normalizeTimeZone('GMT')).toBe('UTC');
    expect(normalizeTimeZone('')).toBe('UTC');
    expect(normalizeTimeZone(undefined)).toBe('UTC');
    expect(normalizeTimeZone('Not/AZone')).toBe('UTC');
    expect(normalizeTimeZone('America/Sao_Paulo')).toBe('America/Sao_Paulo');
  });
});
