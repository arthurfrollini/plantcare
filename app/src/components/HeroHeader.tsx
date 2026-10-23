import React, { type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import colors from '../styles/colors';

const PHOTO_SIZE = 120;
/** Gradient height below the status bar; the circle sits on its bottom edge. */
const HEADER_HEIGHT = 112;

type Props = {
  left?: ReactNode;
  right?: ReactNode;
  /** Drawn inside the circle. */
  children: ReactNode;
};

/** The green band with optional corner buttons and a circle centred on its bottom edge. */
export function HeroHeader({ left, right, children }: Props) {
  const { top } = useSafeAreaInsets();
  return (
    <>
      <LinearGradient
        colors={[colors.green, colors.green_light]}
        style={[styles.header, { paddingTop: top, height: top + HEADER_HEIGHT }]}
      >
        <View style={styles.topBar}>
          {left ?? <View />}
          {right ?? <View />}
        </View>
      </LinearGradient>
      <View style={styles.photoWrap}>
        <View style={styles.photoCircle}>{children}</View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 30,
  },
  topBar: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  photoWrap: {
    alignItems: 'center',
    marginTop: -PHOTO_SIZE / 2,
  },
  photoCircle: {
    width: PHOTO_SIZE,
    height: PHOTO_SIZE,
    borderRadius: PHOTO_SIZE / 2,
    borderWidth: 4,
    borderColor: colors.white,
    backgroundColor: colors.shape,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});
