import { useState, useEffect } from "react";
import { Trash2 } from "lucide-react";
import { Spinner } from "../ui/Spinner";
import { useLanguage } from "../../hooks/useLanguage";
import type { Settings } from "../../lib/api";

type CleanupSettingsProps = {
  settings: Settings | null;
  onSaveDays: (days: number) => Promise<void>;
  onRunCleanup: () => Promise<void>;
  locked: boolean;
};

export function CleanupSettings({
  settings,
  onSaveDays,
  onRunCleanup,
  locked,
}: CleanupSettingsProps) {
  const { t, formatSeen } = useLanguage();
  const [daysDraft, setDaysDraft] = useState(7);
  const [busyDays, setBusyDays] = useState(false);
  const [busyRun, setBusyRun] = useState(false);

  useEffect(() => {
    if (settings?.offlineDays) {
      setDaysDraft(settings.offlineDays);
    }
  }, [settings?.offlineDays]);

  const handleSaveDays = async () => {
    if (busyDays || locked || daysDraft === settings?.offlineDays) return;
    setBusyDays(true);
    try {
      await onSaveDays(daysDraft);
    } finally {
      setBusyDays(false);
    }
  };

  const handleRunCleanup = async () => {
    if (busyRun || locked) return;
    setBusyRun(true);
    try {
      await onRunCleanup();
    } finally {
      setBusyRun(false);
    }
  };

  return (
    <div className="settings-block">
      <h3 style={{ margin: "0 0 0.35rem", fontSize: "1rem" }}>
        {t("settings.cleanup.title")}
      </h3>
      <p className="hint" style={{ marginTop: 0, marginBottom: "0.85rem" }}>
        {t("settings.cleanup.description")}
      </p>

      <div style={{ display: "flex", gap: "0.5rem", alignItems: "flex-end", flexWrap: "wrap", marginBottom: "0.85rem" }}>
        <div style={{ width: 140 }}>
          <label className="field-label" htmlFor="offline-days-input">
            {t("settings.cleanup.daysLabel")}
          </label>
          <input
            id="offline-days-input"
            type="number"
            min={1}
            max={365}
            className="input"
            style={{ width: "100%" }}
            value={daysDraft}
            onChange={(e) => setDaysDraft(Math.max(1, Number(e.target.value) || 1))}
            disabled={busyDays || locked}
          />
        </div>

        <button
          type="button"
          className="btn"
          onClick={() => void handleSaveDays()}
          disabled={busyDays || locked || daysDraft === settings?.offlineDays}
        >
          {busyDays ? <Spinner label={t("common.loading")} /> : t("common.save")}
        </button>

        <button
          type="button"
          className="btn"
          onClick={() => void handleRunCleanup()}
          disabled={busyRun || locked}
        >
          {busyRun ? (
            <Spinner label={t("settings.cleanup.runningBtn")} />
          ) : (
            <>
              <Trash2 size={13} aria-hidden />
              <span>{t("settings.cleanup.runNowBtn")}</span>
            </>
          )}
        </button>
      </div>

      <div style={{ fontSize: "0.78rem", color: "var(--muted)" }}>
        <span>{t("settings.cleanup.lastRunLabel")}: </span>
        <span>
          {settings?.lastCleanupAt
            ? formatSeen(settings.lastCleanupAt)
            : t("settings.cleanup.neverRun")}
        </span>
      </div>
    </div>
  );
}
