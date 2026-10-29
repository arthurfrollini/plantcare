import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { Confirmation } from './Confirmation';

const mockPopTo = jest.fn();
const mockNavigate = jest.fn();

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual<object>('@react-navigation/native'),
  useNavigation: () => ({ navigate: mockNavigate, popTo: mockPopTo }),
  useRoute: () => ({
    params: {
      title: 'Done',
      subtitle: 'Sub',
      buttonTitle: 'See my plants',
      icon: 'hug',
      nextScreen: 'MyPlants',
      toast: 'ZZ plant joined the catalog',
    },
  }),
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: jest.requireActual<typeof import('react-native')>('react-native').View,
}));

describe('Confirmation', () => {
  it('goes back to the existing tabs on My plants instead of pushing a second copy', () => {
    render(<Confirmation />);

    fireEvent.press(screen.getByText('See my plants'));

    expect(mockPopTo).toHaveBeenCalledWith('PlantSelect', { screen: 'MyPlantsList' });
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('shows the toast it was given', () => {
    render(<Confirmation />);

    expect(screen.getByText('ZZ plant joined the catalog')).toBeOnTheScreen();
  });
});
