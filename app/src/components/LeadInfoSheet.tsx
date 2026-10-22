import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { BottomSheet } from './BottomSheet';
import { Button } from './Button';
import colors from '../styles/colors';
import fonts from '../styles/fonts';

interface LeadInfoSheetProps {
  visible: boolean;
  /** The plant's reminder lead. */
  minutes: number;
  onClose: () => void;
}

/** What the reminder lead does: how long before the watering the notification comes. */
export function LeadInfoSheet({ visible, minutes, onClose }: LeadInfoSheetProps) {
  const { t } = useTranslation();

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View style={styles.icon}>
        <Feather name="bell" size={24} color={colors.green_dark} />
      </View>
      <Text style={styles.title}>{t('plantDetail.leadInfoTitle')}</Text>
      <Text style={styles.text}>{t('plantDetail.leadInfoText', { minutes })}</Text>
      <Button title={t('plantDetail.leadInfoDone')} onPress={onClose} />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  icon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.green_light,
  },
  title: {
    marginTop: 16,
    fontSize: 20,
    color: colors.heading,
    fontFamily: fonts.heading,
  },
  text: {
    marginTop: 8,
    marginBottom: 24,
    fontSize: 15,
    lineHeight: 22,
    color: colors.body_dark,
    fontFamily: fonts.text,
  },
});
