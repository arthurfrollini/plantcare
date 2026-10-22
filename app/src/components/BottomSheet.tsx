import React, { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, Modal, Pressable, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import colors from '../styles/colors';

/** Start position below the screen until the sheet has measured itself. */
const INITIAL_SHEET_HEIGHT = 600;

interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Runs once the sheet has slid out and its modal is gone. */
  onClosed?: () => void;
  children: ReactNode;
}

/** A sheet that slides up over a blurred, darkened backdrop, and slides back down to close. */
export function BottomSheet({ visible, onClose, onClosed, children }: BottomSheetProps) {
  const insets = useSafeAreaInsets();
  const [progress] = useState(() => new Animated.Value(0));
  const [sheetHeight, setSheetHeight] = useState(INITIAL_SHEET_HEIGHT);
  // Stays true while the sheet slides out, so the modal closes only after the animation.
  const [mounted, setMounted] = useState(visible);
  if (visible && !mounted) setMounted(true);
  // Set when the slide-out ends; onClosed runs once the render that removes the modal commits.
  const closedPending = useRef(false);
  useEffect(() => {
    if (closedPending.current && !mounted) {
      closedPending.current = false;
      onClosed?.();
    }
  });

  useEffect(() => {
    const animation = Animated.timing(progress, {
      toValue: visible ? 1 : 0,
      duration: visible ? 280 : 220,
      easing: visible ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start(({ finished }) => {
      if (finished && !visible) {
        closedPending.current = true;
        setMounted(false);
      }
    });
    return () => animation.stop();
  }, [visible, progress]);

  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [sheetHeight, 0] });

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: progress }]}>
        {/* Android blurs only behind a BlurTargetView; without one it keeps the dimmed backdrop. */}
        <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
        <Pressable style={styles.backdrop} onPress={onClose} accessible={false} />
      </Animated.View>
      <Animated.View
        onLayout={(e) => setSheetHeight(e.nativeEvent.layout.height)}
        style={[styles.sheet, { paddingBottom: insets.bottom + 24, transform: [{ translateY }] }]}
      >
        {children}
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
});
