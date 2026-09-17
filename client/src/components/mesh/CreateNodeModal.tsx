import { useState, type FormEvent } from "react";
import { Modal } from "../ui/Modal";
import { Spinner } from "../ui/Spinner";
import { useLanguage } from "../../hooks/useLanguage";

type CreateNodeModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (name: string) => Promise<void>;
  locked: boolean;
};

export function CreateNodeModal({
  isOpen,
  onClose,
  onCreate,
  locked,
}: CreateNodeModalProps) {
  const { t } = useLanguage();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || busy || locked) return;

    setBusy(true);
    try {
      await onCreate(trimmed);
      setName("");
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t("mesh.modals.createTitle")}>
      <form onSubmit={handleSubmit}>
        <p className="hint">
          {t("mesh.modals.createDesc")}
        </p>

        <div className="field">
          <label htmlFor="new-node-name">{t("mesh.modals.nodeNameLabel")}</label>
          <input
            id="new-node-name"
            type="text"
            className="input"
            placeholder={t("mesh.modals.nodeNamePlaceholder")}
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
            disabled={!name.trim() || busy || locked}
          >
            {busy ? <Spinner label={t("mesh.modals.creatingBtn")} /> : t("mesh.modals.createBtn")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
