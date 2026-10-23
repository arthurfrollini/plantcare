import React, { useState } from 'react';
import { Image as NativeImage } from 'react-native';
import { Image } from 'expo-image';
import { SvgFromUri } from 'react-native-svg';
import type { UserPlant } from '@plantcare/shared';

import { assetUrl } from '../api/config';
import { plantPhotoSource } from '../api/endpoints';
import mascot from '../assets/watering.png';

interface PlantPictureProps {
  plant: UserPlant;
  accessToken: string | null;
  size: number;
  /**
   * The photo failed once; refreshes the session and returns the token now in use. Without it,
   * the first failure falls back to the illustration.
   */
  onPhotoError?: () => Promise<string | null>;
}

/** The plant's photo, round; else its illustration; else the mascot. */
export function PlantPicture({ plant, accessToken, size, onPhotoError }: PlantPictureProps) {
  const [photoRetried, setPhotoRetried] = useState(false);
  const [photoGone, setPhotoGone] = useState(false);
  const [illustrationGone, setIllustrationGone] = useState(false);

  const photo = !photoGone && accessToken ? plantPhotoSource(plant, accessToken) : null;
  const round = { width: size, height: size, borderRadius: size / 2 };

  // One retry with a refreshed token; any other failure falls back to the illustration.
  function handlePhotoError() {
    if (photoRetried || !onPhotoError) {
      setPhotoGone(true);
      return;
    }
    setPhotoRetried(true);
    const failedWith = accessToken;
    void onPhotoError().then((next) => {
      if (next === null || next === failedWith) setPhotoGone(true);
    });
  }

  if (photo) {
    return (
      <Image
        testID="plant-photo"
        source={photo}
        style={round}
        onError={handlePhotoError}
        accessibilityIgnoresInvertColors
      />
    );
  }
  if (plant.imageUrl && !illustrationGone) {
    return (
      <SvgFromUri
        uri={assetUrl(plant.imageUrl)}
        width={size}
        height={size}
        onError={() => setIllustrationGone(true)}
      />
    );
  }
  return (
    <NativeImage
      testID="plant-mascot"
      source={mascot}
      style={round}
      accessibilityIgnoresInvertColors
    />
  );
}
