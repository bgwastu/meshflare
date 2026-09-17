import { useState } from "react";
import { Modal } from "../ui/Modal";
import { Spinner } from "../ui/Spinner";
import { useLanguage } from "../../hooks/useLanguage";
import type { MeshEntry } from "../../lib/api";

type DeleteMachineModalProps = {
  entry: MeshEntry | null;
  onClose: () => void;
  onDelete: (id: string) => Promise<void>;
  locked: boolean;
};

export function DeleteMachineModal({
  entry,
  onClose,
  onDelete,
  locked,
}: DeleteMachineModalProps) {
  const { t } = useLanguage();
  const [busy, setBusy] = useState(false);

  if (!entry) return null;

  const isNode = entry.kind === "node";
  const deleteTitle = isNode
    ? t("mesh.modals.deleteTitleNode")
    : t("mesh.modals.deleteTitleDevice");
  const confirmDeleteBtn = isNode
    ? t("mesh.modals.confirmDeleteBtnNode")
    : t("mesh.modals.confirmDeleteBtnDevice");

  const handleConfirm = async () => {
    if (busy || locked) return;
    setBusy(true);
    try {
      await onDelete(entry.id);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      isOpen={Boolean(entry)}
      onClose={onClose}
      title={deleteTitle}
    >
      <div>
        <p style={{ marginTop: 0 }}>
          {t("mesh.modals.deleteConfirm", { name: entry.name })}
        </p>

        {isNode && (
          <p className="hint" style={{ color: "var(--danger)" }}>
            {t("mesh.modals.deleteWarning")}
          </p>
        )}

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
              <Spinner label={t("mesh.modals.deletingBtn")} />
            ) : (
              confirmDeleteBtn
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
}
