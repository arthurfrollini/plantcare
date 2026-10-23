import React from 'react';
import {
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Tappable, type TappableProps } from './Tappable';
import { SvgFromUri } from 'react-native-svg';

import { assetUrl } from '../api/config';
import colors from '../styles/colors';
import fonts from '../styles/fonts';

interface PlantProps extends TappableProps {
  data: {
    name: string;
    imageUrl: string | null;
  };
  selected?: boolean;
}

export const PlantCardPrimary = ({ data, selected = false, ...rest }: PlantProps) => {
  return (
    <Tappable
      style={[styles.container, selected && styles.containerSelected]}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      {...rest}
    >
      {selected && (
        <View style={styles.check}>
          <Feather name="check" size={14} color={colors.white} />
        </View>
      )}
      {data.imageUrl ? (
        <SvgFromUri uri={assetUrl(data.imageUrl)} width={70} height={70} />
      ) : (
        <View style={styles.placeholder}>
          <Text style={styles.placeholderText}>🌱</Text>
        </View>
      )}
      <Text style={styles.text}>{data.name}</Text>
    </Tappable>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.shape,
    borderRadius: 20,
    paddingVertical: 10,
    alignItems: 'center',
    // Always 2 px wide, so selecting a card never shifts its content.
    borderWidth: 2,
    borderColor: 'transparent',
  },
  containerSelected: {
    borderColor: colors.green,
    backgroundColor: colors.green_light,
  },
  check: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.green,
  },
  placeholder: {
    width: 70,
    height: 70,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: {
    fontSize: 40,
  },
  text: {
    color: colors.green_dark,
    fontFamily: fonts.heading,
    marginVertical: 16,
    textAlign: 'center',
    paddingHorizontal: 6,
  },
});
