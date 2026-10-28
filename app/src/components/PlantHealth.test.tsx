import React from 'react';
import MockAdapter from 'axios-mock-adapter';
import * as ImagePicker from 'expo-image-picker';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { Checkup, UserPlant } from '@plantcare/shared';

import { api } from '../api/client';
import { changeLanguage, initI18n } from '../i18n';
import type { PlantPhoto } from '../plants/pickPhoto';
import { userPlantFixture } from '../plants/testFixtures';
import { weekdayName } from '../plants/weekdays';
import { PlantHealth } from './PlantHealth';

const openCheckup: Checkup = {
  id: 'k2',
  createdAt: '2026-10-27T12:00:00.000Z',
  description: 'Yellow leaves',
  problem: 'Overwatering',
  steps: ['Let the soil dry out.', 'Empty the saucer.'],
  whenToWorry: 'If the stems go soft.',
  status: 'open',
  healedAt: null,
  photoUrl: '/me/plants/p1/checkups/k2/photo',
};
const healedCheckup: Checkup = {
  ...openCheckup,
  id: 'k1',
  createdAt: '2026-09-01T12:00:00.000Z',
  problem: 'Too little light',
  status: 'healed',
  healedAt: '2026-09-10T12:00:00.000Z',
};

const shrunk: PlantPhoto = { uri: 'file:///tmp/small.jpg', mimeType: 'image/jpeg' };
const shrink = jest.fn<Promise<PlantPhoto>, [PlantPhoto]>(() => Promise.resolve(shrunk));

let mock: MockAdapter;

beforeAll(initI18n);

beforeEach(async () => {
  mock = new MockAdapter(api);
  shrink.mockClear();
  await changeLanguage('en');
  mock.onGet('/ai/status').reply(200, { enabled: true, identifyLeft: 10, checkupLeft: 5 });
});

afterEach(() => mock.restore());

function renderHealth(plant: UserPlant = userPlantFixture, checkups: Checkup[] = []) {
  mock.onGet('/me/plants/p1/checkups').reply(200, checkups);
  return render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <PlantHealth plant={plant} shrink={shrink} />
    </SafeAreaProvider>,
  );
}

function openGuide() {
  fireEvent.press(screen.getByRole('button', { name: 'My plant is sick 🤒' }));
}

async function askAiAbout(symptom: string) {
  openGuide();
  fireEvent.press(await screen.findByRole('button', { name: symptom }));
  fireEvent.press(screen.getByRole('button', { name: 'Still not sure? Ask AI for a closer look' }));
  // The check-up sheet opens once the guide has slid away.
  await screen.findByRole('button', { name: 'Ask AI' }, { timeout: 5000 });
}

async function pickGalleryPhoto() {
  jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValueOnce({
    canceled: false,
    assets: [{ uri: 'file:///tmp/leaf.jpg', mimeType: 'image/jpeg', width: 4000, height: 3000 }],
  });
  fireEvent.press(screen.getByRole('button', { name: 'Choose from gallery' }));
  await screen.findByRole('button', { name: 'Ask AI', disabled: false });
}

describe('PlantHealth', () => {
  it('opens the guide with the nine symptoms, and a symptom lists its causes', async () => {
    renderHealth();
    openGuide();

    for (const symptom of [
      'Yellow leaves',
      'Brown tips or edges',
      'Spots on the leaves',
      'Holes or chewed leaves',
      'Wilting or drooping',
      'White powder, mold or cotton',
      'Leaves falling off',
      'Long, stretched, pale growth',
      'Tiny bugs',
    ]) {
      expect(await screen.findByRole('button', { name: symptom })).toBeOnTheScreen();
    }

    fireEvent.press(screen.getByRole('button', { name: 'Yellow leaves' }));

    expect(screen.getByText('Too much water')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Holes or chewed leaves' })).not.toBeOnTheScreen();
  });

  it("puts the species' watering and the user's days next to a watering cause", async () => {
    renderHealth();
    openGuide();

    fireEvent.press(await screen.findByRole('button', { name: 'Yellow leaves' }));

    const days = `${weekdayName(1, 'EEE')}, ${weekdayName(4, 'EEE')}`;
    expect(screen.getAllByText(`Ideal watering: 2x a week. You water on ${days}.`)[0]).toBeOnTheScreen();
  });

  it("puts the species' light next to a light cause", async () => {
    renderHealth();
    openGuide();

    fireEvent.press(await screen.findByRole('button', { name: 'Long, stretched, pale growth' }));

    expect(screen.getAllByText('Ideal light: Partial shade.')[0]).toBeOnTheScreen();
  });

  it('opens the check-up with the symptom filled in, and needs a photo to send', async () => {
    renderHealth();
    await askAiAbout('Yellow leaves');

    expect(screen.getByDisplayValue('Yellow leaves')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Ask AI', disabled: true })).toBeOnTheScreen();

    await pickGalleryPhoto();

    expect(shrink).toHaveBeenCalledWith({ uri: 'file:///tmp/leaf.jpg', mimeType: 'image/jpeg' });
  }, 15000);

  it('shows the advice in the yellow box after a check-up', async () => {
    mock.onPost('/me/plants/p1/checkups').reply(201, openCheckup);
    renderHealth();
    await askAiAbout('Yellow leaves');
    await pickGalleryPhoto();
    fireEvent.changeText(screen.getByLabelText('What do you see? (optional)'), '');

    fireEvent.press(screen.getByRole('button', { name: 'Ask AI' }));

    const box = await screen.findByTestId('checkup-box', {}, { timeout: 5000 });
    expect(within(box).getByText('Overwatering')).toBeOnTheScreen();
    expect(within(box).getByText('Let the soil dry out.')).toBeOnTheScreen();
    expect(within(box).getByText('Empty the saucer.')).toBeOnTheScreen();
    expect(within(box).getByText('If the stems go soft.')).toBeOnTheScreen();
  }, 15000);

  it('says so when the photo shows another plant', async () => {
    mock
      .onPost('/me/plants/p1/checkups')
      .reply(422, { error: { code: 'species_mismatch', message: 'Mismatch' } });
    renderHealth();
    await askAiAbout('Yellow leaves');
    await pickGalleryPhoto();

    fireEvent.press(screen.getByRole('button', { name: 'Ask AI' }));

    expect(await screen.findByText(/looks like a different plant/)).toBeOnTheScreen();
  }, 15000);

  it('Ask again opens the guide', async () => {
    renderHealth({ ...userPlantFixture, openCheckup });

    fireEvent.press(within(screen.getByTestId('checkup-box')).getByRole('button', { name: 'Ask again' }));

    expect(await screen.findByRole('button', { name: 'Yellow leaves' })).toBeOnTheScreen();
  });

  it('Mark as healed closes the check-up and hides the box', async () => {
    mock.onPatch('/me/plants/p1/checkups/k2').reply(200, { ...openCheckup, status: 'healed' });
    renderHealth({ ...userPlantFixture, openCheckup }, [openCheckup]);

    fireEvent.press(screen.getByRole('button', { name: 'Mark as healed' }));

    await waitFor(() => expect(screen.queryByTestId('checkup-box')).not.toBeOnTheScreen());
    expect(JSON.parse(String(mock.history.patch[0]?.data))).toEqual({ status: 'healed' });
  });

  it('lists the earlier check-ups under Past check-ups', async () => {
    renderHealth({ ...userPlantFixture, openCheckup }, [openCheckup, healedCheckup]);

    fireEvent.press(await screen.findByRole('button', { name: 'Past check-ups (1)' }));

    expect(screen.getByText('Too little light')).toBeOnTheScreen();
    expect(screen.getAllByText('Overwatering')).toHaveLength(1);
  });

  it('keeps the guide when the AI is off, without the AI link', async () => {
    mock.onGet('/ai/status').reply(200, { enabled: false, identifyLeft: 10, checkupLeft: 5 });
    renderHealth();
    openGuide();

    fireEvent.press(await screen.findByRole('button', { name: 'Yellow leaves' }));

    expect(await screen.findByText('AI is unavailable right now.')).toBeOnTheScreen();
    expect(screen.getByText('Too much water')).toBeOnTheScreen();
    expect(
      screen.queryByRole('button', { name: 'Still not sure? Ask AI for a closer look' }),
    ).not.toBeOnTheScreen();
  });
});
