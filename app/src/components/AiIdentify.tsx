import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { StackActions, useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import type { AiStatus, IdentifyResponse } from '@plantcare/shared';

import { toApiError } from '../api/client';
import {
  addProposal,
  createMyPlant,
  getAiStatus,
  identifyByName,
  identifyByPhoto,
  uploadPlantPhoto,
} from '../api/endpoints';
import { useAuth } from '../auth/AuthProvider';
import { currentLanguage } from '../i18n';
import { pickPhoto, type PhotoSource, type PickMessage, type PlantPhoto } from '../plants/pickPhoto';
import {
  addedConfirmationParams,
  createBody,
  defaultSchedule,
  syncAfterSave,
} from '../plants/savePlant';
import { shrinkPhoto } from '../plants/shrinkPhoto';
import { Button } from './Button';
import { previewFromResult, SpeciesPreviewSheet } from './SpeciesPreviewSheet';
import colors from '../styles/colors';
import fonts from '../styles/fonts';

/** What the screen says under the buttons. */
type Message =
  | 'notFound'
  | 'notAPlant'
  | 'limit'
  | 'off'
  | 'expired'
  | 'retry'
  | 'network'
  | 'unknown'
  | PickMessage;

type Found = Exclude<IdentifyResponse, { kind: 'none' }>;

interface AiIdentifyProps {
  bottomInset: number;
  /** Tests pass a fake; the app shrinks with expo-image-manipulator. */
  shrink?: (photo: PlantPhoto) => Promise<PlantPhoto>;
}

function messageFor(error: unknown): Message {
  const { code } = toApiError(error);
  switch (code) {
    case 'ai_daily_limit':
      return 'limit';
    case 'ai_off':
      return 'off';
    // One answer failed; the next may not, so nothing gets switched off.
    case 'ai_unavailable':
      return 'retry';
    case 'proposal_expired':
    case 'proposal_used':
      return 'expired';
    case 'network':
      return 'network';
    default:
      return 'unknown';
  }
}

/** The "Add with AI" tab: a name or a photo, then a preview of the species to add. */
export function AiIdentify({ bottomInset, shrink = shrinkPhoto }: AiIdentifyProps) {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const { status } = useAuth();
  const [name, setName] = useState('');
  const [aiStatus, setAiStatus] = useState<AiStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  const [found, setFound] = useState<Found | null>(null);
  // The photo behind the current result, so a catalog hit keeps it like a new species does.
  const [foundPhoto, setFoundPhoto] = useState<PlantPhoto | null>(null);
  const [adding, setAdding] = useState(false);
  // Read synchronously, so two taps in the same frame cannot both send.
  const busyRef = useRef(false);

  useEffect(() => {
    if (status !== 'signedIn') return;
    let current = true;
    getAiStatus()
      .then((next) => {
        if (current) setAiStatus(next);
      })
      .catch(() => {
        // Unknown: the buttons stay on, and a request says what is wrong.
      });
    return () => {
      current = false;
    };
  }, [status]);

  const off = aiStatus?.enabled === false || message === 'off';
  const limitReached = aiStatus?.identifyLeft === 0 || message === 'limit';
  const blocked = off || limitReached;
  const shownMessage: Message | null = off ? 'off' : limitReached ? 'limit' : message;

  async function identify(run: () => Promise<IdentifyResponse>, photo: PlantPhoto | null = null) {
    if (busyRef.current || blocked) return;
    busyRef.current = true;
    setBusy(true);
    setMessage(null);
    try {
      const result = await run();
      if (result.kind === 'none') {
        setMessage(result.reason === 'not_a_plant' ? 'notAPlant' : 'notFound');
      } else {
        setFound(result);
        setFoundPhoto(photo);
      }
    } catch (e) {
      setMessage(messageFor(e));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  function findByName() {
    const trimmed = name.trim();
    if (trimmed) void identify(() => identifyByName(trimmed));
  }

  async function findByPhoto(source: PhotoSource) {
    if (busyRef.current || blocked) return;
    const picked = await pickPhoto(source);
    if ('message' in picked) {
      setMessage(picked.message);
      return;
    }
    if ('photo' in picked) {
      const small = await shrink(picked.photo);
      await identify(() => identifyByPhoto(small), small);
    }
  }

  async function add() {
    if (!found || adding) return;
    setAdding(true);
    try {
      if (found.kind === 'catalog') {
        const plant = await createMyPlant(createBody({ catalogPlantId: found.plant.id }));
        // The plant exists either way; a failed upload only leaves it without the photo.
        if (foundPhoto) await uploadPlantPhoto(plant.id, foundPhoto).catch(() => undefined);
      } else {
        await addProposal(found.proposalId, defaultSchedule());
      }
      await syncAfterSave();
      const params = addedConfirmationParams(t, 1, 0);
      // A proposal is a species new to the catalog; say so on the way out.
      const toast =
        found.kind === 'proposal'
          ? t('aiIdentify.joinedCatalog', { name: found.proposal.names[currentLanguage()] })
          : undefined;
      navigation.dispatch(StackActions.replace('Confirmation', { ...params, toast }));
    } catch (e) {
      setFound(null);
      setMessage(messageFor(e));
    } finally {
      setAdding(false);
    }
  }

  if (status === 'signedOut') {
    return (
      <View style={[styles.center, { paddingBottom: bottomInset + 32 }]}>
        <View style={styles.icon}>
          <MaterialCommunityIcons name="creation" size={32} color={colors.green_dark} />
        </View>
        <Text style={styles.title}>{t('aiIdentify.title')}</Text>
        <Text style={styles.text}>{t('aiIdentify.signedOut')}</Text>
        <View style={styles.signUp}>
          <Button
            title={t('aiIdentify.signUp')}
            onPress={() => navigation.navigate('Auth', { mode: 'signUp' })}
          />
        </View>
      </View>
    );
  }

  const nameReady = name.trim().length > 0 && !busy && !blocked;
  const photoDisabled = busy || blocked;
  const messageText =
    shownMessage === null
      ? null
      : shownMessage === 'denied' || shownMessage === 'unsupported' || shownMessage === 'failed'
        ? t(`plantForm.photoMessages.${shownMessage}`)
        : t(`aiIdentify.messages.${shownMessage}`);

  return (
    <View style={[styles.container, { paddingBottom: bottomInset + 24 }]}>
      <Text style={styles.title}>{t('aiIdentify.title')}</Text>
      <Text style={styles.text}>{t('aiIdentify.text')}</Text>

      <View style={styles.nameRow}>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          onSubmitEditing={findByName}
          placeholder={t('aiIdentify.namePlaceholder')}
          accessibilityLabel={t('aiIdentify.nameLabel')}
          placeholderTextColor={colors.body_light}
          returnKeyType="search"
          editable={!busy}
          maxLength={80}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('aiIdentify.find')}
          accessibilityState={{ disabled: !nameReady }}
          disabled={!nameReady}
          style={[styles.findButton, !nameReady && styles.off]}
          onPress={findByName}
        >
          <Feather name="search" size={22} color={colors.white} />
        </Pressable>
      </View>

      <Text style={styles.or}>{t('aiIdentify.or')}</Text>

      <View style={styles.photoRow}>
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
            accessibilityState={{ disabled: photoDisabled }}
            disabled={photoDisabled}
            style={({ pressed }) => [
              styles.photoButton,
              pressed && styles.pressed,
              photoDisabled && styles.off,
            ]}
            onPress={() => void findByPhoto(source)}
          >
            <Feather name={icon} size={24} color={colors.green_dark} />
            <Text style={styles.photoLabel}>{label}</Text>
          </Pressable>
        ))}
      </View>

      {busy && (
        <View style={styles.status}>
          <ActivityIndicator color={colors.green} />
          <Text style={styles.statusText}>{t('aiIdentify.looking')}</Text>
        </View>
      )}
      {!busy && messageText && (
        <Text style={[styles.message, shownMessage === 'off' && styles.messageOff]}>
          {messageText}
        </Text>
      )}

      <SpeciesPreviewSheet
        species={
          found
            ? previewFromResult(found, currentLanguage(), {
                reference: null,
                ownPhoto: foundPhoto?.uri ?? null,
              })
            : null
        }
        adding={adding}
        onAdd={() => void add()}
        onNotThis={() => setFound(null)}
        onClose={() => setFound(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 30,
    paddingTop: 24,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  icon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.green_light,
    marginBottom: 20,
  },
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
  signUp: {
    alignSelf: 'stretch',
    marginTop: 24,
  },
  nameRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 24,
  },
  input: {
    flex: 1,
    height: 56,
    paddingHorizontal: 16,
    borderRadius: 16,
    backgroundColor: colors.shape,
    fontSize: 16,
    color: colors.heading,
    fontFamily: fonts.text,
  },
  findButton: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.green,
  },
  off: {
    opacity: 0.4,
  },
  or: {
    marginVertical: 16,
    textAlign: 'center',
    fontSize: 14,
    color: colors.body_light,
    fontFamily: fonts.text,
  },
  photoRow: {
    flexDirection: 'row',
    gap: 12,
  },
  photoButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 20,
    borderRadius: 20,
    backgroundColor: colors.green_light,
  },
  pressed: {
    opacity: 0.6,
  },
  photoLabel: {
    marginTop: 8,
    fontSize: 14,
    color: colors.green_dark,
    fontFamily: fonts.heading,
  },
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginTop: 24,
  },
  statusText: {
    fontSize: 15,
    color: colors.body_dark,
    fontFamily: fonts.text,
  },
  message: {
    marginTop: 24,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    color: colors.heading,
    fontFamily: fonts.text,
  },
  messageOff: {
    color: colors.body_dark,
  },
});
