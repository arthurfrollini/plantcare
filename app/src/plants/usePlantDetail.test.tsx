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
import { deviceTimeZone } from './savePlant';
import { usePlantDetail } from './usePlantDetail';

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

async function renderDetail(plant = userPlantFixture) {
  await signIn();
  mock.onGet('/me/plants').reply(200, [plant]);
  mock.onPatch('/me/plants/p1').reply(200, plant);
  const hook = renderHook(() => usePlantDetail({ userPlantId: 'p1' }), { wrapper });
  await waitFor(() => expect(hook.result.current.load).toBe('ready'), { timeout: 5000 });
  return hook;
}

const photoAsset = { uri: 'file:///tmp/leaf.jpg', mimeType: 'image/jpeg', width: 1, height: 1 };
const patchBody = (): unknown => JSON.parse(String(mock.history.patch[0]?.data));
const withPhoto = { ...userPlantFixture, hasPhoto: true, photoVersion: 'v1' };

describe('usePlantDetail', () => {
  it('starts from the saved schedule and sends only the changed fields', async () => {
    const { result } = await renderDetail();

    expect(result.current.values).toEqual({
      wateringDays: [1, 4],
      reminderTime: '09:30',
      reminderLeadMinutes: 15,
    });
    expect(result.current.requiredDays).toBe(2);
    expect(result.current.canSave).toBe(false);

    act(() => result.current.setLead(10));
    expect(result.current.canSave).toBe(true);
    await act(() => result.current.save());

    expect(patchBody()).toEqual({ reminderLeadMinutes: 10 });
    expect(mockDispatch).toHaveBeenCalledTimes(1);
    expect(mockDispatch.mock.calls[0]?.[0]).toMatchObject({
      type: StackActions.replace('Confirmation').type,
      payload: { name: 'Confirmation', params: { title: 'Done', nextScreen: 'MyPlants' } },
    });
  });

  it('sends the time zone with a changed reminder time', async () => {
    const { result } = await renderDetail();

    act(() => result.current.setReminderTime('06:30'));
    await act(() => result.current.save());

    expect(patchBody()).toEqual({ reminderTime: '06:30', timeZone: deviceTimeZone() });
  });

  it('preselects the default days after a review and allows Save', async () => {
    const { result } = await renderDetail({
      ...userPlantFixture,
      frequency: { times: 3, per: 'week' },
      wateringDays: [],
      scheduleNeedsReview: true,
    });

    expect(result.current.needsReview).toBe(true);
    expect(result.current.requiredDays).toBe(3);
    expect(result.current.values.wateringDays).toEqual([1, 3, 5]);
    expect(result.current.canSave).toBe(true);

    await act(() => result.current.save());
    expect(patchBody()).toEqual({ wateringDays: [1, 3, 5] });
  });

  it('keeps a stored 09:15 out of the body when only the days change', async () => {
    const { result } = await renderDetail({ ...userPlantFixture, reminderTime: '09:15' });

    act(() => result.current.toggleDay(4));
    act(() => result.current.toggleDay(5));
    expect(result.current.values.wateringDays).toEqual([1, 5]);
    await act(() => result.current.save());

    expect(patchBody()).toEqual({ wateringDays: [1, 5] });
    expect(mockDispatch).toHaveBeenCalledTimes(1);
  });

  it('moves the selection for a monthly plant instead of ignoring the second tap', async () => {
    const { result } = await renderDetail({
      ...userPlantFixture,
      frequency: { times: 1, per: 'month' },
      wateringDays: [1],
    });

    expect(result.current.requiredDays).toBe(1);
    act(() => result.current.toggleDay(3));
    expect(result.current.values.wateringDays).toEqual([3]);
    act(() => result.current.toggleDay(5));
    expect(result.current.values.wateringDays).toEqual([5]);
    expect(result.current.canSave).toBe(true);
  });

  it('ignores a fourth day on a 3x a week plant and needs all three to save', async () => {
    const { result } = await renderDetail({
      ...userPlantFixture,
      frequency: { times: 3, per: 'week' },
      wateringDays: [1, 3, 5],
    });

    act(() => result.current.toggleDay(7));
    expect(result.current.values.wateringDays).toEqual([1, 3, 5]);

    act(() => result.current.toggleDay(5));
    expect(result.current.values.wateringDays).toEqual([1, 3]);
    expect(result.current.canSave).toBe(false);
    await act(() => result.current.save());
    expect(mock.history.patch).toHaveLength(0);
  });

  it('has no weekdays for a daily plant and can still save a time change', async () => {
    const { result } = await renderDetail({
      ...userPlantFixture,
      frequency: { times: 1, per: 'day' },
      wateringDays: [],
    });

    expect(result.current.requiredDays).toBe(0);
    act(() => result.current.toggleDay(2));
    expect(result.current.values.wateringDays).toEqual([]);
    expect(result.current.canSave).toBe(false);

    act(() => result.current.setReminderTime('07:00'));
    expect(result.current.canSave).toBe(true);
    await act(() => result.current.save());
    expect(patchBody()).toEqual({ reminderTime: '07:00', timeZone: deviceTimeZone() });
  });

  it('warns once that only 60 reminders fit when a save hits the cap', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const daily = { ...userPlantFixture, frequency: { times: 1, per: 'day' as const }, wateringDays: [] };
    const { result } = await renderDetail();
    mock.onGet('/me/plants').reply(
      200,
      Array.from({ length: 62 }, (_, i) => ({ ...daily, id: `d${i}` })),
    );

    act(() => result.current.setLead(10));
    await act(() => result.current.save());
    act(() => result.current.setLead(5));
    await act(() => result.current.save());

    expect(alert).toHaveBeenCalledTimes(1);
    expect(alert).toHaveBeenCalledWith(expect.stringContaining('60 reminders'));
  });

  it('saves once when Save is tapped twice', async () => {
    const { result } = await renderDetail();

    act(() => result.current.setLead(10));
    await act(async () => {
      await Promise.all([result.current.save(), result.current.save()]);
    });

    expect(mock.history.patch).toHaveLength(1);
  });

  it('shows the network error and lets Save run again', async () => {
    mock.onPatch('/me/plants/p1').networkErrorOnce();
    const { result } = await renderDetail();

    act(() => result.current.setLead(10));
    await act(() => result.current.save());
    expect(result.current.error).toBe('network');
    expect(result.current.saving).toBe(false);
    expect(mockDispatch).not.toHaveBeenCalled();

    await act(() => result.current.save());
    expect(result.current.error).toBeNull();
    expect(mockDispatch).toHaveBeenCalledTimes(1);
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
    it('uploads at once, replaces the plant and keeps the schedule edits', async () => {
      mock.onPost('/me/plants/p1/photo').reply(200, { ...userPlantFixture, hasPhoto: true });
      jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValueOnce({
        canceled: false,
        assets: [photoAsset],
      });
      const { result } = await renderDetail();

      act(() => result.current.setLead(10));
      await act(() => result.current.changePhoto('gallery'));

      expect(mock.history.post.map((r) => r.url)).toEqual(['/me/plants/p1/photo']);
      expect(result.current.plant?.hasPhoto).toBe(true);
      expect(result.current.values.reminderLeadMinutes).toBe(10);
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
