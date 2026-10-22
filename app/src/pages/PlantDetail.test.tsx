import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import MockAdapter from 'axios-mock-adapter';
import { StackActions } from '@react-navigation/native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { UserPlant } from '@plantcare/shared';

import { api } from '../api/client';
import { AuthProvider } from '../auth/AuthProvider';
import { clearTokens, saveTokens } from '../auth/session';
import { changeLanguage, initI18n } from '../i18n';
import { resetCapWarning } from '../reminders/sync';
import { accountFixture, userPlantFixture } from '../plants/testFixtures';
import { PlantDetail } from './PlantDetail';

const mockDispatch = jest.fn<void, [unknown]>();
const mockGoBack = jest.fn();

jest.mock('react-native-svg', () => {
  const { createElement } = jest.requireActual<typeof import('react')>('react');
  return { SvgFromUri: (props: object) => createElement('SvgFromUri', props) };
});

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual<object>('@react-navigation/native'),
  useNavigation: () => ({ dispatch: mockDispatch, goBack: mockGoBack }),
  useRoute: () => ({ key: 'PlantDetail-1', name: 'PlantDetail', params: { userPlantId: 'p1' } }),
}));

let mock: MockAdapter;

beforeAll(initI18n);

beforeEach(async () => {
  mock = new MockAdapter(api);
  mockDispatch.mockClear();
  mockGoBack.mockClear();
  resetCapWarning();
  await clearTokens();
  await AsyncStorage.clear();
  await changeLanguage('en');
});

afterEach(() => mock.restore());

async function renderScreen(plant: UserPlant = userPlantFixture) {
  await saveTokens({ accessToken: 'a', refreshToken: 'r' });
  mock.onGet('/me').reply(200, accountFixture);
  mock.onGet('/me/plants').reply(200, [plant]);
  mock.onPatch('/me/plants/p1').reply(200, plant);
  render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <AuthProvider>
        <PlantDetail />
      </AuthProvider>
    </SafeAreaProvider>,
  );
  await screen.findByText('Monstera', undefined, { timeout: 5000 });
}

const saveButton = () => screen.getByRole('button', { name: 'Save' });
const day = (name: string) => screen.getByRole('checkbox', { name });

describe('PlantDetail', () => {
  it('shows the species and its care facts', async () => {
    await renderScreen();

    expect(screen.getByText('Monstera deliciosa')).toBeTruthy();
    expect(screen.getByText('Big leaves.')).toBeTruthy();
    expect(screen.getByText('Easy')).toBeTruthy();
    expect(screen.getByText('Partial shade')).toBeTruthy();
    expect(screen.getByText('2x a week')).toBeTruthy();
  });

  it('checks the saved watering days and ignores a third day on a 2x plant', async () => {
    await renderScreen();

    expect(day('Monday')).toBeChecked();
    expect(day('Thursday')).toBeChecked();
    expect(day('Wednesday')).not.toBeChecked();
    expect(screen.getByText('Pick 2 days')).toBeTruthy();

    fireEvent.press(day('Wednesday'));

    expect(day('Wednesday')).not.toBeChecked();
    expect(day('Monday')).toBeChecked();
    expect(day('Thursday')).toBeChecked();
    expect(saveButton()).toBeDisabled();
  });

  it('enables Save after a change, sends only the lead and confirms', async () => {
    await renderScreen();
    expect(saveButton()).toBeDisabled();

    fireEvent.press(screen.getByRole('radio', { name: '20 min' }));
    expect(saveButton()).toBeEnabled();
    fireEvent.press(saveButton());

    await waitFor(() => expect(mockDispatch).toHaveBeenCalledTimes(1), { timeout: 5000 });
    expect(JSON.parse(String(mock.history.patch[0]?.data))).toEqual({ reminderLeadMinutes: 20 });
    expect(mockDispatch.mock.calls[0]?.[0]).toMatchObject({
      type: StackActions.replace('Confirmation').type,
      payload: { name: 'Confirmation', params: { title: 'Done', nextScreen: 'MyPlants' } },
    });
  });

  it('lists every half hour in the time sheet and takes the picked time', async () => {
    await renderScreen();

    fireEvent.press(screen.getByRole('button', { name: 'Time, 09:30' }));

    const rows = screen.getAllByRole('radio', { name: /^\d{2}:\d{2}$/ });
    expect(rows).toHaveLength(48);
    expect(rows[0]).toHaveAccessibleName('00:00');
    expect(rows[47]).toHaveAccessibleName('23:30');
    expect(screen.getByRole('radio', { name: '09:30' })).toBeChecked();

    fireEvent.press(screen.getByRole('radio', { name: '13:30' }));

    await waitFor(() => expect(screen.queryByRole('radio', { name: '13:30' })).toBeNull(), {
      timeout: 5000,
    });
    expect(screen.getByRole('button', { name: 'Time, 13:30' })).toBeTruthy();
    expect(saveButton()).toBeEnabled();
  }, 15000);

  it('shows a stored off-grid time above the list without checking a row', async () => {
    await renderScreen({ ...userPlantFixture, reminderTime: '09:15' });

    fireEvent.press(screen.getByRole('button', { name: 'Time, 09:15' }));

    expect(screen.getAllByText('09:15').length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByRole('radio', { name: /^\d{2}:\d{2}$/, checked: true })).toBeNull();
  });

  it('hides the days for a daily plant', async () => {
    await renderScreen({ ...userPlantFixture, frequency: { times: 1, per: 'day' }, wateringDays: [] });

    expect(screen.getByText('Every day')).toBeTruthy();
    expect(screen.queryByText('Watering days')).toBeNull();
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
  });

  it('asks for the days again when the watering changed', async () => {
    await renderScreen({
      ...userPlantFixture,
      frequency: { times: 3, per: 'week' },
      wateringDays: [],
      scheduleNeedsReview: true,
    });

    expect(
      screen.getByText('The watering for this plant changed. Pick 3 days.'),
    ).toBeTruthy();
    expect(screen.getByText('3x a week')).toBeTruthy();
    expect(saveButton()).toBeEnabled();
  });

  it('goes back from the header', async () => {
    await renderScreen();

    fireEvent.press(screen.getByRole('button', { name: 'Back' }));

    expect(mockGoBack).toHaveBeenCalledTimes(1);
  });

  describe('photo sheet', () => {
    it('offers a photo from the camera or the gallery, without remove when there is none', async () => {
      await renderScreen();

      fireEvent.press(screen.getByRole('button', { name: 'Edit photo' }));

      expect(screen.getByRole('button', { name: 'Take a photo' })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Choose from gallery' })).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Remove photo' })).toBeNull();
    });

    it('removes a saved photo once the sheet has closed', async () => {
      const withPhoto = { ...userPlantFixture, hasPhoto: true, photoVersion: 'v1' };
      mock.onDelete('/me/plants/p1/photo').reply(200, userPlantFixture);
      await renderScreen(withPhoto);

      fireEvent.press(screen.getByRole('button', { name: 'Edit photo' }));
      fireEvent.press(screen.getByRole('button', { name: 'Remove photo' }));

      await waitFor(() => expect(mock.history.delete).toHaveLength(1), { timeout: 5000 });
      await waitFor(() => expect(screen.queryByText('Remove photo')).toBeNull(), { timeout: 5000 });
    }, 15000);
  });
});
