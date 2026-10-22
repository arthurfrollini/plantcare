import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import colors from '../styles/colors';
import fonts from '../styles/fonts';

/**
 * Asks the AI what is wrong with a sick plant. Shown as a button that is not wired yet: disabled,
 * with the "Soon" badge on it.
 */
export function SickPlantCard() {
  const { t } = useTranslation();
  const label = t('plantDetail.sick');
  const soon = t('plantSelect.soon');

  return (
    <View
      accessible
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${soon}`}
      accessibilityState={{ disabled: true }}
      style={styles.button}
    >
      <Text style={styles.text} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
        {label}
      </Text>
      <Text style={styles.soon}>{soon}</Text>
    </View>
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
  // Sits on the button's top edge, so the label keeps the whole width for one line.
  soon: {
    position: 'absolute',
    top: -10,
    right: 12,
    fontSize: 12,
    color: colors.green_dark,
    fontFamily: fonts.heading,
    backgroundColor: colors.green_light,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 8,
    overflow: 'hidden',
  },
});
