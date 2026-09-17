import { useState } from "react";
import { Modal } from "../ui/Modal";
import { Spinner } from "../ui/Spinner";
import { useLanguage } from "../../hooks/useLanguage";
import type { TunnelEntry } from "../../lib/api";

type DeleteTunnelModalProps = {
  tunnel: TunnelEntry | null;
  onClose: () => void;
  onDelete: (id: string) => Promise<void>;
  locked: boolean;
};

export function DeleteTunnelModal({
  tunnel,
  onClose,
  onDelete,
  locked,
}: DeleteTunnelModalProps) {
  const { t } = useLanguage();
  const [busy, setBusy] = useState(false);

  if (!tunnel) return null;

  const handleConfirm = async () => {
    if (busy || locked) return;
    setBusy(true);
    try {
      await onDelete(tunnel.id);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      isOpen={Boolean(tunnel)}
      onClose={onClose}
      title={t("tunnels.modals.deleteTitle")}
    >
      <div>
        <p style={{ marginTop: 0 }}>
          {t("tunnels.modals.deleteConfirm", { name: tunnel.name })}
        </p>

        <p className="hint" style={{ color: "var(--danger)" }}>
          {t("tunnels.modals.deleteWarning")}
        </p>

        <div className="modal-actions" style={{ display: "flex", gap: "0.5rem", marginTop: "1rem" }}>
          <button
            type="button"
            className="btn"
            onClick={onClose}
            disabled={busy}
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            className="btn btn-danger"
            onClick={() => void handleConfirm()}
            disabled={busy || locked}
          >
            {busy ? (
              <Spinner label={t("tunnels.modals.deletingBtn")} />
            ) : (
              t("tunnels.modals.confirmDeleteBtn")
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
}
