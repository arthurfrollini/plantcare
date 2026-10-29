import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Image, type ImageStyle } from 'expo-image';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CommonActions, useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';

import type { avatarSource } from '../api/endpoints';
import { useAuth, type AuthStatus } from '../auth/AuthProvider';
import { LOCAL_NAME_KEY, saveLocalName } from '../auth/localName';
import { useAvatarSource } from '../auth/useAvatarSource';
import { DeleteAccountSheet } from '../components/DeleteAccountSheet';
import { initials } from '../components/Header';
import { HeroHeader } from '../components/HeroHeader';
import { Tappable } from '../components/Tappable';
import { NameRow } from '../components/NameRow';
import { PasswordSheet } from '../components/PasswordSheet';
import { PhotoSheet, type PhotoChoice } from '../components/PhotoSheet';
import { PhotoViewer } from '../components/PhotoViewer';
import { Toast } from '../components/Toast';
import { LANGUAGES, Language, currentLanguage } from '../i18n';
import { pickPhoto, type PhotoMessage } from '../plants/pickPhoto';
import { SAVED_TOAST_MS, formError, type FormError } from '../plants/usePlantDetail';
import colors from '../styles/colors';
import fonts from '../styles/fonts';

export type ProfileToast = 'saved' | 'passwordChanged' | 'photoUpdated' | 'photoRemoved';

export interface ProfileViewProps {
  status: AuthStatus;
  name: string;
  email: string | null;
  hasPassword: boolean;
  /** Signed in with the account loaded: the photo can change. */
  canEditPhoto: boolean;
  hasPhoto: boolean;
  photoSource: ReturnType<typeof avatarSource>;
  photoBusy: boolean;
  photoMessage: PhotoMessage | null;
  nameSaving: boolean;
  deleting: boolean;
  toastVisible: boolean;
  toast: ProfileToast;
  /** Why the last name save failed; stays until the next one. */
  error: FormError | null;
  language: Language;
  onPhotoError: () => void;
  onPhoto: (choice: PhotoChoice) => void;
  onSaveName: (name: string) => Promise<boolean>;
  onSelectLanguage: (language: Language) => void;
  onChangePassword: (current: string, next: string) => Promise<void>;
  onSignIn: () => void;
  onPhotoCredits: () => void;
  onSignOut: () => void;
  onDeleteAccount: () => Promise<void>;
}

/** The Profile screen itself, driven only by its props. */
export function ProfileView(props: ProfileViewProps) {
  const { status, name, email } = props;
  const { t } = useTranslation();
  const [photoOpen, setPhotoOpen] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const signedIn = status === 'signedIn';

  return (
    <View style={styles.container}>
      <HeroHeader
        left={
          <Text style={styles.headerTitle} accessibilityRole="header">
            {t('profile.title')}
          </Text>
        }
        right={
          props.canEditPhoto ? (
            <Tappable
              rippleColor={'rgba(255, 255, 255, 0.3)'}
              style={styles.headerButton}
              onPress={() => setPhotoOpen(true)}
              disabled={props.photoBusy}
              accessibilityRole="button"
              accessibilityLabel={t('profile.editPhoto')}
              hitSlop={8}
            >
              <Feather name="edit-2" size={20} color={colors.white} />
            </Tappable>
          ) : undefined
        }
      >
        {props.photoSource ? (
          <Pressable
            accessibilityRole="imagebutton"
            accessibilityLabel={t('profile.viewPhoto')}
            style={StyleSheet.absoluteFill}
            onPress={() => setViewerOpen(true)}
          >
            <Image
              testID="profile-avatar"
              source={props.photoSource}
              onError={props.onPhotoError}
              style={styles.photo}
              accessibilityIgnoresInvertColors
            />
          </Pressable>
        ) : (
          <View style={styles.initialsFill}>
            <Text style={styles.initials}>{initials(name)}</Text>
          </View>
        )}
        {props.photoBusy && (
          <View style={styles.photoBusy}>
            <ActivityIndicator color={colors.white} />
          </View>
        )}
      </HeroHeader>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {signedIn && email ? (
          <Text style={styles.email} numberOfLines={1}>
            {email}
          </Text>
        ) : null}
        {props.photoMessage && (
          <Text style={styles.photoMessage}>
            {t(`plantForm.photoMessages.${props.photoMessage}`)}
          </Text>
        )}

        <View style={styles.nameRow}>
          <NameRow name={name} saving={props.nameSaving} onSave={props.onSaveName} />
        </View>

        <Text style={[styles.sectionTitle, styles.section]}>{t('profile.language')}</Text>
        <View style={styles.options}>
          {LANGUAGES.map((language, index) => {
            const active = language === props.language;
            return (
              <TouchableOpacity
                key={language}
                style={[styles.option, index > 0 && styles.optionDivider]}
                onPress={() => props.onSelectLanguage(language)}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                activeOpacity={0.7}
              >
                <Text style={[styles.optionText, active && styles.optionTextActive]}>
                  {t(`languages.${language}`)}
                </Text>
                {active && <Feather name="check" size={20} color={colors.green} />}
              </TouchableOpacity>
            );
          })}
        </View>

        {status !== 'loading' && (
          <>
            <Text style={[styles.sectionTitle, styles.section]}>{t('profile.account')}</Text>
            <View style={styles.options}>
              {signedIn ? (
                <>
                  {props.hasPassword && (
                    <TouchableOpacity
                      style={styles.option}
                      onPress={() => setPasswordOpen(true)}
                      accessibilityRole="button"
                      activeOpacity={0.7}
                    >
                      <Text style={styles.optionText}>{t('profile.changePassword')}</Text>
                      <Feather name="chevron-right" size={20} color={colors.body_dark} />
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={[styles.option, props.hasPassword && styles.optionDivider]}
                    onPress={props.onSignOut}
                    accessibilityRole="button"
                    activeOpacity={0.7}
                  >
                    <Text style={styles.optionText}>{t('profile.signOut')}</Text>
                    <Feather name="log-out" size={20} color={colors.body_dark} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.option, styles.optionDivider]}
                    onPress={() => setDeleteOpen(true)}
                    accessibilityRole="button"
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.optionText, styles.danger]}>
                      {t('profile.deleteAccount')}
                    </Text>
                    <Feather name="trash-2" size={20} color={colors.red} />
                  </TouchableOpacity>
                </>
              ) : (
                <TouchableOpacity
                  style={styles.option}
                  onPress={props.onSignIn}
                  accessibilityRole="button"
                  activeOpacity={0.7}
                >
                  <Text style={styles.optionText}>{t('profile.signIn')}</Text>
                  <Feather name="chevron-right" size={20} color={colors.body_dark} />
                </TouchableOpacity>
              )}
            </View>
          </>
        )}

        <Text style={[styles.sectionTitle, styles.section]}>{t('profile.about')}</Text>
        <View style={styles.options}>
          <TouchableOpacity
            style={styles.option}
            onPress={props.onPhotoCredits}
            accessibilityRole="button"
            activeOpacity={0.7}
          >
            <Text style={styles.optionText}>{t('profile.photoCredits')}</Text>
            <Feather name="chevron-right" size={20} color={colors.body_dark} />
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Stays until the next save, so it takes its own room instead of covering the content. */}
      {props.error && (
        <View style={styles.errorBar}>
          <Text style={styles.errorText} accessibilityRole="alert">
            {t(`plantForm.errors.${props.error}`)}
          </Text>
        </View>
      )}
      <View style={styles.toastArea} pointerEvents="none">
        <Toast visible={props.toastVisible} text={t(`profile.${props.toast}`)} />
      </View>
      <PhotoViewer
        visible={viewerOpen}
        source={props.photoSource}
        onClose={() => setViewerOpen(false)}
      />

      {signedIn && (
        <>
          <PhotoSheet
            visible={photoOpen}
            hasPhoto={props.hasPhoto}
            onChoose={props.onPhoto}
            onClose={() => setPhotoOpen(false)}
          />
          <PasswordSheet
            visible={passwordOpen}
            onSubmit={props.onChangePassword}
            onClose={() => setPasswordOpen(false)}
          />
          <DeleteAccountSheet
            visible={deleteOpen}
            word={t('profile.deleteWord')}
            deleting={props.deleting}
            onConfirm={props.onDeleteAccount}
            onClose={() => setDeleteOpen(false)}
          />
        </>
      )}
    </View>
  );
}

/** Account, name, photo and language; signed out, the name typed on the first screen. */
export function Profile() {
  const navigation = useNavigation();
  // Re-renders this screen when the language changes, so the selection and labels update at once.
  const { t } = useTranslation();
  const auth = useAuth();
  const { status, user } = auth;
  const avatar = useAvatarSource(user);
  const [localName, setLocalName] = useState('');
  const [nameSaving, setNameSaving] = useState(false);
  const [error, setError] = useState<FormError | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoMessage, setPhotoMessage] = useState<PhotoMessage | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState<ProfileToast>('saved');
  const [toastVisible, setToastVisible] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const photoWorking = useRef(false);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(LOCAL_NAME_KEY)
      .then((saved) => {
        if (active) setLocalName(saved ?? '');
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [status, user?.name]);

  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    [],
  );

  function showToast(message: ProfileToast) {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(message);
    setToastVisible(true);
    toastTimer.current = setTimeout(() => {
      toastTimer.current = null;
      setToastVisible(false);
    }, SAVED_TOAST_MS);
  }

  async function handleSaveName(name: string): Promise<boolean> {
    setNameSaving(true);
    setError(null);
    try {
      if (status === 'signedIn') {
        await auth.updateName(name);
      } else {
        await saveLocalName(name);
        setLocalName(name);
      }
      showToast('saved');
      return true;
    } catch (e) {
      setError(formError(e));
      return false;
    } finally {
      setNameSaving(false);
    }
  }

  async function handlePhoto(choice: PhotoChoice) {
    if (photoWorking.current) return;
    photoWorking.current = true;
    setPhotoBusy(true);
    setPhotoMessage(null);
    try {
      if (choice === 'remove') {
        try {
          await auth.removeAvatar();
          showToast('photoRemoved');
        } catch {
          setPhotoMessage('removeFailed');
        }
        return;
      }
      const result = await pickPhoto(choice);
      if ('photo' in result) {
        try {
          await auth.changeAvatar(result.photo);
          showToast('photoUpdated');
        } catch {
          setPhotoMessage('uploadFailed');
        }
      } else if ('message' in result) {
        setPhotoMessage(result.message);
      }
      // A cancelled picker leaves the photo as it was, with nothing to say.
    } finally {
      photoWorking.current = false;
      setPhotoBusy(false);
    }
  }

  async function handleSelectLanguage(language: Language) {
    if (language === currentLanguage()) return;
    await auth.setLanguage(language);
  }

  async function handleChangePassword(current: string, next: string) {
    await auth.changePassword(current, next);
    showToast('passwordChanged');
  }

  async function handleSignOut() {
    try {
      await auth.signOut();
    } catch {
      Alert.alert(t('profile.signOutError'));
    }
  }

  async function handleDeleteAccount() {
    setDeleting(true);
    try {
      await auth.deleteAccount();
    } finally {
      setDeleting(false);
    }
    navigation.dispatch(CommonActions.reset({ index: 0, routes: [{ name: 'Welcome' }] }));
  }

  return (
    <ProfileView
      status={status}
      name={user?.name ?? localName}
      email={user?.email ?? null}
      hasPassword={user?.hasPassword ?? false}
      canEditPhoto={status === 'signedIn' && user !== null}
      hasPhoto={user?.hasAvatar ?? false}
      photoSource={avatar.source}
      photoBusy={photoBusy}
      photoMessage={photoMessage}
      nameSaving={nameSaving}
      deleting={deleting}
      toastVisible={toastVisible}
      toast={toast}
      error={error}
      language={currentLanguage()}
      onPhotoError={avatar.onError}
      onPhoto={(choice) => void handlePhoto(choice)}
      onSaveName={handleSaveName}
      onSelectLanguage={(language) => void handleSelectLanguage(language)}
      onChangePassword={handleChangePassword}
      onSignIn={() => navigation.navigate('Auth', { mode: 'signIn' })}
      onPhotoCredits={() => navigation.navigate('PhotoCredits')}
      onSignOut={() => void handleSignOut()}
      onDeleteAccount={handleDeleteAccount}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  headerTitle: {
    fontSize: 22,
    color: colors.white,
    fontFamily: fonts.heading,
  },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
  },
  // expo-image's style type still wants a percentage literal, not RN 0.88's plain string.
  photo: { width: '100%', height: '100%' } satisfies ImageStyle,
  initialsFill: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.green_light,
  },
  initials: {
    fontSize: 40,
    color: colors.green_dark,
    fontFamily: fonts.heading,
  },
  photoBusy: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 30,
    paddingTop: 10,
    paddingBottom: 40,
  },
  email: {
    textAlign: 'center',
    fontSize: 14,
    color: colors.body_dark,
    fontFamily: fonts.text,
  },
  photoMessage: {
    marginTop: 8,
    textAlign: 'center',
    color: colors.body_dark,
    fontFamily: fonts.text,
    fontSize: 13,
  },
  nameRow: {
    marginTop: 24,
  },
  section: {
    marginTop: 28,
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 13,
    fontFamily: fonts.heading,
    color: colors.body_dark,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  options: {
    backgroundColor: colors.shape,
    borderRadius: 16,
    overflow: 'hidden',
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  optionDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.gray,
  },
  optionText: {
    fontSize: 17,
    fontFamily: fonts.text,
    color: colors.heading,
  },
  optionTextActive: {
    fontFamily: fonts.heading,
    color: colors.green_dark,
  },
  danger: {
    color: colors.red,
  },
  toastArea: {
    position: 'absolute',
    left: 30,
    right: 30,
    bottom: 24,
    alignItems: 'center',
  },
  errorBar: {
    paddingVertical: 12,
    paddingHorizontal: 30,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.shape,
  },
  errorText: {
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 20,
    color: colors.red,
    fontFamily: fonts.text,
  },
});
