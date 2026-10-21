import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, Image, FlatList, Alert } from 'react-native';

import { Header } from '../components/Header';

import { PlantProps, loadPlant, removePlant } from '../libs/storage';
import { formatDistance } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { dateLocale } from '../i18n';
import { PlantCardSecondary } from '../components/PlantCardSecondary';
import { Load } from '../components/Load';

import waterdrop from '../assets/waterdrop.png';
import colors from '../styles/colors';
import fonts from '../styles/fonts';

export function MyPlants() {
  const [myPlants, setMyPlants] = useState<PlantProps[]>([]);
  const [loading, setLoading] = useState(true);
  const { t } = useTranslation();

  function handleRemove(plant: PlantProps) {
    Alert.alert(t('myPlants.removeTitle', { name: plant.name }), undefined, [
      {
        text: t('myPlants.cancel'),
        style: 'cancel',
      },
      {
        text: t('myPlants.remove'),
        style: 'destructive',
        onPress: async () => {
          try {
            await removePlant(plant.id);

            setMyPlants((oldData) =>
              oldData.filter((item) => item.id !== plant.id)
            );
          } catch (err) {
            Alert.alert(t('myPlants.removeError'));
          }
        },
      },
    ]);
  }

  useEffect(() => {
    async function loadStoragedData() {
      const plantsStoraged = await loadPlant();
      setMyPlants(plantsStoraged);
      setLoading(false);
    }

    loadStoragedData();
  }, []);

  if (loading) return <Load />;

  // Built on render so it follows a language change made in Profile while this tab stays mounted.
  const nextPlant = myPlants[0];
  const nextWatering = nextPlant
    ? t('myPlants.nextWatering', {
        name: nextPlant.name,
        time: formatDistance(new Date(nextPlant.dateTimeNotification), new Date(), {
          locale: dateLocale(),
          addSuffix: true,
        }),
      })
    : t('myPlants.empty');

  return (
    <View style={styles.container}>
      <Header />
      <View style={styles.spotlight}>
        <Image source={waterdrop} style={styles.spotlightImage} />
        <Text style={styles.spotlightText}>{nextWatering}</Text>
      </View>

      <View style={styles.plants}>
        <Text style={styles.plantsTitle}>{t('myPlants.upcoming')}</Text>

        <FlatList
          data={myPlants}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => (
            <PlantCardSecondary
              data={item}
              handleRemove={() => {
                handleRemove(item);
              }}
            />
          )}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ flex: 1 }}
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
  plants: {
    flex: 1,
    width: '100%',
  },
  plantsTitle: {
    fontSize: 24,
    fontFamily: fonts.heading,
    color: colors.heading,
    marginVertical: 20,
  },
});
