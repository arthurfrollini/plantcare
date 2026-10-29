import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import type { PhotoCredit } from '@plantcare/shared';

import { toApiError } from '../api/client';
import { listPhotoCredits } from '../api/endpoints';
import { Button } from '../components/Button';
import { CreditLine } from '../components/CreditLine';
import { Load } from '../components/Load';
import { SpeciesImage } from '../components/SpeciesImage';
import { Tappable } from '../components/Tappable';
import colors from '../styles/colors';
import fonts from '../styles/fonts';

type State =
  | { kind: 'loading' }
  | { kind: 'error'; network: boolean }
  | { kind: 'ready'; credits: PhotoCredit[] };

/** Who took each catalog photo, under which licence, with a link to the original. */
export function PhotoCredits() {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const { top, bottom } = useSafeAreaInsets();
  const [state, setState] = useState<State>({ kind: 'loading' });

  const fetchCredits = useCallback(() => {
    listPhotoCredits().then(
      (credits) => setState({ kind: 'ready', credits }),
      (e: unknown) => setState({ kind: 'error', network: toApiError(e).code === 'network' }),
    );
  }, []);

  useEffect(fetchCredits, [fetchCredits]);

  function retry() {
    setState({ kind: 'loading' });
    fetchCredits();
  }

  return (
    <View style={[styles.container, { paddingTop: top + 12 }]}>
      <View style={styles.header}>
        <Tappable
          style={styles.back}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel={t('photoCredits.back')}
          hitSlop={8}
          borderlessRipple
        >
          <Feather name="chevron-left" size={28} color={colors.heading} />
        </Tappable>
        <Text style={styles.title} accessibilityRole="header">
          {t('photoCredits.title')}
        </Text>
      </View>
      <Text style={styles.text}>{t('photoCredits.text')}</Text>

      {state.kind === 'loading' && <Load />}
      {state.kind === 'error' && (
        <View style={styles.error}>
          <Text style={styles.errorText}>
            {t(state.network ? 'plantSelect.errors.network' : 'plantSelect.errors.unknown')}
          </Text>
          <Button title={t('plantSelect.retry')} onPress={retry} />
        </View>
      )}
      {state.kind === 'ready' && (
        <FlatList
          data={state.credits}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: bottom + 24 }}
          ListEmptyComponent={<Text style={styles.text}>{t('photoCredits.empty')}</Text>}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <SpeciesImage url={item.imageUrl} size={48} round />
              <View style={styles.rowText}>
                <Text style={styles.name}>{item.name}</Text>
                <Text style={styles.scientific}>{item.scientificName}</Text>
                <CreditLine credit={item.credit} style={styles.credit} />
              </View>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 24,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  back: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -8,
  },
  title: {
    fontSize: 22,
    color: colors.heading,
    fontFamily: fonts.heading,
  },
  text: {
    marginTop: 8,
    marginBottom: 16,
    fontSize: 14,
    lineHeight: 20,
    color: colors.body_dark,
    fontFamily: fonts.text,
  },
  error: {
    marginTop: 24,
    gap: 16,
  },
  errorText: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    color: colors.heading,
    fontFamily: fonts.text,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.gray,
  },
  rowText: {
    flex: 1,
  },
  name: {
    fontSize: 16,
    color: colors.heading,
    fontFamily: fonts.heading,
  },
  scientific: {
    fontSize: 13,
    fontStyle: 'italic',
    color: colors.body_dark,
    fontFamily: fonts.text,
  },
  credit: {
    marginTop: 2,
  },
});
