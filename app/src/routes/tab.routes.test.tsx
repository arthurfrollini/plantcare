import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import MockAdapter from 'axios-mock-adapter';
import { NavigationContainer } from '@react-navigation/native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { api } from '../api/client';
import { AuthProvider } from '../auth/AuthProvider';
import { clearTokens } from '../auth/session';
import { changeLanguage, initI18n } from '../i18n';
import AuthRoutes from './tab.routes';

const mockNavigate = jest.fn();

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual<object>('@react-navigation/native'),
  useNavigation: () => ({ navigate: mockNavigate, goBack: jest.fn() }),
}));

let mock: MockAdapter;

beforeAll(initI18n);

beforeEach(async () => {
  mock = new MockAdapter(api);
  mockNavigate.mockClear();
  await clearTokens();
  await AsyncStorage.clear();
  await changeLanguage('en');
});

afterEach(() => mock.restore());

function renderTabs() {
  return render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <AuthProvider>
        <NavigationContainer>
          <AuthRoutes />
        </NavigationContainer>
      </AuthProvider>
    </SafeAreaProvider>,
  );
}

describe('tabs', () => {
  it('opens on My plants, with Profile and My plants as tabs', async () => {
    renderTabs();

    expect(await screen.findByText('Sign in to see your plants.')).toBeTruthy();
    expect(screen.getByText('Profile')).toBeTruthy();
    expect(screen.getByText('My plants')).toBeTruthy();
  });

  it('opens the catalog from the + button', async () => {
    renderTabs();

    fireEvent.press(await screen.findByLabelText('Add a plant'));

    expect(mockNavigate).toHaveBeenCalledWith('Catalog');
  });
});
