import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { userNameSchema } from '@plantcare/shared';

import colors from '../styles/colors';
import fonts from '../styles/fonts';

interface NameRowProps {
  name: string;
  saving: boolean;
  /** Gets the trimmed name; resolves true once it is stored, which ends the editing. */
  onSave: (name: string) => Promise<boolean>;
}

/** The name, read-only with a pencil; the pencil turns it into a field with Save and Cancel. */
export function NameRow({ name, saving, onSave }: NameRowProps) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);

  const trimmed = draft.trim();
  const canSave = !saving && trimmed !== name && userNameSchema.safeParse(draft).success;

  function startEditing() {
    setDraft(name);
    setEditing(true);
  }

  async function save() {
    if (!canSave) return;
    if (await onSave(trimmed)) setEditing(false);
  }

  if (!editing) {
    return (
      <View style={[styles.card, styles.readRow]}>
        <View style={styles.readText}>
          <Text style={styles.label}>{t('profile.name')}</Text>
          <Text style={styles.value} numberOfLines={1}>
            {name}
          </Text>
        </View>
        <Pressable
          style={({ pressed }) => [styles.pencil, pressed && styles.pressed]}
          onPress={startEditing}
          accessibilityRole="button"
          accessibilityLabel={t('profile.editName')}
          hitSlop={8}
        >
          <Feather name="edit-2" size={16} color={colors.green_dark} />
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <Text style={styles.label}>{t('profile.name')}</Text>
      <TextInput
        style={styles.input}
        value={draft}
        onChangeText={setDraft}
        accessibilityLabel={t('profile.name')}
        autoFocus
        autoCapitalize="words"
        autoComplete="name"
        returnKeyType="done"
        onSubmitEditing={() => void save()}
        editable={!saving}
      />
      <View style={styles.actions}>
        <Pressable
          style={({ pressed }) => [styles.action, styles.cancel, pressed && styles.pressed]}
          onPress={() => setEditing(false)}
          disabled={saving}
          accessibilityRole="button"
          accessibilityState={{ disabled: saving }}
        >
          <Text style={styles.cancelText}>{t('profile.cancel')}</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [
            styles.action,
            styles.save,
            !canSave && !saving && styles.off,
            pressed && styles.pressed,
          ]}
          onPress={() => void save()}
          disabled={!canSave}
          accessibilityRole="button"
          accessibilityLabel={t('profile.save')}
          accessibilityState={{ disabled: !canSave, busy: saving }}
        >
          {saving ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <Text style={styles.saveText}>{t('profile.save')}</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: colors.shape,
  },
  readRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  readText: {
    flexShrink: 1,
    marginRight: 12,
  },
  label: {
    fontSize: 13,
    color: colors.body_dark,
    fontFamily: fonts.text,
  },
  value: {
    marginTop: 2,
    fontSize: 17,
    color: colors.heading,
    fontFamily: fonts.heading,
  },
  pencil: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.green_light,
  },
  pressed: {
    opacity: 0.6,
  },
  input: {
    marginTop: 8,
    height: 48,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.green,
    backgroundColor: colors.white,
    fontSize: 17,
    color: colors.heading,
    fontFamily: fonts.text,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  action: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancel: {
    backgroundColor: colors.white,
  },
  cancelText: {
    fontSize: 15,
    color: colors.heading,
    fontFamily: fonts.heading,
  },
  save: {
    backgroundColor: colors.green,
  },
  off: {
    opacity: 0.5,
  },
  saveText: {
    fontSize: 15,
    color: colors.white,
    fontFamily: fonts.heading,
  },
});
