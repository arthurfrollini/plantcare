import React, { useEffect, useState } from 'react';
import { Animated, Easing, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
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

/** Start position below the screen until the sheet has measured itself. */
const INITIAL_SHEET_HEIGHT = 600;

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
  const [progress] = useState(() => new Animated.Value(0));
  const [sheetHeight, setSheetHeight] = useState(INITIAL_SHEET_HEIGHT);
  // Stays true while the sheet slides out, so the modal closes only after the animation.
  const [mounted, setMounted] = useState(visible);
  if (visible && !mounted) setMounted(true);

  useEffect(() => {
    const animation = Animated.timing(progress, {
      toValue: visible ? 1 : 0,
      duration: visible ? 280 : 220,
      easing: visible ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start(({ finished }) => {
      if (finished && !visible) setMounted(false);
    });
    return () => animation.stop();
  }, [visible, progress]);

  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [sheetHeight, 0] });

  function clear() {
    onLightChange(null);
    onDifficultyChange(null);
  }

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: progress }]}>
        <BlurView
          intensity={20}
          tint="dark"
          experimentalBlurMethod="dimezisBlurView"
          style={StyleSheet.absoluteFill}
        />
        <Pressable style={styles.backdrop} onPress={onClose} accessible={false} />
      </Animated.View>
      <Animated.View
        onLayout={(e) => setSheetHeight(e.nativeEvent.layout.height)}
        style={[styles.sheet, { paddingBottom: insets.bottom + 24, transform: [{ translateY }] }]}
      >
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
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
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
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 10,
    marginTop: 8,
  },
  done: {
    marginTop: 28,
  },
});
