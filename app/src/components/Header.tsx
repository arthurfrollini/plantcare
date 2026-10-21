import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';

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

export function Header() {
  const [username, setUsername] = useState<string>();
  const { top } = useSafeAreaInsets();
  const { t } = useTranslation();
  const navigation = useNavigation();

  useEffect(() => {
    async function loadStorageUsername() {
      const user = await AsyncStorage.getItem('@plantcare:user');
      setUsername(user || '');
    }
    loadStorageUsername();
  }, [username]);

  return (
    <View style={[styles.container, { marginTop: top }]}>
      <View>
        <Text style={styles.greeting}>{t('header.greeting')}</Text>
        <Text style={styles.userName}>{username}</Text>
      </View>

      <TouchableOpacity
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={t('header.openProfile')}
        onPress={() => navigation.navigate('Profile')}
      >
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials(username ?? '')}</Text>
        </View>
      </TouchableOpacity>
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
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.green_light,
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
