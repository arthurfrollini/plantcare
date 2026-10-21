import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NavigationContainer } from '@react-navigation/native';
import { render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { initI18n } from '../i18n';
import { Header, initials } from './Header';

describe('initials', () => {
  it('takes the first letters of the first two words', () => {
    expect(initials('Ana Clara Souza')).toBe('AC');
  });

  it('trims and upper-cases', () => {
    expect(initials('  arthur ')).toBe('A');
  });

  it('is empty for an empty name', () => {
    expect(initials('')).toBe('');
  });
});

describe('Header', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    await initI18n();
  });

  it('shows the stored user name and initials', async () => {
    await AsyncStorage.setItem('@plantcare:user', 'Arthur Frollini');

    render(
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 390, height: 844 },
          insets: { top: 0, left: 0, right: 0, bottom: 0 },
        }}
      >
        <NavigationContainer>
          <Header />
        </NavigationContainer>
      </SafeAreaProvider>,
    );

    expect(await screen.findByText('Arthur Frollini')).toBeTruthy();
    expect(screen.getByText('AF')).toBeTruthy();
  });
});
