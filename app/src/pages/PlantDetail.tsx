import React, { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { SvgFromUri } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { format } from 'date-fns';
import { useTranslation } from 'react-i18next';
import type { UserPlant } from '@plantcare/shared';

import { assetUrl } from '../api/config';
import type { plantPhotoSource } from '../api/endpoints';
import { Button } from '../components/Button';
import { CareTiles } from '../components/CareTiles';
import { Load } from '../components/Load';
import { PhotoSheet, type PhotoChoice } from '../components/PhotoSheet';
import { TimeSheet } from '../components/TimeSheet';
import { dateLocale } from '../i18n';
import type { ScheduleValues } from '../plants/savePlant';
import { usePlantDetail, type FormError, type PhotoMessage } from '../plants/usePlantDetail';
import type { RootStackParamList } from '../routes/stack.routes';
import colors from '../styles/colors';
import fonts from '../styles/fonts';

const PHOTO_SIZE = 120;
/** Gradient height below the status bar; the photo circle sits on its bottom edge. */
const HEADER_HEIGHT = 112;
/** ISO weekdays, Monday first. */
const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7];
const LEADS = [5, 10, 15, 20, 25, 30];

/**
 * 1 January 2024 was a Monday, so day N of that month is ISO weekday N. The short name is cut to
 * three letters: Portuguese "EEE" is "segunda", too wide for seven chips in a row.
 */
function weekdayName(isoDay: number, pattern: 'EEE' | 'EEEE'): string {
  const name = format(new Date(2024, 0, isoDay), pattern, { locale: dateLocale() });
  const shown = pattern === 'EEE' ? name.slice(0, 3) : name;
  return shown.charAt(0).toUpperCase() + shown.slice(1);
}

export interface PlantDetailViewProps {
  plant: UserPlant;
  values: ScheduleValues;
  requiredDays: number;
  needsReview: boolean;
  canSave: boolean;
  saving: boolean;
  error: FormError | null;
  photoSource: ReturnType<typeof plantPhotoSource>;
  photoBusy: boolean;
  photoMessage: PhotoMessage | null;
  onBack: () => void;
  onToggleDay: (isoDay: number) => void;
  onTimeChange: (time: string) => void;
  onLeadChange: (minutes: number) => void;
  onSave: () => void;
  onPhoto: (choice: PhotoChoice) => void;
  onSavedPhotoError: () => void;
}

/** The plant detail screen itself, driven only by its props. */
export function PlantDetailView(props: PlantDetailViewProps) {
  const { plant, values, requiredDays, needsReview, canSave, saving, error } = props;
  const { t } = useTranslation();
  const { top, bottom } = useSafeAreaInsets();
  const [timeOpen, setTimeOpen] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);
  const [illustrationGone, setIllustrationGone] = useState(false);

  function renderPicture() {
    if (props.photoSource) {
      return (
        <Image
          testID="plant-photo"
          source={props.photoSource}
          style={styles.photo}
          onError={props.onSavedPhotoError}
          accessibilityIgnoresInvertColors
        />
      );
    }
    if (plant.imageUrl && !illustrationGone) {
      return (
        <SvgFromUri
          uri={assetUrl(plant.imageUrl)}
          width={84}
          height={84}
          onError={() => setIllustrationGone(true)}
        />
      );
    }
    return <Text style={styles.placeholder}>🌱</Text>;
  }

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[colors.green, colors.green_light]}
        style={[styles.header, { paddingTop: top, height: top + HEADER_HEIGHT }]}
      >
        <View style={styles.topBar}>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={props.onBack}
            accessibilityRole="button"
            accessibilityLabel={t('plantDetail.back')}
            hitSlop={8}
          >
            <Feather name="chevron-left" size={28} color={colors.white} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={() => setPhotoOpen(true)}
            disabled={props.photoBusy}
            accessibilityRole="button"
            accessibilityLabel={t('plantDetail.editPhoto')}
            hitSlop={8}
          >
            <Feather name="edit-2" size={20} color={colors.white} />
          </TouchableOpacity>
        </View>
      </LinearGradient>

      <View style={styles.photoWrap}>
        <View style={styles.photoCircle}>
          {renderPicture()}
          {props.photoBusy && (
            <View style={styles.photoBusy}>
              <ActivityIndicator color={colors.white} />
            </View>
          )}
        </View>
      </View>

      {/* Only this part scrolls; the header above and the save bar below stay put. */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {props.photoMessage && (
          <Text style={styles.photoMessage}>
            {t(`plantForm.photoMessages.${props.photoMessage}`)}
          </Text>
        )}
        <Text style={styles.name}>{plant.speciesName}</Text>
        <Text style={styles.scientific}>{plant.scientificName}</Text>
        {plant.about ? <Text style={styles.about}>{plant.about}</Text> : null}

        <View style={styles.tiles}>
          <CareTiles difficulty={plant.difficulty} light={plant.light} frequency={plant.frequency} />
        </View>

        {needsReview && requiredDays > 0 && (
          <View style={styles.review} accessibilityRole="alert">
            <Feather name="info" size={18} color={colors.blue} />
            <Text style={styles.reviewText}>
              {t('plantDetail.review', { count: requiredDays })}
            </Text>
          </View>
        )}

        {requiredDays > 0 && (
          <>
            <Text style={styles.section}>{t('plantDetail.days')}</Text>
            <View style={styles.chipRow}>
              {WEEKDAYS.map((day) => {
                const checked = values.wateringDays.includes(day);
                return (
                  <Pressable
                    key={day}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked }}
                    accessibilityLabel={weekdayName(day, 'EEEE')}
                    style={[styles.chip, checked && styles.chipActive]}
                    onPress={() => props.onToggleDay(day)}
                  >
                    <Text style={[styles.chipText, checked && styles.chipTextActive]}>
                      {weekdayName(day, 'EEE')}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.hint}>{t('plantDetail.pickDays', { count: requiredDays })}</Text>
          </>
        )}

        <Text style={styles.section}>{t('plantDetail.time')}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${t('plantDetail.time')}, ${values.reminderTime}`}
          style={({ pressed }) => [styles.timeRow, pressed && styles.pressed]}
          onPress={() => setTimeOpen(true)}
        >
          <Feather name="clock" size={18} color={colors.green_dark} />
          <Text style={styles.timeText}>{values.reminderTime}</Text>
          <Feather name="chevron-down" size={20} color={colors.body_dark} />
        </Pressable>

        <Text style={styles.section}>{t('plantDetail.lead')}</Text>
        <View style={styles.chipRow}>
          {LEADS.map((minutes) => {
            const checked = values.reminderLeadMinutes === minutes;
            const label = t('plantDetail.leadOption', { minutes });
            return (
              <Pressable
                key={minutes}
                accessibilityRole="radio"
                accessibilityState={{ checked }}
                accessibilityLabel={label}
                style={[styles.chip, checked && styles.chipActive]}
                onPress={() => props.onLeadChange(minutes)}
              >
                <Text
                  style={[styles.chipText, checked && styles.chipTextActive]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.8}
                >
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      <View style={[styles.saveBar, { paddingBottom: bottom + 16 }]}>
        {error && (
          <Text style={styles.error} accessibilityRole="alert">
            {t(`plantForm.errors.${error}`)}
          </Text>
        )}
        <View style={!canSave && styles.saveOff}>
          {saving ? (
            <View style={styles.saving}>
              <ActivityIndicator color={colors.white} accessibilityLabel={t('plantForm.saving')} />
            </View>
          ) : (
            <Button
              title={t('plantDetail.save')}
              onPress={props.onSave}
              disabled={!canSave}
              accessibilityState={{ disabled: !canSave }}
            />
          )}
        </View>
      </View>

      <TimeSheet
        visible={timeOpen}
        value={values.reminderTime}
        onSelect={(time) => {
          props.onTimeChange(time);
          setTimeOpen(false);
        }}
        onClose={() => setTimeOpen(false)}
      />
      <PhotoSheet
        visible={photoOpen}
        hasPhoto={plant.hasPhoto}
        onChoose={props.onPhoto}
        onClose={() => setPhotoOpen(false)}
      />
    </View>
  );
}

/** A plant in the garden: its species, care facts and editable watering schedule. */
export function PlantDetail() {
  const route = useRoute<RouteProp<RootStackParamList, 'PlantDetail'>>();
  const navigation = useNavigation();
  const { t } = useTranslation();
  const { top } = useSafeAreaInsets();
  const detail = usePlantDetail({ userPlantId: route.params.userPlantId });

  if (detail.load === 'ready' && detail.plant) {
    return (
      <PlantDetailView
        plant={detail.plant}
        values={detail.values}
        requiredDays={detail.requiredDays}
        needsReview={detail.needsReview}
        canSave={detail.canSave}
        saving={detail.saving}
        error={detail.error}
        photoSource={detail.photoSource}
        photoBusy={detail.photoBusy}
        photoMessage={detail.photoMessage}
        onBack={() => navigation.goBack()}
        onToggleDay={detail.toggleDay}
        onTimeChange={detail.setReminderTime}
        onLeadChange={detail.setLead}
        onSave={() => void detail.save()}
        onPhoto={(choice) =>
          void (choice === 'remove' ? detail.removePhoto() : detail.changePhoto(choice))
        }
        onSavedPhotoError={() => void detail.handleSavedPhotoError()}
      />
    );
  }

  if (detail.load === 'loading' || detail.load === 'ready') return <Load />;

  return (
    <View style={[styles.container, { paddingTop: top }]}>
      <TouchableOpacity
        style={styles.errorBack}
        onPress={() => navigation.goBack()}
        accessibilityRole="button"
        accessibilityLabel={t('plantDetail.back')}
        hitSlop={8}
      >
        <Feather name="chevron-left" size={28} color={colors.heading} />
      </TouchableOpacity>
      <View style={styles.center}>
        <Text style={styles.error} accessibilityRole="alert">
          {t(detail.load.error === 'network' ? 'plantForm.errors.network' : 'plantForm.loadError')}
        </Text>
        <View style={styles.retry}>
          <Button title={t('plantForm.retry')} onPress={detail.retryLoad} />
        </View>
      </View>
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
  topBar: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
  },
  photoWrap: {
    alignItems: 'center',
    marginTop: -PHOTO_SIZE / 2,
  },
  photoCircle: {
    width: PHOTO_SIZE,
    height: PHOTO_SIZE,
    borderRadius: PHOTO_SIZE / 2,
    borderWidth: 4,
    borderColor: colors.white,
    backgroundColor: colors.shape,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  photo: {
    width: '100%',
    height: '100%',
  },
  photoBusy: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
  },
  placeholder: {
    fontSize: 48,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 30,
    paddingTop: 12,
    paddingBottom: 28,
  },
  photoMessage: {
    marginBottom: 8,
    textAlign: 'center',
    color: colors.body_dark,
    fontFamily: fonts.text,
    fontSize: 13,
  },
  name: {
    textAlign: 'center',
    fontSize: 24,
    color: colors.heading,
    fontFamily: fonts.heading,
  },
  scientific: {
    textAlign: 'center',
    fontSize: 15,
    color: colors.body_dark,
    fontFamily: fonts.italic,
  },
  about: {
    marginTop: 12,
    textAlign: 'center',
    fontSize: 15,
    lineHeight: 22,
    color: colors.body_dark,
    fontFamily: fonts.text,
  },
  tiles: {
    marginTop: 20,
  },
  review: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 20,
    padding: 14,
    borderRadius: 16,
    backgroundColor: colors.blue_light,
  },
  reviewText: {
    flex: 1,
    marginLeft: 10,
    fontSize: 14,
    lineHeight: 20,
    color: colors.blue,
    fontFamily: fonts.text,
  },
  section: {
    marginTop: 24,
    marginBottom: 10,
    fontSize: 15,
    color: colors.heading,
    fontFamily: fonts.heading,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 6,
  },
  chip: {
    flex: 1,
    height: 44,
    paddingHorizontal: 2,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.shape,
  },
  chipActive: {
    backgroundColor: colors.green_light,
  },
  chipText: {
    fontSize: 13,
    color: colors.heading,
    fontFamily: fonts.text,
  },
  chipTextActive: {
    color: colors.green_dark,
    fontFamily: fonts.heading,
  },
  hint: {
    marginTop: 8,
    fontSize: 13,
    color: colors.body_dark,
    fontFamily: fonts.text,
  },
  timeRow: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: colors.shape,
  },
  pressed: {
    opacity: 0.6,
  },
  timeText: {
    flex: 1,
    marginLeft: 10,
    fontSize: 17,
    color: colors.heading,
    fontFamily: fonts.heading,
  },
  saveBar: {
    paddingTop: 16,
    paddingHorizontal: 30,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.shape,
  },
  saveOff: {
    opacity: 0.5,
  },
  saving: {
    backgroundColor: colors.green,
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  error: {
    marginBottom: 12,
    textAlign: 'center',
    color: colors.red,
    fontFamily: fonts.text,
    fontSize: 15,
  },
  errorBack: {
    marginLeft: 30,
    marginTop: 8,
    width: 40,
    height: 40,
    justifyContent: 'center',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 30,
  },
  retry: {
    width: '100%',
    marginTop: 20,
  },
});
