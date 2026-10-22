import React from 'react';
import { Text } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { HeroHeader } from './HeroHeader';

describe('HeroHeader', () => {
  it('renders its children and both corner buttons', () => {
    render(
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 390, height: 844 },
          insets: { top: 0, left: 0, right: 0, bottom: 0 },
        }}
      >
        <HeroHeader left={<Text>L</Text>} right={<Text>R</Text>}>
          <Text>inside</Text>
        </HeroHeader>
      </SafeAreaProvider>,
    );
    expect(screen.getByText('inside')).toBeOnTheScreen();
    expect(screen.getByText('L')).toBeOnTheScreen();
    expect(screen.getByText('R')).toBeOnTheScreen();
  });
});
