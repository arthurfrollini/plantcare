import React, { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SvgFromUri } from 'react-native-svg';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute, type RouteProp } from '@react-navigation/native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { format } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { lightSchema, type Light } from '@plantcare/shared';

import { assetUrl } from '../api/config';
import { Button } from '../components/Button';
import { PhotoPicker } from '../components/PhotoPicker';
import { usePlantForm } from '../plants/usePlantForm';
import type { RootStackParamList } from '../routes/stack.routes';
import colors from '../styles/colors';
import fonts from '../styles/fonts';

const LIGHTS: Light[] = lightSchema.options;
const TIMES = [1, 2, 3, 4, 5, 6, 7];

function timeToDate(time: string): Date {
  const [hours = '8', minutes = '0'] = time.split(':');
  const date = new Date();
  date.setHours(Number(hours), Number(minutes), 0, 0);
  return date;
}

export function PlantForm() {
  const route = useRoute<RouteProp<RootStackParamList, 'PlantForm'>>();
  const { t } = useTranslation();
  const form = usePlantForm(route.params);
  const [showPicker, setShowPicker] = useState(Platform.OS === 'ios');

  function handleChangeTime(_event: unknown, date: Date) {
    if (Platform.OS === 'android') setShowPicker(false);
    form.setReminderTime(format(date, 'HH:mm'));
  }

  if (form.load.state !== 'ready' || !form.species) {
    return (
      <SafeAreaView style={styles.center}>
        {form.load.state === 'error' ? (
          <>
            <Text style={styles.error} accessibilityRole="alert">
              {t(
                form.load.error === 'network' ? 'plantForm.errors.network' : 'plantForm.loadError',
              )}
            </Text>
            <View style={styles.retry}>
              <Button title={t('plantForm.retry')} onPress={form.retryLoad} />
            </View>
          </>
        ) : (
          <ActivityIndicator color={colors.green} accessibilityLabel={t('auth.loading')} />
        )}
      </SafeAreaView>
    );
  }

  const { species, frequency } = form;
  const illustration = species.imageUrl ? assetUrl(species.imageUrl) : null;

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            {form.photo || form.savedPhoto ? (
              <Image
                source={form.photo ? { uri: form.photo.uri } : form.savedPhoto ?? undefined}
                style={styles.headerPhoto}
                onError={form.photo ? undefined : () => void form.handleSavedPhotoError()}
                accessibilityIgnoresInvertColors
              />
            ) : (
              illustration && <SvgFromUri uri={illustration} width={120} height={120} />
            )}
            <Text style={styles.speciesName}>{species.name}</Text>
            <Text style={styles.scientific}>{species.scientificName}</Text>
          </View>

          <Text style={styles.label}>{t('plantForm.nickname')}</Text>
          <TextInput
            style={styles.input}
            value={form.nickname}
            onChangeText={form.setNickname}
            placeholder={t('plantForm.nicknamePlaceholder')}
            accessibilityLabel={t('plantForm.nickname')}
            maxLength={40}
            editable={!form.saving}
          />

          <Text style={styles.label}>{t('plantForm.frequency')}</Text>
          <View style={styles.chips}>
            {(['day', 'week'] as const).map((per) => (
              <Chip
                key={per}
                label={t(per === 'day' ? 'plantForm.perDay' : 'plantForm.perWeek')}
                selected={frequency.per === per}
                onPress={() => form.setPer(per)}
              />
            ))}
          </View>
          {frequency.per === 'week' && (
            <View style={styles.chips}>
              {TIMES.map((n) => (
                <Chip
                  key={n}
                  label={String(n)}
                  accessibilityLabel={t('plantForm.times', { count: n })}
                  selected={frequency.times === n}
                  onPress={() => form.setTimes(n)}
                />
              ))}
            </View>
          )}

          <Text style={styles.label}>{t('plantForm.reminderTime')}</Text>
          {Platform.OS === 'android' && (
            <TouchableOpacity onPress={() => setShowPicker(true)} accessibilityRole="button">
              <Text style={styles.time}>
                {t('plantForm.changeTime', { time: form.reminderTime })}
              </Text>
            </TouchableOpacity>
          )}
          {showPicker && (
            <DateTimePicker
              value={timeToDate(form.reminderTime)}
              mode="time"
              display="spinner"
              onValueChange={handleChangeTime}
              onDismiss={() => setShowPicker(Platform.OS === 'ios')}
            />
          )}

          <Text style={styles.label}>{t('plantForm.light')}</Text>
          <View style={styles.chips}>
            {LIGHTS.map((light) => (
              <Chip
                key={light}
                label={t(`light.${light}`)}
                selected={form.light === light}
                onPress={() => form.setLight(form.light === light ? null : light)}
              />
            ))}
          </View>

          <Text style={styles.label}>{t('plantForm.notes')}</Text>
          <TextInput
            style={[styles.input, styles.notes]}
            value={form.notes}
            onChangeText={form.setNotes}
            placeholder={t('plantForm.notesPlaceholder')}
            accessibilityLabel={t('plantForm.notes')}
            maxLength={500}
            multiline
            editable={!form.saving}
          />

          <Text style={styles.label}>{t('plantForm.photo')}</Text>
          <PhotoPicker
            hasPicked={form.photo !== null}
            message={form.photoMessage}
            disabled={form.saving}
            onCamera={() => void form.pickPhoto('camera')}
            onGallery={() => void form.pickPhoto('gallery')}
            onRemove={form.removePhoto}
          />

          {form.error && (
            <Text style={styles.error} accessibilityRole="alert">
              {t(`plantForm.errors.${form.error}`)}
            </Text>
          )}

          <View style={styles.footer}>
            {form.saving ? (
              <View style={styles.saving} accessibilityLabel={t('plantForm.saving')}>
                <ActivityIndicator color={colors.white} />
              </View>
            ) : (
              <Button
                title={t(form.error === 'network' ? 'plantForm.retry' : 'plantForm.saveEdit')}
                onPress={() => void form.submit()}
                disabled={form.status === 'loading'}
              />
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

type ChipProps = {
  label: string;
  selected: boolean;
  onPress: () => void;
  accessibilityLabel?: string;
};

function Chip({ label, selected, onPress, accessibilityLabel }: ChipProps) {
  return (
    <TouchableOpacity
      style={[styles.chip, selected && styles.chipSelected]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected }}
    >
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 30,
    backgroundColor: colors.white,
  },
  content: { padding: 24, paddingBottom: 40 },
  header: { alignItems: 'center', marginBottom: 16 },
  headerPhoto: { width: 160, height: 160, borderRadius: 80, backgroundColor: colors.shape },
  speciesName: {
    fontFamily: fonts.heading,
    fontSize: 24,
    color: colors.heading,
    marginTop: 12,
  },
  scientific: {
    fontFamily: fonts.text,
    fontSize: 15,
    fontStyle: 'italic',
    color: colors.body_dark,
  },
  label: {
    fontFamily: fonts.complement,
    fontSize: 14,
    color: colors.heading,
    marginTop: 20,
    marginBottom: 8,
  },
  input: {
    borderBottomWidth: 1,
    borderColor: colors.gray,
    color: colors.heading,
    fontSize: 18,
    padding: 10,
  },
  notes: { minHeight: 70, textAlignVertical: 'top' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.shape,
  },
  chipSelected: { backgroundColor: colors.green },
  chipText: { fontFamily: fonts.text, fontSize: 15, color: colors.heading },
  chipTextSelected: { color: colors.white },
  time: {
    fontFamily: fonts.text,
    fontSize: 24,
    color: colors.heading,
    textAlign: 'center',
    paddingVertical: 12,
  },
  error: {
    color: colors.red,
    fontFamily: fonts.text,
    fontSize: 15,
    marginTop: 16,
    textAlign: 'center',
  },
  retry: { width: '100%', marginTop: 20 },
  footer: { marginTop: 28 },
  saving: {
    backgroundColor: colors.green,
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
