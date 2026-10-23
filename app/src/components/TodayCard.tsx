import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { differenceInCalendarDays, format } from 'date-fns';
import { useTranslation } from 'react-i18next';
import type { UserPlant } from '@plantcare/shared';

import { PlantPicture } from './PlantPicture';
import { Tappable } from './Tappable';
import { dateLocale } from '../i18n';
import type { TodayRow } from '../plants/today';
import colors from '../styles/colors';
import fonts from '../styles/fonts';

export interface TodayCardProps {
  /** Today's waterings, already in order. */
  rows: TodayRow[];
  /** The first watering after today, for a day with nothing to water. */
  next: { plant: UserPlant; at: Date } | null;
  accessToken: string | null;
  /** The plant whose watering is being saved; its row cannot be tapped meanwhile. */
  busyId: string | null;
  /** Marks a pending row watered, or undoes a done one. */
  onToggle: (row: TodayRow) => void;
  onOpen: (plant: UserPlant) => void;
  /** A photo failed once; refreshes the session and returns the token now in use. */
  onPhotoError?: () => Promise<string | null>;
}

const PICTURE_SIZE = 40;

/** The top of My plants: what to water today, ticked off one by one. */
export function TodayCard({
  rows,
  next,
  accessToken,
  busyId,
  onToggle,
  onOpen,
  onPhotoError,
}: TodayCardProps) {
  const { t } = useTranslation();
  const total = rows.length;
  const done = rows.filter((row) => row.done).length;

  // Built on render so the words follow the language and the day.
  function describeNext(at: Date) {
    const time = format(at, 'HH:mm');
    const days = differenceInCalendarDays(at, new Date());
    if (days <= 1) return t('today.tomorrowAt', { time });
    const locale = dateLocale();
    // Within the coming week a weekday is unambiguous; past it, the date.
    if (days < 7) return t('today.weekdayAt', { day: format(at, 'EEEE', { locale }), time });
    return t('today.dateAt', { date: format(at, t('today.dateFormat'), { locale }), time });
  }

  return (
    <View testID="today-card" style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title} accessibilityRole="header">
          {t('today.title')}
        </Text>
        {total > 0 && (
          <View style={styles.count}>
            <Text style={styles.countText}>{t('today.progress', { done, total })}</Text>
            <Text style={styles.drop} importantForAccessibility="no" accessibilityElementsHidden>
              💧
            </Text>
          </View>
        )}
      </View>

      {total > 0 ? (
        <>
          <View
            testID="today-progress"
            style={styles.track}
            accessibilityRole="progressbar"
            accessibilityValue={{ min: 0, max: total, now: done }}
          >
            <View style={[styles.fill, { flex: done }]} />
            <View style={{ flex: total - done }} />
          </View>
          {done === total && <Text style={styles.message}>{t('today.allDone')}</Text>}
          <View style={styles.rows}>
            {rows.map((row) => (
              <Row
                key={row.plant.id}
                row={row}
                busy={busyId === row.plant.id}
                accessToken={accessToken}
                onToggle={onToggle}
                onOpen={onOpen}
                onPhotoError={onPhotoError}
              />
            ))}
          </View>
        </>
      ) : (
        <>
          <Text style={styles.message}>{t('today.nothing')}</Text>
          {next && (
            <Text style={styles.next}>
              {t('today.next', { name: next.plant.speciesName, when: describeNext(next.at) })}
            </Text>
          )}
        </>
      )}
    </View>
  );
}

interface RowProps {
  row: TodayRow;
  busy: boolean;
  accessToken: string | null;
  onToggle: (row: TodayRow) => void;
  onOpen: (plant: UserPlant) => void;
  onPhotoError?: () => Promise<string | null>;
}

function Row({ row, busy, accessToken, onToggle, onOpen, onPhotoError }: RowProps) {
  const { t } = useTranslation();
  const { plant, done, late } = row;

  return (
    <View testID="today-row" style={styles.row}>
      <Tappable style={styles.plant} onPress={() => onOpen(plant)} accessibilityRole="button">
        <PlantPicture
          plant={plant}
          accessToken={accessToken}
          size={PICTURE_SIZE}
          onPhotoError={onPhotoError}
        />
        <View style={styles.names}>
          <Text testID="today-name" style={styles.name} numberOfLines={1}>
            {plant.speciesName}
          </Text>
          <View style={styles.when}>
            <Text testID="today-time" style={[styles.time, late && styles.timeLate]}>
              {format(row.time, 'HH:mm')}
            </Text>
            {late && <Text style={styles.late}>{t('today.late')}</Text>}
          </View>
        </View>
      </Tappable>

      <Tappable
        style={[styles.button, done ? styles.buttonDone : styles.buttonWater]}
        rippleColor={done ? undefined : 'rgba(255, 255, 255, 0.3)'}
        onPress={() => onToggle(row)}
        disabled={busy}
        accessibilityRole="button"
        accessibilityHint={done ? t('today.undoHint') : undefined}
        accessibilityState={{ checked: done, busy }}
      >
        {/* The label keeps its room while a spinner covers it, so the row does not shift. */}
        <Text
          style={[done ? styles.doneText : styles.waterText, busy && styles.hidden]}
          numberOfLines={1}
        >
          {done ? t('today.watered') : t('today.water')}
        </Text>
        {busy && (
          <ActivityIndicator
            style={StyleSheet.absoluteFill}
            size="small"
            color={done ? colors.green_dark : colors.white}
          />
        )}
      </Tappable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 20,
    borderRadius: 25,
    backgroundColor: colors.green_light,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 22,
    fontFamily: fonts.heading,
    color: colors.heading,
  },
  count: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  countText: {
    fontSize: 15,
    fontFamily: fonts.heading,
    color: colors.green_dark,
  },
  drop: {
    fontSize: 14,
  },
  track: {
    flexDirection: 'row',
    height: 8,
    marginTop: 12,
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: colors.white,
  },
  fill: {
    borderRadius: 4,
    backgroundColor: colors.green,
  },
  message: {
    marginTop: 12,
    fontSize: 16,
    fontFamily: fonts.heading,
    color: colors.green_dark,
  },
  next: {
    marginTop: 4,
    fontSize: 15,
    fontFamily: fonts.text,
    color: colors.body_dark,
  },
  rows: {
    marginTop: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
  },
  plant: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 2,
    borderRadius: 12,
  },
  names: {
    flex: 1,
    marginLeft: 12,
    marginRight: 8,
  },
  name: {
    fontSize: 16,
    fontFamily: fonts.heading,
    color: colors.heading,
  },
  when: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  time: {
    fontSize: 14,
    fontFamily: fonts.text,
    color: colors.body_dark,
  },
  timeLate: {
    fontFamily: fonts.heading,
    color: colors.red,
  },
  late: {
    marginLeft: 6,
    fontSize: 13,
    fontFamily: fonts.heading,
    color: colors.red,
  },
  button: {
    minWidth: 104,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonWater: {
    backgroundColor: colors.green,
  },
  buttonDone: {
    backgroundColor: colors.white,
  },
  waterText: {
    fontSize: 14,
    fontFamily: fonts.heading,
    color: colors.white,
  },
  doneText: {
    fontSize: 14,
    fontFamily: fonts.heading,
    color: colors.green_dark,
  },
  hidden: {
    opacity: 0,
  },
});
