import React from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { Difficulty, Frequency, IdentifyResponse, Light } from '@plantcare/shared';

import type { Language } from '../i18n';
import { BottomSheet } from './BottomSheet';
import { Button } from './Button';
import { CareTiles } from './CareTiles';
import colors from '../styles/colors';
import fonts from '../styles/fonts';

/** What the preview shows, from a catalog hit or a new species the AI proposed. */
export type SpeciesPreview = {
  fromCatalog: boolean;
  name: string;
  scientificName: string;
  about: string;
  waterTips: string;
  light: Light;
  difficulty: Difficulty;
  frequency: Frequency;
};

/** The species an identification found, in the app language; null when it found none. */
export function previewFromResult(result: IdentifyResponse, language: Language): SpeciesPreview | null {
  switch (result.kind) {
    case 'catalog':
      return { fromCatalog: true, ...result.plant };
    case 'proposal': {
      const { proposal } = result;
      return {
        fromCatalog: false,
        name: proposal.names[language],
        scientificName: proposal.scientificName,
        about: proposal.about[language],
        waterTips: proposal.waterTips[language],
        light: proposal.light,
        difficulty: proposal.difficulty,
        frequency: proposal.frequency,
      };
    }
    case 'none':
      return null;
  }
}

interface SpeciesPreviewSheetProps {
  species: SpeciesPreview | null;
  adding: boolean;
  onAdd: () => void;
  onClose: () => void;
}

/** The species the AI found, with its care, and one button that adds it to the garden. */
export function SpeciesPreviewSheet({ species, adding, onAdd, onClose }: SpeciesPreviewSheetProps) {
  const { t } = useTranslation();

  return (
    <BottomSheet visible={species !== null} onClose={adding ? () => undefined : onClose}>
      {species && (
        <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.badge}>
            <MaterialCommunityIcons
              name={species.fromCatalog ? 'book-open-variant' : 'creation'}
              size={14}
              color={colors.green_dark}
            />
            <Text style={styles.badgeText}>
              {t(species.fromCatalog ? 'aiIdentify.fromCatalog' : 'aiIdentify.foundByAi')}
            </Text>
          </View>
          <Text style={styles.name}>{species.name}</Text>
          <Text style={styles.scientific}>{species.scientificName}</Text>
          <Text style={styles.about}>{species.about}</Text>
          <CareTiles
            difficulty={species.difficulty}
            light={species.light}
            frequency={species.frequency}
          />
          <Text style={styles.section}>{t('aiIdentify.watering')}</Text>
          <Text style={styles.about}>{species.waterTips}</Text>
        </ScrollView>
      )}
      <View style={styles.action}>
        {adding ? (
          <View style={styles.adding}>
            <ActivityIndicator color={colors.white} accessibilityLabel={t('plantForm.saving')} />
          </View>
        ) : (
          <Button title={t('aiIdentify.add')} onPress={onAdd} />
        )}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  scroll: {
    maxHeight: 460,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: colors.green_light,
  },
  badgeText: {
    fontSize: 12,
    color: colors.green_dark,
    fontFamily: fonts.heading,
  },
  name: {
    marginTop: 12,
    fontSize: 24,
    color: colors.heading,
    fontFamily: fonts.heading,
  },
  scientific: {
    marginTop: 2,
    fontSize: 15,
    fontStyle: 'italic',
    color: colors.body_dark,
    fontFamily: fonts.text,
  },
  about: {
    marginVertical: 14,
    fontSize: 15,
    lineHeight: 22,
    color: colors.body_dark,
    fontFamily: fonts.text,
  },
  section: {
    marginTop: 18,
    fontSize: 16,
    color: colors.heading,
    fontFamily: fonts.heading,
  },
  action: {
    marginTop: 8,
  },
  adding: {
    height: 56,
    borderRadius: 16,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
