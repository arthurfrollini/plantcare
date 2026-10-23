import React, { useState } from 'react';
import { Image as NativeImage, StyleSheet, Text, View } from 'react-native';
import Swipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useTranslation } from 'react-i18next';
import { SvgFromUri } from 'react-native-svg';
import type { UserPlant } from '@plantcare/shared';

import { Tappable } from './Tappable';
import { assetUrl } from '../api/config';
import { plantPhotoSource } from '../api/endpoints';
import mascot from '../assets/watering.png';
import colors from '../styles/colors';
import fonts from '../styles/fonts';

interface PlantProps {
  plant: UserPlant;
  accessToken: string | null;
  /** Offline: no swipe-to-remove. */
  readOnly: boolean;
  onPress: () => void;
  handleRemove: () => void;
  /** The photo failed once; refreshes the session and returns the token now in use. */
  onPhotoError: () => Promise<string | null>;
}

export const PlantCardSecondary = ({
  plant,
  accessToken,
  readOnly,
  onPress,
  handleRemove,
  onPhotoError,
}: PlantProps) => {
  const { t } = useTranslation();
  const [photoRetried, setPhotoRetried] = useState(false);
  const [photoGone, setPhotoGone] = useState(false);
  const [illustrationGone, setIllustrationGone] = useState(false);

  const photo = !photoGone && accessToken ? plantPhotoSource(plant, accessToken) : null;
  const name = plant.speciesName;

  // One retry with a refreshed token; any other failure falls back to the illustration.
  function handlePhotoError() {
    if (photoRetried) {
      setPhotoGone(true);
      return;
    }
    setPhotoRetried(true);
    const failedWith = accessToken;
    void onPhotoError().then((next) => {
      if (next === null || next === failedWith) setPhotoGone(true);
    });
  }

  function renderPicture() {
    if (photo) {
      return (
        <Image
          testID="plant-photo"
          source={photo}
          style={styles.photo}
          onError={handlePhotoError}
          accessibilityIgnoresInvertColors
        />
      );
    }
    if (plant.imageUrl && !illustrationGone) {
      return (
        <SvgFromUri
          uri={assetUrl(plant.imageUrl)}
          width={50}
          height={50}
          onError={() => setIllustrationGone(true)}
        />
      );
    }
    return <NativeImage
        testID="plant-mascot"
        source={mascot}
        style={styles.photo}
        accessibilityIgnoresInvertColors
      />;
  }

  return (
    <Swipeable
      enabled={!readOnly}
      overshootRight={false}
      renderRightActions={
        readOnly
          ? undefined
          : () => (
              <View style={styles.actions}>
                <Tappable
                  rippleColor={'rgba(255, 255, 255, 0.3)'}
                  style={styles.buttonRemove}
                  onPress={handleRemove}
                  accessibilityRole="button"
                  accessibilityLabel={t('myPlants.remove')}
                >
                  <Feather name="trash-2" size={28} color={colors.white} />
                </Tappable>
              </View>
            )
      }
    >
      {/* The card stays opaque when pressed: the delete button is drawn behind it until a swipe. */}
      <Tappable
        feedback="highlight"
        style={styles.container}
        pressedStyle={styles.containerPressed}
        onPress={onPress}
        accessibilityRole="button"
      >
        {renderPicture()}
        <View style={styles.names}>
          <Text style={styles.title}>{name}</Text>
        </View>
        <View style={styles.details}>
          <Text style={styles.timeLabel}>{t('myPlants.waterAt')}</Text>
          <Text style={styles.time}>{plant.reminderTime}</Text>
        </View>
      </Tappable>
    </Swipeable>
  );
};

const CARD_MARGIN = 5;
const CARD_RADIUS = 25;
const DELETE_WIDTH = 90;

const styles = StyleSheet.create({
  container: {
    width: '100%',
    paddingHorizontal: 10,
    paddingVertical: 25,
    borderRadius: CARD_RADIUS,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.shape,
    marginVertical: CARD_MARGIN,
  },
  containerPressed: {
    backgroundColor: colors.shape_pressed,
  },
  photo: {
    width: 50,
    height: 50,
    borderRadius: 25,
  },
  names: {
    flex: 1,
    marginLeft: 10,
  },
  title: {
    fontFamily: fonts.heading,
    fontSize: 17,
    color: colors.heading,
  },
  details: {
    alignItems: 'flex-end',
  },
  timeLabel: {
    color: colors.body_light,
    fontSize: 16,
    paddingRight: 10,
    fontFamily: fonts.text,
  },
  time: {
    marginTop: 5,
    paddingRight: 10,
    fontSize: 16,
    fontFamily: fonts.heading,
    color: colors.body_dark,
  },
  // The delete button sits behind the card as its continuation: it starts under the card's rounded
  // right edge, so a swipe reveals one red strip attached to the card, with the card's height.
  actions: {
    flexDirection: 'row',
    marginVertical: CARD_MARGIN,
    marginLeft: -CARD_RADIUS,
  },
  buttonRemove: {
    width: DELETE_WIDTH + CARD_RADIUS,
    paddingLeft: CARD_RADIUS,
    backgroundColor: colors.red,
    borderTopRightRadius: CARD_RADIUS,
    borderBottomRightRadius: CARD_RADIUS,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
