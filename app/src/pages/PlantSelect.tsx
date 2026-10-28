import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StackActions, useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import type { CatalogPlant, Difficulty, Light } from '@plantcare/shared';

import { toApiError } from '../api/client';
import { useAuth } from '../auth/AuthProvider';
import { AiIdentify } from '../components/AiIdentify';
import { Button } from '../components/Button';
import { FilterSheet } from '../components/FilterSheet';
import { PlantCardPrimary } from '../components/PlantCardPrimary';
import { Load } from '../components/Load';
import { setPendingSave, type SpeciesPick } from '../plants/pendingSave';
import { addedConfirmationParams, addPlants, syncAfterSave } from '../plants/savePlant';
import { useCatalog } from '../plants/useCatalog';

import colors from '../styles/colors';
import fonts from '../styles/fonts';

const CELL_GAP = 16;
type Mode = 'catalog' | 'ai';

export function PlantSelect() {
  const [search, setSearch] = useState('');
  const [light, setLight] = useState<Light | null>(null);
  const [difficulty, setDifficulty] = useState<Difficulty | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  // Always opens on the catalog.
  const [mode, setMode] = useState<Mode>('catalog');
  // Kept across searches and filters, in the order the user picked them.
  const [selected, setSelected] = useState<SpeciesPick[]>([]);
  const [adding, setAdding] = useState(false);
  // Read synchronously, so two taps in the same frame cannot both add.
  const addingRef = useRef(false);

  const navigation = useNavigation();
  const { status } = useAuth();
  const { top, bottom } = useSafeAreaInsets();
  const { t } = useTranslation();
  const { plants, loading, refreshing, loadingMore, error, loadMore, retry } = useCatalog({
    search,
    light,
    difficulty,
  });

  const isSelected = (id: string) => selected.some((pick) => pick.catalogPlantId === id);

  function toggle(plant: CatalogPlant) {
    setSelected((current) =>
      current.some((pick) => pick.catalogPlantId === plant.id)
        ? current.filter((pick) => pick.catalogPlantId !== plant.id)
        : [...current, { catalogPlantId: plant.id }],
    );
  }

  async function addSelected() {
    if (addingRef.current || selected.length === 0 || status === 'loading') return;
    addingRef.current = true;
    setAdding(true);
    try {
      if (status === 'signedOut') {
        // An account is asked for only now; the plants are added right after sign-up.
        await setPendingSave({ plants: selected });
        navigation.navigate('Auth', { mode: 'signUp', afterAuth: 'savePendingPlant' });
        return;
      }
      const { added, failed, error } = await addPlants(selected);
      if (added.length > 0) await syncAfterSave();
      if (failed.length === 0) {
        navigation.dispatch(
          StackActions.replace('Confirmation', addedConfirmationParams(t, added.length, 0)),
        );
      } else if (added.length > 0) {
        setSelected(failed);
        Alert.alert(
          t('plantSelect.addedSome', { added: added.length, total: added.length + failed.length }),
        );
      } else {
        Alert.alert(
          t(
            toApiError(error).code === 'network'
              ? 'plantSelect.errors.network'
              : 'plantSelect.errors.unknown',
          ),
        );
      }
    } catch {
      Alert.alert(t('plantSelect.errors.unknown'));
    } finally {
      addingRef.current = false;
      setAdding(false);
    }
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
            <PlantCardPrimary
              data={item}
              selected={isSelected(item.id)}
              onPress={() => toggle(item)}
            />
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
    <View style={[styles.container, { paddingTop: top }]}>
      <View style={styles.header}>
        <View style={styles.topBar}>
          <TouchableOpacity
            style={styles.back}
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel={t('plantSelect.back')}
            hitSlop={12}
          >
            <Feather name="chevron-left" size={28} color={colors.heading} />
          </TouchableOpacity>
          <View style={styles.segments} accessibilityRole="tablist">
            {(['catalog', 'ai'] as const).map((value) => {
              const active = mode === value;
              return (
                <Pressable
                  key={value}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: active }}
                  style={[styles.segment, active && styles.segmentActive]}
                  onPress={() => setMode(value)}
                >
                  {value === 'ai' && (
                    <MaterialCommunityIcons
                      name="creation"
                      size={16}
                      color={active ? colors.green_dark : colors.body_dark}
                      style={styles.segmentIcon}
                    />
                  )}
                  <Text
                    style={[styles.segmentText, active && styles.segmentTextActive]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.85}
                  >
                    {t(value === 'catalog' ? 'plantSelect.tabCatalog' : 'plantSelect.tabAi')}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
        {mode === 'catalog' && (
          <>
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
          </>
        )}
      </View>

      {mode === 'ai' ? (
        <AiIdentify bottomInset={bottom} />
      ) : (
        <>
          {/* Only the grid scrolls; the header above and the add bar below stay put. */}
          <View style={styles.plants}>{renderBody()}</View>

          <View style={[styles.addBar, { paddingBottom: bottom + 16 }]}>
            {selected.length > 0 && (
              <Pressable
                accessibilityRole="button"
                hitSlop={12}
                onPress={() => setSelected([])}
                disabled={adding}
              >
                <Text style={styles.clear}>{t('plantSelect.clear')}</Text>
              </Pressable>
            )}
            <View style={[styles.addButton, selected.length === 0 && styles.addButtonOff]}>
              {adding ? (
                <View style={styles.adding}>
                  <ActivityIndicator
                    color={colors.white}
                    accessibilityLabel={t('plantForm.saving')}
                  />
                </View>
              ) : (
                <Button
                  title={t('plantSelect.add', { count: selected.length })}
                  onPress={() => void addSelected()}
                  disabled={selected.length === 0 || status === 'loading'}
                  accessibilityState={{ disabled: selected.length === 0 }}
                />
              )}
            </View>
          </View>
        </>
      )}

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
  addBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 16,
    paddingHorizontal: 30,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.shape,
  },
  clear: {
    fontSize: 15,
    color: colors.green_dark,
    fontFamily: fonts.heading,
    marginRight: 24,
  },
  addButton: {
    flex: 1,
  },
  addButtonOff: {
    opacity: 0.5,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
  },
  back: {
    marginLeft: -6,
    marginRight: 8,
  },
  segments: {
    flex: 1,
    flexDirection: 'row',
    padding: 4,
    borderRadius: 14,
    backgroundColor: colors.shape,
  },
  segment: {
    flex: 1,
    height: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
  },
  segmentActive: {
    backgroundColor: colors.background,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  segmentIcon: {
    marginRight: 6,
  },
  segmentText: {
    fontSize: 15,
    color: colors.body_dark,
    fontFamily: fonts.text,
  },
  segmentTextActive: {
    color: colors.green_dark,
    fontFamily: fonts.heading,
  },
  adding: {
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.green,
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
