import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View, Text, Image, FlatList, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { formatDistance } from 'date-fns';
import { useTranslation } from 'react-i18next';
import type { UserPlant } from '@plantcare/shared';

import { listMyPlants } from '../api/endpoints';
import { useAuth } from '../auth/AuthProvider';
import { loadTokens } from '../auth/session';
import { Button } from '../components/Button';
import { Header } from '../components/Header';
import { Load } from '../components/Load';
import { PlantCardSecondary } from '../components/PlantCardSecondary';
import { dateLocale } from '../i18n';
import { sortByNextWatering } from '../plants/nextWatering';
import { useMyPlants } from '../plants/useMyPlants';

import waterdrop from '../assets/waterdrop.png';
import colors from '../styles/colors';
import fonts from '../styles/fonts';

export function MyPlants() {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const { status } = useAuth();
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const { plants, offline, loading, error, refresh, remove } = useMyPlants();

  // The token is read after each load: that request may have refreshed it.
  useEffect(() => {
    let active = true;
    void loadTokens()
      .then((tokens) => {
        if (active) setAccessToken(tokens?.accessToken ?? null);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [plants]);

  // Asks for any list so an expired token is refreshed, then returns the token now in use.
  const refreshToken = useCallback(async () => {
    try {
      await listMyPlants();
      const next = (await loadTokens())?.accessToken ?? null;
      setAccessToken(next);
      return next;
    } catch {
      return null;
    }
  }, []);

  function handleEdit(plant: UserPlant) {
    if (offline) {
      Alert.alert(t('myPlants.offlineNotice'));
      return;
    }
    navigation.navigate('PlantDetail', { userPlantId: plant.id });
  }

  function handleRemove(plant: UserPlant) {
    Alert.alert(t('myPlants.removeTitle', { name: plant.speciesName }), undefined, [
      { text: t('myPlants.cancel'), style: 'cancel' },
      {
        text: t('myPlants.remove'),
        style: 'destructive',
        onPress: () => {
          remove(plant.id).catch(() => Alert.alert(t('myPlants.removeError')));
        },
      },
    ]);
  }

  if (status === 'loading' || (status === 'signedIn' && loading)) return <Load />;

  if (status === 'signedOut') {
    return (
      <View style={styles.container}>
        <Header />
        <View style={styles.message}>
          <Text style={styles.messageText}>{t('myPlants.signedOut')}</Text>
          <Button
            title={t('myPlants.signIn')}
            onPress={() => navigation.navigate('Auth', { mode: 'signIn' })}
          />
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <Header />
        <View style={styles.message}>
          <Text style={styles.messageText}>{t('myPlants.loadError')}</Text>
          <Button title={t('myPlants.retry')} onPress={() => void refresh()} />
        </View>
      </View>
    );
  }

  // Built on render so it follows a language change made in Profile while this tab stays mounted.
  const sorted = sortByNextWatering(plants);
  const first = sorted[0];
  const nextWatering =
    first && first.next
      ? t('myPlants.nextWatering', {
          name: first.plant.speciesName,
          time: formatDistance(first.next, new Date(), { locale: dateLocale(), addSuffix: true }),
        })
      : t('myPlants.empty');

  return (
    <View style={styles.container}>
      <Header />
      <View style={styles.spotlight}>
        <Image source={waterdrop} style={styles.spotlightImage} />
        <Text style={styles.spotlightText}>{nextWatering}</Text>
      </View>
      {offline && <Text style={styles.offline}>{t('myPlants.offlineNotice')}</Text>}

      <View style={styles.plants}>
        <Text style={styles.plantsTitle}>{t('myPlants.upcoming')}</Text>

        <FlatList
          data={sorted}
          keyExtractor={(item) => item.plant.id}
          renderItem={({ item }) => (
            <PlantCardSecondary
              plant={item.plant}
              accessToken={accessToken}
              readOnly={offline}
              onPress={() => handleEdit(item.plant)}
              handleRemove={() => handleRemove(item.plant)}
              onPhotoError={refreshToken}
            />
          )}
          showsVerticalScrollIndicator={false}
          // No flex: 1 here: it caps the content at the screen height and stops the list scrolling.
          contentContainerStyle={styles.listContent}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 30,
    paddingTop: 50,
    backgroundColor: colors.background,
  },
  message: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    gap: 20,
  },
  messageText: {
    textAlign: 'center',
    fontFamily: fonts.text,
    fontSize: 17,
    color: colors.heading,
  },
  spotlight: {
    backgroundColor: colors.blue_light,
    paddingHorizontal: 20,
    borderRadius: 20,
    height: 110,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  spotlightImage: {
    width: 60,
    height: 60,
  },
  spotlightText: {
    flex: 1,
    color: colors.blue,
    paddingLeft: 10,
  },
  offline: {
    marginTop: 12,
    textAlign: 'center',
    fontFamily: fonts.text,
    fontSize: 14,
    color: colors.body_dark,
  },
  plants: {
    flex: 1,
    width: '100%',
  },
  listContent: {
    paddingBottom: 24,
  },
  plantsTitle: {
    fontSize: 24,
    fontFamily: fonts.heading,
    color: colors.heading,
    marginVertical: 20,
  },
});
