import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { SYMPTOMS, type SymptomCause, type SymptomId, type UserPlant } from '@plantcare/shared';

import { currentLanguage } from '../i18n';
import { weekdayName } from '../plants/weekdays';
import { BottomSheet } from './BottomSheet';
import { frequencyLabel } from './CareTiles';
import colors from '../styles/colors';
import fonts from '../styles/fonts';

/** Why the AI link is missing: switched off, or today's check-ups are used up. */
export type AiNote = 'off' | 'limit';

interface SymptomGuideSheetProps {
  visible: boolean;
  plant: UserPlant;
  /** Null while the AI is available (or not known yet). */
  aiNote: AiNote | null;
  /** The picked symptom's name, to fill in the check-up; empty when none was picked. */
  onAskAi: (description: string) => void;
  onClose: () => void;
  onClosed?: () => void;
}

/** The species' own needs next to a cause, so the advice starts from this plant. */
function speciesHint(t: TFunction, cause: SymptomCause, plant: UserPlant): string | null {
  switch (cause.speciesHint) {
    case 'water': {
      const frequency = frequencyLabel(t, plant.frequency);
      if (plant.wateringDays.length === 0) return t('health.hintWaterNoDays', { frequency });
      const days = plant.wateringDays.map((day) => weekdayName(day, 'EEE')).join(', ');
      return t('health.hintWater', { frequency, days });
    }
    case 'light':
      return t('health.hintLight', { light: t(`light.${plant.light}`) });
    case undefined:
      return null;
  }
}

/** The free, offline guide: symptoms, then their likely causes, most common first. */
export function SymptomGuideSheet({
  visible,
  plant,
  aiNote,
  onAskAi,
  onClose,
  onClosed,
}: SymptomGuideSheetProps) {
  const { t } = useTranslation();
  const language = currentLanguage();
  const [symptomId, setSymptomId] = useState<SymptomId | null>(null);
  const symptom = SYMPTOMS.find((s) => s.id === symptomId) ?? null;

  function handleClosed() {
    setSymptomId(null);
    onClosed?.();
  }

  return (
    <BottomSheet visible={visible} onClose={onClose} onClosed={handleClosed}>
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        {symptom ? (
          <>
            <Pressable
              accessibilityRole="button"
              style={({ pressed }) => [styles.back, pressed && styles.pressed]}
              onPress={() => setSymptomId(null)}
              hitSlop={8}
            >
              <Feather name="chevron-left" size={20} color={colors.green_dark} />
              <Text style={styles.backText}>{t('health.allSymptoms')}</Text>
            </Pressable>
            <Text style={styles.title}>{symptom.title[language]}</Text>
            {symptom.causes.map((cause) => {
              const hint = speciesHint(t, cause, plant);
              return (
                <View key={cause.id} style={styles.cause}>
                  <Text style={styles.causeTitle}>{cause.title[language]}</Text>
                  <Text style={styles.label}>{t('health.check')}</Text>
                  <Text style={styles.body}>{cause.check[language]}</Text>
                  <Text style={styles.label}>{t('health.do')}</Text>
                  <Text style={styles.body}>{cause.do[language]}</Text>
                  {hint && (
                    <View style={styles.hint}>
                      <MaterialCommunityIcons name="sprout" size={16} color={colors.green_dark} />
                      <Text style={styles.hintText}>{hint}</Text>
                    </View>
                  )}
                </View>
              );
            })}
          </>
        ) : (
          <>
            <Text style={styles.title}>{t('health.guideTitle')}</Text>
            <Text style={styles.text}>{t('health.guideText')}</Text>
            {SYMPTOMS.map((s) => (
              <Pressable
                key={s.id}
                accessibilityRole="button"
                accessibilityLabel={s.title[language]}
                style={({ pressed }) => [styles.symptom, pressed && styles.pressed]}
                onPress={() => setSymptomId(s.id)}
              >
                <Text style={styles.symptomText}>{s.title[language]}</Text>
                <Feather name="chevron-right" size={20} color={colors.body_light} />
              </Pressable>
            ))}
          </>
        )}

        {aiNote ? (
          <Text style={styles.aiNote}>
            {t(aiNote === 'off' ? 'health.aiOff' : 'health.aiLimit')}
          </Text>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('health.askAi')}
            style={({ pressed }) => [styles.askAi, pressed && styles.pressed]}
            onPress={() => onAskAi(symptom ? symptom.title[language] : '')}
          >
            <MaterialCommunityIcons name="creation" size={16} color={colors.green_dark} />
            <Text style={styles.askAiText}>{t('health.askAi')}</Text>
          </Pressable>
        )}
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  scroll: {
    maxHeight: 560,
  },
  title: {
    fontSize: 20,
    color: colors.heading,
    fontFamily: fonts.heading,
  },
  text: {
    marginTop: 4,
    marginBottom: 8,
    fontSize: 14,
    lineHeight: 20,
    color: colors.body_dark,
    fontFamily: fonts.text,
  },
  symptom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.gray,
  },
  symptomText: {
    fontSize: 16,
    color: colors.heading,
    fontFamily: fonts.text,
  },
  pressed: {
    opacity: 0.6,
  },
  back: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  backText: {
    fontSize: 14,
    color: colors.green_dark,
    fontFamily: fonts.heading,
  },
  cause: {
    marginTop: 14,
    padding: 16,
    borderRadius: 16,
    backgroundColor: colors.shape,
  },
  causeTitle: {
    fontSize: 16,
    color: colors.heading,
    fontFamily: fonts.heading,
  },
  label: {
    marginTop: 8,
    fontSize: 12,
    color: colors.body_dark,
    fontFamily: fonts.heading,
    textTransform: 'uppercase',
  },
  body: {
    marginTop: 2,
    fontSize: 14,
    lineHeight: 20,
    color: colors.heading,
    fontFamily: fonts.text,
  },
  hint: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
    padding: 10,
    borderRadius: 12,
    backgroundColor: colors.green_light,
  },
  hintText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    color: colors.green_dark,
    fontFamily: fonts.text,
  },
  askAi: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 20,
    paddingVertical: 12,
  },
  askAiText: {
    fontSize: 14,
    color: colors.green_dark,
    fontFamily: fonts.heading,
  },
  aiNote: {
    marginTop: 20,
    paddingVertical: 12,
    textAlign: 'center',
    fontSize: 14,
    color: colors.body_dark,
    fontFamily: fonts.text,
  },
});
