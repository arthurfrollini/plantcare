import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Locale } from 'date-fns';
import { enUS, ptBR as ptBRDates } from 'date-fns/locale';

import en from './locales/en';
import ptBR from './locales/pt-BR';

export const LANGUAGES = ['en', 'pt-BR'] as const;
export type Language = (typeof LANGUAGES)[number];

const STORAGE_KEY = '@plantcare:language';

const DATE_LOCALES: Record<Language, Locale> = {
  en: enUS,
  'pt-BR': ptBRDates,
};

function isLanguage(value: string | null): value is Language {
  return LANGUAGES.some((language) => language === value);
}

export function currentLanguage(): Language {
  return isLanguage(i18n.language) ? i18n.language : 'en';
}

export function dateLocale(): Locale {
  return DATE_LOCALES[currentLanguage()];
}

/** English unless the user picked another language in Profile. */
export async function initI18n() {
  const saved = await AsyncStorage.getItem(STORAGE_KEY);

  await i18n.use(initReactI18next).init({
    resources: {
      en: { translation: en },
      'pt-BR': { translation: ptBR },
    },
    lng: isLanguage(saved) ? saved : 'en',
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
  });
}

export async function changeLanguage(language: Language) {
  await i18n.changeLanguage(language);
  await AsyncStorage.setItem(STORAGE_KEY, language);
}

export default i18n;
