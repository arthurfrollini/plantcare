import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { useTranslation } from 'react-i18next';
import type { Checkup } from '@plantcare/shared';

import { dateLocale } from '../i18n';
import colors from '../styles/colors';
import fonts from '../styles/fonts';

/** "Oct 27, 2026", in the app language. */
export function checkupDate(iso: string): string {
  return format(new Date(iso), 'PP', { locale: dateLocale() });
}

interface CheckupBoxProps {
  checkup: Checkup;
  healing: boolean;
  onAskAgain: () => void;
  onHealed: () => void;
}

/** The plant's open check-up: what the AI saw, what to do, and when to worry. */
export function CheckupBox({ checkup, healing, onAskAgain, onHealed }: CheckupBoxProps) {
  const { t } = useTranslation();

  return (
    <View style={styles.box} testID="checkup-box">
      <View style={styles.header}>
        <MaterialCommunityIcons name="stethoscope" size={18} color={colors.yellow_dark} />
        <Text style={styles.date}>
          {t('health.boxTitle', { date: checkupDate(checkup.createdAt) })}
        </Text>
      </View>
      <Text style={styles.problem}>{checkup.problem}</Text>

      <Text style={styles.label}>{t('health.steps')}</Text>
      {checkup.steps.map((step, i) => (
        <View key={i} style={styles.step}>
          <Text style={styles.stepNumber}>{i + 1}.</Text>
          <Text style={styles.stepText}>{step}</Text>
        </View>
      ))}

      <Text style={styles.label}>{t('health.whenToWorry')}</Text>
      <Text style={styles.stepText}>{checkup.whenToWorry}</Text>

      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          style={({ pressed }) => [styles.action, pressed && styles.pressed]}
          onPress={onAskAgain}
          disabled={healing}
        >
          <Text style={styles.actionText}>{t('health.askAgain')}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('health.healed')}
          accessibilityState={{ busy: healing, disabled: healing }}
          style={({ pressed }) => [styles.action, styles.healed, pressed && styles.pressed]}
          onPress={onHealed}
          disabled={healing}
        >
          {healing ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <Text style={[styles.actionText, styles.healedText]}>{t('health.healed')}</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    padding: 18,
    borderRadius: 20,
    backgroundColor: colors.yellow_light,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  date: {
    fontSize: 13,
    color: colors.yellow_dark,
    fontFamily: fonts.heading,
  },
  problem: {
    marginTop: 8,
    fontSize: 17,
    lineHeight: 24,
    color: colors.heading,
    fontFamily: fonts.heading,
  },
  label: {
    marginTop: 14,
    marginBottom: 4,
    fontSize: 12,
    color: colors.yellow_dark,
    fontFamily: fonts.heading,
    textTransform: 'uppercase',
  },
  step: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 2,
  },
  stepNumber: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.yellow_dark,
    fontFamily: fonts.heading,
  },
  stepText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    color: colors.heading,
    fontFamily: fonts.text,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  action: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.yellow_dark,
  },
  healed: {
    backgroundColor: colors.green,
    borderColor: colors.green,
  },
  pressed: {
    opacity: 0.6,
  },
  actionText: {
    fontSize: 14,
    color: colors.yellow_dark,
    fontFamily: fonts.heading,
  },
  healedText: {
    color: colors.white,
  },
});
