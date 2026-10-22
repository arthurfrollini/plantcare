import React, { useState } from 'react';
import { Image as NativeImage, StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import Swipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useTranslation } from 'react-i18next';
import { SvgFromUri } from 'react-native-svg';
import type { UserPlant } from '@plantcare/shared';

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
  /** The photo failed once; refresh the session so the retry carries a fresh token. */
  onPhotoError: () => Promise<void>;
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
  const name = plant.nickname ?? plant.speciesName;

  function handlePhotoError() {
    if (photoRetried) {
      setPhotoGone(true);
      return;
    }
    setPhotoRetried(true);
    void onPhotoError();
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
    return <NativeImage source={mascot} style={styles.photo} accessibilityIgnoresInvertColors />;
  }

  return (
    <Swipeable
      enabled={!readOnly}
      overshootRight={false}
      renderRightActions={
        readOnly
          ? undefined
          : () => (
              <View>
                <TouchableOpacity
                  style={styles.buttonRemove}
                  onPress={handleRemove}
                  accessibilityRole="button"
                  accessibilityLabel={t('myPlants.remove')}
                >
                  <Feather name="trash" size={32} color={colors.white} />
                </TouchableOpacity>
              </View>
            )
      }
    >
      <TouchableOpacity style={styles.container} activeOpacity={0.7} onPress={onPress}>
        {renderPicture()}
        <View style={styles.names}>
          <Text style={styles.title}>{name}</Text>
          {plant.nickname && <Text style={styles.species}>{plant.speciesName}</Text>}
        </View>
        <View style={styles.details}>
          <Text style={styles.timeLabel}>{t('myPlants.waterAt')}</Text>
          <Text style={styles.time}>{plant.reminderTime}</Text>
        </View>
      </TouchableOpacity>
    </Swipeable>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    paddingHorizontal: 10,
    paddingVertical: 25,
    borderRadius: 25,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.shape,
    marginVertical: 5,
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
  species: {
    marginTop: 2,
    fontFamily: fonts.text,
    fontSize: 14,
    color: colors.body_light,
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
  buttonRemove: {
    width: 90,
    height: 85,
    backgroundColor: colors.red,
    marginTop: 15,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    right: 20,
    paddingLeft: 15,
  },
});
