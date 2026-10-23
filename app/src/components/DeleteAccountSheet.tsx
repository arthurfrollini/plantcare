import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput } from 'react-native';
import { useTranslation } from 'react-i18next';

import { formError, type FormError } from '../plants/usePlantDetail';
import { BottomSheet } from './BottomSheet';
import colors from '../styles/colors';
import fonts from '../styles/fonts';

interface DeleteAccountSheetProps {
  visible: boolean;
  /** What the user types to confirm: DELETE in English, EXCLUIR in Portuguese. */
  word: string;
  deleting: boolean;
  /** Resolves once the account is gone; rejects with the API error, which shows here. */
  onConfirm: () => Promise<void>;
  onClose: () => void;
}

/** Explains what is deleted for good and asks for the confirmation word. */
export function DeleteAccountSheet(props: DeleteAccountSheetProps) {
  const { visible, word, deleting, onConfirm, onClose } = props;
  const { t } = useTranslation();
  const [input, setInput] = useState('');
  const [error, setError] = useState<FormError | null>(null);
  // Every opening starts empty.
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setInput('');
      setError(null);
    }
  }

  const canConfirm = input.trim() === word && !deleting;

  async function confirm() {
    if (!canConfirm) return;
    setError(null);
    try {
      await onConfirm();
    } catch (e) {
      setError(formError(e));
    }
  }

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <Text style={styles.title}>{t('profile.deleteTitle')}</Text>
      <Text style={styles.text}>{t('profile.deleteText', { word })}</Text>
      <TextInput
        style={styles.input}
        value={input}
        onChangeText={setInput}
        placeholder={word}
        placeholderTextColor={colors.body_light}
        accessibilityLabel={word}
        autoCapitalize="characters"
        autoCorrect={false}
        autoComplete="off"
        editable={!deleting}
        returnKeyType="done"
        onSubmitEditing={() => void confirm()}
      />
      {error && (
        <Text style={styles.error} accessibilityRole="alert">
          {t(`plantForm.errors.${error}`)}
        </Text>
      )}
      <Pressable
        style={({ pressed }) => [
          styles.button,
          !canConfirm && !deleting && styles.off,
          pressed && styles.pressed,
        ]}
        onPress={() => void confirm()}
        disabled={!canConfirm}
        accessibilityRole="button"
        accessibilityLabel={t('profile.deleteConfirm')}
        accessibilityState={{ disabled: !canConfirm, busy: deleting }}
      >
        {deleting ? (
          <ActivityIndicator color={colors.white} />
        ) : (
          <Text style={styles.buttonText}>{t('profile.deleteConfirm')}</Text>
        )}
      </Pressable>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 20,
    color: colors.heading,
    fontFamily: fonts.heading,
  },
  text: {
    marginTop: 8,
    fontSize: 15,
    lineHeight: 22,
    color: colors.body_dark,
    fontFamily: fonts.text,
  },
  input: {
    marginTop: 18,
    height: 52,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: colors.shape,
    fontSize: 16,
    letterSpacing: 1,
    color: colors.heading,
    fontFamily: fonts.heading,
  },
  error: {
    marginTop: 14,
    textAlign: 'center',
    fontSize: 14,
    color: colors.red,
    fontFamily: fonts.text,
  },
  button: {
    marginTop: 20,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.red,
  },
  off: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.7,
  },
  buttonText: {
    fontSize: 16,
    color: colors.white,
    fontFamily: fonts.heading,
  },
});
