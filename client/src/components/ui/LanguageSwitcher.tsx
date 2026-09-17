import { useState, useRef, useEffect } from "react";
import { Globe, Check, ChevronDown } from "lucide-react";
import { useLanguage } from "../../hooks/useLanguage";
import type { SupportedLanguage } from "../../i18n/types";

export function LanguageSwitcher() {
  const { language, languageMeta, languages, setLanguage, t } = useLanguage();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const handleSelect = async (code: SupportedLanguage) => {
    setOpen(false);
    await setLanguage(code);
  };

  return (
    <div className="lang-selector-wrapper" ref={containerRef}>
      <button
        type="button"
        className="lang-toggle-btn"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t("common.language")}
      >
        <Globe size={13} aria-hidden />
        <span className="lang-code">{languageMeta.flagCode}</span>
        <ChevronDown size={11} style={{ opacity: 0.7 }} aria-hidden />
      </button>

      {open && (
        <div className="lang-dropdown-menu" role="listbox" aria-label="Available languages">
          {languages.map((lang) => {
            const isActive = lang.code === language;
            return (
              <button
                key={lang.code}
                type="button"
                className={`lang-dropdown-item ${isActive ? "is-active" : ""}`}
                role="option"
                aria-selected={isActive}
                onClick={() => void handleSelect(lang.code)}
              >
                <div className="lang-dropdown-item-left">
                  <span className="lang-flag-badge">{lang.flagCode}</span>
                  <div>
                    <div className="lang-item-native">{lang.nativeName}</div>
                    <div className="lang-item-en">{lang.name}</div>
                  </div>
                </div>
                {isActive && <Check size={14} aria-hidden />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
