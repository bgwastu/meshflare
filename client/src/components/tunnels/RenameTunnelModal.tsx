import { useState, useEffect, type FormEvent } from "react";
import { Modal } from "../ui/Modal";
import { Spinner } from "../ui/Spinner";
import { useLanguage } from "../../hooks/useLanguage";
import type { TunnelEntry } from "../../lib/api";

type RenameTunnelModalProps = {
  tunnel: TunnelEntry | null;
  onClose: () => void;
  onRename: (id: string, name: string) => Promise<void>;
  locked: boolean;
};

export function RenameTunnelModal({
  tunnel,
  onClose,
  onRename,
  locked,
}: RenameTunnelModalProps) {
  const { t } = useLanguage();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (tunnel) {
      setName(tunnel.name);
    }
  }, [tunnel]);

  if (!tunnel) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || trimmed === tunnel.name || busy || locked) return;

    setBusy(true);
    try {
      await onRename(tunnel.id, trimmed);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      isOpen={Boolean(tunnel)}
      onClose={onClose}
      title={t("tunnels.modals.renameTitle")}
    >
      <form onSubmit={handleSubmit}>
        <p className="hint" style={{ marginTop: 0 }}>
          {t("tunnels.modals.renameDesc")}
        </p>

        <div className="field">
          <label htmlFor="rename-tunnel-input">{t("tunnels.modals.newNameLabel")}</label>
          <input
            id="rename-tunnel-input"
            type="text"
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={busy || locked}
            autoFocus
            required
          />
        </div>

        <div className="row-actions modal-actions">
          <button type="button" className="btn" onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={!name.trim() || name.trim() === tunnel.name || busy || locked}
          >
            {busy ? <Spinner label={t("common.saving")} /> : t("common.save")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
