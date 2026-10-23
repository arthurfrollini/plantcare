import React from 'react';
import { Text, StyleSheet } from 'react-native';
import { Tappable, type TappableProps } from './Tappable';
import colors from '../styles/colors';
import fonts from '../styles/fonts';

interface ButtonProps extends TappableProps {
  title: string;
}

export function Button({ title, ...rest }: ButtonProps) {
  return (
    <Tappable
      style={styles.container}
      rippleColor="rgba(255, 255, 255, 0.3)"
      accessibilityRole="button"
      {...rest}
    >
      <Text style={styles.text}>{title}</Text>
    </Tappable>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.green,
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  text: {
    fontSize: 16,
    color: colors.white,
    fontFamily: fonts.heading,
  },
});
