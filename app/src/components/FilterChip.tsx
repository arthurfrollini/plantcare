import React from 'react';
import { Pressable, StyleSheet, Text, type PressableProps } from 'react-native';

import colors from '../styles/colors';
import fonts from '../styles/fonts';

interface FilterChipProps extends Omit<PressableProps, 'children'> {
  title: string;
  emoji?: string;
  active?: boolean;
}

export function FilterChip({ title, emoji, active = false, ...rest }: FilterChipProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={[styles.container, active && styles.containerActive]}
      {...rest}
    >
      {emoji ? <Text style={styles.emoji}>{emoji}</Text> : null}
      <Text style={[styles.text, active && styles.textActive]}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.shape,
    height: 40,
    minWidth: 76,
    paddingHorizontal: 14,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 12,
    marginRight: 10,
  },
  containerActive: {
    backgroundColor: colors.green_light,
  },
  emoji: {
    fontSize: 15,
    marginRight: 6,
  },
  text: {
    color: colors.heading,
    fontFamily: fonts.text,
  },
  textActive: {
    color: colors.green_dark,
    fontFamily: fonts.heading,
  },
});
