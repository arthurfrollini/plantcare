import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { BottomSheet } from './BottomSheet';
import { Button } from './Button';
import type { FormError } from '../plants/usePlantDetail';
import { WEEKDAYS, weekdayName } from '../plants/weekdays';
import colors from '../styles/colors';
import fonts from '../styles/fonts';

interface DaysSheetProps {
  visible: boolean;
  /** How many days the plant is watered per week. */
  required: number;
  /** The days in use now, shown under the title; the picking starts from none. */
  initialDays: number[];
  saving: boolean;
  /** Why the last save failed; shown here only when this sheet's own save failed. */
  error?: FormError | null;
  /** Resolves true once the days are stored; the sheet then closes. */
  onSave: (days: number[]) => Promise<boolean>;
  onClose: () => void;
}

/** Picks the watering days from scratch, exactly as many as the plant needs. */
export function DaysSheet(props: DaysSheetProps) {
  const { visible, required, initialDays, saving, error, onSave, onClose } = props;
  const { t } = useTranslation();
  const [picked, setPicked] = useState<number[]>([]);
  const [failed, setFailed] = useState(false);
  // Every opening starts with nothing picked.
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setPicked([]);
      setFailed(false);
    }
  }

  const full = picked.length === required;

  function toggle(day: number) {
    if (required === 1) {
      setPicked([day]);
      return;
    }
    setPicked((current) => {
      if (current.includes(day)) return current.filter((d) => d !== day);
      if (current.length >= required) return current;
      return [...current, day].sort((a, b) => a - b);
    });
  }

  async function save() {
    if (!full || saving) return;
    setFailed(false);
    if (await onSave(picked)) onClose();
    else setFailed(true);
  }

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <Text style={styles.title}>{t('plantDetail.days')}</Text>
      {initialDays.length > 0 && (
        <Text style={styles.current}>
          {initialDays.map((day) => weekdayName(day, 'EEEE')).join(' · ')}
        </Text>
      )}
      <View style={styles.chipRow}>
        {WEEKDAYS.map((day) => {
          const checked = picked.includes(day);
          return (
            <Pressable
              key={day}
              accessibilityRole="checkbox"
              accessibilityState={{ checked }}
              accessibilityLabel={weekdayName(day, 'EEEE')}
              style={({ pressed }) => [
                styles.chip,
                checked && styles.chipActive,
                pressed && styles.pressed,
              ]}
              onPress={() => toggle(day)}
            >
              <Text style={[styles.chipText, checked && styles.chipTextActive]}>
                {weekdayName(day, 'EEE')}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.hint}>
        {t('plantDetail.pickDaysCount', { count: required, picked: picked.length })}
      </Text>
      {failed && error && (
        <Text style={styles.error} accessibilityRole="alert">
          {t(`plantForm.errors.${error}`)}
        </Text>
      )}
      <View style={styles.action}>
        {saving ? (
          <View style={styles.saving}>
            <ActivityIndicator color={colors.white} accessibilityLabel={t('plantForm.saving')} />
          </View>
        ) : (
          <View style={!full && styles.off}>
            <Button
              title={t('plantDetail.saveDays')}
              onPress={() => void save()}
              disabled={!full}
              accessibilityState={{ disabled: !full }}
            />
          </View>
        )}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 20,
    color: colors.heading,
    fontFamily: fonts.heading,
  },
  current: {
    marginTop: 4,
    fontSize: 14,
    color: colors.body_dark,
    fontFamily: fonts.text,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 20,
  },
  chip: {
    flex: 1,
    height: 48,
    paddingHorizontal: 2,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.shape,
  },
  chipActive: {
    backgroundColor: colors.green,
  },
  pressed: {
    opacity: 0.6,
  },
  chipText: {
    fontSize: 13,
    color: colors.heading,
    fontFamily: fonts.text,
  },
  chipTextActive: {
    color: colors.white,
    fontFamily: fonts.heading,
  },
  hint: {
    marginTop: 12,
    textAlign: 'center',
    fontSize: 14,
    color: colors.body_dark,
    fontFamily: fonts.text,
  },
  error: {
    marginTop: 12,
    textAlign: 'center',
    fontSize: 14,
    color: colors.red,
    fontFamily: fonts.text,
  },
  action: {
    marginTop: 20,
  },
  off: {
    opacity: 0.5,
  },
  saving: {
    backgroundColor: colors.green,
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
