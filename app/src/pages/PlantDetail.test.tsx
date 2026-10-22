import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import MockAdapter from 'axios-mock-adapter';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { UserPlant } from '@plantcare/shared';
import { z } from 'zod';

import { api } from '../api/client';
import { AuthProvider } from '../auth/AuthProvider';
import { clearTokens, saveTokens } from '../auth/session';
import { changeLanguage, initI18n } from '../i18n';
import { resetCapWarning } from '../reminders/sync';
import { deviceTimeZone } from '../plants/savePlant';
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

/** The PATCH body, so the mocked API can answer with the plant as saved. */
const bodyOf = (data: unknown) => z.record(z.string(), z.unknown()).parse(JSON.parse(String(data)));

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
  mock
    .onPatch('/me/plants/p1')
    .reply((config) => [200, { ...plant, ...bodyOf(config.data) }]);
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

const patchBody = (): unknown => JSON.parse(String(mock.history.patch[0]?.data));
const checkbox = (name: string) => screen.getByRole('checkbox', { name });
const threeTimes: UserPlant = {
  ...userPlantFixture,
  frequency: { times: 3, per: 'week' },
  wateringDays: [1, 4, 7],
};

async function openDaysSheet() {
  fireEvent.press(screen.getByRole('button', { name: 'Edit watering days' }));
  await waitFor(() => expect(screen.getAllByRole('checkbox')).toHaveLength(7), { timeout: 5000 });
}

describe('PlantDetail', () => {
  it('shows the species and its care facts', async () => {
    await renderScreen();

    expect(screen.getByText('Monstera deliciosa')).toBeTruthy();
    expect(screen.getByText('Big leaves.')).toBeTruthy();
    expect(screen.getByText('Easy')).toBeTruthy();
    expect(screen.getByText('Partial shade')).toBeTruthy();
    expect(screen.getByText('2x a week')).toBeTruthy();
  });

  it('shows the watering days read-only, with no Save bar', async () => {
    await renderScreen();

    expect(screen.getByText('Watering days')).toBeTruthy();
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    expect(screen.getByLabelText('Monday')).toBeSelected();
    expect(screen.getByLabelText('Thursday')).toBeSelected();
    expect(screen.getByLabelText('Wednesday')).not.toBeSelected();

    fireEvent.press(screen.getByLabelText('Wednesday'));

    expect(screen.getByLabelText('Wednesday')).not.toBeSelected();
    expect(mock.history.patch).toHaveLength(0);
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
  });

  it('opens the days sheet with nothing picked and counts up to the required days', async () => {
    await renderScreen(threeTimes);

    await openDaysSheet();

    expect(screen.getByText('Pick 3 days · 0 of 3')).toBeTruthy();
    for (const box of screen.getAllByRole('checkbox')) expect(box).not.toBeChecked();
    const saveDays = () => screen.getByRole('button', { name: 'Save days' });
    expect(saveDays()).toBeDisabled();

    fireEvent.press(checkbox('Tuesday'));
    fireEvent.press(checkbox('Thursday'));
    expect(screen.getByText('Pick 3 days · 2 of 3')).toBeTruthy();
    expect(saveDays()).toBeDisabled();
    fireEvent.press(checkbox('Saturday'));
    fireEvent.press(checkbox('Sunday'));

    expect(checkbox('Sunday')).not.toBeChecked();
    expect(screen.getByText('Pick 3 days · 3 of 3')).toBeTruthy();
    fireEvent.press(checkbox('Thursday'));
    expect(screen.getByText('Pick 3 days · 2 of 3')).toBeTruthy();
    fireEvent.press(checkbox('Thursday'));
    expect(saveDays()).toBeEnabled();

    fireEvent.press(saveDays());

    await waitFor(() => expect(mock.history.patch).toHaveLength(1), { timeout: 5000 });
    expect(patchBody()).toEqual({ wateringDays: [2, 4, 6] });
    await waitFor(() => expect(screen.queryAllByRole('checkbox')).toHaveLength(0), { timeout: 5000 });
    expect(screen.getByLabelText('Saturday')).toBeSelected();
    expect(screen.getByLabelText('Monday')).not.toBeSelected();
    expect(mockDispatch).not.toHaveBeenCalled();
  }, 20000);

  it('moves the single day of a weekly plant to the tapped one', async () => {
    await renderScreen({ ...userPlantFixture, frequency: { times: 1, per: 'week' }, wateringDays: [1] });

    await openDaysSheet();
    expect(screen.getByText('Pick 1 day')).toBeTruthy();
    fireEvent.press(checkbox('Monday'));
    fireEvent.press(checkbox('Wednesday'));

    expect(checkbox('Monday')).not.toBeChecked();
    expect(checkbox('Wednesday')).toBeChecked();
    expect(screen.getByRole('button', { name: 'Save days' })).toBeEnabled();
  }, 15000);

  it('counts the days in Portuguese', async () => {
    await changeLanguage('pt-BR');
    await renderScreen(threeTimes);

    expect(screen.getByText('Dias de rega')).toBeTruthy();
    expect(screen.getByText('Horário da rega')).toBeTruthy();
    expect(screen.getByText('Lembrete')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Editar dias de rega' }));

    expect(await screen.findByText('Escolha 3 dias · 0 de 3', undefined, { timeout: 5000 })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Salvar dias' })).toBeDisabled();
  }, 15000);

  it('lists every half hour in the time sheet and saves the picked time at once', async () => {
    await renderScreen();

    fireEvent.press(screen.getByRole('button', { name: 'Watering time, 09:30' }));

    const rows = screen.getAllByRole('radio', { name: /^\d{2}:\d{2}$/ });
    expect(rows).toHaveLength(48);
    expect(rows[0]).toHaveAccessibleName('00:00');
    expect(rows[47]).toHaveAccessibleName('23:30');
    expect(screen.getByRole('radio', { name: '09:30' })).toBeChecked();

    fireEvent.press(screen.getByRole('radio', { name: '13:30' }));

    await waitFor(() => expect(screen.queryByRole('radio', { name: '13:30' })).not.toBeOnTheScreen(), {
      timeout: 5000,
    });
    await waitFor(() => expect(mock.history.patch).toHaveLength(1), { timeout: 5000 });
    expect(patchBody()).toEqual({ reminderTime: '13:30', timeZone: deviceTimeZone() });
    expect(screen.getByRole('button', { name: 'Watering time, 13:30' })).toBeTruthy();
  }, 15000);

  it('shows a stored off-grid time above the list without checking a row', async () => {
    await renderScreen({ ...userPlantFixture, reminderTime: '09:15' });

    fireEvent.press(screen.getByRole('button', { name: 'Watering time, 09:15' }));

    expect(screen.getAllByText('09:15').length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByRole('radio', { name: /^\d{2}:\d{2}$/, checked: true })).toBeNull();
  });

  it('saves a lead chip at once and says Saved', async () => {
    await renderScreen();

    fireEvent.press(screen.getByRole('radio', { name: '20 min' }));

    expect(await screen.findByText('Saved ✓', undefined, { timeout: 5000 })).toBeTruthy();
    expect(patchBody()).toEqual({ reminderLeadMinutes: 20 });
    expect(screen.getByRole('radio', { name: '20 min' })).toBeChecked();
    expect(mockDispatch).not.toHaveBeenCalled();
  }, 15000);

  it('keeps the stored lead and shows the error when the save fails', async () => {
    mock.onPatch('/me/plants/p1').networkErrorOnce();
    await renderScreen();

    fireEvent.press(screen.getByRole('radio', { name: '20 min' }));

    expect(
      await screen.findByText("Can't reach the server. Check your connection and try again.", undefined, {
        timeout: 5000,
      }),
    ).toBeTruthy();
    expect(screen.getByRole('radio', { name: '15 min' })).toBeChecked();
    expect(screen.getByRole('radio', { name: '20 min' })).not.toBeChecked();
  }, 15000);

  it('explains the reminders with the chosen lead', async () => {
    await renderScreen();
    expect(screen.getByText('Reminder')).toBeTruthy();

    fireEvent.press(screen.getByRole('button', { name: 'How reminders work' }));

    expect(
      await screen.findByText(
        'Your phone gets a notification 15 minutes before the watering time, so you never forget to water your plant.',
        undefined,
        { timeout: 5000 },
      ),
    ).toBeTruthy();
    expect(screen.getByText('Reminders')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Got it' }));
    await waitFor(() => expect(screen.queryByText('Reminders')).not.toBeOnTheScreen(), { timeout: 5000 });
  }, 15000);

  it('offers to ask the AI about a sick plant, disabled until it ships', async () => {
    await renderScreen();

    const button = screen.getByRole('button', { name: /ask AI for help/ });
    expect(button).toBeDisabled();
    expect(within(button).getByText('My plant is sick 🤒, ask AI for help ✨')).toBeTruthy();
    expect(within(button).getByText('Soon')).toBeTruthy();
  });

  it('hides the days for a daily plant', async () => {
    await renderScreen({ ...userPlantFixture, frequency: { times: 1, per: 'day' }, wateringDays: [] });

    expect(screen.getByText('Every day')).toBeTruthy();
    expect(screen.queryByText('Watering days')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Edit watering days' })).toBeNull();
  });

  it('asks for the days again when the watering changed', async () => {
    await renderScreen({
      ...userPlantFixture,
      frequency: { times: 3, per: 'week' },
      wateringDays: [],
      scheduleNeedsReview: true,
    });

    expect(
      screen.getByText('The watering for this plant changed. Tap the pencil to pick 3 days.'),
    ).toBeTruthy();
    expect(screen.getByText('3x a week')).toBeTruthy();
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
      await waitFor(() => expect(screen.queryByText('Remove photo')).not.toBeOnTheScreen(), {
        timeout: 5000,
      });
    }, 15000);
  });
});
