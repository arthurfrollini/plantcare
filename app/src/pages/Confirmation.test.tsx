import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { Confirmation, type ConfirmationParams } from './Confirmation';

const mockPopTo = jest.fn();
const mockNavigate = jest.fn();
let mockParams: ConfirmationParams;

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual<object>('@react-navigation/native'),
  useNavigation: () => ({ navigate: mockNavigate, popTo: mockPopTo }),
  useRoute: () => ({ params: mockParams }),
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: jest.requireActual<typeof import('react-native')>('react-native').View,
}));

const base: ConfirmationParams = {
  title: 'Done',
  subtitle: 'Sub',
  buttonTitle: 'See my plants',
  icon: 'hug',
  nextScreen: 'MyPlants',
};

beforeEach(() => {
  mockParams = base;
});

describe('Confirmation', () => {
  it('goes back to the existing tabs on My plants instead of pushing a second copy', () => {
    render(<Confirmation />);

    fireEvent.press(screen.getByText('See my plants'));

    expect(mockPopTo).toHaveBeenCalledWith('PlantSelect', { screen: 'MyPlantsList' });
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('shows the emoji when it has no photo', () => {
    render(<Confirmation />);

    expect(screen.getByText('🤗')).toBeOnTheScreen();
    expect(screen.queryByTestId('confirmation-photo')).not.toBeOnTheScreen();
  });

  it('shows the plant photo in place of the emoji, and the badge it was given', () => {
    mockParams = {
      ...base,
      title: 'ZZ plant is in your garden',
      photo: { uri: 'http://api/plants/zz/image?v=1' },
      badge: '✨ Also joined the catalog',
    };
    render(<Confirmation />);

    expect(screen.getByTestId('confirmation-photo').props.source).toMatchObject({
      uri: 'http://api/plants/zz/image?v=1',
    });
    expect(screen.queryByText('🤗')).not.toBeOnTheScreen();
    expect(screen.getByText('✨ Also joined the catalog')).toBeOnTheScreen();
    expect(screen.getByText('ZZ plant is in your garden')).toBeOnTheScreen();
  });

  it('pins nothing to the top of the screen, where the notch is', () => {
    mockParams = { ...base, badge: '✨ Also joined the catalog' };
    const { toJSON } = render(<Confirmation />);

    expect(JSON.stringify(toJSON())).not.toContain('"position":"absolute"');
  });
});
