import React from 'react';
import { Text } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { Tappable, pressFeedbackStyle } from './Tappable';

const base = { feedback: 'opacity' as const, borderlessRipple: false };

describe('pressFeedbackStyle', () => {
  it('dims a pressed control on iOS', () => {
    expect(pressFeedbackStyle(true, base, 'ios')).toContainEqual({ opacity: 0.6 });
    expect(pressFeedbackStyle(false, base, 'ios')).not.toContainEqual({ opacity: 0.6 });
  });

  it('uses the pressed style instead of dimming for highlight on iOS', () => {
    const pressedStyle = { backgroundColor: 'gray' };
    const styles = pressFeedbackStyle(true, { ...base, feedback: 'highlight', pressedStyle }, 'ios');

    expect(styles).toContainEqual(pressedStyle);
    expect(styles).not.toContainEqual({ opacity: 0.6 });
  });

  it('never dims on Android, where the ripple is the feedback, and clips the ripple', () => {
    const styles = pressFeedbackStyle(true, base, 'android');

    expect(styles).not.toContainEqual({ opacity: 0.6 });
    expect(styles).toContainEqual({ overflow: 'hidden' });
    expect(pressFeedbackStyle(true, { ...base, borderlessRipple: true }, 'android')).not.toContainEqual({
      overflow: 'hidden',
    });
  });
});

describe('Tappable', () => {
  it('calls onPress', () => {
    const onPress = jest.fn();
    render(
      <Tappable onPress={onPress}>
        <Text>Go</Text>
      </Tappable>,
    );

    fireEvent.press(screen.getByText('Go'));

    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
