import React from 'react';
import { render, screen } from '@testing-library/react-native';

import { assetUrl } from '../api/config';
import { PlantCardPrimary } from './PlantCardPrimary';

jest.mock('react-native-svg', () => {
  const { createElement } = jest.requireActual<typeof import('react')>('react');
  return { SvgFromUri: (props: object) => createElement('SvgFromUri', props) };
});

describe('PlantCardPrimary', () => {
  it('fills the card with the species photo, the name below', () => {
    render(<PlantCardPrimary data={{ name: 'Yucca', imageUrl: '/static/plants/yucca.webp' }} />);

    expect(screen.getByTestId('card-photo').props).toMatchObject({
      source: { uri: assetUrl('/static/plants/yucca.webp') },
      contentFit: 'cover',
    });
    expect(screen.getByText('Yucca')).toBeOnTheScreen();
  });

  it('centers an illustration in the photo frame', () => {
    render(<PlantCardPrimary data={{ name: 'Aninga', imageUrl: '/static/plants/aningapara.svg' }} />);

    expect(screen.queryByTestId('card-photo')).not.toBeOnTheScreen();
    expect(screen.getByTestId('plant-illustration')).toBeOnTheScreen();
  });

  it('marks a selected card', () => {
    render(
      <PlantCardPrimary data={{ name: 'Yucca', imageUrl: null }} selected />,
    );

    expect(screen.getByRole('button', { name: 'Yucca', selected: true })).toBeOnTheScreen();
    expect(screen.getByTestId('card-check')).toBeOnTheScreen();
  });
});
