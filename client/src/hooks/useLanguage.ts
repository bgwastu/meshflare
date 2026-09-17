import { useTranslation } from "react-i18next";
import {
  SUPPORTED_LANGUAGES,
  getLanguageMetadata,
  setLanguage,
} from "../i18n/config";
import type { LanguageMetadata, SupportedLanguage } from "../i18n/types";
import { formatDateTime as fmtDateTime, formatSeen as fmtSeen } from "../i18n/formatters";

export function useLanguage() {
  const { t, i18n } = useTranslation();
  const currentCode = (i18n.language || "en") as SupportedLanguage;
  const currentMeta: LanguageMetadata = getLanguageMetadata(currentCode);
  const isRTL = currentMeta.dir === "rtl";

  const changeLang = async (lang: SupportedLanguage) => {
    await setLanguage(lang);
  };

  const formatSeen = (iso: string | null | undefined, empty = "—") => {
    return fmtSeen(iso, empty, currentCode);
  };

  const formatDateTime = (iso: string | null | undefined, empty = "—") => {
    return fmtDateTime(iso, empty, currentCode);
  };

  return {
    t,
    i18n,
    language: currentCode,
    languageMeta: currentMeta,
    dir: currentMeta.dir,
    isRTL,
    languages: SUPPORTED_LANGUAGES,
    setLanguage: changeLang,
    formatSeen,
    formatDateTime,
  };
}
