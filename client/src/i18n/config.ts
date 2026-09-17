import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import type { LanguageMetadata, SupportedLanguage } from "./types";

import en from "./locales/en.json";
import id from "./locales/id.json";
import zhCN from "./locales/zh-CN.json";
import es from "./locales/es.json";
import de from "./locales/de.json";
import fr from "./locales/fr.json";
import ar from "./locales/ar.json";
import ru from "./locales/ru.json";
import ptBR from "./locales/pt-BR.json";
import hi from "./locales/hi.json";
import bn from "./locales/bn.json";
import ja from "./locales/ja.json";

export const SUPPORTED_LANGUAGES: LanguageMetadata[] = [
  { code: "en", name: "English", nativeName: "English", dir: "ltr", flagCode: "EN" },
  { code: "id", name: "Indonesian", nativeName: "Bahasa Indonesia", dir: "ltr", flagCode: "ID" },
  { code: "zh-CN", name: "Chinese (Simplified)", nativeName: "简体中文", dir: "ltr", flagCode: "CN" },
  { code: "de", name: "German", nativeName: "Deutsch", dir: "ltr", flagCode: "DE" },
  { code: "es", name: "Spanish", nativeName: "Español", dir: "ltr", flagCode: "ES" },
  { code: "fr", name: "French", nativeName: "Français", dir: "ltr", flagCode: "FR" },
  { code: "ar", name: "Arabic", nativeName: "العربية", dir: "rtl", flagCode: "AR" },
  { code: "ru", name: "Russian", nativeName: "Русский", dir: "ltr", flagCode: "RU" },
  { code: "pt-BR", name: "Portuguese (Brazil)", nativeName: "Português", dir: "ltr", flagCode: "BR" },
  { code: "hi", name: "Hindi", nativeName: "हिन्दी", dir: "ltr", flagCode: "IN" },
  { code: "bn", name: "Bengali", nativeName: "বাংলা", dir: "ltr", flagCode: "BD" },
  { code: "ja", name: "Japanese", nativeName: "日本語", dir: "ltr", flagCode: "JA" },
];

export const STORAGE_KEY = "meshflare_lang";

export function detectInitialLanguage(): SupportedLanguage {
  try {
    const saved = localStorage.getItem(STORAGE_KEY) as SupportedLanguage | null;
    if (saved && SUPPORTED_LANGUAGES.some((l) => l.code === saved)) {
      return saved;
    }
  } catch {
    /* localStorage disabled or restricted */
  }

  if (typeof navigator !== "undefined" && navigator.languages) {
    for (const lang of navigator.languages) {
      const lower = lang.toLowerCase();
      if (lower.startsWith("id")) return "id";
      if (lower.startsWith("zh")) return "zh-CN";
      if (lower.startsWith("de")) return "de";
      if (lower.startsWith("es")) return "es";
      if (lower.startsWith("fr")) return "fr";
      if (lower.startsWith("ar")) return "ar";
      if (lower.startsWith("ru")) return "ru";
      if (lower.startsWith("pt")) return "pt-BR";
      if (lower.startsWith("hi")) return "hi";
      if (lower.startsWith("bn")) return "bn";
      if (lower.startsWith("ja")) return "ja";
      if (lower.startsWith("en")) return "en";
    }
  }

  return "en";
}

export function syncDocumentDirection(code: string) {
  if (typeof document === "undefined") return;
  const meta = SUPPORTED_LANGUAGES.find((l) => l.code === code);
  const dir = meta?.dir ?? "ltr";
  document.documentElement.lang = code;
  document.documentElement.dir = dir;
}

const initialLang = detectInitialLanguage();
syncDocumentDirection(initialLang);

void i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      id: { translation: id },
      "zh-CN": { translation: zhCN },
      es: { translation: es },
      de: { translation: de },
      fr: { translation: fr },
      ar: { translation: ar },
      ru: { translation: ru },
      "pt-BR": { translation: ptBR },
      hi: { translation: hi },
      bn: { translation: bn },
      ja: { translation: ja },
    },
    lng: initialLang,
    fallbackLng: "en",
    interpolation: {
      escapeValue: false, // React already escapes values
    },
    react: {
      useSuspense: false,
    },
  });

export async function setLanguage(lang: SupportedLanguage): Promise<void> {
  await i18n.changeLanguage(lang);
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    /* no-op */
  }
  syncDocumentDirection(lang);
}

export function getLanguageMetadata(code: string): LanguageMetadata {
  return (
    SUPPORTED_LANGUAGES.find((l) => l.code === code) ??
    SUPPORTED_LANGUAGES[0]
  );
}

export default i18n;
