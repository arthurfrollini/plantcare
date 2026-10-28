import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Tappable } from './Tappable';
import colors from '../styles/colors';
import fonts from '../styles/fonts';

interface SickPlantCardProps {
  onPress: () => void;
}

/** Opens the symptom guide, which leads to an AI check-up when the guide isn't enough. */
export function SickPlantCard({ onPress }: SickPlantCardProps) {
  const { t } = useTranslation();
  const label = t('plantDetail.sick');

  return (
    <Tappable
      accessibilityRole="button"
      accessibilityLabel={label}
      style={styles.button}
      feedback="opacity"
      onPress={onPress}
    >
      <Text style={styles.text} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
        {label}
      </Text>
    </Tappable>
  );
}

const styles = StyleSheet.create({
  button: {
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    borderRadius: 16,
    backgroundColor: colors.yellow_light,
  },
  text: {
    fontSize: 15,
    color: colors.yellow_dark,
    fontFamily: fonts.heading,
  },
});
