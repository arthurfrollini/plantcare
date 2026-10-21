import React, { useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, StyleSheet } from 'react-native';
import LottieView from 'lottie-react-native';
import * as SplashScreen from 'expo-splash-screen';

import splashAnimation from '../assets/animations/plantcare-splash.json';
import colors from '../styles/colors';

// Must match `imageWidth` of the expo-splash-screen plugin in app.json, so the animation starts
// exactly where the native splash image was drawn.
export const SPLASH_WIDTH = 240;
const SPLASH_ASPECT = 680 / 1000;

// The wink is fully drawn from frame 29 to 44 of the 60 fps animation; stopping on it skips the
// eye reopening and keeps the opening under a second.
const WINK_FRAME = 32;
const HOLD_ON_WINK_MS = 300;
const FADE_OUT_MS = 250;
// If the player never reports the end (lottie on web does not), the splash still leaves.
const MAX_SPLASH_MS = 2500;

interface AnimatedSplashProps {
  onFinish: () => void;
}

export function AnimatedSplash({ onFinish }: AnimatedSplashProps) {
  const animation = useRef<LottieView>(null);
  const opacity = useRef(new Animated.Value(1)).current;
  const leaving = useRef(false);

  function fadeOut() {
    if (leaving.current) return;
    leaving.current = true;
    Animated.timing(opacity, {
      toValue: 0,
      duration: FADE_OUT_MS,
      useNativeDriver: true,
    }).start(onFinish);
  }

  async function handleLayout() {
    // The native splash hides only once this identical first frame is on screen, so there is no flash.
    await SplashScreen.hideAsync();

    if (await AccessibilityInfo.isReduceMotionEnabled()) {
      fadeOut();
      return;
    }
    animation.current?.play(0, WINK_FRAME);
  }

  function handleAnimationFinish(isCancelled: boolean) {
    if (isCancelled) return;
    setTimeout(fadeOut, HOLD_ON_WINK_MS);
  }

  useEffect(() => {
    const fallback = setTimeout(fadeOut, MAX_SPLASH_MS);
    return () => {
      clearTimeout(fallback);
      opacity.stopAnimation();
    };
  }, []);

  return (
    <Animated.View
      style={[styles.container, { opacity }]}
      onLayout={handleLayout}
      pointerEvents="none"
    >
      <LottieView
        ref={animation}
        source={splashAnimation}
        autoPlay={false}
        loop={false}
        onAnimationFinish={handleAnimationFinish}
        style={styles.animation}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  animation: {
    width: SPLASH_WIDTH,
    height: SPLASH_WIDTH * SPLASH_ASPECT,
  },
});
