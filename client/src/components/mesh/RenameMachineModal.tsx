import { useState, useEffect, type FormEvent } from "react";
import { Modal } from "../ui/Modal";
import { Spinner } from "../ui/Spinner";
import { useLanguage } from "../../hooks/useLanguage";
import type { MeshEntry } from "../../lib/api";

type RenameMachineModalProps = {
  entry: MeshEntry | null;
  onClose: () => void;
  onRename: (id: string, name: string) => Promise<void>;
  locked: boolean;
};

export function RenameMachineModal({
  entry,
  onClose,
  onRename,
  locked,
}: RenameMachineModalProps) {
  const { t } = useLanguage();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (entry) {
      setName(entry.name);
    }
  }, [entry]);

  if (!entry) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || trimmed === entry.name || busy || locked) return;

    setBusy(true);
    try {
      await onRename(entry.id, trimmed);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      isOpen={Boolean(entry)}
      onClose={onClose}
      title={t("mesh.modals.renameTitle")}
    >
      <form onSubmit={handleSubmit}>
        <p className="hint" style={{ marginTop: 0 }}>
          {t("mesh.modals.renameDesc")}
        </p>

        <div className="field">
          <label htmlFor="rename-machine-input">{t("mesh.modals.newNameLabel")}</label>
          <input
            id="rename-machine-input"
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
            disabled={!name.trim() || name.trim() === entry.name || busy || locked}
          >
            {busy ? <Spinner label={t("common.saving")} /> : t("common.save")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
