import React, { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { difficultySchema, lightSchema, type Difficulty, type Light } from '@plantcare/shared';

import { Header } from '../components/Header';
import { FilterChip } from '../components/FilterChip';
import { PlantCardPrimary } from '../components/PlantCardPrimary';
import { Load } from '../components/Load';
import { useCatalog } from '../plants/useCatalog';

import colors from '../styles/colors';
import fonts from '../styles/fonts';

const LIGHTS = lightSchema.options;
const DIFFICULTIES = difficultySchema.options;

export function PlantSelect() {
  const [search, setSearch] = useState('');
  const [light, setLight] = useState<Light | null>(null);
  const [difficulty, setDifficulty] = useState<Difficulty | null>(null);

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
          <PlantCardPrimary data={item} onPress={() => handlePlantSelect(item.id)} />
        )}
        style={refreshing && styles.refreshing}
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
        <Text style={styles.title}>{t('plantSelect.title')}</Text>
        <Text style={styles.subtitle}>{t('plantSelect.subtitle')}</Text>
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

      <Text style={styles.filterLabel}>{t('plantSelect.lightLabel')}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.chips}
        style={styles.chipRow}
      >
        <FilterChip
          title={t('plantSelect.all')}
          active={light === null}
          onPress={() => setLight(null)}
        />
        {LIGHTS.map((value) => (
          <FilterChip
            key={value}
            title={t(`light.${value}`)}
            active={light === value}
            onPress={() => setLight(value)}
          />
        ))}
      </ScrollView>

      <Text style={styles.filterLabel}>{t('plantSelect.difficultyLabel')}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.chips}
        style={styles.chipRow}
      >
        <FilterChip
          title={t('plantSelect.all')}
          active={difficulty === null}
          onPress={() => setDifficulty(null)}
        />
        {DIFFICULTIES.map((value) => (
          <FilterChip
            key={value}
            title={t(`difficulty.${value}`)}
            active={difficulty === value}
            onPress={() => setDifficulty(value)}
          />
        ))}
      </ScrollView>

      <View style={styles.plants}>{renderBody()}</View>
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
  title: {
    fontSize: 17,
    color: colors.heading,
    fontFamily: fonts.heading,
    lineHeight: 20,
    marginTop: 15,
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
  filterLabel: {
    marginTop: 16,
    marginLeft: 32,
    color: colors.body_dark,
    fontFamily: fonts.text,
    fontSize: 13,
  },
  chipRow: {
    flexGrow: 0,
    marginTop: 6,
  },
  chips: {
    paddingHorizontal: 32,
  },
  plants: {
    flex: 1,
    paddingHorizontal: 32,
    marginTop: 16,
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
