import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import type { PhotoMessage } from '../plants/usePlantForm';
import colors from '../styles/colors';
import fonts from '../styles/fonts';

type Props = {
  /** Whether a photo was just picked, not saved yet; the form shows the picture itself. */
  hasPicked: boolean;
  message: PhotoMessage | null;
  disabled?: boolean;
  onCamera: () => void;
  onGallery: () => void;
  onRemove: () => void;
};

export function PhotoPicker({ hasPicked, message, disabled, onCamera, onGallery, onRemove }: Props) {
  const { t } = useTranslation();

  return (
    <View>
      <View style={styles.row}>
        <TouchableOpacity
          style={styles.action}
          onPress={onCamera}
          disabled={disabled}
          accessibilityRole="button"
        >
          <Text style={styles.actionText}>{t('plantForm.takePhoto')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.action}
          onPress={onGallery}
          disabled={disabled}
          accessibilityRole="button"
        >
          <Text style={styles.actionText}>{t('plantForm.choosePhoto')}</Text>
        </TouchableOpacity>
      </View>
      {hasPicked && (
        <TouchableOpacity onPress={onRemove} disabled={disabled} accessibilityRole="button">
          <Text style={styles.remove}>{t('plantForm.removePhoto')}</Text>
        </TouchableOpacity>
      )}
      {message && <Text style={styles.message}>{t(`plantForm.photoMessages.${message}`)}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 10,
  },
  action: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: colors.green_light,
    alignItems: 'center',
  },
  actionText: {
    color: colors.green_dark,
    fontFamily: fonts.text,
    fontSize: 15,
  },
  remove: {
    marginTop: 10,
    textAlign: 'center',
    color: colors.red,
    fontFamily: fonts.text,
    fontSize: 15,
  },
  message: {
    marginTop: 10,
    color: colors.body_dark,
    fontFamily: fonts.text,
    fontSize: 14,
  },
});
