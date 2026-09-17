import { useState, useEffect, type FormEvent } from "react";
import { Modal } from "../ui/Modal";
import { Spinner } from "../ui/Spinner";
import { useLanguage } from "../../hooks/useLanguage";
import type { TunnelIngressRule } from "../../lib/api";

type IngressEditorModalProps = {
  rule: {
    index: number | null;
    hostname: string;
    path: string;
    service: string;
  } | null;
  onClose: () => void;
  onSave: (rule: TunnelIngressRule, index: number | null) => Promise<void>;
  locked: boolean;
};

export function IngressEditorModal({
  rule,
  onClose,
  onSave,
  locked,
}: IngressEditorModalProps) {
  const { t } = useLanguage();
  const [hostname, setHostname] = useState("");
  const [path, setPath] = useState("");
  const [service, setService] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (rule) {
      setHostname(rule.hostname || "");
      setPath(rule.path || "");
      setService(rule.service || "");
    }
  }, [rule]);

  if (!rule) return null;

  const isEdit = rule.index !== null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmedService = service.trim();
    if (!trimmedService || busy || locked) return;

    setBusy(true);
    try {
      await onSave(
        {
          hostname: hostname.trim() || undefined,
          path: path.trim() || undefined,
          service: trimmedService,
        },
        rule.index,
      );
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      isOpen={Boolean(rule)}
      onClose={onClose}
      title={
        isEdit
          ? t("tunnels.modals.ingressModalTitleEdit")
          : t("tunnels.modals.ingressModalTitleAdd")
      }
    >
      <form onSubmit={handleSubmit}>
        <label className="field-label" htmlFor="ingress-hostname-input">
          {t("tunnels.modals.hostnameLabel")}
        </label>
        <input
          id="ingress-hostname-input"
          type="text"
          className="input mono"
          dir="ltr"
          style={{ width: "100%", marginBottom: "0.85rem" }}
          placeholder={t("tunnels.modals.hostnamePlaceholder")}
          value={hostname}
          onChange={(e) => setHostname(e.target.value)}
          disabled={busy || locked}
          autoFocus
        />

        <label className="field-label" htmlFor="ingress-path-input">
          {t("tunnels.modals.pathLabel")}
        </label>
        <input
          id="ingress-path-input"
          type="text"
          className="input mono"
          dir="ltr"
          style={{ width: "100%", marginBottom: "0.85rem" }}
          placeholder={t("tunnels.modals.pathPlaceholder")}
          value={path}
          onChange={(e) => setPath(e.target.value)}
          disabled={busy || locked}
        />

        <label className="field-label" htmlFor="ingress-service-input">
          {t("tunnels.modals.serviceLabel")}
        </label>
        <input
          id="ingress-service-input"
          type="text"
          className="input mono"
          dir="ltr"
          style={{ width: "100%", marginBottom: "0.45rem" }}
          placeholder={t("tunnels.modals.servicePlaceholder")}
          value={service}
          onChange={(e) => setService(e.target.value)}
          disabled={busy || locked}
          required
        />
        <p className="hint" style={{ marginTop: 0, marginBottom: "1.25rem", fontSize: "0.75rem" }}>
          {t("tunnels.modals.serviceTip")}
        </p>

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
            disabled={!service.trim() || busy || locked}
          >
            {busy ? (
              <Spinner label={t("tunnels.modals.savingRuleBtn")} />
            ) : (
              t("tunnels.modals.saveRuleBtn")
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
}
