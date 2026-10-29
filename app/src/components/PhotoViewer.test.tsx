import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { initI18n } from '../i18n';
import { PhotoViewer } from './PhotoViewer';

beforeAll(initI18n);

function renderViewer(onClose = jest.fn()) {
  render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <PhotoViewer visible source={{ uri: 'https://example.com/me.jpg' }} onClose={onClose} />
    </SafeAreaProvider>,
  );
  return onClose;
}

describe('PhotoViewer', () => {
  it('shows the photo as a large circle, filled edge to edge', () => {
    renderViewer();

    const photo = screen.getByTestId('viewer-photo');
    const style = StyleSheet.flatten(photo.props.style);
    expect(photo.props).toMatchObject({ contentFit: 'cover' });
    expect(style.width).toBeGreaterThan(200);
    expect(style.height).toBe(style.width);
    expect(style.borderRadius).toBe(Number(style.width) / 2);
  });

  it('dims and blurs the screen behind it, like the sheets do', () => {
    renderViewer();

    expect(screen.getByTestId('viewer-blur')).toBeOnTheScreen();
    expect(StyleSheet.flatten(screen.getByTestId('viewer-backdrop').props.style)).toMatchObject({
      backgroundColor: 'rgba(0, 0, 0, 0.45)',
    });
  });

  it('closes from the backdrop', () => {
    const onClose = renderViewer();

    fireEvent.press(screen.getByTestId('viewer-backdrop'));

    expect(onClose).toHaveBeenCalled();
  });
});
