import React, { useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { BottomSheet } from './BottomSheet';
import colors from '../styles/colors';
import fonts from '../styles/fonts';

const ROW_HEIGHT = 48;
const VISIBLE_ROWS = 6;

/** 00:00, 00:30 ... 23:30. */
export const HALF_HOURS = Array.from({ length: 48 }, (_, i) => {
  const hour = String(Math.floor(i / 2)).padStart(2, '0');
  return `${hour}:${i % 2 === 0 ? '00' : '30'}`;
});

/** The row to scroll to: the value's own row, or the half hour just before an off-grid value. */
function nearestRow(value: string): number {
  const index = HALF_HOURS.findIndex((time) => time > value);
  return Math.max(0, (index === -1 ? HALF_HOURS.length : index) - 1);
}

interface TimeSheetProps {
  visible: boolean;
  value: string;
  onSelect: (time: string) => void;
  onClose: () => void;
}

/** The reminder time, picked from a list of every half hour. */
export function TimeSheet({ visible, value, onSelect, onClose }: TimeSheetProps) {
  const { t } = useTranslation();
  const list = useRef<ScrollView>(null);
  // Keeps the current row in the middle of the list when the sheet opens.
  const offset = Math.max(0, (nearestRow(value) - Math.floor(VISIBLE_ROWS / 2) + 1) * ROW_HEIGHT);

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View style={styles.top}>
        <Text style={styles.title}>{t('plantDetail.time')}</Text>
        <Text style={styles.current}>{value}</Text>
      </View>
      <ScrollView
        ref={list}
        style={styles.list}
        showsVerticalScrollIndicator={false}
        onLayout={() => list.current?.scrollTo({ y: offset, animated: false })}
      >
        {HALF_HOURS.map((time) => {
          const selected = time === value;
          return (
            <Pressable
              key={time}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              accessibilityLabel={time}
              style={[styles.row, selected && styles.rowSelected]}
              onPress={() => onSelect(time)}
            >
              <Text style={[styles.time, selected && styles.timeSelected]}>{time}</Text>
              {selected && <Feather name="check" size={18} color={colors.green_dark} />}
            </Pressable>
          );
        })}
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  top: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 20,
    color: colors.heading,
    fontFamily: fonts.heading,
  },
  current: {
    fontSize: 20,
    color: colors.green_dark,
    fontFamily: fonts.heading,
  },
  list: {
    maxHeight: ROW_HEIGHT * VISIBLE_ROWS,
  },
  row: {
    height: ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  rowSelected: {
    backgroundColor: colors.green_light,
  },
  time: {
    fontSize: 17,
    color: colors.heading,
    fontFamily: fonts.text,
  },
  timeSelected: {
    color: colors.green_dark,
    fontFamily: fonts.heading,
  },
});
