import React from 'react';
import { Linking, StyleSheet, Text, type StyleProp, type TextStyle } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { ImageCredit } from '@plantcare/shared';

import colors from '../styles/colors';
import fonts from '../styles/fonts';

/** CC BY and CC BY-SA ask to say the photo was changed; we crop every photo to a square. */
function isAttribution(license: string): boolean {
  return /^cc[ -]by/i.test(license.trim());
}

/** Who took a species photo and under which licence; a tap opens its page at the source. */
export function CreditLine({
  credit,
  style,
}: {
  credit: ImageCredit;
  style?: StyleProp<TextStyle>;
}) {
  const { t } = useTranslation();
  const line = t('credit.photo', { author: credit.author, license: credit.license });
  return (
    <Text
      style={[styles.credit, style]}
      accessibilityRole="link"
      onPress={() => void Linking.openURL(credit.source)}
      numberOfLines={2}
    >
      {isAttribution(credit.license) ? t('credit.cropped', { credit: line }) : line}
    </Text>
  );
}

const styles = StyleSheet.create({
  credit: {
    fontSize: 11,
    lineHeight: 15,
    color: colors.body_light,
    fontFamily: fonts.text,
  },
});
