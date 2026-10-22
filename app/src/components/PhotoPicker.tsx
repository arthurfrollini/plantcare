import React from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View, type ImageSourcePropType } from 'react-native';
import { useTranslation } from 'react-i18next';

import type { PhotoMessage } from '../plants/usePlantForm';
import colors from '../styles/colors';
import fonts from '../styles/fonts';

type Props = {
  /** The photo just picked, not saved yet. */
  pickedUri: string | null;
  /** The photo already saved on the plant. */
  saved: ImageSourcePropType | null;
  message: PhotoMessage | null;
  disabled?: boolean;
  onCamera: () => void;
  onGallery: () => void;
  onRemove: () => void;
};

export function PhotoPicker({ pickedUri, saved, message, disabled, onCamera, onGallery, onRemove }: Props) {
  const { t } = useTranslation();
  const preview = pickedUri ? { uri: pickedUri } : saved;

  return (
    <View>
      {preview && <Image source={preview} style={styles.preview} accessibilityIgnoresInvertColors />}
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
      {pickedUri && (
        <TouchableOpacity onPress={onRemove} disabled={disabled} accessibilityRole="button">
          <Text style={styles.remove}>{t('plantForm.removePhoto')}</Text>
        </TouchableOpacity>
      )}
      {message && <Text style={styles.message}>{t(`plantForm.photoMessages.${message}`)}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  preview: {
    width: '100%',
    height: 180,
    borderRadius: 16,
    marginBottom: 12,
    backgroundColor: colors.shape,
  },
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
