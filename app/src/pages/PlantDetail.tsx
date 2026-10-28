import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { SvgFromUri } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import type { UserPlant } from '@plantcare/shared';

import { assetUrl } from '../api/config';
import type { plantPhotoSource } from '../api/endpoints';
import { Button } from '../components/Button';
import { CareTiles } from '../components/CareTiles';
import { HeroHeader } from '../components/HeroHeader';
import { DaysSheet } from '../components/DaysSheet';
import { LeadInfoSheet } from '../components/LeadInfoSheet';
import { Load } from '../components/Load';
import { PhotoSheet, type PhotoChoice } from '../components/PhotoSheet';
import { PlantHealth } from '../components/PlantHealth';
import { isIllustration } from '../components/SpeciesImage';
import { Tappable } from '../components/Tappable';
import { TimeSheet } from '../components/TimeSheet';
import { Toast } from '../components/Toast';
import type { ScheduleValues } from '../plants/savePlant';
import {
  usePlantDetail,
  type FormError,
  type PhotoMessage,
  type SavingField,
} from '../plants/usePlantDetail';
import { WEEKDAYS, weekdayName } from '../plants/weekdays';
import type { RootStackParamList } from '../routes/stack.routes';
import colors from '../styles/colors';
import fonts from '../styles/fonts';

/** Ripple for the buttons on the green header. */
const LIGHT_RIPPLE = 'rgba(255, 255, 255, 0.3)';

const LEADS = [5, 10, 15, 20, 25, 30];

export interface PlantDetailViewProps {
  plant: UserPlant;
  values: ScheduleValues;
  requiredDays: number;
  needsReview: boolean;
  savingField: SavingField | null;
  /** True for a moment after a save, for the "Saved" toast. */
  saved: boolean;
  error: FormError | null;
  photoSource: ReturnType<typeof plantPhotoSource>;
  photoBusy: boolean;
  photoMessage: PhotoMessage | null;
  onBack: () => void;
  removing: boolean;
  onRemove: () => void;
  /** Resolves true once the days are stored. */
  onSaveDays: (days: number[]) => Promise<boolean>;
  onTimeChange: (time: string) => void;
  onLeadChange: (minutes: number) => void;
  onPhoto: (choice: PhotoChoice) => void;
  onSavedPhotoError: () => void;
}

/** The plant detail screen itself, driven only by its props. */
export function PlantDetailView(props: PlantDetailViewProps) {
  const { plant, values, requiredDays, needsReview, savingField, error } = props;
  const { t } = useTranslation();
  const { bottom } = useSafeAreaInsets();
  const [daysOpen, setDaysOpen] = useState(false);
  const [timeOpen, setTimeOpen] = useState(false);
  const [leadInfoOpen, setLeadInfoOpen] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);
  const [illustrationGone, setIllustrationGone] = useState(false);
  // Credited only while the species photo is the one on screen.
  const credit = !props.photoSource && !illustrationGone ? plant.imageCredit : null;

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
    if (plant.imageUrl && !illustrationGone && !isIllustration(plant.imageUrl)) {
      return (
        <Image
          testID="species-photo"
          source={{ uri: assetUrl(plant.imageUrl) }}
          style={styles.photo}
          onError={() => setIllustrationGone(true)}
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
      <HeroHeader
        left={
          <Tappable
            rippleColor={LIGHT_RIPPLE}
            style={styles.headerButton}
            onPress={props.onBack}
            accessibilityRole="button"
            accessibilityLabel={t('plantDetail.back')}
            hitSlop={8}
          >
            <Feather name="chevron-left" size={28} color={colors.white} />
          </Tappable>
        }
        right={
          <Tappable
            rippleColor={LIGHT_RIPPLE}
            style={styles.headerButton}
            onPress={() => setPhotoOpen(true)}
            disabled={props.photoBusy}
            accessibilityRole="button"
            accessibilityLabel={t('plantDetail.editPhoto')}
            hitSlop={8}
          >
            <Feather name="edit-2" size={20} color={colors.white} />
          </Tappable>
        }
      >
        {renderPicture()}
        {props.photoBusy && (
          <View style={styles.photoBusy}>
            <ActivityIndicator color={colors.white} />
          </View>
        )}
      </HeroHeader>

      {/* Only this part scrolls; the header above stays put. */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {props.photoMessage && (
          <Text style={styles.photoMessage}>
            {t(`plantForm.photoMessages.${props.photoMessage}`)}
          </Text>
        )}
        <Text style={styles.name}>{plant.speciesName}</Text>
        <Text style={styles.scientific}>{plant.scientificName}</Text>
        {credit && (
          <Text
            accessibilityRole="link"
            style={styles.credit}
            onPress={() => void Linking.openURL(credit.source)}
          >
            {t('plantDetail.photoCredit', { author: credit.author, license: credit.license })}
          </Text>
        )}
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
            <View style={styles.sectionRow}>
              <Text style={styles.sectionTitle}>{t('plantDetail.days')}</Text>
              <Tappable
                style={styles.sectionButton}
                onPress={() => setDaysOpen(true)}
                accessibilityRole="button"
                accessibilityLabel={t('plantDetail.editDays')}
                hitSlop={8}
              >
                <Feather name="edit-2" size={16} color={colors.green_dark} />
              </Tappable>
            </View>
            <View style={styles.chipRow}>
              {WEEKDAYS.map((day) => {
                const selected = values.wateringDays.includes(day);
                return (
                  <View
                    key={day}
                    accessible
                    accessibilityRole="text"
                    accessibilityState={{ selected }}
                    accessibilityLabel={weekdayName(day, 'EEEE')}
                    style={[styles.chip, selected && styles.chipActive]}
                  >
                    <Text style={[styles.chipText, selected && styles.chipTextActive]}>
                      {weekdayName(day, 'EEE')}
                    </Text>
                  </View>
                );
              })}
            </View>
          </>
        )}

        <Text style={[styles.sectionTitle, styles.section]}>{t('plantDetail.time')}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${t('plantDetail.time')}, ${values.reminderTime}`}
          style={({ pressed }) => [styles.timeRow, pressed && styles.pressed]}
          onPress={() => setTimeOpen(true)}
        >
          <Feather name="clock" size={18} color={colors.green_dark} />
          <Text style={styles.timeText}>{values.reminderTime}</Text>
          {savingField === 'time' ? (
            <ActivityIndicator color={colors.green_dark} accessibilityLabel={t('plantForm.saving')} />
          ) : (
            <Feather name="chevron-down" size={20} color={colors.body_dark} />
          )}
        </Pressable>

        <View style={[styles.sectionRow, styles.labelWithInfo]}>
          <Text style={styles.sectionTitle}>{t('plantDetail.lead')}</Text>
          <Tappable
            style={styles.infoButton}
            onPress={() => setLeadInfoOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={t('plantDetail.leadInfo')}
            hitSlop={10}
          >
            <Feather name="info" size={16} color={colors.body_dark} />
          </Tappable>
        </View>
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
                style={({ pressed }) => [
                  styles.chip,
                  checked && styles.chipActive,
                  pressed && styles.pressed,
                ]}
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

        <View style={styles.sick}>
          <PlantHealth plant={plant} />
        </View>

        {/* For people who never find the swipe on My plants. */}
        <Tappable
          style={styles.remove}
          rippleColor={LIGHT_RIPPLE}
          onPress={props.onRemove}
          disabled={props.removing}
          accessibilityRole="button"
          accessibilityLabel={t('plantDetail.remove')}
          accessibilityState={{ disabled: props.removing, busy: props.removing }}
        >
          {props.removing ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <>
              <Feather name="trash-2" size={18} color={colors.white} />
              <Text style={styles.removeText}>{t('plantDetail.remove')}</Text>
            </>
          )}
        </Tappable>
      </ScrollView>

      {/* Stays until the next save, so it takes its own room instead of covering the content. */}
      {error && (
        <View style={[styles.errorBar, { paddingBottom: bottom + 12 }]}>
          <Text style={styles.errorText} accessibilityRole="alert">
            {t(`plantForm.errors.${error}`)}
          </Text>
        </View>
      )}
      <View style={[styles.toastArea, { bottom: bottom + 24 }]} pointerEvents="none">
        <Toast visible={props.saved} text={t('plantDetail.saved')} />
      </View>

      <DaysSheet
        visible={daysOpen}
        required={requiredDays}
        initialDays={values.wateringDays}
        saving={savingField === 'days'}
        error={error}
        onSave={props.onSaveDays}
        onClose={() => setDaysOpen(false)}
      />
      <TimeSheet
        visible={timeOpen}
        value={values.reminderTime}
        onSelect={(time) => {
          props.onTimeChange(time);
          setTimeOpen(false);
        }}
        onClose={() => setTimeOpen(false)}
      />
      <LeadInfoSheet
        visible={leadInfoOpen}
        minutes={values.reminderLeadMinutes}
        onClose={() => setLeadInfoOpen(false)}
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

  // The same confirmation as the swipe on My plants.
  function confirmRemove(plant: UserPlant | null) {
    if (!plant) return;
    Alert.alert(t('myPlants.removeTitle', { name: plant.speciesName }), undefined, [
      { text: t('myPlants.cancel'), style: 'cancel' },
      {
        text: t('myPlants.remove'),
        style: 'destructive',
        onPress: () => {
          void detail.removePlant().then((removed) => {
            if (removed) navigation.goBack();
            else Alert.alert(t('myPlants.removeError'));
          });
        },
      },
    ]);
  }

  if (detail.load === 'ready' && detail.plant) {
    return (
      <PlantDetailView
        plant={detail.plant}
        values={detail.values}
        requiredDays={detail.requiredDays}
        needsReview={detail.needsReview}
        savingField={detail.savingField}
        saved={detail.saved}
        error={detail.error}
        photoSource={detail.photoSource}
        photoBusy={detail.photoBusy}
        photoMessage={detail.photoMessage}
        onBack={() => navigation.goBack()}
        removing={detail.removing}
        onRemove={() => confirmRemove(detail.plant)}
        onSaveDays={detail.saveDays}
        onTimeChange={(time) => void detail.saveReminderTime(time)}
        onLeadChange={(minutes) => void detail.saveLead(minutes)}
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
      <Tappable
        style={styles.errorBack}
        onPress={() => navigation.goBack()}
        accessibilityRole="button"
        accessibilityLabel={t('plantDetail.back')}
        hitSlop={8}
      >
        <Feather name="chevron-left" size={28} color={colors.heading} />
      </Tappable>
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
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
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
  credit: {
    marginTop: 4,
    textAlign: 'center',
    fontSize: 12,
    color: colors.body_light,
    fontFamily: fonts.text,
    textDecorationLine: 'underline',
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
  },
  sectionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 32,
    marginTop: 24,
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 15,
    color: colors.heading,
    fontFamily: fonts.heading,
  },
  sectionButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.green_light,
  },
  labelWithInfo: {
    justifyContent: 'flex-start',
  },
  infoButton: {
    marginLeft: 6,
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
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
  sick: {
    marginTop: 36,
  },
  remove: {
    marginTop: 16,
    height: 56,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.red,
  },
  removeText: {
    marginLeft: 8,
    fontSize: 15,
    color: colors.white,
    fontFamily: fonts.heading,
  },
  toastArea: {
    position: 'absolute',
    left: 30,
    right: 30,
    alignItems: 'center',
  },
  errorBar: {
    paddingTop: 12,
    paddingHorizontal: 30,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.shape,
  },
  errorText: {
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 20,
    color: colors.red,
    fontFamily: fonts.text,
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
