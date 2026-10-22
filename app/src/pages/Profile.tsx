import React from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';

import { useAuth } from '../auth/AuthProvider';
import { LANGUAGES, Language, currentLanguage } from '../i18n';
import colors from '../styles/colors';
import fonts from '../styles/fonts';

export function Profile() {
  const navigation = useNavigation();
  // Re-renders this screen when the language changes, so the selection and labels update at once.
  const { t } = useTranslation();
  const { status, user, signOut, setLanguage } = useAuth();
  const selected = currentLanguage();

  async function handleSelect(language: Language) {
    if (language === selected) return;
    await setLanguage(language);
  }

  async function handleSignOut() {
    try {
      await signOut();
    } catch {
      Alert.alert(t('profile.signOutError'));
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <Text style={styles.title}>{t('profile.title')}</Text>

      <Text style={styles.sectionTitle}>{t('profile.language')}</Text>
      <View style={styles.options}>
        {LANGUAGES.map((language, index) => {
          const active = language === selected;
          return (
            <TouchableOpacity
              key={language}
              style={[styles.option, index > 0 && styles.optionDivider]}
              onPress={() => void handleSelect(language)}
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

      {status !== 'loading' && (
        <>
          <Text style={[styles.sectionTitle, styles.accountTitle]}>{t('profile.account')}</Text>
          <View style={styles.options}>
            {status === 'signedIn' ? (
              <>
                {user && (
                  <View style={styles.option}>
                    <View>
                      <Text style={styles.optionTextActive}>{user.name}</Text>
                      {user.email && <Text style={styles.optionText}>{user.email}</Text>}
                    </View>
                  </View>
                )}
                <TouchableOpacity
                  style={[styles.option, user !== null && styles.optionDivider]}
                  onPress={() => void handleSignOut()}
                  accessibilityRole="button"
                  activeOpacity={0.7}
                >
                  <Text style={styles.optionText}>{t('profile.signOut')}</Text>
                </TouchableOpacity>
              </>
            ) : (
              <TouchableOpacity
                style={styles.option}
                onPress={() => navigation.navigate('Auth', { mode: 'signIn' })}
                accessibilityRole="button"
                activeOpacity={0.7}
              >
                <Text style={styles.optionText}>{t('profile.signIn')}</Text>
                <Feather name="chevron-right" size={20} color={colors.heading} />
              </TouchableOpacity>
            )}
          </View>
          {status === 'signedOut' && <Text style={styles.hint}>{t('profile.signedOutHint')}</Text>}
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 30,
    backgroundColor: colors.background,
  },
  title: {
    marginTop: 12,
    marginBottom: 32,
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
  accountTitle: {
    marginTop: 28,
  },
  hint: {
    marginTop: 10,
    fontSize: 14,
    fontFamily: fonts.text,
    color: colors.body_dark,
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
