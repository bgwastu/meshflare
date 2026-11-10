import { describe, it, expect } from "bun:test";
import { formatSeen, formatDateTime } from "./formatters";
import { SUPPORTED_LANGUAGES } from "./config";
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

describe("i18n formatters", () => {
  it("formatSeen handles empty input", () => {
    expect(formatSeen(null)).toBe("—");
    expect(formatSeen(undefined, "N/A")).toBe("N/A");
  });

  it("formatSeen returns relative time in English", () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
    const result = formatSeen(twoHoursAgo, "—", "en");
    expect(result).toContain("hour");
  });

  it("formatSeen returns relative time in Indonesian", () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
    const result = formatSeen(twoHoursAgo, "—", "id");
    expect(result).toContain("jam");
  });

  it("formatSeen returns relative time in German", () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
    const result = formatSeen(twoHoursAgo, "—", "de");
    expect(result).toContain("Stunde");
  });

  it("formatDateTime formats valid date", () => {
    const now = new Date("2025-01-15T12:00:00Z").toISOString();
    const formatted = formatDateTime(now, "—", "en");
    expect(formatted).toContain("2025");
  });
});

describe("locale key parity", () => {
  const locales: Record<string, Record<string, unknown>> = {
    id,
    "zh-CN": zhCN,
    es,
    de,
    fr,
    ar,
    ru,
    "pt-BR": ptBR,
    hi,
    bn,
    ja,
  };

  const getKeys = (obj: Record<string, unknown>, prefix = ""): string[] => {
    return Object.entries(obj).flatMap(([k, v]) => {
      const fullKey = prefix ? `${prefix}.${k}` : k;
      if (v && typeof v === "object" && !Array.isArray(v)) {
        return getKeys(v as Record<string, unknown>, fullKey);
      }
      return [fullKey];
    });
  };

  const enKeys = new Set(getKeys(en as Record<string, unknown>));

  it("all supported languages are registered in metadata", () => {
    expect(SUPPORTED_LANGUAGES.length).toBe(12);
    const codes = SUPPORTED_LANGUAGES.map((l) => l.code);
    expect(codes).toContain("en");
    expect(codes).toContain("id");
    expect(codes).toContain("de");
    expect(codes).toContain("ar");
  });

  for (const [langCode, dict] of Object.entries(locales)) {
    it(`locale ${langCode} translates every English key`, () => {
      const have = new Set(getKeys(dict));
      expect([...enKeys].filter((k) => !have.has(k))).toEqual([]);
    });

    it(`locale ${langCode} keeps the English {{placeholders}}`, () => {
      const flat = (obj: Record<string, unknown>, prefix = ""): [string, string][] =>
        Object.entries(obj).flatMap(([k, v]) =>
          v && typeof v === "object"
            ? flat(v as Record<string, unknown>, prefix ? `${prefix}.${k}` : k)
            : [[prefix ? `${prefix}.${k}` : k, String(v)] as [string, string]],
        );
      const vars = (text: string) => (text.match(/{{\w+}}/g) ?? []).sort().join();
      const translated = new Map(flat(dict));
      const mismatched = flat(en as Record<string, unknown>)
        // Singular plural forms may say "one machine" instead of "{{count}} machine".
        .filter(([k]) => !/_(zero|one|two)$/.test(k))
        .filter(([k, text]) => translated.has(k) && vars(text) !== vars(translated.get(k)!))
        .map(([k]) => k);
      expect(mismatched).toEqual([]);
    });

    it(`locale ${langCode} contains all essential namespaces`, () => {
      expect(dict.common).toBeDefined();
      expect(dict.nav).toBeDefined();
      expect(dict.mesh).toBeDefined();
      expect(dict.tunnels).toBeDefined();
      expect(dict.settings).toBeDefined();
      expect(dict.auth).toBeDefined();
      expect(dict.status).toBeDefined();
      expect(dict.toasts).toBeDefined();
    });
  }
});
