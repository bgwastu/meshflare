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
      <div className="drawer-section-head">
        <h4>{t("tunnels.drawer.ingressTitle")}</h4>
        <button
          type="button"
          className="btn btn-primary btn-sm"
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
        <div className="drawer-list">
          {rules.map((rule, index) => (
            <div key={index} className="drawer-list-item">
              <div className="drawer-list-item-copy">
                <div className="drawer-list-item-name mono" dir="ltr">
                  {rule.hostname || "*"}
                  {rule.path && <span className="muted">{rule.path}</span>}
                </div>
                <div className="drawer-list-item-meta drawer-list-item-accent mono" dir="ltr">
                  {rule.service}
                </div>
              </div>

              <div className="drawer-list-item-actions">
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

      <p className="hint hint-notice">
        {t("tunnels.drawer.defaultRuleNotice")}
      </p>
    </div>
  );
}
