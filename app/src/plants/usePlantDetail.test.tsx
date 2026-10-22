import React, { type ReactNode } from 'react';
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import MockAdapter from 'axios-mock-adapter';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { z } from 'zod';

import { api } from '../api/client';
import { AuthProvider } from '../auth/AuthProvider';
import { clearTokens, saveTokens } from '../auth/session';
import { plantPhotoSource } from '../api/endpoints';
import { changeLanguage, initI18n } from '../i18n';
import { accountFixture, userPlantFixture } from './testFixtures';
import { resetCapWarning } from '../reminders/sync';
import { deviceTimeZone } from './savePlant';
import { usePlantDetail } from './usePlantDetail';

const mockDispatch = jest.fn<void, [unknown]>();

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual<object>('@react-navigation/native'),
  useNavigation: () => ({ dispatch: mockDispatch }),
}));

let mock: MockAdapter;

/** The PATCH body, so the mocked API can answer with the plant as saved. */
const bodyOf = (data: unknown) => z.record(z.string(), z.unknown()).parse(JSON.parse(String(data)));

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

async function renderDetail(plant = userPlantFixture) {
  await signIn();
  mock.onGet('/me/plants').reply(200, [plant]);
  mock
    .onPatch('/me/plants/p1')
    .reply((config) => [200, { ...plant, ...bodyOf(config.data) }]);
  const hook = renderHook(() => usePlantDetail({ userPlantId: 'p1' }), { wrapper });
  await waitFor(() => expect(hook.result.current.load).toBe('ready'), { timeout: 5000 });
  return hook;
}

const photoAsset = { uri: 'file:///tmp/leaf.jpg', mimeType: 'image/jpeg', width: 1, height: 1 };
const patchBody = (): unknown => JSON.parse(String(mock.history.patch[0]?.data));
const withPhoto = { ...userPlantFixture, hasPhoto: true, photoVersion: 'v1' };

describe('usePlantDetail', () => {
  it('shows the stored schedule with nothing saving', async () => {
    const { result } = await renderDetail();

    expect(result.current.values).toEqual({
      wateringDays: [1, 4],
      reminderTime: '09:30',
      reminderLeadMinutes: 15,
    });
    expect(result.current.requiredDays).toBe(2);
    expect(result.current.savingField).toBeNull();
    expect(result.current.saved).toBe(false);
  });

  it('saves the days alone, shows the response and says Saved for a moment', async () => {
    const { result } = await renderDetail({
      ...userPlantFixture,
      frequency: { times: 3, per: 'week' },
      wateringDays: [1, 4, 7],
    });

    let ok = false;
    await act(async () => {
      ok = await result.current.saveDays([1, 3, 5]);
    });

    expect(ok).toBe(true);
    expect(patchBody()).toEqual({ wateringDays: [1, 3, 5] });
    expect(result.current.values.wateringDays).toEqual([1, 3, 5]);
    expect(result.current.saved).toBe(true);
    expect(result.current.savingField).toBeNull();
    expect(mockDispatch).not.toHaveBeenCalled();
    await waitFor(() => expect(result.current.saved).toBe(false), { timeout: 5000 });
  });

  it('sends the time zone with the reminder time', async () => {
    const { result } = await renderDetail();

    await act(() => result.current.saveReminderTime('13:30'));

    expect(patchBody()).toEqual({ reminderTime: '13:30', timeZone: deviceTimeZone() });
    expect(result.current.values.reminderTime).toBe('13:30');
  });

  it('saves the lead alone', async () => {
    const { result } = await renderDetail();

    await act(() => result.current.saveLead(20));

    expect(patchBody()).toEqual({ reminderLeadMinutes: 20 });
    expect(result.current.values.reminderLeadMinutes).toBe(20);
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it('marks the field being saved until the response arrives', async () => {
    let respond: (value: [number, unknown]) => void = () => undefined;
    const { result } = await renderDetail();
    mock.onPatch('/me/plants/p1').reply(
      () =>
        new Promise<[number, unknown]>((resolve) => {
          respond = resolve;
        }),
    );

    let saving: Promise<boolean> = Promise.resolve(false);
    act(() => {
      saving = result.current.saveLead(20);
    });
    await waitFor(() => expect(mock.history.patch).toHaveLength(1), { timeout: 5000 });
    expect(result.current.savingField).toBe('lead');

    await act(async () => {
      respond([200, { ...userPlantFixture, reminderLeadMinutes: 20 }]);
      await saving;
    });
    expect(result.current.savingField).toBeNull();
  });

  it('keeps the stored value and reports the error when a save fails, then saves again', async () => {
    mock.onPatch('/me/plants/p1').networkErrorOnce();
    const { result } = await renderDetail();

    let ok = true;
    await act(async () => {
      ok = await result.current.saveLead(20);
    });

    expect(ok).toBe(false);
    expect(result.current.values.reminderLeadMinutes).toBe(15);
    expect(result.current.error).toBe('network');
    expect(result.current.saved).toBe(false);
    expect(result.current.savingField).toBeNull();

    await act(async () => {
      ok = await result.current.saveLead(20);
    });
    expect(ok).toBe(true);
    expect(result.current.error).toBeNull();
    expect(result.current.values.reminderLeadMinutes).toBe(20);
  });

  it('shows the default days while the watering asks for a review', async () => {
    const { result } = await renderDetail({
      ...userPlantFixture,
      frequency: { times: 3, per: 'week' },
      wateringDays: [],
      scheduleNeedsReview: true,
    });

    expect(result.current.needsReview).toBe(true);
    expect(result.current.requiredDays).toBe(3);
    expect(result.current.values.wateringDays).toEqual([1, 4, 7]);
  });

  it('keeps a stored 09:15 out of the body when the days change', async () => {
    const { result } = await renderDetail({ ...userPlantFixture, reminderTime: '09:15' });

    await act(() => result.current.saveDays([2, 4]));

    expect(patchBody()).toEqual({ wateringDays: [2, 4] });
  });

  it('has no weekdays for a daily plant', async () => {
    const { result } = await renderDetail({
      ...userPlantFixture,
      frequency: { times: 1, per: 'day' },
      wateringDays: [],
    });

    expect(result.current.requiredDays).toBe(0);
    expect(result.current.values.wateringDays).toEqual([]);
  });

  it('warns once that only 60 reminders fit when a save hits the cap', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const daily = { ...userPlantFixture, frequency: { times: 1, per: 'day' as const }, wateringDays: [] };
    const { result } = await renderDetail();
    mock.onGet('/me/plants').reply(
      200,
      Array.from({ length: 62 }, (_, i) => ({ ...daily, id: `d${i}` })),
    );

    await act(() => result.current.saveLead(10));
    await act(() => result.current.saveLead(5));

    expect(alert).toHaveBeenCalledTimes(1);
    expect(alert).toHaveBeenCalledWith(expect.stringContaining('60 reminders'));
  });

  it('runs one save at a time', async () => {
    const { result } = await renderDetail();

    let results: boolean[] = [];
    await act(async () => {
      results = await Promise.all([result.current.saveLead(10), result.current.saveLead(20)]);
    });

    expect(mock.history.patch).toHaveLength(1);
    expect(results).toEqual([true, false]);
  });

  it('reports a load failure with a retry', async () => {
    await signIn();
    mock.onGet('/me/plants').networkErrorOnce();
    mock.onGet('/me/plants').reply(200, [userPlantFixture]);
    const { result } = renderHook(() => usePlantDetail({ userPlantId: 'p1' }), { wrapper });

    await waitFor(() => expect(result.current.load).toEqual({ error: 'network' }), { timeout: 5000 });
    act(() => result.current.retryLoad());
    await waitFor(() => expect(result.current.load).toBe('ready'), { timeout: 5000 });
  });

  describe('photo', () => {
    it('uploads at once and replaces the plant', async () => {
      mock.onPost('/me/plants/p1/photo').reply(200, { ...userPlantFixture, hasPhoto: true });
      jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValueOnce({
        canceled: false,
        assets: [photoAsset],
      });
      const { result } = await renderDetail();

      await act(() => result.current.changePhoto('gallery'));

      expect(mock.history.post.map((r) => r.url)).toEqual(['/me/plants/p1/photo']);
      expect(result.current.plant?.hasPhoto).toBe(true);
      expect(result.current.photoBusy).toBe(false);
      expect(mock.history.patch).toHaveLength(0);
    });

    it('reports a failed upload', async () => {
      mock.onPost('/me/plants/p1/photo').reply(500);
      jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValueOnce({
        canceled: false,
        assets: [photoAsset],
      });
      const { result } = await renderDetail();

      await act(() => result.current.changePhoto('gallery'));

      expect(result.current.photoMessage).toBe('failed');
      expect(result.current.plant?.hasPhoto).toBe(false);
    });

    it('removes the photo at once', async () => {
      mock.onDelete('/me/plants/p1/photo').reply(200, userPlantFixture);
      const { result } = await renderDetail(withPhoto);

      await act(() => result.current.removePhoto());

      expect(mock.history.delete).toHaveLength(1);
      expect(result.current.plant?.hasPhoto).toBe(false);
    });

    it('says why there is no photo when the permission is denied', async () => {
      jest.mocked(ImagePicker.requestMediaLibraryPermissionsAsync).mockResolvedValueOnce({
        status: ImagePicker.PermissionStatus.DENIED,
        granted: false,
        canAskAgain: false,
        expires: 'never',
      });
      const { result } = await renderDetail();

      await act(() => result.current.changePhoto('gallery'));

      expect(result.current.photoMessage).toBe('denied');
      expect(ImagePicker.launchImageLibraryAsync).not.toHaveBeenCalled();
      expect(mock.history.post).toHaveLength(0);
    });

    it('says why there is no photo when the picker is cancelled', async () => {
      const { result } = await renderDetail();

      await act(() => result.current.changePhoto('gallery'));

      expect(result.current.photoMessage).toBe('cancelled');
    });

    it('says nothing about a missing photo when the picker is cancelled over a saved one', async () => {
      const { result } = await renderDetail(withPhoto);

      await act(() => result.current.changePhoto('gallery'));

      expect(result.current.photoMessage).toBeNull();
    });

    it('asks iOS for the compatible representation so HEIC arrives as JPEG', async () => {
      const { result } = await renderDetail();

      await act(() => result.current.changePhoto('gallery'));

      expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledWith(
        expect.objectContaining({ preferredAssetRepresentationMode: 'compatible' }),
      );
    });

    it('rejects an unsupported photo type with its own message', async () => {
      jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValueOnce({
        canceled: false,
        assets: [{ ...photoAsset, uri: 'file:///tmp/leaf.heic', mimeType: 'image/heic' }],
      });
      const { result } = await renderDetail();

      await act(() => result.current.changePhoto('gallery'));

      expect(result.current.photoMessage).toBe('unsupported');
      expect(mock.history.post).toHaveLength(0);
    });

    it('accepts a photo without a mime type when the extension is known', async () => {
      mock.onPost('/me/plants/p1/photo').reply(200, { ...userPlantFixture, hasPhoto: true });
      jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValueOnce({
        canceled: false,
        assets: [{ uri: 'file:///tmp/leaf.PNG', width: 1, height: 1 }],
      });
      const { result } = await renderDetail();

      await act(() => result.current.changePhoto('gallery'));

      expect(result.current.plant?.hasPhoto).toBe(true);
      expect(mock.history.post).toHaveLength(1);
    });

    it('refreshes once when the saved photo fails, then gives up on it', async () => {
      const { result } = await renderDetail(withPhoto);
      const lists = () => mock.history.get.filter((r) => r.url === '/me/plants').length;
      expect(result.current.photoSource).not.toBeNull();
      // One list for the hook's own load, one for the reminder sync the provider runs at launch.
      await waitFor(() => expect(lists()).toBe(2), { timeout: 5000 });

      await act(() => result.current.handleSavedPhotoError());
      expect(lists()).toBe(3);
      expect(result.current.photoSource).not.toBeNull();

      await act(() => result.current.handleSavedPhotoError());
      expect(lists()).toBe(3);
      expect(result.current.photoSource).toBeNull();
    });

    it('builds the photo source with the token as it is after the list request', async () => {
      await signIn();
      mock.onGet('/me/plants').reply(async () => {
        // A refresh during the list request leaves a newer token behind.
        await saveTokens({ accessToken: 'fresh', refreshToken: 'r2' });
        return [200, [withPhoto]];
      });
      const { result } = renderHook(() => usePlantDetail({ userPlantId: 'p1' }), { wrapper });
      await waitFor(() => expect(result.current.load).toBe('ready'), { timeout: 5000 });

      expect(result.current.photoSource).toEqual(plantPhotoSource(withPhoto, 'fresh'));
    });
  });
});
