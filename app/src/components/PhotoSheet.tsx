import React, { useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { BottomSheet } from './BottomSheet';
import colors from '../styles/colors';
import fonts from '../styles/fonts';

export type PhotoChoice = 'camera' | 'gallery' | 'remove';

interface PhotoSheetProps {
  visible: boolean;
  hasPhoto: boolean;
  /** Runs after the sheet has closed, so the camera or gallery never opens over it. */
  onChoose: (choice: PhotoChoice) => void;
  onClose: () => void;
}

type Option = { choice: PhotoChoice; icon: 'camera' | 'image' | 'trash-2'; label: string };

/** Take a photo, choose one from the gallery or, when there is one, remove it. */
export function PhotoSheet({ visible, hasPhoto, onChoose, onClose }: PhotoSheetProps) {
  const { t } = useTranslation();
  const chosen = useRef<PhotoChoice | null>(null);

  const options: Option[] = [
    { choice: 'camera', icon: 'camera', label: t('plantForm.takePhoto') },
    { choice: 'gallery', icon: 'image', label: t('plantForm.choosePhoto') },
  ];
  if (hasPhoto) options.push({ choice: 'remove', icon: 'trash-2', label: t('plantForm.removePhoto') });

  function choose(choice: PhotoChoice) {
    chosen.current = choice;
    onClose();
  }

  function handleClosed() {
    const choice = chosen.current;
    chosen.current = null;
    if (choice) onChoose(choice);
  }

  return (
    <BottomSheet visible={visible} onClose={onClose} onClosed={handleClosed}>
      <Text style={styles.title}>{t('plantDetail.editPhoto')}</Text>
      {options.map(({ choice, icon, label }) => {
        const danger = choice === 'remove';
        return (
          <Pressable
            key={choice}
            accessibilityRole="button"
            accessibilityLabel={label}
            style={({ pressed }) => [styles.option, pressed && styles.optionPressed]}
            onPress={() => choose(choice)}
          >
            <View style={[styles.icon, danger && styles.iconDanger]}>
              <Feather name={icon} size={20} color={danger ? colors.red : colors.green_dark} />
            </View>
            <Text style={[styles.label, danger && styles.labelDanger]}>{label}</Text>
          </Pressable>
        );
      })}
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
    paddingVertical: 10,
    borderRadius: 12,
  },
  optionPressed: {
    opacity: 0.6,
  },
  icon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.green_light,
    marginRight: 16,
  },
  iconDanger: {
    backgroundColor: colors.shape,
  },
  label: {
    fontSize: 16,
    color: colors.heading,
    fontFamily: fonts.text,
  },
  labelDanger: {
    color: colors.red,
  },
});
