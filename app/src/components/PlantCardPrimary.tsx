import React from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type TouchableOpacityProps,
} from 'react-native';
import { SvgFromUri } from 'react-native-svg';

import { assetUrl } from '../api/config';
import colors from '../styles/colors';
import fonts from '../styles/fonts';

interface PlantProps extends TouchableOpacityProps {
  data: {
    name: string;
    imageUrl: string | null;
  };
}

export const PlantCardPrimary = ({ data, ...rest }: PlantProps) => {
  return (
    <TouchableOpacity style={styles.container} activeOpacity={0.7} {...rest}>
      {data.imageUrl ? (
        <SvgFromUri uri={assetUrl(data.imageUrl)} width={70} height={70} />
      ) : (
        <View style={styles.placeholder}>
          <Text style={styles.placeholderText}>🌱</Text>
        </View>
      )}
      <Text style={styles.text}>{data.name}</Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.shape,
    borderRadius: 20,
    paddingVertical: 10,
    alignItems: 'center',
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
