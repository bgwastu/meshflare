import { Plus, Pencil, Trash2 } from "lucide-react";
import { useLanguage } from "../../hooks/useLanguage";
import type { TunnelIngressRule } from "../../lib/api";

type IngressRulesTableProps = {
  rules: TunnelIngressRule[];
  onOpenAdd: () => void;
  onOpenEdit: (rule: TunnelIngressRule, index: number) => void;
  onDelete: (index: number) => void;
  locked: boolean;
};

export function IngressRulesTable({
  rules,
  onOpenAdd,
  onOpenEdit,
  onDelete,
  locked,
}: IngressRulesTableProps) {
  const { t } = useLanguage();

  return (
    <div className="ingress-rules-section">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
        <h4 style={{ margin: 0, fontSize: "0.95rem" }}>{t("tunnels.drawer.ingressTitle")}</h4>
        <button
          type="button"
          className="btn btn-primary"
          style={{ padding: "0.25rem 0.55rem", fontSize: "0.75rem" }}
          onClick={onOpenAdd}
          disabled={locked}
        >
          <Plus size={12} aria-hidden />
          <span>{t("tunnels.drawer.addRule")}</span>
        </button>
      </div>

      {rules.length === 0 ? (
        <p className="hint">{t("tunnels.drawer.noRules")}</p>
      ) : (
        <div style={{ display: "grid", gap: "0.5rem", marginBottom: "0.75rem" }}>
          {rules.map((rule, index) => (
            <div
              key={index}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "0.5rem 0.75rem",
                background: "var(--bg0)",
                border: "1px solid var(--line)",
                borderRadius: "var(--radius)",
                fontSize: "0.82rem",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600 }} className="mono" dir="ltr">
                  {rule.hostname || "*"}
                  {rule.path && <span style={{ color: "var(--muted)" }}>{rule.path}</span>}
                </div>
                <div style={{ color: "var(--accent)", fontSize: "0.78rem" }} className="mono" dir="ltr">
                  {rule.service}
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", flexShrink: 0 }}>
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => onOpenEdit(rule, index)}
                  disabled={locked}
                  title={t("tunnels.drawer.editRule")}
                  aria-label={t("tunnels.drawer.editRule")}
                >
                  <Pencil size={12} aria-hidden />
                </button>
                <button
                  type="button"
                  className="icon-btn danger"
                  onClick={() => onDelete(index)}
                  disabled={locked}
                  title={t("tunnels.drawer.deleteRule")}
                  aria-label={t("tunnels.drawer.deleteRule")}
                >
                  <Trash2 size={12} aria-hidden />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="hint" style={{ fontSize: "0.74rem", margin: "0.5rem 0 0" }}>
        {t("tunnels.drawer.defaultRuleNotice")}
      </p>
    </div>
  );
}
