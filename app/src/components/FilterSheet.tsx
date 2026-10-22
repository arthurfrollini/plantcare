import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { difficultySchema, lightSchema, type Difficulty, type Light } from '@plantcare/shared';

import { BottomSheet } from './BottomSheet';
import { Button } from './Button';
import { FilterChip } from './FilterChip';

import colors from '../styles/colors';
import fonts from '../styles/fonts';

const LIGHT_EMOJI: Record<Light, string> = {
  full_sun: '☀️',
  partial_shade: '⛅',
  shade: '☁️',
};

const DIFFICULTY_EMOJI: Record<Difficulty, string> = {
  easy: '😌',
  medium: '🙂',
  hard: '😅',
};

interface FilterSheetProps {
  visible: boolean;
  light: Light | null;
  difficulty: Difficulty | null;
  onLightChange: (light: Light | null) => void;
  onDifficultyChange: (difficulty: Difficulty | null) => void;
  onClose: () => void;
}

export function FilterSheet({
  visible,
  light,
  difficulty,
  onLightChange,
  onDifficultyChange,
  onClose,
}: FilterSheetProps) {
  const { t } = useTranslation();
  function clear() {
    onLightChange(null);
    onDifficultyChange(null);
  }

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View style={styles.top}>
        <Text style={styles.title}>{t('plantSelect.filters')}</Text>
        <Pressable accessibilityRole="button" hitSlop={12} onPress={clear}>
          <Text style={styles.clear}>{t('plantSelect.clear')}</Text>
        </Pressable>
      </View>

      <Text style={styles.label}>{t('plantSelect.lightLabel')}</Text>
      <View style={styles.row}>
        <FilterChip
          title={t('plantSelect.all')}
          active={light === null}
          onPress={() => onLightChange(null)}
        />
        {lightSchema.options.map((value) => (
          <FilterChip
            key={value}
            emoji={LIGHT_EMOJI[value]}
            title={t(`light.${value}`)}
            active={light === value}
            onPress={() => onLightChange(value)}
          />
        ))}
      </View>

      <Text style={styles.label}>{t('plantSelect.difficultyLabel')}</Text>
      <View style={styles.row}>
        <FilterChip
          title={t('plantSelect.all')}
          active={difficulty === null}
          onPress={() => onDifficultyChange(null)}
        />
        {difficultySchema.options.map((value) => (
          <FilterChip
            key={value}
            emoji={DIFFICULTY_EMOJI[value]}
            title={t(`difficulty.${value}`)}
            active={difficulty === value}
            onPress={() => onDifficultyChange(value)}
          />
        ))}
      </View>

      <View style={styles.done}>
        <Button title={t('plantSelect.done')} onPress={onClose} />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  top: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: 20,
    color: colors.heading,
    fontFamily: fonts.heading,
  },
  clear: {
    fontSize: 15,
    color: colors.green_dark,
    fontFamily: fonts.heading,
  },
  label: {
    marginTop: 20,
    color: colors.body_dark,
    fontFamily: fonts.text,
    fontSize: 13,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 10,
    marginTop: 8,
  },
  done: {
    marginTop: 28,
  },
});
