import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Swipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { UserPlant } from '@plantcare/shared';

import { describeWatering } from '../plants/describeWatering';
import { PlantPicture } from './PlantPicture';
import { Tappable } from './Tappable';
import colors from '../styles/colors';
import fonts from '../styles/fonts';

interface PlantProps {
  plant: UserPlant;
  /** The next watering moment, or null when the reminder time is invalid. */
  next: Date | null;
  now: Date;
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
  next,
  now,
  accessToken,
  readOnly,
  onPress,
  handleRemove,
  onPhotoError,
}: PlantProps) => {
  const { t } = useTranslation();
  const name = plant.speciesName;
  const dueToday = next !== null && next.toDateString() === now.toDateString();

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
        <PlantPicture
          plant={plant}
          accessToken={accessToken}
          size={PICTURE_SIZE}
          onPhotoError={onPhotoError}
        />
        <View style={styles.body}>
          <Text style={styles.title} numberOfLines={1}>
            {name}
          </Text>
          <Text style={styles.species} numberOfLines={1}>
            {plant.scientificName}
          </Text>
          <View style={styles.badges}>
            <View testID="next-watering" style={[styles.pill, dueToday && styles.pillToday]}>
              <Feather name="droplet" size={13} color={dueToday ? colors.blue : colors.body_dark} />
              <Text style={[styles.pillText, dueToday && styles.pillTextToday]}>
                {next
                  ? describeWatering(t, next, now)
                  : `${t('myPlants.waterAt')} ${plant.reminderTime}`}
              </Text>
            </View>
            {plant.openCheckup && (
              <View style={[styles.pill, styles.pillCare]}>
                <Text style={[styles.pillText, styles.pillTextCare]}>
                  {`🤒 ${t('myPlants.needsCare')}`}
                </Text>
              </View>
            )}
          </View>
        </View>
        <Feather name="chevron-right" size={20} color={colors.body_light} />
      </Tappable>
    </Swipeable>
  );
};

const CARD_MARGIN = 6;
const CARD_RADIUS = 22;
const DELETE_WIDTH = 90;
const PICTURE_SIZE = 64;

const styles = StyleSheet.create({
  container: {
    width: '100%',
    padding: 12,
    paddingRight: 14,
    borderRadius: CARD_RADIUS,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.shape,
    marginVertical: CARD_MARGIN,
    // A soft lift on iOS; Android draws its own shadow from elevation.
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  containerPressed: {
    backgroundColor: colors.shape,
  },
  body: {
    flex: 1,
    marginLeft: 14,
    marginRight: 8,
  },
  title: {
    fontFamily: fonts.heading,
    fontSize: 17,
    color: colors.heading,
  },
  species: {
    fontFamily: fonts.italic,
    fontSize: 14,
    color: colors.body_dark,
  },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    backgroundColor: colors.shape,
  },
  pillToday: {
    backgroundColor: colors.blue_light,
  },
  pillCare: {
    backgroundColor: colors.yellow_light,
  },
  pillText: {
    fontSize: 13,
    fontFamily: fonts.heading,
    color: colors.body_dark,
  },
  pillTextToday: {
    color: colors.blue,
  },
  pillTextCare: {
    color: colors.yellow_dark,
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
