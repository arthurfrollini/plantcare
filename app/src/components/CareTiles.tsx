import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import type { Difficulty, Frequency, Light } from '@plantcare/shared';

import { DIFFICULTY_EMOJI, LIGHT_EMOJI, WATER_EMOJI } from '../plants/careEmoji';
import colors from '../styles/colors';
import fonts from '../styles/fonts';

interface CareTilesProps {
  difficulty: Difficulty;
  light: Light;
  frequency: Frequency;
}

/** "Every day", "3x a week", "Every 2 weeks", "Once a month". */
export function frequencyLabel(t: TFunction, frequency: Frequency): string {
  switch (frequency.per) {
    case 'day':
      return t('frequency.day');
    case 'week':
      return t('frequency.week', { count: frequency.times });
    case 'twoWeeks':
      return t('frequency.twoWeeks');
    case 'month':
      return t('frequency.month');
  }
}

/** The species' care facts, read-only: one row of three equal cards. */
export function CareTiles({ difficulty, light, frequency }: CareTilesProps) {
  const { t } = useTranslation();
  const tiles = [
    { key: 'difficulty', emoji: DIFFICULTY_EMOJI[difficulty], label: t(`difficulty.${difficulty}`) },
    { key: 'light', emoji: LIGHT_EMOJI[light], label: t(`light.${light}`) },
    { key: 'frequency', emoji: WATER_EMOJI, label: frequencyLabel(t, frequency) },
  ];

  return (
    <View style={styles.row}>
      {tiles.map((tile) => (
        <View key={tile.key} style={styles.tile} accessible accessibilityLabel={tile.label}>
          <Text style={styles.emoji}>{tile.emoji}</Text>
          <Text
            style={styles.label}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.75}
          >
            {tile.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 10,
  },
  tile: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 6,
    borderRadius: 20,
    backgroundColor: colors.shape,
  },
  emoji: {
    fontSize: 26,
  },
  label: {
    marginTop: 6,
    fontSize: 13,
    color: colors.green_dark,
    fontFamily: fonts.heading,
    textAlign: 'center',
  },
});
