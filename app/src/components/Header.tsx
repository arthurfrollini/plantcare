import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { avatarSource } from '../api/endpoints';
import { useAuth } from '../auth/AuthProvider';
import { loadTokens } from '../auth/session';
import colors from '../styles/colors';
import fonts from '../styles/fonts';

/** Up to two initials from the name the user typed, e.g. "Ana Clara Souza" -> "AC". */
export function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join('');
}

/** The first word of the name, so a full name never crowds the greeting. */
export function firstName(name: string) {
  return name.trim().split(/\s+/)[0] ?? '';
}

export function Header() {
  const [localName, setLocalName] = useState<string>();
  const [accessToken, setAccessToken] = useState<{ userId: string; token: string } | null>(null);
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const { status, user } = useAuth();
  const { top } = useSafeAreaInsets();
  const { t } = useTranslation();

  useEffect(() => {
    async function loadStorageUsername() {
      const saved = await AsyncStorage.getItem('@plantcare:user');
      setLocalName(saved || '');
    }
    void loadStorageUsername();
  }, [status, user?.name]);

  // The photo request needs the access token, as for plant photos.
  const avatarVersion = user?.avatarVersion;
  const hasAvatar = user?.hasAvatar;
  const userId = user?.id;
  useEffect(() => {
    if (!hasAvatar || !userId) return;
    let active = true;
    void loadTokens()
      .then((tokens) => {
        if (active) setAccessToken(tokens ? { userId, token: tokens.accessToken } : null);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [hasAvatar, avatarVersion, userId]);
  // The token only counts for the user it was loaded for; a failed image shows the initials until
  // the avatar changes.
  const avatarKey = `${userId ?? ''}-${avatarVersion ?? ''}`;
  const photo =
    user && accessToken && accessToken.userId === user.id && failedKey !== avatarKey
      ? avatarSource(user, accessToken.token)
      : null;

  // The account name wins; the name typed on the first screen covers signed-out and offline use.
  const username = user?.name ?? localName;

  return (
    <View style={[styles.container, { marginTop: top }]}>
      <View style={styles.names}>
        <Text style={styles.greeting}>{t('header.greeting')}</Text>
        <Text style={styles.userName} numberOfLines={1}>
          {firstName(username ?? '')}
        </Text>
      </View>

      <View style={styles.avatar}>
        {photo ? (
          <Image
            testID="header-avatar"
            source={photo}
            onError={() => setFailedKey(avatarKey)}
            style={styles.avatarImage}
            accessibilityIgnoresInvertColors
          />
        ) : (
          <Text style={styles.avatarText}>{initials(username ?? '')}</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 20,
  },
  // Shrinks before the avatar does; a very long single name ends in an ellipsis.
  names: {
    flexShrink: 1,
    marginRight: 16,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.green_light,
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarText: {
    fontSize: 28,
    fontFamily: fonts.heading,
    color: colors.green_dark,
  },
  greeting: {
    fontSize: 32,
    color: colors.heading,
    fontFamily: fonts.text,
  },
  userName: {
    fontSize: 32,
    fontFamily: fonts.heading,
    color: colors.heading,
    lineHeight: 40,
  },
});
