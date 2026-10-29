import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { RootStackParamList } from '../routes/stack.routes';

import { Button } from '../components/Button';

import colors from '../styles/colors';
import fonts from '../styles/fonts';

export interface ConfirmationParams {
  title: string;
  subtitle: string;
  buttonTitle: string;
  icon: 'smile' | 'hug';
  nextScreen: 'PlantSelect' | 'MyPlants';
  /** The plant's photo, shown in a circle in place of the emoji. */
  photo?: { uri: string; headers?: Record<string, string> };
  /** A short note that stays on screen, e.g. that a species joined the catalog. */
  badge?: string;
}

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
    photo,
    badge,
  } = routes.params;

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
        {photo ? (
          <View style={styles.ring}>
            <Image
              testID="confirmation-photo"
              source={photo}
              style={styles.photo}
              contentFit="cover"
              accessibilityIgnoresInvertColors
            />
          </View>
        ) : (
          <Text style={styles.emoji}>{emojis[icon]}</Text>
        )}

        <Text style={styles.title}>{title}</Text>

        <Text style={styles.subtitle}>{subtitle}</Text>

        {badge && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{badge}</Text>
          </View>
        )}

        <View style={styles.footer}>
          <Button title={buttonTitle} onPress={handleMoveOn} />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
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
  ring: {
    width: 150,
    height: 150,
    borderRadius: 75,
    overflow: 'hidden',
    borderWidth: 4,
    borderColor: colors.white,
    backgroundColor: colors.shape,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  photo: {
    width: '100%',
    height: '100%',
  },
  badge: {
    marginTop: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: colors.green_light,
  },
  badgeText: {
    fontSize: 14,
    color: colors.green_dark,
    fontFamily: fonts.heading,
  },
  footer: {
    width: '100%',
    paddingHorizontal: 50,
    marginTop: 45,
  },
});
