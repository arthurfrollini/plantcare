import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import MockAdapter from 'axios-mock-adapter';
import * as ImagePicker from 'expo-image-picker';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { Identification } from '@plantcare/shared';

import { api } from '../api/client';
import { AuthProvider } from '../auth/AuthProvider';
import { clearTokens, saveTokens } from '../auth/session';
import { changeLanguage, initI18n } from '../i18n';
import type { PlantPhoto } from '../plants/pickPhoto';
import { deviceTimeZone } from '../plants/savePlant';
import { accountFixture, catalogFixture, userPlantFixture } from '../plants/testFixtures';
import { AiIdentify } from './AiIdentify';

const mockNavigate = jest.fn();
const mockDispatch = jest.fn();

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual<object>('@react-navigation/native'),
  useNavigation: () => ({ navigate: mockNavigate, dispatch: mockDispatch }),
}));

const proposal: Identification = {
  isPlant: true,
  confidence: 'high',
  scientificName: 'Zamioculcas zamiifolia',
  names: { en: 'ZZ plant', 'pt-BR': 'Zamioculca' },
  about: { en: 'Glossy leaves that store water.', 'pt-BR': 'Folhas brilhantes.' },
  waterTips: { en: 'Let the soil dry out between waterings.', 'pt-BR': 'Deixe secar.' },
  light: 'shade',
  difficulty: 'easy',
  frequency: { times: 1, per: 'twoWeeks' },
};

const shrunk: PlantPhoto = { uri: 'file:///tmp/small.jpg', mimeType: 'image/jpeg' };
const shrink = jest.fn<Promise<PlantPhoto>, [PlantPhoto]>(() => Promise.resolve(shrunk));

let mock: MockAdapter;

beforeAll(initI18n);

beforeEach(async () => {
  mock = new MockAdapter(api);
  mockNavigate.mockClear();
  mockDispatch.mockClear();
  shrink.mockClear();
  await clearTokens();
  await AsyncStorage.clear();
  await changeLanguage('en');
});

afterEach(() => mock.restore());

async function signIn(status = { enabled: true, identifyLeft: 10, checkupLeft: 5 }) {
  await saveTokens({ accessToken: 'acc', refreshToken: 'ref' });
  mock.onGet('/me').reply(200, accountFixture);
  mock.onGet('/me/plants').reply(200, [userPlantFixture]);
  mock.onGet('/ai/status').reply(200, status);
}

function renderAi() {
  return render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <AuthProvider>
        <AiIdentify bottomInset={0} shrink={shrink} />
      </AuthProvider>
    </SafeAreaProvider>,
  );
}

async function findByName(name: string) {
  fireEvent.changeText(await screen.findByLabelText('Plant name'), name);
  fireEvent.press(screen.getByRole('button', { name: 'Find plant' }));
}

describe('AiIdentify', () => {
  it('offers a name field and the camera and gallery buttons', async () => {
    await signIn();
    renderAi();

    expect(await screen.findByLabelText('Plant name')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Take a photo' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Choose from gallery' })).toBeOnTheScreen();
  });

  it('sends the typed name and shows the proposal in the preview', async () => {
    await signIn();
    mock.onPost('/ai/identify/name').reply(200, { kind: 'proposal', proposalId: 'pr1', proposal });
    renderAi();

    await findByName('  zz plant ');

    expect(await screen.findByText('ZZ plant')).toBeOnTheScreen();
    expect(JSON.parse(String(mock.history.post[0]?.data))).toEqual({ name: 'zz plant' });
    expect(screen.getByText('Zamioculcas zamiifolia')).toBeOnTheScreen();
    expect(screen.getByText('Glossy leaves that store water.')).toBeOnTheScreen();
    expect(screen.getByText('Let the soil dry out between waterings.')).toBeOnTheScreen();
    expect(screen.getByLabelText('Shade')).toBeOnTheScreen();
    expect(screen.getByLabelText('Easy')).toBeOnTheScreen();
    expect(screen.getByLabelText('Every 2 weeks')).toBeOnTheScreen();
  });

  it('shows the names in the app language', async () => {
    await signIn();
    await changeLanguage('pt-BR');
    mock.onPost('/ai/identify/name').reply(200, { kind: 'proposal', proposalId: 'pr1', proposal });
    renderAi();

    fireEvent.changeText(await screen.findByLabelText('Nome da planta'), 'zamioculca');
    fireEvent.press(screen.getByRole('button', { name: 'Buscar planta' }));

    expect(await screen.findByText('Zamioculca')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Adicionar ao meu jardim' })).toBeOnTheScreen();
    expect(screen.getByText('Folhas brilhantes.')).toBeOnTheScreen();
  });

  it('adds a proposal to the garden with the default schedule, then confirms', async () => {
    await signIn();
    mock.onPost('/ai/identify/name').reply(200, { kind: 'proposal', proposalId: 'pr1', proposal });
    mock.onPost('/ai/proposals/pr1/add').reply(201, userPlantFixture);
    renderAi();

    await findByName('zz plant');
    fireEvent.press(await screen.findByRole('button', { name: 'Add to my garden' }));

    await waitFor(() => expect(mockDispatch).toHaveBeenCalledTimes(1));
    const add = mock.history.post.find((r) => r.url === '/ai/proposals/pr1/add');
    expect(JSON.parse(String(add?.data))).toEqual({
      reminderTime: '08:00',
      timeZone: deviceTimeZone(),
    });
    expect(mockDispatch.mock.calls[0]?.[0]).toMatchObject({
      type: 'REPLACE',
      payload: {
        name: 'Confirmation',
        params: { nextScreen: 'MyPlants', toast: 'ZZ plant joined the catalog' },
      },
    });
  });

  it.each(['Not now', 'Close'])('closes the preview without adding from %s', async (label) => {
    await signIn();
    mock.onPost('/ai/identify/name').reply(200, { kind: 'proposal', proposalId: 'pr1', proposal });
    renderAi();

    await findByName('zz plant');
    expect(await screen.findByText('ZZ plant')).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: label }));

    await waitFor(() => expect(screen.queryByText('ZZ plant')).not.toBeOnTheScreen());
    expect(mock.history.post.filter((r) => r.url === '/ai/proposals/pr1/add')).toHaveLength(0);
  });

  it('adds a catalog hit through the regular add', async () => {
    await signIn();
    mock.onPost('/ai/identify/name').reply(200, { kind: 'catalog', plant: catalogFixture });
    mock.onPost('/me/plants').reply(201, userPlantFixture);
    renderAi();

    await findByName('monstera');
    expect(await screen.findByText('Monstera deliciosa')).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Add to my garden' }));

    await waitFor(() => expect(mockDispatch).toHaveBeenCalledTimes(1));
    const add = mock.history.post.find((r) => r.url === '/me/plants');
    expect(JSON.parse(String(add?.data))).toEqual({
      catalogPlantId: 'c1',
      reminderTime: '08:00',
      timeZone: deviceTimeZone(),
    });
  });

  it('says so when no plant was found', async () => {
    await signIn();
    mock.onPost('/ai/identify/name').reply(200, { kind: 'none', reason: 'unsure' });
    renderAi();

    await findByName('asdf');

    expect(await screen.findByText(/Couldn't identify a plant/)).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Add to my garden' })).not.toBeOnTheScreen();
  });

  it('says the daily limit was reached', async () => {
    await signIn();
    mock
      .onPost('/ai/identify/name')
      .reply(429, { error: { code: 'ai_daily_limit', message: 'Limit' } });
    renderAi();

    await findByName('zz plant');

    expect(await screen.findByText(/used today's AI searches/)).toBeOnTheScreen();
  });

  it('turns the buttons off when the AI answers that it is off', async () => {
    await signIn();
    mock.onPost('/ai/identify/name').reply(503, { error: { code: 'ai_off', message: 'Off' } });
    renderAi();

    await findByName('zz plant');

    expect(await screen.findByText('AI is unavailable right now.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Take a photo', disabled: true })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Find plant', disabled: true })).toBeOnTheScreen();
  });

  it('starts with the buttons off when the AI is disabled', async () => {
    await signIn({ enabled: false, identifyLeft: 10, checkupLeft: 5 });
    renderAi();

    expect(await screen.findByText('AI is unavailable right now.')).toBeOnTheScreen();
    expect(
      screen.getByRole('button', { name: 'Choose from gallery', disabled: true }),
    ).toBeOnTheScreen();
  });

  it('sends one request when Find is tapped twice', async () => {
    await signIn();
    mock.onPost('/ai/identify/name').reply(200, { kind: 'proposal', proposalId: 'pr1', proposal });
    renderAi();

    fireEvent.changeText(await screen.findByLabelText('Plant name'), 'zz plant');
    const find = screen.getByRole('button', { name: 'Find plant' });
    fireEvent.press(find);
    fireEvent.press(find);

    expect(await screen.findByText('ZZ plant')).toBeOnTheScreen();
    expect(mock.history.post.filter((r) => r.url === '/ai/identify/name')).toHaveLength(1);
  });

  it('shrinks a gallery photo before sending it', async () => {
    await signIn();
    jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: 'file:///tmp/leaf.jpg', mimeType: 'image/jpeg', width: 4000, height: 3000 }],
    });
    mock.onPost('/ai/identify/photo').reply(200, { kind: 'proposal', proposalId: 'pr1', proposal });
    renderAi();

    fireEvent.press(await screen.findByRole('button', { name: 'Choose from gallery' }));

    expect(await screen.findByText('ZZ plant')).toBeOnTheScreen();
    expect(shrink).toHaveBeenCalledWith({ uri: 'file:///tmp/leaf.jpg', mimeType: 'image/jpeg' });
  });

  it('asks for an account when signed out', async () => {
    renderAi();

    fireEvent.press(await screen.findByRole('button', { name: 'Create an account' }));

    expect(mockNavigate).toHaveBeenCalledWith('Auth', { mode: 'signUp' });
    expect(mock.history.get.filter((r) => r.url === '/ai/status')).toHaveLength(0);
  });

  it('lets the user try again when the AI could not answer', async () => {
    await signIn();
    mock
      .onPost('/ai/identify/name')
      .reply(502, { error: { code: 'ai_unavailable', message: 'x' } });
    renderAi();

    await findByName('zz plant');

    expect(await screen.findByText("The AI couldn't answer this time. Try again.")).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Find plant', disabled: false })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Take a photo', disabled: false })).toBeOnTheScreen();
  });

  it('keeps the photo when a photo turns out to be a catalog species', async () => {
    await signIn();
    jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: 'file:///tmp/leaf.jpg', mimeType: 'image/jpeg', width: 4000, height: 3000 }],
    });
    mock.onPost('/ai/identify/photo').reply(200, { kind: 'catalog', plant: catalogFixture });
    mock.onPost('/me/plants').reply(201, userPlantFixture);
    mock.onPost('/me/plants/p1/photo').reply(200, { ...userPlantFixture, hasPhoto: true });
    renderAi();

    fireEvent.press(await screen.findByRole('button', { name: 'Choose from gallery' }));
    fireEvent.press(await screen.findByRole('button', { name: 'Add to my garden' }));

    await waitFor(() => expect(mockDispatch).toHaveBeenCalledTimes(1));
    expect(mock.history.post.map((r) => r.url)).toEqual([
      '/ai/identify/photo',
      '/me/plants',
      '/me/plants/p1/photo',
    ]);
  });
});
