import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';

import { assetUrl } from '../api/config';
import { Tappable, type TappableProps } from './Tappable';
import { isIllustration, SpeciesImage } from './SpeciesImage';

import colors from '../styles/colors';
import fonts from '../styles/fonts';

interface PlantProps extends TappableProps {
  data: {
    name: string;
    imageUrl: string | null;
  };
  selected?: boolean;
}

/** A catalog species: its photo filling a tall frame, the name below. */
export const PlantCardPrimary = ({ data, selected = false, ...rest }: PlantProps) => {
  function renderPicture() {
    if (!data.imageUrl) return <Text style={styles.placeholderText}>🌱</Text>;
    if (isIllustration(data.imageUrl)) return <SpeciesImage url={data.imageUrl} size={80} />;
    return (
      <Image
        testID="card-photo"
        source={{ uri: assetUrl(data.imageUrl) }}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        transition={150}
        accessibilityIgnoresInvertColors
      />
    );
  }

  return (
    <Tappable
      style={[styles.container, selected && styles.containerSelected]}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      {...rest}
    >
      <View style={styles.frame}>
        {renderPicture()}
        {selected && (
          <View style={styles.check} testID="card-check">
            <Feather name="check" size={14} color={colors.white} />
          </View>
        )}
      </View>
      <Text style={styles.text} numberOfLines={2}>
        {data.name}
      </Text>
    </Tappable>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 6,
    borderRadius: 18,
    backgroundColor: colors.background,
    // Always 2 px wide, so selecting a card never shifts its content.
    borderWidth: 2,
    borderColor: colors.shape,
  },
  containerSelected: {
    borderColor: colors.green,
  },
  frame: {
    aspectRatio: 3 / 4,
    borderRadius: 12,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.shape,
  },
  check: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.green,
    borderWidth: 2,
    borderColor: colors.white,
  },
  placeholderText: {
    fontSize: 40,
  },
  text: {
    marginTop: 8,
    marginBottom: 4,
    fontSize: 15,
    color: colors.heading,
    fontFamily: fonts.italic,
    textAlign: 'center',
    paddingHorizontal: 4,
  },
});
