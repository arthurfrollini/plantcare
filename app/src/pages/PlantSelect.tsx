import React, { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import type { Difficulty, Light } from '@plantcare/shared';

import { Header } from '../components/Header';
import { FilterSheet } from '../components/FilterSheet';
import { PlantCardPrimary } from '../components/PlantCardPrimary';
import { Load } from '../components/Load';
import { useCatalog } from '../plants/useCatalog';

import colors from '../styles/colors';
import fonts from '../styles/fonts';

const CELL_GAP = 16;

export function PlantSelect() {
  const [search, setSearch] = useState('');
  const [light, setLight] = useState<Light | null>(null);
  const [difficulty, setDifficulty] = useState<Difficulty | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const navigation = useNavigation();
  const { t } = useTranslation();
  const { plants, loading, refreshing, loadingMore, error, loadMore, retry } = useCatalog({
    search,
    light,
    difficulty,
  });

  function handlePlantSelect(catalogPlantId: string) {
    navigation.navigate('PlantForm', { mode: 'create', catalogPlantId });
  }

  const activeFilters = (light ? 1 : 0) + (difficulty ? 1 : 0);

  const errorMessage = error
    ? t(error.code === 'network' ? 'plantSelect.errors.network' : 'plantSelect.errors.unknown')
    : null;

  function renderBody() {
    if (loading) return <Load />;

    if (errorMessage && plants.length === 0) {
      return (
        <View style={styles.message}>
          <Text style={styles.messageText}>{errorMessage}</Text>
          <TouchableOpacity style={styles.retry} activeOpacity={0.7} onPress={retry}>
            <Text style={styles.retryText}>{t('plantSelect.retry')}</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <FlatList
        data={plants}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.cell}>
            <PlantCardPrimary data={item} onPress={() => handlePlantSelect(item.id)} />
          </View>
        )}
        style={[styles.grid, refreshing && styles.refreshing]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        numColumns={2}
        onEndReachedThreshold={0.1}
        onEndReached={loadMore}
        ListEmptyComponent={
          <View style={styles.message}>
            <Text style={styles.messageText}>{t('plantSelect.empty')}</Text>
          </View>
        }
        ListFooterComponent={
          loadingMore ? (
            <ActivityIndicator color={colors.green} />
          ) : errorMessage ? (
            <View style={styles.footerError}>
              <Text style={styles.messageText}>{errorMessage}</Text>
              <TouchableOpacity style={styles.retry} activeOpacity={0.7} onPress={retry}>
                <Text style={styles.retryText}>{t('plantSelect.retry')}</Text>
              </TouchableOpacity>
            </View>
          ) : null
        }
      />
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Header />
        <View style={styles.heading}>
          <View style={styles.headingText}>
            <Text style={styles.title}>{t('plantSelect.title')}</Text>
            <Text style={styles.subtitle}>{t('plantSelect.subtitle')}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              activeFilters > 0
                ? t('plantSelect.filtersActive', { count: activeFilters })
                : t('plantSelect.filters')
            }
            style={[styles.filterButton, activeFilters > 0 && styles.filterButtonActive]}
            onPress={() => setFiltersOpen(true)}
          >
            <Feather name="sliders" size={20} color={colors.heading} />
            {activeFilters > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{activeFilters}</Text>
              </View>
            )}
          </Pressable>
        </View>
        <TextInput
          style={styles.search}
          value={search}
          onChangeText={setSearch}
          placeholder={t('plantSelect.searchPlaceholder')}
          accessibilityLabel={t('plantSelect.searchPlaceholder')}
          placeholderTextColor={colors.body_light}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
        />
      </View>

      <View style={styles.plants}>{renderBody()}</View>

      <FilterSheet
        visible={filtersOpen}
        light={light}
        difficulty={difficulty}
        onLightChange={setLight}
        onDifficultyChange={setDifficulty}
        onClose={() => setFiltersOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: 30,
    marginTop: 30,
  },
  heading: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 15,
  },
  headingText: {
    flex: 1,
    marginRight: 16,
  },
  title: {
    fontSize: 17,
    color: colors.heading,
    fontFamily: fonts.heading,
    lineHeight: 20,
  },
  subtitle: {
    fontSize: 17,
    color: colors.heading,
    fontFamily: fonts.text,
    lineHeight: 20,
  },
  search: {
    height: 44,
    marginTop: 16,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: colors.shape,
    color: colors.heading,
    fontFamily: fonts.text,
    fontSize: 16,
  },
  filterButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.shape,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterButtonActive: {
    backgroundColor: colors.green_light,
  },
  badge: {
    position: 'absolute',
    top: -6,
    right: -6,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: colors.white,
    fontFamily: fonts.heading,
    fontSize: 12,
  },
  plants: {
    flex: 1,
    paddingHorizontal: 30,
    marginTop: 16,
  },
  // Each cell pads CELL_GAP / 2 on both sides; the grid pulls back by the same amount so the
  // outer cards line up with the header and the search field.
  grid: {
    marginHorizontal: -CELL_GAP / 2,
  },
  cell: {
    flex: 1,
    maxWidth: '50%',
    padding: CELL_GAP / 2,
  },
  refreshing: {
    opacity: 0.5,
  },
  message: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  messageText: {
    color: colors.heading,
    fontFamily: fonts.text,
    fontSize: 15,
    textAlign: 'center',
  },
  footerError: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  retry: {
    marginTop: 16,
    height: 44,
    paddingHorizontal: 24,
    borderRadius: 12,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryText: {
    color: colors.white,
    fontFamily: fonts.heading,
  },
});
