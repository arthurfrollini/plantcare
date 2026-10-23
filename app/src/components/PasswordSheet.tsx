import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { passwordSchema } from '@plantcare/shared';

import { toApiError } from '../api/client';
import { formError } from '../plants/usePlantDetail';
import { BottomSheet } from './BottomSheet';
import { Button } from './Button';
import colors from '../styles/colors';
import fonts from '../styles/fonts';

interface PasswordSheetProps {
  visible: boolean;
  /** Resolves once the password is changed, and the sheet closes; rejects with the API error. */
  onSubmit: (current: string, next: string) => Promise<void>;
  onClose: () => void;
}

type SheetError = { kind: 'wrongPassword' } | { kind: 'form'; code: ReturnType<typeof formError> };

function sheetError(e: unknown): SheetError {
  const error = toApiError(e);
  if (error.status === 403 || error.code === 'wrong_password') return { kind: 'wrongPassword' };
  return { kind: 'form', code: formError(error) };
}

/** Current password, new password and its confirmation. A wrong current password keeps it open. */
export function PasswordSheet({ visible, onSubmit, onClose }: PasswordSheetProps) {
  const { t } = useTranslation();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<SheetError | null>(null);
  // Every opening starts empty.
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setCurrent('');
      setNext('');
      setConfirm('');
      setError(null);
    }
  }

  const ruleMet = passwordSchema.safeParse(next).success;
  const mismatch = confirm.length > 0 && confirm !== next;
  const canSave = current.length > 0 && ruleMet && confirm === next && !saving;

  async function save() {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      await onSubmit(current, next);
      onClose();
    } catch (e) {
      setError(sheetError(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <Text style={styles.title}>{t('profile.changePassword')}</Text>
      <TextInput
        style={styles.input}
        value={current}
        onChangeText={setCurrent}
        placeholder={t('profile.currentPassword')}
        placeholderTextColor={colors.body_light}
        accessibilityLabel={t('profile.currentPassword')}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="current-password"
        textContentType="password"
      />
      <TextInput
        style={[styles.input, styles.gap]}
        value={next}
        onChangeText={setNext}
        placeholder={t('profile.newPassword')}
        placeholderTextColor={colors.body_light}
        accessibilityLabel={t('profile.newPassword')}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="new-password"
        textContentType="newPassword"
      />
      <Text style={[styles.note, next.length > 0 && !ruleMet && styles.noteError]}>
        {t('profile.passwordRule')}
      </Text>
      <TextInput
        style={[styles.input, styles.gap]}
        value={confirm}
        onChangeText={setConfirm}
        placeholder={t('profile.confirmPassword')}
        placeholderTextColor={colors.body_light}
        accessibilityLabel={t('profile.confirmPassword')}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="done"
        onSubmitEditing={() => void save()}
      />
      {mismatch && (
        <Text style={[styles.note, styles.noteError]}>{t('profile.passwordMismatch')}</Text>
      )}
      {error && (
        <Text style={styles.error} accessibilityRole="alert">
          {error.kind === 'wrongPassword'
            ? t('profile.wrongPassword')
            : t(`plantForm.errors.${error.code}`)}
        </Text>
      )}
      <View style={styles.action}>
        {saving ? (
          <View style={styles.saving}>
            <ActivityIndicator color={colors.white} accessibilityLabel={t('plantForm.saving')} />
          </View>
        ) : (
          <View style={!canSave && styles.off}>
            <Button
              title={t('profile.save')}
              onPress={() => void save()}
              disabled={!canSave}
              accessibilityState={{ disabled: !canSave }}
            />
          </View>
        )}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 20,
    color: colors.heading,
    fontFamily: fonts.heading,
    marginBottom: 16,
  },
  input: {
    height: 52,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: colors.shape,
    fontSize: 16,
    color: colors.heading,
    fontFamily: fonts.text,
  },
  gap: {
    marginTop: 12,
  },
  note: {
    marginTop: 6,
    marginLeft: 4,
    fontSize: 13,
    color: colors.body_dark,
    fontFamily: fonts.text,
  },
  noteError: {
    color: colors.red,
  },
  error: {
    marginTop: 14,
    textAlign: 'center',
    fontSize: 14,
    color: colors.red,
    fontFamily: fonts.text,
  },
  action: {
    marginTop: 20,
  },
  off: {
    opacity: 0.5,
  },
  saving: {
    backgroundColor: colors.green,
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
