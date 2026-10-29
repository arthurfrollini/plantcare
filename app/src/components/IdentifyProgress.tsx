import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import colors from '../styles/colors';
import fonts from '../styles/fonts';

export type ProgressStep = { label: string; done: boolean };

interface IdentifyProgressProps {
  /** The photo being identified; a name search shows a search icon instead. */
  photoUri: string | null;
  steps: ProgressStep[];
}

/** What the search is doing: the photo in a ring, and each step ticked off as it ends. */
export function IdentifyProgress({ photoUri, steps }: IdentifyProgressProps) {
  const { t } = useTranslation();
  return (
    <View style={styles.container} accessibilityLiveRegion="polite">
      <View style={styles.ring}>
        {photoUri ? (
          <Image
            testID="progress-photo"
            source={{ uri: photoUri }}
            style={styles.photo}
            contentFit="cover"
            accessibilityIgnoresInvertColors
          />
        ) : (
          <Feather name="search" size={44} color={colors.green_dark} />
        )}
      </View>
      <Text style={styles.title}>{t('aiIdentify.identifying')}</Text>
      <View style={styles.steps}>
        {steps.map((step) => (
          <View key={step.label} style={styles.step}>
            {step.done ? (
              <Feather name="check" size={16} color={colors.green_dark} />
            ) : (
              <ActivityIndicator size="small" color={colors.green} />
            )}
            <Text style={[styles.stepText, step.done && styles.stepDone]}>{step.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const RING = 132;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 30,
  },
  ring: {
    width: RING,
    height: RING,
    borderRadius: RING / 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: colors.green_light,
    borderWidth: 4,
    borderColor: colors.white,
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
  title: {
    marginTop: 24,
    fontSize: 18,
    color: colors.heading,
    fontFamily: fonts.heading,
  },
  steps: {
    marginTop: 18,
    gap: 10,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  stepText: {
    fontSize: 15,
    color: colors.body_light,
    fontFamily: fonts.text,
  },
  stepDone: {
    color: colors.green_dark,
  },
});
