import { useState } from "react";
import { Copy, Check, RefreshCw } from "lucide-react";
import { CopyValue } from "../ui/CopyValue";
import { Spinner } from "../ui/Spinner";
import { useLanguage } from "../../hooks/useLanguage";
import {
  copyText,
  warpConnectorInstallCommand,
  type InstallPlatform,
} from "../../lib/warp";

type ConnectorCommandsProps = {
  token: string | null;
  loading: boolean;
  onRegenerate: () => Promise<void>;
  locked: boolean;
  onCopied: (msg: string) => void;
};

export function ConnectorCommands({
  token,
  loading,
  onRegenerate,
  locked,
  onCopied,
}: ConnectorCommandsProps) {
  const { t } = useLanguage();
  const [platform, setPlatform] = useState<InstallPlatform>("debian");
  const [copiedCmd, setCopiedCmd] = useState(false);
  const [regenOpen, setRegenOpen] = useState(false);
  const [regenBusy, setRegenBusy] = useState(false);

  const command = token ? warpConnectorInstallCommand(token, platform) : "";

  const handleCopyCmd = async () => {
    if (!command) return;
    try {
      await copyText(command);
      setCopiedCmd(true);
      onCopied(t("common.copied"));
      setTimeout(() => setCopiedCmd(false), 2000);
    } catch {
      /* handled */
    }
  };

  const handleRegenerate = async () => {
    if (regenBusy || locked) return;
    setRegenBusy(true);
    try {
      await onRegenerate();
      setRegenOpen(false);
    } finally {
      setRegenBusy(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: "1rem 0" }}>
        <Spinner label={t("common.loading")} />
      </div>
    );
  }

  if (!token) {
    return null;
  }

  return (
    <div className="connector-setup-box">
      <h4 style={{ margin: "0 0 0.35rem", fontSize: "0.95rem" }}>
        {t("mesh.drawer.setupTitle")}
      </h4>
      <p className="hint" style={{ marginTop: 0, marginBottom: "0.85rem" }}>
        {t("mesh.drawer.setupDesc")}
      </p>

      {/* Platform switcher */}
      <div style={{ display: "flex", gap: "0.35rem", marginBottom: "0.75rem", flexWrap: "wrap" }}>
        <button
          type="button"
          className={`chip ${platform === "debian" ? "is-active" : ""}`}
          onClick={() => setPlatform("debian")}
        >
          {t("mesh.drawer.platformDebian")}
        </button>
        <button
          type="button"
          className={`chip ${platform === "rhel" ? "is-active" : ""}`}
          onClick={() => setPlatform("rhel")}
        >
          {t("mesh.drawer.platformRhel")}
        </button>
        <button
          type="button"
          className={`chip ${platform === "docker" ? "is-active" : ""}`}
          onClick={() => setPlatform("docker")}
        >
          {t("mesh.drawer.platformDocker")}
        </button>
      </div>

      {/* Code command */}
      <div style={{ position: "relative", marginBottom: "1rem" }}>
        <pre className="cmd-block mono" dir="ltr" style={{ margin: 0, paddingRight: "3rem" }}>
          {command}
        </pre>
        <button
          type="button"
          className="icon-btn"
          style={{ position: "absolute", top: "0.45rem", right: "0.45rem" }}
          onClick={() => void handleCopyCmd()}
          title={t("common.copy")}
        >
          {copiedCmd ? <Check size={14} style={{ color: "var(--ok)" }} /> : <Copy size={14} />}
        </button>
      </div>

      {/* Token box */}
      <div style={{ marginBottom: "1.25rem" }}>
        <div style={{ fontSize: "0.78rem", color: "var(--muted)", marginBottom: "0.3rem" }}>
          {t("mesh.drawer.tokenLabel")}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <CopyValue value={token} onCopied={() => onCopied(t("common.copied"))} />
          </div>
          <button
            type="button"
            className="btn btn-ghost"
            style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem" }}
            onClick={() => setRegenOpen(true)}
            disabled={locked}
            title={t("mesh.drawer.regenerateToken")}
          >
            <RefreshCw size={12} aria-hidden />
            <span>{t("mesh.drawer.regenerateToken")}</span>
          </button>
        </div>
      </div>

      {/* Regenerate confirmation modal */}
      {regenOpen && (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => setRegenOpen(false)}
        >
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label={t("mesh.modals.regenerateTitle")}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: "0 0 0.85rem" }}>{t("mesh.modals.regenerateTitle")}</h3>
            <p className="hint" style={{ color: "var(--danger)", marginTop: 0 }}>
              {t("mesh.drawer.regenerateWarning")}
            </p>
            <div className="modal-actions" style={{ display: "flex", gap: "0.5rem", marginTop: "1rem" }}>
              <button
                type="button"
                className="btn"
                onClick={() => setRegenOpen(false)}
                disabled={regenBusy}
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => void handleRegenerate()}
                disabled={regenBusy || locked}
              >
                {regenBusy ? (
                  <Spinner label={t("mesh.drawer.regeneratingToken")} />
                ) : (
                  t("mesh.modals.confirmRegenerateBtn")
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
