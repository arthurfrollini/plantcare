import React, { useEffect, useState } from 'react';
import { Animated, Easing, Modal, Pressable, StyleSheet, Text } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Image, type ImageSource } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import colors from '../styles/colors';
import fonts from '../styles/fonts';

interface PhotoViewerProps {
  visible: boolean;
  source: ImageSource | null;
  /** The Commons credit line, shown under the photo. */
  credit?: string | null;
  onClose: () => void;
}

/** A plant photo full screen on black: it fades and grows in, and a tap anywhere closes it. */
export function PhotoViewer({ visible, source, credit = null, onClose }: PhotoViewerProps) {
  const { t } = useTranslation();
  const { top, bottom } = useSafeAreaInsets();
  const [progress] = useState(() => new Animated.Value(0));
  // Stays mounted while it fades out, so the modal closes only after the animation.
  const [mounted, setMounted] = useState(visible);
  if (visible && !mounted) setMounted(true);

  useEffect(() => {
    const animation = visible
      ? Animated.spring(progress, { toValue: 1, damping: 18, stiffness: 180, useNativeDriver: true })
      : Animated.timing(progress, {
          toValue: 0,
          duration: 180,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        });
    animation.start(({ finished }) => {
      if (finished && !visible) setMounted(false);
    });
    return () => animation.stop();
  }, [visible, progress]);

  const scale = progress.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] });

  return (
    <Modal
      visible={mounted && source !== null}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <Animated.View style={[styles.backdrop, { opacity: progress }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessible={false} />
        <Animated.View style={[styles.frame, { transform: [{ scale }] }]} pointerEvents="none">
          {source && (
            <Image
              testID="viewer-photo"
              source={source}
              style={StyleSheet.absoluteFill}
              contentFit="contain"
              accessibilityIgnoresInvertColors
            />
          )}
        </Animated.View>
        {credit && (
          <Text style={[styles.credit, { bottom: bottom + 24 }]} pointerEvents="none">
            {credit}
          </Text>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('plantDetail.closePhoto')}
          style={({ pressed }) => [styles.close, { top: top + 12 }, pressed && styles.pressed]}
          onPress={onClose}
          hitSlop={12}
        >
          <Feather name="x" size={24} color={colors.white} />
        </Pressable>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.92)',
    justifyContent: 'center',
  },
  frame: {
    height: '75%',
    marginHorizontal: 12,
  },
  credit: {
    position: 'absolute',
    left: 24,
    right: 24,
    textAlign: 'center',
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.75)',
    fontFamily: fonts.text,
  },
  close: {
    position: 'absolute',
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },
  pressed: {
    opacity: 0.6,
  },
});
