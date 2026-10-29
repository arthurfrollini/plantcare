import React from 'react';
import { render, screen } from '@testing-library/react-native';

import { assetUrl } from '../api/config';
import { SpeciesImage } from './SpeciesImage';

jest.mock('react-native-svg', () => {
  const { createElement } = jest.requireActual<typeof import('react')>('react');
  return { SvgFromUri: (props: object) => createElement('SvgFromUri', props) };
});

describe('SpeciesImage', () => {
  it('draws an illustration as SVG', () => {
    render(<SpeciesImage url="/static/plants/monstera.svg" size={70} />);

    expect(screen.queryByTestId('species-photo')).not.toBeOnTheScreen();
    expect(screen.getByTestId('plant-illustration').props).toMatchObject({
      uri: assetUrl('/static/plants/monstera.svg'),
    });
  });

  it('draws a stored species photo as an image', () => {
    render(<SpeciesImage url="/plants/c1/image" size={70} />);

    expect(screen.getByTestId('species-photo').props).toMatchObject({
      source: { uri: assetUrl('/plants/c1/image') },
    });
  });
});
