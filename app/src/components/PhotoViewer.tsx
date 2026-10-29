import React, { useEffect, useState } from 'react';
import { Animated, Easing, Modal, Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { Image, type ImageSource } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import colors from '../styles/colors';

interface PhotoViewerProps {
  visible: boolean;
  source: ImageSource | null;
  onClose: () => void;
}

/**
 * A photo enlarged in a circle over the sheets' blurred, darkened backdrop: it fades and grows in,
 * and a tap anywhere closes it.
 */
export function PhotoViewer({ visible, source, onClose }: PhotoViewerProps) {
  const { t } = useTranslation();
  const { top } = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const diameter = Math.min(width - 2 * MARGIN, height * 0.6, MAX_DIAMETER);
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
      <Animated.View style={[styles.screen, { opacity: progress }]}>
        {/* The same backdrop as BottomSheet; Android, without a BlurTargetView, only dims. */}
        <BlurView testID="viewer-blur" intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
        <Pressable
          testID="viewer-backdrop"
          style={styles.backdrop}
          onPress={onClose}
          accessible={false}
        />
        <Animated.View style={[styles.ring, { transform: [{ scale }] }]} pointerEvents="none">
          {source && (
            <Image
              testID="viewer-photo"
              source={source}
              style={{
                width: diameter,
                height: diameter,
                borderRadius: diameter / 2,
              }}
              contentFit="cover"
              accessibilityIgnoresInvertColors
            />
          )}
        </Animated.View>
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

const MARGIN = 24;
const MAX_DIAMETER = 420;

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  ring: {
    borderRadius: 999,
    borderWidth: 4,
    borderColor: colors.white,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
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
