import React from 'react';
import { Alert, type AlertButton } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import MockAdapter from 'axios-mock-adapter';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { Identification } from '@plantcare/shared';

import { api } from '../api/client';
import { AuthProvider } from '../auth/AuthProvider';
import { clearTokens, saveTokens } from '../auth/session';
import { changeLanguage, initI18n } from '../i18n';
import { accountFixture, catalogFixture, userPlantFixture } from '../plants/testFixtures';
import Routes from '.';

// The whole app with its real navigators: only the API is fake. Screen tests stub navigate(), so
// this is what catches a route name or params the real navigators don't accept.

let mock: MockAdapter;

beforeAll(initI18n);

beforeEach(async () => {
  mock = new MockAdapter(api);
  await clearTokens();
  await AsyncStorage.clear();
  await changeLanguage('en');
});

afterEach(() => mock.restore());

async function signedInWithOnePlant() {
  await saveTokens({ accessToken: 'acc', refreshToken: 'ref' });
  await AsyncStorage.setItem('@plantcare:user', 'Ana');
  mock.onGet('/me').reply(200, accountFixture);
  mock.onGet('/me/plants').reply(200, [userPlantFixture]);
  mock.onGet('/me/plants/p1/checkups').reply(200, []);
  mock.onGet('/plants').reply(200, { items: [catalogFixture], nextPage: null, total: 1 });
  mock.onGet('/ai/status').reply(200, { enabled: true, identifyLeft: 10, checkupLeft: 5 });
}

function renderApp() {
  render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <AuthProvider>
        <Routes />
      </AuthProvider>
    </SafeAreaProvider>,
  );
}

describe('navigation', () => {
  it('goes from Welcome to the garden, and from the avatar to Profile and back', async () => {
    await signedInWithOnePlant();
    renderApp();

    fireEvent.press(await screen.findByLabelText('Get started'));
    expect(
      await screen.findByText('Monstera deliciosa', undefined, { timeout: 5000 }),
    ).toBeOnTheScreen();

    fireEvent.press(screen.getByRole('button', { name: 'Open profile' }));
    expect(await screen.findByText('ana@example.com')).toBeOnTheScreen();

    fireEvent.press(screen.getByText('My plants'));
    await waitFor(() => expect(screen.getByText('Monstera deliciosa')).toBeOnTheScreen());
  }, 20000);

  it('opens the catalog from + and comes back', async () => {
    await signedInWithOnePlant();
    renderApp();
    fireEvent.press(await screen.findByLabelText('Get started'));
    await screen.findByText('Monstera deliciosa', undefined, { timeout: 5000 });

    fireEvent.press(screen.getByRole('button', { name: 'Add a plant' }));
    expect(await screen.findByText('Find your plant')).toBeOnTheScreen();

    fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    await waitFor(() => expect(screen.queryByText('Find your plant')).not.toBeOnTheScreen());
  }, 20000);

  it('opens a plant and comes back to the garden', async () => {
    await signedInWithOnePlant();
    renderApp();
    fireEvent.press(await screen.findByLabelText('Get started'));

    fireEvent.press(await screen.findByText('Monstera deliciosa', undefined, { timeout: 5000 }));
    expect(await screen.findByText('Big leaves.')).toBeOnTheScreen();

    fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    await waitFor(() => expect(screen.queryByText('Big leaves.')).not.toBeOnTheScreen());
  }, 20000);

  it('adds a new species with AI, confirms it, and lands back in the garden', async () => {
    const zz: Identification = {
      isPlant: true,
      confidence: 'high',
      scientificName: 'Zamioculcas zamiifolia',
      names: { en: 'ZZ plant', 'pt-BR': 'Zamioculca' },
      about: { en: 'Glossy leaves.', 'pt-BR': 'Folhas brilhantes.' },
      waterTips: { en: 'Let it dry.', 'pt-BR': 'Deixe secar.' },
      light: 'partial_shade',
      difficulty: 'easy',
      frequency: { times: 1, per: 'twoWeeks' },
    };
    await signedInWithOnePlant();
    mock
      .onPost('/ai/identify/name')
      .reply(200, { kind: 'proposal', proposalId: 'pr1', proposal: zz });
    mock.onPost('/ai/proposals/pr1/reference-photo').reply(200, { photo: null });
    mock.onPost('/ai/proposals/pr1/add').reply(201, { ...userPlantFixture, id: 'p2' });
    renderApp();
    fireEvent.press(await screen.findByLabelText('Get started'));
    await screen.findByText('Monstera deliciosa', undefined, { timeout: 5000 });

    fireEvent.press(screen.getByRole('button', { name: 'Add a plant' }));
    fireEvent.press(await screen.findByRole('tab', { name: 'Add with AI' }));
    fireEvent.changeText(await screen.findByLabelText('Plant name'), 'zz');
    fireEvent.press(screen.getByRole('button', { name: 'Find plant' }));
    fireEvent.press(await screen.findByRole('button', { name: "That's it! Add to my garden" }));

    expect(await screen.findByText('ZZ plant is in your garden')).toBeOnTheScreen();
    expect(screen.getByText('✨ Also joined the catalog')).toBeOnTheScreen();
    fireEvent.press(screen.getByText('See my plants'));
    await waitFor(() =>
      expect(screen.queryByText('ZZ plant is in your garden')).not.toBeOnTheScreen(),
    );
    expect(await screen.findByText('Monstera deliciosa')).toBeOnTheScreen();
  }, 20000);

  it('removes a plant from its detail and lands in the garden without it', async () => {
    await signedInWithOnePlant();
    mock.onDelete('/me/plants/p1').reply(204);
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    renderApp();
    fireEvent.press(await screen.findByLabelText('Get started'));
    fireEvent.press(await screen.findByText('Monstera deliciosa', undefined, { timeout: 5000 }));
    await screen.findByText('Big leaves.');

    mock.onGet('/me/plants').reply(200, []);
    fireEvent.press(screen.getByRole('button', { name: 'Remove plant' }));
    const buttons: AlertButton[] = alert.mock.calls[0]?.[2] ?? [];
    buttons.find((button) => button.style === 'destructive')?.onPress?.();

    await waitFor(() => expect(screen.queryByText('Big leaves.')).not.toBeOnTheScreen());
    await waitFor(() => expect(screen.queryByText('Monstera deliciosa')).not.toBeOnTheScreen());
    alert.mockRestore();
  }, 20000);

  it('deletes the account from Profile and starts over at Welcome', async () => {
    await signedInWithOnePlant();
    mock.onDelete('/me').reply(204);
    renderApp();
    fireEvent.press(await screen.findByLabelText('Get started'));
    await screen.findByText('Monstera deliciosa', undefined, { timeout: 5000 });
    fireEvent.press(screen.getByRole('button', { name: 'Open profile' }));

    fireEvent.press(await screen.findByText('Delete account'));
    fireEvent.changeText(screen.getByLabelText('DELETE'), 'DELETE');
    fireEvent.press(screen.getByRole('button', { name: 'Confirm' }));

    expect(
      await screen.findByLabelText('Get started', undefined, { timeout: 5000 }),
    ).toBeOnTheScreen();
    expect(screen.queryByText('ana@example.com')).not.toBeOnTheScreen();
  }, 20000);
});
