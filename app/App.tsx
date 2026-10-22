import React, { useEffect, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import * as Notifications from 'expo-notifications';
import {
  useFonts,
  Jost_400Regular,
  Jost_400Regular_Italic,
  Jost_600SemiBold,
} from '@expo-google-fonts/jost';

import Routes from './src/routes';
import { initI18n } from './src/i18n';
import { AuthProvider } from './src/auth/AuthProvider';
import { AnimatedSplash } from './src/components/AnimatedSplash';

// Keeps the native splash up until the Jost fonts are ready; AnimatedSplash hides it once its first
// frame, identical to the native image, is on screen.
SplashScreen.preventAutoHideAsync();

// Without a handler, a reminder that fires while the app is open is dropped silently.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export default function App() {
  const [splashDone, setSplashDone] = useState(false);
  const [i18nReady, setI18nReady] = useState(false);
  const [fontsLoaded, fontError] = useFonts({
    Jost_400Regular,
    Jost_400Regular_Italic,
    Jost_600SemiBold,
  });

  useEffect(() => {
    initI18n().finally(() => setI18nReady(true));
  }, []);

  if ((!fontsLoaded && !fontError) || !i18nReady) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <AuthProvider>
          <Routes />
        </AuthProvider>
        {!splashDone && <AnimatedSplash onFinish={() => setSplashDone(true)} />}
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
