import React from 'react';
import { Linking } from 'react-native';
import MockAdapter from 'axios-mock-adapter';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { api } from '../api/client';
import { changeLanguage, initI18n } from '../i18n';
import { PhotoCredits } from './PhotoCredits';

const mockGoBack = jest.fn();

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual<object>('@react-navigation/native'),
  useNavigation: () => ({ goBack: mockGoBack }),
}));

let mock: MockAdapter;

beforeAll(initI18n);
beforeEach(async () => {
  mock = new MockAdapter(api);
  mockGoBack.mockClear();
  await changeLanguage('en');
});
afterEach(() => mock.restore());

const credits = [
  {
    id: 'p1',
    name: 'Calla lily',
    scientificName: 'Zantedeschia aethiopica',
    imageUrl: '/plants/p1/image?v=1',
    credit: {
      author: 'Jane Doe',
      license: 'CC BY-SA',
      source: 'https://www.inaturalist.org/photos/1',
    },
  },
  {
    id: 'p2',
    name: 'ZZ plant',
    scientificName: 'Zamioculcas zamiifolia',
    imageUrl: '/static/plants/zamioculca.webp',
    credit: { author: 'Jo', license: 'CC0', source: 'https://x' },
  },
];

function renderCredits() {
  render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <PhotoCredits />
    </SafeAreaProvider>,
  );
}

describe('PhotoCredits', () => {
  it('lists every species photo with its credit, which opens the source', async () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    mock.onGet('/plants/credits').reply(200, credits);
    renderCredits();

    expect(await screen.findByText('Calla lily')).toBeOnTheScreen();
    expect(screen.getByText('ZZ plant')).toBeOnTheScreen();
    expect(screen.getByText('Photo: Jo · CC0')).toBeOnTheScreen();
    fireEvent.press(screen.getByText('Photo: Jane Doe · CC BY-SA (cropped)'));
    expect(openURL).toHaveBeenCalledWith('https://www.inaturalist.org/photos/1');
    openURL.mockRestore();
  });

  it('says so when the list cannot load, and tries again', async () => {
    mock.onGet('/plants/credits').networkError();
    renderCredits();

    expect(await screen.findByText(/Can't reach the server/)).toBeOnTheScreen();
    mock.onGet('/plants/credits').reply(200, credits);
    fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Calla lily')).toBeOnTheScreen();
  });

  it('goes back from the header', async () => {
    mock.onGet('/plants/credits').reply(200, credits);
    renderCredits();

    fireEvent.press(await screen.findByRole('button', { name: 'Back' }));

    expect(mockGoBack).toHaveBeenCalled();
  });
});
