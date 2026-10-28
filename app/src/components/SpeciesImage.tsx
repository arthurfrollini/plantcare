import React from 'react';
import { Image } from 'expo-image';
import { SvgFromUri } from 'react-native-svg';

import { assetUrl } from '../api/config';

/** Catalog illustrations are SVG files; species photos from Commons are WebP. */
export function isIllustration(url: string): boolean {
  return (url.split('?')[0] ?? '').toLowerCase().endsWith('.svg');
}

interface SpeciesImageProps {
  url: string;
  size: number;
  /** Clips a photo to a circle; illustrations have their own shape. */
  round?: boolean;
  onError?: () => void;
}

/** A species' picture: its illustration, or its photo from Wikimedia Commons. */
export function SpeciesImage({ url, size, round = false, onError }: SpeciesImageProps) {
  if (isIllustration(url)) {
    return (
      <SvgFromUri
        testID="plant-illustration"
        uri={assetUrl(url)}
        width={size}
        height={size}
        onError={onError}
      />
    );
  }
  return (
    <Image
      testID="species-photo"
      source={{ uri: assetUrl(url) }}
      style={{ width: size, height: size, borderRadius: round ? size / 2 : 16 }}
      contentFit="cover"
      onError={onError}
      accessibilityIgnoresInvertColors
    />
  );
}
