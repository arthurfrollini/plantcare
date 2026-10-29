import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
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
      accessibilityHint={t('plantDetail.sickHint')}
      style={styles.button}
      feedback="highlight"
      pressedStyle={styles.pressed}
      onPress={onPress}
    >
      <View style={styles.icon}>
        <MaterialCommunityIcons name="stethoscope" size={22} color={colors.white} />
      </View>
      <View style={styles.texts}>
        <Text style={styles.title} numberOfLines={1}>
          {label}
        </Text>
        <Text style={styles.hint} numberOfLines={2}>
          {t('plantDetail.sickHint')}
        </Text>
      </View>
      <Feather name="chevron-right" size={22} color={colors.yellow_dark} />
    </Tappable>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    paddingLeft: 14,
    paddingRight: 12,
    borderRadius: 18,
    backgroundColor: colors.yellow_light,
    borderWidth: 1.5,
    borderColor: colors.yellow,
    shadowColor: colors.yellow_dark,
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  pressed: {
    backgroundColor: colors.yellow_pressed,
  },
  icon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.yellow_dark,
  },
  texts: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    color: colors.heading,
    fontFamily: fonts.heading,
  },
  hint: {
    marginTop: 2,
    fontSize: 13,
    lineHeight: 18,
    color: colors.yellow_dark,
    fontFamily: fonts.text,
  },
});
