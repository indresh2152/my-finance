import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import commonEn from './locales/en/common.json';
import authEn from './locales/en/auth.json';
import cardsEn from './locales/en/cards.json';
import panEn from './locales/en/pan.json';

void i18next
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: 'en',
    supportedLngs: ['en'],
    resources: {
      en: {
        common: commonEn,
        auth: authEn,
        cards: cardsEn,
        pan: panEn,
      },
    },
    interpolation: { escapeValue: false },
    detection: { order: ['navigator'], caches: [] },
  });

export default i18next;
