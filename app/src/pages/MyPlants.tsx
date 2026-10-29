import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Alert,
  AppState,
  FlatList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { toLocalDateString, type UserPlant } from '@plantcare/shared';

import { listMyPlants } from '../api/endpoints';
import { useAuth } from '../auth/AuthProvider';
import { loadTokens } from '../auth/session';
import { Button } from '../components/Button';
import { Header } from '../components/Header';
import { Load } from '../components/Load';
import { PlantCardSecondary } from '../components/PlantCardSecondary';
import { Toast } from '../components/Toast';
import { TodayCard } from '../components/TodayCard';
import { sortByNextWatering } from '../plants/nextWatering';
import { nextWateringAfterToday, todayRows, type TodayRow } from '../plants/today';
import { useMyPlants } from '../plants/useMyPlants';

import colors from '../styles/colors';
import fonts from '../styles/fonts';

export function MyPlants() {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const openProfile = () => navigation.navigate('PlantSelect', { screen: 'Profile' });
  const { status } = useAuth();
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const { plants, offline, loading, error, refresh, remove, markWatered, undoWatered } =
    useMyPlants();
  // Plants with a watering being saved; each keeps its spinner until its own request settles.
  const [busyIds, setBusyIds] = useState<ReadonlySet<string>>(() => new Set());
  const [saveFailed, setSaveFailed] = useState(false);
  const saveFailedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // "Today" is worked out again when the screen gains focus, every minute while it has it, when the
  // app returns to the foreground and when the list changes. So a time that passes turns "late",
  // and a screen left open overnight moves on to the new day.
  const [now, setNow] = useState(() => new Date());
  const [nowFor, setNowFor] = useState(plants);
  if (nowFor !== plants) {
    setNowFor(plants);
    setNow(new Date());
  }
  useFocusEffect(
    useCallback(() => {
      setNow(new Date());
      const timer = setInterval(() => setNow(new Date()), NOW_TICK_MS);
      return () => clearInterval(timer);
    }, []),
  );
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') setNow(new Date());
    });
    return () => subscription.remove();
  }, []);

  useEffect(
    () => () => {
      if (saveFailedTimer.current) clearTimeout(saveFailedTimer.current);
    },
    [],
  );

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

  function showSaveFailed() {
    if (saveFailedTimer.current) clearTimeout(saveFailedTimer.current);
    setSaveFailed(true);
    // The toast's live region only works on Android; this makes VoiceOver read it too.
    AccessibilityInfo.announceForAccessibility(t('today.saveError'));
    saveFailedTimer.current = setTimeout(() => {
      saveFailedTimer.current = null;
      setSaveFailed(false);
    }, SAVE_FAILED_TOAST_MS);
  }

  async function handleToggle(row: TodayRow) {
    const id = row.plant.id;
    // The row's own day: a tap just after midnight on a row still showing yesterday marks yesterday.
    const day = toLocalDateString(row.time);
    setBusyIds((current) => new Set(current).add(id));
    const saved = await (row.done ? undoWatered(id, day) : markWatered(id, day));
    setBusyIds((current) => {
      const next = new Set(current);
      next.delete(id);
      return next;
    });
    if (!saved) showSaveFailed();
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
        <Header onAvatarPress={openProfile} />
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
        <Header onAvatarPress={openProfile} />
        <View style={styles.message}>
          <Text style={styles.messageText}>{t('myPlants.loadError')}</Text>
          <Button title={t('myPlants.retry')} onPress={() => void refresh()} />
        </View>
      </View>
    );
  }

  const sorted = sortByNextWatering(plants);
  const rows = todayRows(plants, now);
  const next = rows.length === 0 ? nextWateringAfterToday(plants, now) : null;

  return (
    <View style={styles.screen}>
      {/* One list for the whole screen: the header, the Today card and the garden scroll together. */}
      <FlatList
        style={styles.list}
        data={sorted}
        keyExtractor={(item) => item.plant.id}
        ListHeaderComponent={
          <>
            <Header onAvatarPress={openProfile} />
            {offline && <Text style={styles.offline}>{t('myPlants.offlineNotice')}</Text>}
            <View style={styles.today}>
              <TodayCard
                rows={rows}
                next={next}
                accessToken={accessToken}
                now={now}
                busyIds={busyIds}
                onToggle={(row) => void handleToggle(row)}
                onOpen={handleEdit}
                onPhotoError={refreshToken}
              />
            </View>
            <Text style={styles.plantsTitle}>{t('myPlants.garden')}</Text>
          </>
        }
        ListEmptyComponent={<Text style={styles.empty}>{t('myPlants.empty')}</Text>}
        renderItem={({ item }) => (
          <PlantCardSecondary
            plant={item.plant}
            next={item.next}
            now={now}
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

      <View style={styles.toastArea} pointerEvents="none">
        <Toast visible={saveFailed} text={t('today.saveError')} />
      </View>
    </View>
  );
}

const SAVE_FAILED_TOAST_MS = 2500;
const NOW_TICK_MS = 60_000;

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
  offline: {
    marginTop: 12,
    textAlign: 'center',
    fontFamily: fonts.text,
    fontSize: 14,
    color: colors.body_dark,
  },
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  list: {
    width: '100%',
  },
  listContent: {
    paddingHorizontal: 30,
    paddingTop: 50,
    paddingBottom: 24,
  },
  today: {
    marginTop: 20,
  },
  plantsTitle: {
    fontSize: 24,
    fontFamily: fonts.heading,
    color: colors.heading,
    marginTop: 28,
    marginBottom: 12,
  },
  empty: {
    fontFamily: fonts.text,
    fontSize: 15,
    color: colors.body_dark,
  },
  toastArea: {
    position: 'absolute',
    left: 30,
    right: 30,
    bottom: 24,
    alignItems: 'center',
  },
});
