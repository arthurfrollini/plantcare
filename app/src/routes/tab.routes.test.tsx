import React from 'react';
import { Alert, Modal } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import MockAdapter from 'axios-mock-adapter';
import { NavigationContainer } from '@react-navigation/native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { api } from '../api/client';
import { AuthProvider } from '../auth/AuthProvider';
import { clearTokens } from '../auth/session';
import { changeLanguage, initI18n } from '../i18n';
import { pickPhoto } from '../plants/pickPhoto';
import AuthRoutes from './tab.routes';

const mockNavigate = jest.fn();

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual<object>('@react-navigation/native'),
  useNavigation: () => ({ navigate: mockNavigate, goBack: jest.fn() }),
}));

jest.mock('../plants/pickPhoto', () => ({ pickPhoto: jest.fn() }));

let mock: MockAdapter;

beforeAll(initI18n);

beforeEach(async () => {
  mock = new MockAdapter(api);
  mockNavigate.mockClear();
  jest.mocked(pickPhoto).mockReset();
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

/** Taps an option in the add sheet, waits for it to slide away, then plays iOS's onDismiss. */
async function choose(option: string) {
  fireEvent.press(await screen.findByLabelText('Add a plant'));
  const modal = screen.UNSAFE_getByType(Modal);
  fireEvent.press(screen.getByLabelText(option));
  await waitFor(() => expect(screen.queryByLabelText(option)).toBeNull(), { timeout: 3000 });
  await act(async () => {
    (modal.props as { onDismiss: () => void }).onDismiss();
  });
}

describe('tabs', () => {
  it('opens on My plants, with Profile and My plants as tabs', async () => {
    renderTabs();

    expect(await screen.findByText('Sign in to see your plants.')).toBeTruthy();
    expect(screen.getByText('Profile')).toBeTruthy();
    expect(screen.getByText('My plants')).toBeTruthy();
  });

  it('opens the catalog for Add manually', async () => {
    renderTabs();

    await choose('Add manually');

    expect(mockNavigate).toHaveBeenCalledWith('Catalog');
    expect(pickPhoto).not.toHaveBeenCalled();
  });

  it('takes a photo, then opens the catalog with it', async () => {
    const photo = { uri: 'file:///tmp/taken.jpg', mimeType: 'image/jpeg' };
    jest.mocked(pickPhoto).mockResolvedValue({ photo });
    renderTabs();

    await choose('Take a photo');

    expect(pickPhoto).toHaveBeenCalledWith('camera');
    expect(mockNavigate).toHaveBeenCalledWith('Catalog', { photo });
  });

  it('stays put when the camera is cancelled', async () => {
    jest.mocked(pickPhoto).mockResolvedValue({ cancelled: true });
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    renderTabs();

    await choose('Take a photo');

    expect(mockNavigate).not.toHaveBeenCalled();
    expect(alert).not.toHaveBeenCalled();
  });

  it('says how to go on when the camera is not allowed', async () => {
    jest.mocked(pickPhoto).mockResolvedValue({ message: 'denied' });
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    renderTabs();

    await choose('Take a photo');

    expect(alert).toHaveBeenCalledWith(
      "PlantCare isn't allowed to use the camera. You can add the plant manually.",
    );
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
