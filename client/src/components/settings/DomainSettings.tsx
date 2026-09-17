import { useState, useEffect, type FormEvent } from "react";
import { Spinner } from "../ui/Spinner";
import { useLanguage } from "../../hooks/useLanguage";
import type { Settings } from "../../lib/api";

type DomainSettingsProps = {
  settings: Settings | null;
  onSave: (suffix: string) => Promise<void>;
  locked: boolean;
};

export function DomainSettings({ settings, onSave, locked }: DomainSettingsProps) {
  const { t } = useLanguage();
  const [suffixDraft, setSuffixDraft] = useState("mesh");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (settings?.meshSuffix) {
      setSuffixDraft(settings.meshSuffix);
    }
  }, [settings?.meshSuffix]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = suffixDraft.trim();
    if (!trimmed || trimmed === settings?.meshSuffix || busy || locked) return;

    setBusy(true);
    try {
      await onSave(trimmed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="settings-block">
      <h3 style={{ margin: "0 0 0.35rem", fontSize: "1rem" }}>
        {t("settings.meshDns.title")}
      </h3>
      <p className="hint" style={{ marginTop: 0, marginBottom: "0.85rem" }}>
        {t("settings.meshDns.description")}
      </p>

      <form onSubmit={handleSubmit}>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 200px" }}>
            <label className="field-label" htmlFor="domain-suffix-input">
              {t("settings.meshDns.suffixLabel")}
            </label>
            <input
              id="domain-suffix-input"
              type="text"
              className="input mono"
              dir="ltr"
              style={{ width: "100%" }}
              placeholder={t("settings.meshDns.suffixPlaceholder")}
              value={suffixDraft}
              onChange={(e) => setSuffixDraft(e.target.value)}
              disabled={busy || locked}
              required
            />
          </div>
          <div style={{ alignSelf: "flex-end" }}>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={!suffixDraft.trim() || suffixDraft.trim() === settings?.meshSuffix || busy || locked}
            >
              {busy ? <Spinner label={t("settings.meshDns.savingBtn")} /> : t("settings.meshDns.saveBtn")}
            </button>
          </div>
        </div>
        <p className="hint" style={{ fontSize: "0.75rem", marginTop: "0.5rem", marginBottom: 0 }}>
          {t("settings.meshDns.syncNotice")}
        </p>
      </form>
    </div>
  );
}
