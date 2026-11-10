import { useState, type FormEvent } from "react";
import { Modal } from "../ui/Modal";
import { Spinner } from "../ui/Spinner";
import { useLanguage } from "../../hooks/useLanguage";
import { isValidMeshLabel, normalizeMeshLabel, slugifyName } from "../../lib/hostname";
import type { MeshEntry, MeshEntryPatch } from "../../lib/api";

type EditMachineModalProps = {
  entry: MeshEntry | null;
  suffix: string;
  onClose: () => void;
  onSave: (entry: MeshEntry, patch: MeshEntryPatch) => Promise<void>;
  locked: boolean;
};

export function EditMachineModal({ entry, ...props }: EditMachineModalProps) {
  if (!entry) return null;
  // Keyed so the form state resets whenever a different machine is opened.
  return <EditMachineForm key={`${entry.kind}:${entry.id}`} entry={entry} {...props} />;
}

function EditMachineForm({
  entry,
  suffix,
  onClose,
  onSave,
  locked,
}: Omit<EditMachineModalProps, "entry"> & { entry: MeshEntry }) {
  const { t } = useLanguage();
  const [name, setName] = useState(entry.name);
  const [label, setLabel] = useState(entry.meshLabel ?? "");
  const [busy, setBusy] = useState(false);

  const trimmedName = name.trim();
  const nextLabel = normalizeMeshLabel(label);
  const labelInvalid = nextLabel !== null && !isValidMeshLabel(nextLabel);
  const nameChanged = Boolean(trimmedName) && trimmedName !== entry.name;
  const labelChanged = nextLabel !== entry.meshLabel;
  const canSave = !busy && !locked && !labelInvalid && Boolean(trimmedName) && (nameChanged || labelChanged);
  const defaultHostname = `${slugifyName(trimmedName || entry.name)}.${suffix}`;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSave) return;

    const patch: MeshEntryPatch = {};
    if (nameChanged) patch.name = trimmedName;
    if (labelChanged) patch.meshLabel = nextLabel;

    setBusy(true);
    try {
      await onSave(entry, patch);
      onClose();
    } catch {
      // The caller reports the error; keep the form open for another try.
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title={t("mesh.modals.editTitle")}>
      <form onSubmit={handleSubmit}>
        <p className="hint">{t("mesh.modals.editDesc")}</p>

        <div className="field">
          <label htmlFor="edit-machine-name">{t("mesh.modals.nameLabel")}</label>
          <input
            id="edit-machine-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={busy || locked}
            autoFocus
            required
          />
        </div>

        <div className="field">
          <label htmlFor="edit-machine-label">{t("mesh.modals.hostnameLabel")}</label>
          <div className={`suffix-input ${labelInvalid ? "is-invalid" : ""}`} dir="ltr">
            <input
              id="edit-machine-label"
              type="text"
              value={label}
              placeholder={slugifyName(trimmedName || entry.name)}
              onChange={(e) => setLabel(e.target.value)}
              disabled={busy || locked}
              aria-invalid={labelInvalid}
              aria-describedby="edit-machine-label-hint"
              autoCapitalize="off"
              autoComplete="off"
              spellCheck={false}
            />
            <span className="suffix-dot">.{suffix}</span>
          </div>
          <p id="edit-machine-label-hint" className={`hint ${labelInvalid ? "hint-error" : ""}`}>
            {labelInvalid
              ? t("mesh.modals.hostnameInvalid")
              : t("mesh.modals.hostnameHint", { hostname: defaultHostname })}
          </p>
        </div>

        <div className="row-actions modal-actions">
          <button type="button" className="btn" onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </button>
          <button type="submit" className="btn btn-primary" disabled={!canSave}>
            {busy ? <Spinner label={t("common.saving")} /> : t("common.save")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
