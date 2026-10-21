import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';

import { LANGUAGES, Language, changeLanguage, currentLanguage } from '../i18n';
import colors from '../styles/colors';
import fonts from '../styles/fonts';

export function Profile() {
  const navigation = useNavigation();
  // Re-renders this screen when the language changes, so the selection and labels update at once.
  const { t } = useTranslation();
  const selected = currentLanguage();

  function handleSelect(language: Language) {
    if (language !== selected) changeLanguage(language);
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel={t('profile.back')}
          hitSlop={12}
        >
          <Feather name="chevron-left" size={28} color={colors.heading} />
        </TouchableOpacity>
        <Text style={styles.title}>{t('profile.title')}</Text>
      </View>

      <Text style={styles.sectionTitle}>{t('profile.language')}</Text>
      <View style={styles.options}>
        {LANGUAGES.map((language, index) => {
          const active = language === selected;
          return (
            <TouchableOpacity
              key={language}
              style={[styles.option, index > 0 && styles.optionDivider]}
              onPress={() => handleSelect(language)}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              activeOpacity={0.7}
            >
              <Text style={[styles.optionText, active && styles.optionTextActive]}>
                {t(`languages.${language}`)}
              </Text>
              {active && <Feather name="check" size={20} color={colors.green} />}
            </TouchableOpacity>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 30,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    marginBottom: 32,
  },
  title: {
    fontSize: 28,
    fontFamily: fonts.heading,
    color: colors.heading,
  },
  sectionTitle: {
    fontSize: 13,
    fontFamily: fonts.heading,
    color: colors.body_dark,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  options: {
    backgroundColor: colors.shape,
    borderRadius: 16,
    overflow: 'hidden',
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  optionDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.gray,
  },
  optionText: {
    fontSize: 17,
    fontFamily: fonts.text,
    color: colors.heading,
  },
  optionTextActive: {
    fontFamily: fonts.heading,
    color: colors.green_dark,
  },
});
