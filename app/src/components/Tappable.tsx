import React from 'react';
import {
  Platform,
  Pressable,
  type PressableProps,
  type PressableStateCallbackType,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

/**
 * How a press looks on iOS. Android always shows the platform ripple instead.
 * - `opacity`: dims the whole control, like a system button. Not for controls with something
 *   drawn behind them (it would show through).
 * - `highlight`: applies `pressedStyle` (e.g. a darker background), keeping the control opaque.
 * - `none`: no change.
 */
export type TapFeedback = 'opacity' | 'highlight' | 'none';

export interface TappableProps extends Omit<PressableProps, 'style'> {
  style?: StyleProp<ViewStyle> | ((state: PressableStateCallbackType) => StyleProp<ViewStyle>);
  feedback?: TapFeedback;
  /** iOS style while pressed, used with `feedback="highlight"`. */
  pressedStyle?: StyleProp<ViewStyle>;
  /** Android ripple color; defaults to a light dark tint. Use a light tint on dark backgrounds. */
  rippleColor?: string;
  /** Android: let the ripple spread past the bounds, for icon-only buttons. */
  borderlessRipple?: boolean;
}

const IOS_PRESSED_OPACITY = 0.6;
const DEFAULT_RIPPLE = 'rgba(0, 0, 0, 0.08)';

/** Extra styles a press adds on top of the control's own style. Pure, so it is testable per platform. */
export function pressFeedbackStyle(
  pressed: boolean,
  options: { feedback: TapFeedback; pressedStyle?: StyleProp<ViewStyle>; borderlessRipple: boolean },
  os: string = Platform.OS,
): StyleProp<ViewStyle>[] {
  const ios = os === 'ios';
  return [
    // Clips the Android ripple to rounded corners.
    !ios && !options.borderlessRipple && { overflow: 'hidden' },
    ios && pressed && options.feedback === 'opacity' && { opacity: IOS_PRESSED_OPACITY },
    ios && pressed && options.feedback === 'highlight' && options.pressedStyle,
  ];
}

/** The app's pressable for main actions: native ripple on Android, a dim or highlight on iOS. */
export function Tappable({
  style,
  feedback = 'opacity',
  pressedStyle,
  rippleColor = DEFAULT_RIPPLE,
  borderlessRipple = false,
  ...rest
}: TappableProps) {
  return (
    <Pressable
      android_ripple={
        feedback === 'none' ? undefined : { color: rippleColor, borderless: borderlessRipple, foreground: true }
      }
      style={(state) => [
        typeof style === 'function' ? style(state) : style,
        ...pressFeedbackStyle(state.pressed, { feedback, pressedStyle, borderlessRipple }),
      ]}
      {...rest}
    />
  );
}
