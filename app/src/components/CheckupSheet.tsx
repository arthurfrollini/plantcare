import React, { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useTranslation } from 'react-i18next';
import type { Checkup, UserPlant } from '@plantcare/shared';

import { toApiError } from '../api/client';
import { createCheckup } from '../api/endpoints';
import { pickPhoto, type PhotoSource, type PickMessage, type PlantPhoto } from '../plants/pickPhoto';
import { shrinkPhoto } from '../plants/shrinkPhoto';
import { BottomSheet } from './BottomSheet';
import { Button } from './Button';
import colors from '../styles/colors';
import fonts from '../styles/fonts';

const MAX_DESCRIPTION = 500;

type Message = 'notAPlant' | 'mismatch' | 'limit' | 'off' | 'network' | 'unknown' | PickMessage;

function messageFor(error: unknown): Message {
  switch (toApiError(error).code) {
    case 'not_a_plant':
      return 'notAPlant';
    case 'species_mismatch':
      return 'mismatch';
    case 'ai_daily_limit':
      return 'limit';
    case 'ai_off':
    case 'ai_unavailable':
      return 'off';
    case 'network':
      return 'network';
    default:
      return 'unknown';
  }
}

interface CheckupSheetProps {
  visible: boolean;
  plant: UserPlant;
  initialDescription: string;
  onDone: (checkup: Checkup) => void;
  onClose: () => void;
  /** Tests pass a fake; the app shrinks with expo-image-manipulator. */
  shrink?: (photo: PlantPhoto) => Promise<PlantPhoto>;
}

/** A photo (required) and a description (optional), sent to the AI for a check-up. */
export function CheckupSheet({
  visible,
  plant,
  initialDescription,
  onDone,
  onClose,
  shrink = shrinkPhoto,
}: CheckupSheetProps) {
  const { t } = useTranslation();
  const [photo, setPhoto] = useState<PlantPhoto | null>(null);
  const [description, setDescription] = useState(initialDescription);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  // Read synchronously, so two taps in the same frame cannot both send.
  const busyRef = useRef(false);
  const name = plant.nickname ?? plant.speciesName;

  async function choose(source: PhotoSource) {
    if (busyRef.current) return;
    const picked = await pickPhoto(source);
    if ('message' in picked) {
      setMessage(picked.message);
    } else if ('photo' in picked) {
      setMessage(null);
      setPhoto(await shrink(picked.photo));
    }
  }

  async function send() {
    if (!photo || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setMessage(null);
    try {
      onDone(await createCheckup(plant.id, photo, description));
    } catch (e) {
      setMessage(messageFor(e));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  const messageText =
    message === null
      ? null
      : message === 'denied' || message === 'unsupported' || message === 'failed'
        ? t(`plantForm.photoMessages.${message}`)
        : t(`health.messages.${message}`, { name });

  return (
    <BottomSheet visible={visible} onClose={busy ? () => undefined : onClose}>
      <Text style={styles.title}>{t('health.checkupTitle', { name })}</Text>
      <Text style={styles.text}>{t('health.checkupText')}</Text>

      <View style={styles.photoRow}>
        {photo && (
          <Image
            source={{ uri: photo.uri }}
            style={styles.preview}
            accessibilityLabel={t('health.photoReady')}
            accessibilityIgnoresInvertColors
          />
        )}
        {(
          [
            { source: 'camera', icon: 'camera', label: t('plantForm.takePhoto') },
            { source: 'gallery', icon: 'image', label: t('plantForm.choosePhoto') },
          ] as const
        ).map(({ source, icon, label }) => (
          <Pressable
            key={source}
            accessibilityRole="button"
            accessibilityLabel={label}
            disabled={busy}
            style={({ pressed }) => [styles.photoButton, pressed && styles.pressed]}
            onPress={() => void choose(source)}
          >
            <Feather name={icon} size={22} color={colors.green_dark} />
            <Text style={styles.photoLabel} numberOfLines={2}>
              {label}
            </Text>
          </Pressable>
        ))}
      </View>

      <TextInput
        style={styles.input}
        value={description}
        onChangeText={setDescription}
        placeholder={t('health.descriptionPlaceholder')}
        accessibilityLabel={t('health.descriptionLabel')}
        placeholderTextColor={colors.body_light}
        maxLength={MAX_DESCRIPTION}
        editable={!busy}
        multiline
      />

      {messageText && <Text style={styles.message}>{messageText}</Text>}

      {busy ? (
        <View style={styles.busy}>
          <ActivityIndicator color={colors.white} />
          <Text style={styles.busyText}>{t('health.looking')}</Text>
        </View>
      ) : (
        <View style={[styles.send, !photo && styles.off]}>
          <Button
            title={t('health.send')}
            onPress={() => void send()}
            disabled={!photo}
            accessibilityState={{ disabled: !photo }}
          />
        </View>
      )}
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
    marginTop: 4,
    fontSize: 14,
    lineHeight: 20,
    color: colors.body_dark,
    fontFamily: fonts.text,
  },
  photoRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  preview: {
    width: 88,
    height: 88,
    borderRadius: 16,
  },
  photoButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    borderRadius: 16,
    backgroundColor: colors.green_light,
    minHeight: 88,
  },
  pressed: {
    opacity: 0.6,
  },
  photoLabel: {
    marginTop: 6,
    fontSize: 13,
    textAlign: 'center',
    color: colors.green_dark,
    fontFamily: fonts.heading,
  },
  input: {
    marginTop: 16,
    minHeight: 72,
    maxHeight: 120,
    padding: 14,
    borderRadius: 16,
    backgroundColor: colors.shape,
    fontSize: 15,
    color: colors.heading,
    fontFamily: fonts.text,
    textAlignVertical: 'top',
  },
  message: {
    marginTop: 12,
    fontSize: 14,
    lineHeight: 20,
    color: colors.red,
    fontFamily: fonts.text,
  },
  send: {
    marginTop: 16,
  },
  off: {
    opacity: 0.4,
  },
  busy: {
    flexDirection: 'row',
    gap: 10,
    height: 56,
    marginTop: 16,
    borderRadius: 16,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  busyText: {
    fontSize: 15,
    color: colors.white,
    fontFamily: fonts.heading,
  },
});
