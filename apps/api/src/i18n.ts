import path from 'path';
import i18next from 'i18next';
import Backend from 'i18next-fs-backend';

export const initI18n = async (): Promise<void> => {
  await i18next.use(Backend).init({
    fallbackLng: 'en',
    supportedLngs: ['en'],
    backend: { loadPath: path.join(__dirname, 'locales/{{lng}}.json') },
    interpolation: { escapeValue: false },
    initImmediate: false,
  });
};

export { i18next };
