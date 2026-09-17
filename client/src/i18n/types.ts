import type en from "./locales/en.json";

export type TranslationSchema = typeof en;

export type SupportedLanguage =
  | "en"
  | "id"
  | "zh-CN"
  | "es"
  | "de"
  | "fr"
  | "ar"
  | "ru"
  | "pt-BR"
  | "hi"
  | "bn"
  | "ja";

export type LanguageMetadata = {
  code: SupportedLanguage;
  name: string;
  nativeName: string;
  dir: "ltr" | "rtl";
  flagCode: string;
};
