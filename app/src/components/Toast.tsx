import React, { useEffect, useState } from 'react';
import { Animated, StyleSheet, Text } from 'react-native';

import colors from '../styles/colors';
import fonts from '../styles/fonts';

/** A short note such as "Saved ✓", faded in while `visible` and out after; gone once faded out. */
export function Toast({ visible, text }: { visible: boolean; text: string }) {
  const [opacity] = useState(() => new Animated.Value(0));
  const [mounted, setMounted] = useState(visible);
  if (visible && !mounted) setMounted(true);

  useEffect(() => {
    const animation = Animated.timing(opacity, {
      toValue: visible ? 1 : 0,
      duration: 200,
      useNativeDriver: true,
    });
    animation.start(({ finished }) => {
      if (finished && !visible) setMounted(false);
    });
    return () => animation.stop();
  }, [visible, opacity]);

  if (!mounted) return null;
  return (
    <Animated.View style={[styles.toast, { opacity }]} accessibilityLiveRegion="polite">
      <Text style={styles.toastText}>{text}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  toast: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: colors.green_dark,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  toastText: {
    fontSize: 14,
    color: colors.white,
    fontFamily: fonts.heading,
  },
});
