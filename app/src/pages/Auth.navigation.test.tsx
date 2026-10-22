import React from 'react';
import { Text } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import MockAdapter from 'axios-mock-adapter';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import {
  NavigationContainer,
  StackRouter,
  createNavigatorFactory,
  useNavigation,
  useNavigationBuilder,
  type NavigationState,
} from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { api } from '../api/client';
import { AuthProvider } from '../auth/AuthProvider';
import { clearTokens } from '../auth/session';
import { initI18n } from '../i18n';
import { Auth } from './Auth';

// A bare stack that shows only the focused screen, so the real router decides what sign-in does.
function StackView({ children, ...rest }: { children: React.ReactNode }) {
  const { state, descriptors, NavigationContent } = useNavigationBuilder(StackRouter, {
    children,
    ...rest,
  });
  const focused = state.routes[state.index];
  return <NavigationContent>{focused ? descriptors[focused.key]?.render() : null}</NavigationContent>;
}
const Stack = createNavigatorFactory(StackView)();

function Tabs() {
  return <Text>Tabs</Text>;
}

function OpenAuth() {
  const navigation = useNavigation();
  return <Text onPress={() => navigation.navigate('Auth', { mode: 'signIn' })}>open auth</Text>;
}

const account = {
  id: 'u1',
  name: 'Ana',
  email: 'ana@example.com',
  language: 'en',
  hasPassword: true,
  hasGoogle: false,
  hasAvatar: false,
  avatarVersion: null,
};

let mock: MockAdapter;
let state: NavigationState | undefined;

beforeAll(initI18n);

beforeEach(async () => {
  mock = new MockAdapter(api);
  mock.onPost('/auth/login').reply(200, { accessToken: 'a', refreshToken: 'r', user: account });
  mock.onGet('/me').reply(200, account);
  mock.onGet('/me/plants').reply(200, []);
  await clearTokens();
  await AsyncStorage.clear();
  state = undefined;
});

afterEach(() => mock.restore());

function renderStack(initial: string[]) {
  return render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <AuthProvider>
        <NavigationContainer
          initialState={{
            index: initial.length - 1,
            routes: initial.map((name) => ({
              name,
              params: name === 'Auth' ? { mode: 'signIn' } : undefined,
            })),
          }}
          onStateChange={(next) => {
            state = next;
          }}
        >
          <Stack.Navigator>
            <Stack.Screen name="Welcome" component={OpenAuth} />
            <Stack.Screen name="PlantSelect" component={Tabs} />
            <Stack.Screen name="Profile" component={OpenAuth} />
            <Stack.Screen name="Auth" component={Auth} />
          </Stack.Navigator>
        </NavigationContainer>
      </AuthProvider>
    </SafeAreaProvider>,
  );
}

function signInNow() {
  fireEvent.changeText(screen.getByLabelText('Email'), 'ana@example.com');
  fireEvent.changeText(screen.getByLabelText('Password'), 'secret123');
  fireEvent.press(screen.getByText('Sign in'));
}

const names = () => state?.routes.map((r) => r.name);

describe('Auth navigation after sign in', () => {
  it('returns to the tabs under Profile instead of stacking a second set', async () => {
    renderStack(['PlantSelect', 'Profile', 'Auth']);

    signInNow();

    await waitFor(() => expect(names()).toEqual(['PlantSelect']));
    expect(screen.getByText('Tabs')).toBeTruthy();
  });

  it('returns to the existing tabs when opened from My Plants', async () => {
    renderStack(['PlantSelect', 'Auth']);

    signInNow();

    await waitFor(() => expect(names()).toEqual(['PlantSelect']));
  });

  it('adds the tabs in place of Auth when coming from Welcome', async () => {
    renderStack(['Welcome', 'Auth']);

    signInNow();

    await waitFor(() => expect(names()).toEqual(['Welcome', 'PlantSelect']));
  });
});
