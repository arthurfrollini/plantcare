import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NavigationContainer } from '@react-navigation/native';
import { render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider } from '../auth/AuthProvider';
import { initI18n } from '../i18n';
import { Header, firstName, initials } from './Header';

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

describe('firstName', () => {
  it('keeps only the first word', () => {
    expect(firstName('Ana Clara Souza')).toBe('Ana');
  });

  it('trims surrounding and repeated spaces', () => {
    expect(firstName('   Arthur    Frollini ')).toBe('Arthur');
  });

  it('is empty for an empty name', () => {
    expect(firstName('  ')).toBe('');
  });
});

describe('Header', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    await initI18n();
  });

  it('greets by first name and keeps both initials', async () => {
    await AsyncStorage.setItem('@plantcare:user', 'Arthur Frollini');

    render(
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 390, height: 844 },
          insets: { top: 0, left: 0, right: 0, bottom: 0 },
        }}
      >
        <AuthProvider>
          <NavigationContainer>
            <Header />
          </NavigationContainer>
        </AuthProvider>
      </SafeAreaProvider>,
    );

    expect(await screen.findByText('Arthur')).toBeTruthy();
    expect(screen.queryByText('Arthur Frollini')).toBeNull();
    expect(screen.getByText('AF')).toBeTruthy();
  });
});
