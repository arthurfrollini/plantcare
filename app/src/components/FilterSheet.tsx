import React, { useEffect, useState } from 'react';
import { Animated, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { difficultySchema, lightSchema, type Difficulty, type Light } from '@plantcare/shared';

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

const SHEET_OFFSET = 400;

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
  const insets = useSafeAreaInsets();
  const [offset] = useState(() => new Animated.Value(SHEET_OFFSET));

  useEffect(() => {
    if (!visible) return;
    offset.setValue(SHEET_OFFSET);
    Animated.timing(offset, { toValue: 0, duration: 220, useNativeDriver: true }).start();
  }, [visible, offset]);

  function clear() {
    onLightChange(null);
    onDifficultyChange(null);
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessible={false} />
      <Animated.View
        style={[
          styles.sheet,
          { paddingBottom: insets.bottom + 24, transform: [{ translateY: offset }] },
        ]}
      >
        <View style={styles.top}>
          <Text style={styles.title}>{t('plantSelect.filters')}</Text>
          <Pressable accessibilityRole="button" hitSlop={12} onPress={clear}>
            <Text style={styles.clear}>{t('plantSelect.clear')}</Text>
          </Pressable>
        </View>

        <Text style={styles.label}>{t('plantSelect.lightLabel')}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.row}>
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
        </ScrollView>

        <Text style={styles.label}>{t('plantSelect.difficultyLabel')}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.row}>
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
        </ScrollView>

        <View style={styles.done}>
          <Button title={t('plantSelect.done')} onPress={onClose} />
        </View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 24,
    paddingHorizontal: 32,
  },
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
    flexGrow: 0,
    marginTop: 8,
  },
  done: {
    marginTop: 28,
  },
});
