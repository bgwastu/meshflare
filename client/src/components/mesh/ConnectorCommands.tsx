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
      <div className="connector-setup-box">
        <Spinner label={t("common.loading")} />
      </div>
    );
  }

  if (!token) {
    return null;
  }

  return (
    <div className="connector-setup-box">
      <h4>{t("mesh.drawer.setupTitle")}</h4>
      <p className="hint">{t("mesh.drawer.setupDesc")}</p>

      <div className="platform-chips" role="group" aria-label={t("mesh.drawer.setupTitle")}>
        <button
          type="button"
          className={`chip ${platform === "debian" ? "is-active" : ""}`}
          aria-pressed={platform === "debian"}
          onClick={() => setPlatform("debian")}
        >
          {t("mesh.drawer.platformDebian")}
        </button>
        <button
          type="button"
          className={`chip ${platform === "rhel" ? "is-active" : ""}`}
          aria-pressed={platform === "rhel"}
          onClick={() => setPlatform("rhel")}
        >
          {t("mesh.drawer.platformRhel")}
        </button>
        <button
          type="button"
          className={`chip ${platform === "docker" ? "is-active" : ""}`}
          aria-pressed={platform === "docker"}
          onClick={() => setPlatform("docker")}
        >
          {t("mesh.drawer.platformDocker")}
        </button>
      </div>

      <div className="cmd-block-wrap">
        <pre className="cmd-block mono" dir="ltr">
          {command}
        </pre>
        <button
          type="button"
          className="icon-btn"
          onClick={() => void handleCopyCmd()}
          title={t("common.copy")}
          aria-label={t("common.copy")}
        >
          {copiedCmd ? <Check size={14} style={{ color: "var(--ok)" }} aria-hidden /> : <Copy size={14} aria-hidden />}
        </button>
      </div>

      <div className="setup-token-label">{t("mesh.drawer.tokenLabel")}</div>
      <div className="setup-token-row">
        <div className="setup-token-value">
          <CopyValue value={token} onCopied={() => onCopied(t("common.copied"))} />
        </div>
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => setRegenOpen(true)}
          disabled={locked}
          title={t("mesh.drawer.regenerateToken")}
        >
          <RefreshCw size={12} aria-hidden />
          <span>{t("mesh.drawer.regenerateToken")}</span>
        </button>
      </div>

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
            <h3>{t("mesh.modals.regenerateTitle")}</h3>
            <p className="hint" style={{ color: "var(--danger)", marginTop: 0 }}>
              {t("mesh.drawer.regenerateWarning")}
            </p>
            <div className="row-actions modal-actions">
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
