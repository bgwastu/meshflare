import { useState, type FormEvent } from "react";
import { Modal } from "../ui/Modal";
import { Spinner } from "../ui/Spinner";
import { useLanguage } from "../../hooks/useLanguage";

type AddRouteModalProps = {
  nodeId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onAddRoute: (params: { nodeId: string; network: string; comment?: string }) => Promise<void>;
  onAddHostnameRoute: (params: { nodeId: string; hostname: string; comment?: string }) => Promise<void>;
  locked: boolean;
};

export function AddRouteModal({
  nodeId,
  isOpen,
  onClose,
  onAddRoute,
  onAddHostnameRoute,
  locked,
}: AddRouteModalProps) {
  const { t } = useLanguage();
  const [routeType, setRouteType] = useState<"cidr" | "hostname">("cidr");
  const [value, setValue] = useState("");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);

  if (!nodeId) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmedVal = value.trim();
    if (!trimmedVal || busy || locked) return;

    setBusy(true);
    try {
      if (routeType === "cidr") {
        await onAddRoute({
          nodeId,
          network: trimmedVal,
          comment: comment.trim() || undefined,
        });
      } else {
        await onAddHostnameRoute({
          nodeId,
          hostname: trimmedVal,
          comment: comment.trim() || undefined,
        });
      }
      setValue("");
      setComment("");
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t("mesh.modals.addRouteTitle")}
    >
      <form onSubmit={handleSubmit}>
        <p className="hint" style={{ marginTop: 0, marginBottom: "0.85rem" }}>
          {t("mesh.modals.addRouteDesc")}
        </p>

        <label className="field-label">{t("mesh.modals.routeTypeLabel")}</label>
        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
          <button
            type="button"
            className={`btn ${routeType === "cidr" ? "btn-primary" : ""}`}
            style={{ flex: 1 }}
            onClick={() => setRouteType("cidr")}
          >
            CIDR
          </button>
          <button
            type="button"
            className={`btn ${routeType === "hostname" ? "btn-primary" : ""}`}
            style={{ flex: 1 }}
            onClick={() => setRouteType("hostname")}
          >
            Hostname
          </button>
        </div>

        <label className="field-label" htmlFor="route-target-val">
          {routeType === "cidr" ? t("mesh.modals.typeCidr") : t("mesh.modals.typeHostname")}
        </label>
        <input
          id="route-target-val"
          type="text"
          className="input mono"
          dir="ltr"
          style={{ width: "100%", marginBottom: "0.85rem" }}
          placeholder={
            routeType === "cidr"
              ? t("mesh.modals.networkPlaceholder")
              : t("mesh.modals.hostnamePlaceholder")
          }
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={busy || locked}
          autoFocus
          required
        />

        <label className="field-label" htmlFor="route-comment-val">
          {t("mesh.modals.commentLabel")}
        </label>
        <input
          id="route-comment-val"
          type="text"
          className="input"
          style={{ width: "100%", marginBottom: "1.25rem" }}
          placeholder={t("mesh.modals.commentPlaceholder")}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          disabled={busy || locked}
        />

        <div className="modal-actions" style={{ display: "flex", gap: "0.5rem" }}>
          <button
            type="button"
            className="btn"
            onClick={onClose}
            disabled={busy}
          >
            {t("common.cancel")}
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={!value.trim() || busy || locked}
          >
            {busy ? (
              <Spinner label={t("mesh.modals.addingRouteBtn")} />
            ) : (
              t("mesh.modals.addRouteBtn")
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
}
