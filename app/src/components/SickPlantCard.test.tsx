import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { changeLanguage, initI18n } from '../i18n';
import { SickPlantCard } from './SickPlantCard';

beforeAll(initI18n);
beforeEach(() => changeLanguage('en'));

describe('SickPlantCard', () => {
  it('reads as a button with a title and what it leads to', () => {
    const onPress = jest.fn();
    render(<SickPlantCard onPress={onPress} />);

    expect(screen.getByText('Find out what is wrong and how to help')).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'My plant is sick 🤒' }));

    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
