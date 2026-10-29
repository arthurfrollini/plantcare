import React from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type {
  Difficulty,
  Frequency,
  IdentifyResponse,
  ImageCredit,
  Light,
} from '@plantcare/shared';

import type { Language } from '../i18n';
import { BottomSheet } from './BottomSheet';
import { Button } from './Button';
import { CareTiles } from './CareTiles';
import { CreditLine } from './CreditLine';
import { SpeciesImage } from './SpeciesImage';
import { Tappable } from './Tappable';
import colors from '../styles/colors';
import fonts from '../styles/fonts';

/** A picture to load, with the token an API image needs. */
export type ImageSource = { uri: string; headers?: Record<string, string>; cacheKey?: string };

/** The picture the species is compared with: a checked photo, a catalog drawing, or none. */
export type ReferenceImage =
  | { kind: 'photo'; source: ImageSource; credit: ImageCredit | null }
  | { kind: 'illustration'; url: string }
  | null;

/** What the preview shows, from a catalog hit or a new species the AI proposed. */
export type SpeciesPreview = {
  fromCatalog: boolean;
  reference: ReferenceImage;
  /** The user's own photo when they identified by photo, as a local uri. */
  ownPhoto: string | null;
  name: string;
  scientificName: string;
  about: string;
  waterTips: string;
  light: Light;
  difficulty: Difficulty;
  frequency: Frequency;
};

/** The species an identification found, in the app language; null when it found none. */
export function previewFromResult(
  result: IdentifyResponse,
  language: Language,
  pictures: { reference: ReferenceImage; ownPhoto: string | null },
): SpeciesPreview | null {
  switch (result.kind) {
    case 'catalog':
      return { fromCatalog: true, ...pictures, ...result.plant };
    case 'proposal': {
      const { proposal } = result;
      return {
        fromCatalog: false,
        ...pictures,
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
  /** The user says the AI found the wrong plant. */
  onNotThis: () => void;
  onClose: () => void;
}

/** The reference picture, or the placeholder when there is none. */
function Reference({ reference, tall }: { reference: ReferenceImage; tall: boolean }) {
  const { t } = useTranslation();
  const height = tall ? 160 : 120;
  if (reference?.kind === 'photo') {
    return (
      <Image
        testID="reference-photo"
        source={reference.source}
        style={[styles.picture, { height }]}
        contentFit="cover"
        accessibilityIgnoresInvertColors
      />
    );
  }
  return (
    <View style={[styles.picture, styles.empty, { height }]}>
      {reference?.kind === 'illustration' ? (
        <SpeciesImage url={reference.url} size={height - 24} />
      ) : (
        <>
          <Text style={styles.sprout}>🌱</Text>
          <Text style={styles.emptyText}>{t('aiIdentify.noReference')}</Text>
        </>
      )}
    </View>
  );
}

/** The user's photo beside the reference, or the reference alone. */
function Pictures({ species }: { species: SpeciesPreview }) {
  const { t } = useTranslation();
  const credit =
    species.reference?.kind === 'photo' && species.reference.credit ? (
      <CreditLine credit={species.reference.credit} style={styles.credit} />
    ) : null;
  if (!species.ownPhoto) {
    return (
      <View style={styles.pictures}>
        <View style={styles.column}>
          <Reference reference={species.reference} tall />
          {credit}
        </View>
      </View>
    );
  }
  return (
    <View style={styles.pictures}>
      <View style={styles.column}>
        <Image
          testID="own-photo"
          source={{ uri: species.ownPhoto }}
          style={[styles.picture, { height: 120 }]}
          contentFit="cover"
          accessibilityIgnoresInvertColors
        />
        <Text style={styles.caption}>{t('aiIdentify.yourPhoto')}</Text>
      </View>
      <View style={styles.column}>
        <Reference reference={species.reference} tall={false} />
        <Text style={styles.caption}>{t('aiIdentify.reference')}</Text>
        {credit}
      </View>
    </View>
  );
}

/** The species the AI found, with photos to compare, its care, a button that adds it and two ways out. */
export function SpeciesPreviewSheet({
  species,
  adding,
  onAdd,
  onNotThis,
  onClose,
}: SpeciesPreviewSheetProps) {
  const { t } = useTranslation();

  return (
    <BottomSheet visible={species !== null} onClose={adding ? () => undefined : onClose}>
      {species && (
        <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.top}>
            <View style={styles.badge}>
              <MaterialCommunityIcons
                name={species.fromCatalog ? 'book-open-variant' : 'creation'}
                size={14}
                color={colors.green_dark}
              />
              <Text style={styles.badgeText}>
                {t(species.fromCatalog ? 'aiIdentify.fromCatalog' : 'aiIdentify.newToCatalog')}
              </Text>
            </View>
            <Tappable
              style={styles.close}
              onPress={onClose}
              disabled={adding}
              accessibilityRole="button"
              accessibilityLabel={t('aiIdentify.close')}
              hitSlop={8}
              borderlessRipple
            >
              <Feather name="x" size={20} color={colors.heading} />
            </Tappable>
          </View>
          <Pictures species={species} />
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
        <Tappable
          style={styles.notThis}
          onPress={onNotThis}
          disabled={adding}
          accessibilityRole="button"
          hitSlop={4}
        >
          <Text style={styles.notThisText}>{t('aiIdentify.notThis')}</Text>
        </Tappable>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  scroll: {
    maxHeight: 520,
  },
  pictures: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  column: {
    flex: 1,
  },
  picture: {
    width: '100%',
    borderRadius: 12,
    backgroundColor: colors.shape,
  },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  sprout: {
    fontSize: 32,
  },
  emptyText: {
    marginTop: 4,
    fontSize: 12,
    color: colors.body_dark,
    fontFamily: fonts.text,
  },
  caption: {
    marginTop: 4,
    fontSize: 12,
    color: colors.body_dark,
    fontFamily: fonts.text,
  },
  credit: {
    marginTop: 2,
  },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  close: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.shape,
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
  notThis: {
    alignSelf: 'center',
    marginTop: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  notThisText: {
    fontSize: 15,
    color: colors.heading,
    fontFamily: fonts.heading,
  },
  adding: {
    height: 56,
    borderRadius: 16,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
