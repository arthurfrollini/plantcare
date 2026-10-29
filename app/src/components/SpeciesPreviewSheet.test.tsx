import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { IdentifyResponse } from '@plantcare/shared';

import { initI18n } from '../i18n';
import { previewFromResult, SpeciesPreviewSheet, type SpeciesPreview } from './SpeciesPreviewSheet';

jest.mock('react-native-svg', () => {
  const { createElement } = jest.requireActual<typeof import('react')>('react');
  return { SvgFromUri: (props: object) => createElement('SvgFromUri', props) };
});

beforeAll(initI18n);

const proposal: IdentifyResponse = {
  kind: 'proposal',
  proposalId: 'pr1',
  proposal: {
    isPlant: true,
    confidence: 'high',
    scientificName: 'Zantedeschia aethiopica',
    names: { en: 'Calla lily', 'pt-BR': 'Copo-de-leite' },
    about: { en: 'White flowers.', 'pt-BR': 'Flores brancas.' },
    waterTips: { en: 'Keep moist.', 'pt-BR': 'Mantenha úmido.' },
    light: 'partial_shade',
    difficulty: 'easy',
    frequency: { times: 2, per: 'week' },
  },
};

const catalogHit: IdentifyResponse = {
  kind: 'catalog',
  plant: {
    id: 'c1',
    slug: 'aningapara',
    scientificName: 'Begonia maculata',
    source: 'curated',
    name: 'Polka dot begonia',
    about: 'Spotted leaves.',
    waterTips: 'Water weekly.',
    light: 'partial_shade',
    difficulty: 'medium',
    frequency: { times: 1, per: 'week' },
    imageUrl: '/static/plants/aningapara.svg',
    imageCredit: null,
  },
};

const referencePhoto: SpeciesPreview['reference'] = {
  kind: 'photo',
  source: { uri: 'http://api/ai/proposals/pr1/reference-photo/image' },
  credit: { author: 'Jane Doe', license: 'CC BY-SA 4.0', source: 'https://x' },
};

function renderSheet(
  species: SpeciesPreview | null,
  handlers: { onAdd?: () => void; onNotThis?: () => void; onClose?: () => void } = {},
  adding = false,
) {
  const props = {
    onAdd: handlers.onAdd ?? jest.fn(),
    onNotThis: handlers.onNotThis ?? jest.fn(),
    onClose: handlers.onClose ?? jest.fn(),
  };
  render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <SpeciesPreviewSheet species={species} adding={adding} {...props} />
    </SafeAreaProvider>,
  );
  return props;
}

describe('SpeciesPreviewSheet', () => {
  it('puts the user photo beside the reference, with the credit under the reference', () => {
    renderSheet(
      previewFromResult(proposal, 'en', {
        reference: referencePhoto,
        ownPhoto: 'file:///mine.jpg',
      }),
    );

    expect(screen.getByText('Your photo')).toBeOnTheScreen();
    expect(screen.getByText('Reference')).toBeOnTheScreen();
    expect(screen.getByTestId('own-photo').props.source).toMatchObject({
      uri: 'file:///mine.jpg',
    });
    expect(screen.getByTestId('reference-photo').props.source).toMatchObject({
      uri: 'http://api/ai/proposals/pr1/reference-photo/image',
    });
    expect(screen.getByText('Photo: Jane Doe · CC BY-SA 4.0 (cropped)')).toBeOnTheScreen();
    expect(screen.getByText('New to the catalog')).toBeOnTheScreen();
  });

  it('shows the reference alone, without captions, after a name search', () => {
    renderSheet(previewFromResult(proposal, 'en', { reference: referencePhoto, ownPhoto: null }));

    expect(screen.getByTestId('reference-photo')).toBeOnTheScreen();
    expect(screen.queryByTestId('own-photo')).not.toBeOnTheScreen();
    expect(screen.queryByText('Your photo')).not.toBeOnTheScreen();
    expect(screen.queryByText('Reference')).not.toBeOnTheScreen();
  });

  it('says when there is no reference photo', () => {
    renderSheet(previewFromResult(proposal, 'en', { reference: null, ownPhoto: null }));

    expect(screen.getByText('No reference photo')).toBeOnTheScreen();
    expect(screen.queryByTestId('reference-photo')).not.toBeOnTheScreen();
  });

  it("draws a catalog species' illustration, with no credit", () => {
    renderSheet(
      previewFromResult(catalogHit, 'en', {
        reference: { kind: 'illustration', url: '/static/plants/aningapara.svg' },
        ownPhoto: 'file:///mine.jpg',
      }),
    );

    expect(screen.getByTestId('plant-illustration')).toBeOnTheScreen();
    expect(screen.queryByText(/^Photo:/)).not.toBeOnTheScreen();
    expect(screen.getByText('From the catalog')).toBeOnTheScreen();
  });

  it('adds, goes back with "That\'s not it", and closes with the X', () => {
    const handlers = renderSheet(
      previewFromResult(proposal, 'en', { reference: null, ownPhoto: null }),
    );

    fireEvent.press(screen.getByRole('button', { name: "That's it! Add to my garden" }));
    expect(handlers.onAdd).toHaveBeenCalled();
    fireEvent.press(screen.getByRole('button', { name: "That's not it" }));
    expect(handlers.onNotThis).toHaveBeenCalled();
    fireEvent.press(screen.getByRole('button', { name: 'Close' }));
    expect(handlers.onClose).toHaveBeenCalled();
    expect(screen.queryByText('Not now')).not.toBeOnTheScreen();
  });

  it('turns every way out off while adding', () => {
    const handlers = renderSheet(
      previewFromResult(proposal, 'en', { reference: null, ownPhoto: null }),
      {},
      true,
    );

    fireEvent.press(screen.getByRole('button', { name: "That's not it" }));
    fireEvent.press(screen.getByRole('button', { name: 'Close' }));
    expect(handlers.onNotThis).not.toHaveBeenCalled();
    expect(handlers.onClose).not.toHaveBeenCalled();
    expect(
      screen.queryByRole('button', { name: "That's it! Add to my garden" }),
    ).not.toBeOnTheScreen();
  });
});
