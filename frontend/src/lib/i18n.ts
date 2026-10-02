import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { en, type Translation } from "@/locales/en";
import { pt } from "@/locales/pt";

export const LANGUAGES = ["pt", "en"] as const;
export type Language = (typeof LANGUAGES)[number];

declare module "i18next" {
  interface CustomTypeOptions {
    resources: { translation: Translation };
  }
}

const STORAGE_KEY = "language";

function isLanguage(value: unknown): value is Language {
  return LANGUAGES.includes(value as Language);
}

export function browserLanguage(): Language {
  return navigator.language?.toLowerCase().startsWith("pt") ? "pt" : "en";
}

function storedLanguage(): Language | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return isLanguage(value) ? value : null;
  } catch {
    return null;
  }
}

/** Switch the UI language. `null` forgets the explicit choice and follows the browser again. */
export function setLanguage(language: Language | null) {
  try {
    if (language) localStorage.setItem(STORAGE_KEY, language);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage unavailable (private mode): the choice just won't survive a reload.
  }
  void i18n.changeLanguage(language ?? browserLanguage());
}

export function currentLanguage(): Language {
  return isLanguage(i18n.language) ? i18n.language : "en";
}

/** BCP 47 tag for Intl date/number formatting. */
export function intlLocale(): string {
  return currentLanguage() === "pt" ? "pt-PT" : "en";
}

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, pt: { translation: pt } },
  lng: storedLanguage() ?? browserLanguage(),
  fallbackLng: "en",
  interpolation: { escapeValue: false }, // React already escapes.
});

function applyToDocument() {
  document.documentElement.lang = i18n.language;
  document.title = i18n.t("app.name");
}
i18n.on("languageChanged", applyToDocument);
applyToDocument();

export default i18n;
