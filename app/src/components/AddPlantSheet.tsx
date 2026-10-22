import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { BottomSheet } from './BottomSheet';

import colors from '../styles/colors';
import fonts from '../styles/fonts';

export type AddPlantChoice = 'photo' | 'manual';

interface AddPlantSheetProps {
  visible: boolean;
  onChoose: (choice: AddPlantChoice) => void;
  onClose: () => void;
  /** Runs after the sheet is gone, so the camera never opens on top of it. */
  onClosed?: () => void;
}

export function AddPlantSheet({ visible, onChoose, onClose, onClosed }: AddPlantSheetProps) {
  const { t } = useTranslation();

  const options = [
    {
      choice: 'photo',
      icon: 'camera',
      title: t('addPlant.takePhoto'),
      hint: t('addPlant.takePhotoHint'),
    },
    {
      choice: 'manual',
      icon: 'search',
      title: t('addPlant.manual'),
      hint: t('addPlant.manualHint'),
    },
  ] as const;

  return (
    <BottomSheet visible={visible} onClose={onClose} onClosed={onClosed}>
      <Text style={styles.title}>{t('addPlant.title')}</Text>
      {options.map((option) => (
        <Pressable
          key={option.choice}
          accessibilityRole="button"
          accessibilityLabel={option.title}
          accessibilityHint={option.hint}
          style={({ pressed }) => [styles.option, pressed && styles.optionPressed]}
          onPress={() => onChoose(option.choice)}
        >
          <View style={styles.icon}>
            <Feather name={option.icon} size={22} color={colors.green_dark} />
          </View>
          <View style={styles.texts}>
            <Text style={styles.optionTitle}>{option.title}</Text>
            <Text style={styles.optionHint}>{option.hint}</Text>
          </View>
          <Feather name="chevron-right" size={20} color={colors.body_light} />
        </Pressable>
      ))}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 20,
    color: colors.heading,
    fontFamily: fonts.heading,
    marginBottom: 12,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    padding: 16,
    borderRadius: 16,
    backgroundColor: colors.shape,
  },
  optionPressed: {
    opacity: 0.7,
  },
  icon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.green_light,
    marginRight: 16,
  },
  texts: {
    flex: 1,
  },
  optionTitle: {
    fontSize: 16,
    color: colors.heading,
    fontFamily: fonts.heading,
  },
  optionHint: {
    marginTop: 2,
    fontSize: 13,
    color: colors.body_dark,
    fontFamily: fonts.text,
  },
});
