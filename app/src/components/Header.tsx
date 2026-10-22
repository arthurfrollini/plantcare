import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useAuth } from '../auth/AuthProvider';
import colors from '../styles/colors';
import fonts from '../styles/fonts';

/** The first word of the name, so a full name never crowds the greeting. */
export function firstName(name: string) {
  return name.trim().split(/\s+/)[0] ?? '';
}

export function Header() {
  const [localName, setLocalName] = useState<string>();
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
  // A very long single name ends in an ellipsis instead of wrapping.
  names: {
    flexShrink: 1,
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
