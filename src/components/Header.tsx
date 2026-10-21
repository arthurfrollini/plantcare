import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Image, Text } from 'react-native';
import { getStatusBarHeight } from 'react-native-iphone-x-helper';
import AsyncStorage from '@react-native-async-storage/async-storage';

import userImg from '../assets/arthur.jpeg';
import colors from '../styles/colors';
import fonts from '../styles/fonts';

export function Header() {
  const [username, setUsername] = useState<string>();

  useEffect(() => {
    async function loadStorageUsername() {
      const user = await AsyncStorage.getItem('@plantcare:user');
      setUsername(user || '');
    }
    loadStorageUsername();
  }, [username]);

  return (
    <View style={styles.container}>
      <View>
        <Text style={styles.greeting}>Olá,</Text>
        <Text style={styles.userName}>{username}</Text>
      </View>

      <Image source={userImg} style={styles.image} />
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
    marginTop: getStatusBarHeight(),
  },
  image: {
    width: 80,
    height: 80,
    borderRadius: 40,
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
