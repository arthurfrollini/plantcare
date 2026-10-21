import 'i18next';
import type en from './locales/en';

// Makes t('some.key') a compile error when the key does not exist in the English resources.
declare module 'i18next' {
  interface CustomTypeOptions {
    resources: { translation: typeof en };
  }
}
