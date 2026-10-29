import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { RootStackParamList } from '../routes/stack.routes';

import { Button } from '../components/Button';
import { Toast } from '../components/Toast';

import colors from '../styles/colors';
import fonts from '../styles/fonts';

export interface ConfirmationParams {
  title: string;
  subtitle: string;
  buttonTitle: string;
  icon: 'smile' | 'hug';
  nextScreen: 'PlantSelect' | 'MyPlants';
  /** A short note shown for a moment on arrival, e.g. that a species joined the catalog. */
  toast?: string;
}

const TOAST_MS = 3000;

const emojis = {
  hug: '🤗',
  smile: '😄',
};

export function Confirmation() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const routes =
    useRoute<RouteProp<{ Confirmation: ConfirmationParams }, 'Confirmation'>>();

  const {
    title,
    subtitle,
    buttonTitle,
    icon,
    nextScreen,
    toast,
  } = routes.params;
  const [toastVisible, setToastVisible] = useState(toast !== undefined);

  useEffect(() => {
    if (!toastVisible) return;
    const timer = setTimeout(() => setToastVisible(false), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toastVisible]);

  function handleMoveOn() {
    if (nextScreen === 'MyPlants') {
      // Both tabs live in the PlantSelect navigator already on the stack; go back to it on the
      // My plants tab instead of pushing a second copy of the tab navigator.
      navigation.popTo('PlantSelect', { screen: 'MyPlantsList' });
      return;
    }
    navigation.navigate(nextScreen);
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.emoji}>{emojis[icon]}</Text>

        <Text style={styles.title}>{title}</Text>

        <Text style={styles.subtitle}>{subtitle}</Text>

        <View style={styles.footer}>
          <Button title={buttonTitle} onPress={handleMoveOn} />
        </View>
      </View>
      {toast && (
        <View style={styles.toastArea} pointerEvents="none">
          <Toast visible={toastVisible} text={toast} />
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  toastArea: {
    position: 'absolute',
    top: 24,
    left: 30,
    right: 30,
    alignItems: 'center',
  },
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    padding: 30,
  },
  title: {
    fontSize: 22,
    lineHeight: 38,
    fontFamily: fonts.heading,
    textAlign: 'center',
    color: colors.heading,
    marginTop: 45,
  },
  subtitle: {
    fontFamily: fonts.text,
    textAlign: 'center',
    fontSize: 17,
    paddingHorizontal: 10,
    color: colors.heading,
    marginTop: 15,
  },
  emoji: {
    fontSize: 104,
  },
  footer: {
    width: '100%',
    paddingHorizontal: 50,
    marginTop: 45,
  },
});
