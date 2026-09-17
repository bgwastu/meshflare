import { useState, useEffect } from "react";
import { Plus, Pencil, Trash2, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Modal } from "../ui/Modal";
import { Spinner } from "../ui/Spinner";
import { useLanguage } from "../../hooks/useLanguage";
import type { SplitTunnelConfig, SplitTunnelItem } from "../../lib/api";

type SplitTunnelsSettingsProps = {
  config: SplitTunnelConfig | null;
  loading: boolean;
  onSave: (mode: "include" | "exclude", items: SplitTunnelItem[]) => Promise<void>;
  locked: boolean;
};

export function SplitTunnelsSettings({
  config,
  loading,
  onSave,
  locked,
}: SplitTunnelsSettingsProps) {
  const { t } = useLanguage();
  const [mode, setMode] = useState<"include" | "exclude">("exclude");
  const [items, setItems] = useState<SplitTunnelItem[]>([]);
  const [busy, setBusy] = useState(false);

  // Editor modal
  const [editor, setEditor] = useState<{
    index: number | null;
    value: string;
    description: string;
  } | null>(null);

  useEffect(() => {
    if (config) {
      setMode(config.mode);
      const list = config.mode === "include" ? config.include : config.exclude;
      setItems([...(list ?? [])]);
    }
  }, [config]);

  const handleSave = async () => {
    if (busy || locked) return;
    setBusy(true);
    try {
      await onSave(mode, items);
    } finally {
      setBusy(false);
    }
  };

  const handleSaveItem = (value: string, description: string, index: number | null) => {
    const isIp = /^[0-9.:/]+$/.test(value);
    const newItem: SplitTunnelItem = {
      ...(isIp ? { address: value } : { host: value }),
      description: description.trim() || undefined,
    };

    if (index !== null) {
      const copy = [...items];
      copy[index] = newItem;
      setItems(copy);
    } else {
      setItems([...items, newItem]);
    }
    setEditor(null);
  };

  const handleDeleteItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  // Check if mesh network is excluded in exclude mode
  const isMeshBypassed =
    mode === "exclude" &&
    items.some((i) => i.address === "100.64.0.0/10");

  if (loading) {
    return (
      <div className="settings-block">
        <Spinner label={t("common.loading")} />
      </div>
    );
  }

  return (
    <div className="settings-block">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.35rem" }}>
        <h3 style={{ margin: 0, fontSize: "1rem" }}>{t("settings.splitTunnels.title")}</h3>
        <button
          type="button"
          className="btn btn-primary"
          style={{ padding: "0.25rem 0.6rem", fontSize: "0.78rem" }}
          onClick={handleSave}
          disabled={busy || locked}
        >
          {busy ? <Spinner label={t("settings.splitTunnels.savingBtn")} /> : t("settings.splitTunnels.saveBtn")}
        </button>
      </div>

      <p className="hint" style={{ marginTop: 0, marginBottom: "0.85rem" }}>
        {t("settings.splitTunnels.description")}
      </p>

      {/* Mode Toggle */}
      <div style={{ marginBottom: "1rem" }}>
        <label className="field-label">{t("settings.splitTunnels.modeLabel")}</label>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <button
            type="button"
            className={`btn ${mode === "exclude" ? "btn-primary" : ""}`}
            style={{ fontSize: "0.8rem" }}
            onClick={() => setMode("exclude")}
          >
            {t("settings.splitTunnels.modeExclude")}
          </button>
          <button
            type="button"
            className={`btn ${mode === "include" ? "btn-primary" : ""}`}
            style={{ fontSize: "0.8rem" }}
            onClick={() => setMode("include")}
          >
            {t("settings.splitTunnels.modeInclude")}
          </button>
        </div>
      </div>

      {/* Audit warning */}
      {isMeshBypassed ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            padding: "0.5rem 0.75rem",
            background: "color-mix(in srgb, var(--warn) 12%, transparent)",
            border: "1px solid var(--warn)",
            borderRadius: "var(--radius)",
            marginBottom: "1rem",
            fontSize: "0.8rem",
          }}
        >
          <AlertTriangle size={15} style={{ color: "var(--warn)", flexShrink: 0 }} />
          <span>{t("settings.splitTunnels.auditWarning")}</span>
        </div>
      ) : (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            padding: "0.45rem 0.75rem",
            background: "color-mix(in srgb, var(--ok) 8%, transparent)",
            border: "1px solid var(--ok)",
            borderRadius: "var(--radius)",
            marginBottom: "1rem",
            fontSize: "0.8rem",
          }}
        >
          <CheckCircle2 size={14} style={{ color: "var(--ok)", flexShrink: 0 }} />
          <span>{t("settings.splitTunnels.auditResolved")}</span>
        </div>
      )}

      {/* Items list */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
        <span className="field-label" style={{ margin: 0 }}>
          {t("common.filter")} ({items.length})
        </span>
        <button
          type="button"
          className="btn"
          style={{ padding: "0.22rem 0.55rem", fontSize: "0.75rem" }}
          onClick={() => setEditor({ index: null, value: "", description: "" })}
        >
          <Plus size={12} aria-hidden />
          <span>{t("settings.splitTunnels.addEntryBtn")}</span>
        </button>
      </div>

      {items.length === 0 ? (
        <p className="hint">{t("settings.splitTunnels.emptyList")}</p>
      ) : (
        <div style={{ display: "grid", gap: "0.4rem", maxHeight: 280, overflowY: "auto" }}>
          {items.map((item, idx) => {
            const val = item.address || item.host || "—";
            return (
              <div
                key={idx}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "0.45rem 0.65rem",
                  background: "var(--bg0)",
                  border: "1px solid var(--line)",
                  borderRadius: "var(--radius)",
                  fontSize: "0.82rem",
                }}
              >
                <div>
                  <div className="mono" dir="ltr" style={{ fontWeight: 600 }}>{val}</div>
                  {item.description && (
                    <div style={{ fontSize: "0.74rem", color: "var(--muted)", marginTop: "0.1rem" }}>
                      {item.description}
                    </div>
                  )}
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={() =>
                      setEditor({
                        index: idx,
                        value: val,
                        description: item.description ?? "",
                      })
                    }
                    title={t("settings.splitTunnels.editEntry")}
                  >
                    <Pencil size={12} />
                  </button>
                  <button
                    type="button"
                    className="icon-btn danger"
                    onClick={() => handleDeleteItem(idx)}
                    title={t("settings.splitTunnels.deleteEntry")}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Item modal */}
      {editor && (
        <Modal
          isOpen={Boolean(editor)}
          onClose={() => setEditor(null)}
          title={
            editor.index !== null
              ? t("settings.splitTunnels.modalTitleEdit")
              : t("settings.splitTunnels.modalTitleAdd")
          }
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!editor.value.trim()) return;
              handleSaveItem(editor.value.trim(), editor.description, editor.index);
            }}
          >
            <label className="field-label" htmlFor="split-target-input">
              {t("settings.splitTunnels.addressHostLabel")}
            </label>
            <input
              id="split-target-input"
              type="text"
              className="input mono"
              dir="ltr"
              style={{ width: "100%", marginBottom: "0.85rem" }}
              placeholder={t("settings.splitTunnels.addressHostPlaceholder")}
              value={editor.value}
              onChange={(e) => setEditor({ ...editor, value: e.target.value })}
              autoFocus
              required
            />

            <label className="field-label" htmlFor="split-desc-input">
              {t("settings.splitTunnels.descriptionLabel")}
            </label>
            <input
              id="split-desc-input"
              type="text"
              className="input"
              style={{ width: "100%", marginBottom: "1.25rem" }}
              placeholder={t("settings.splitTunnels.descriptionPlaceholder")}
              value={editor.description}
              onChange={(e) => setEditor({ ...editor, description: e.target.value })}
            />

            <div className="modal-actions" style={{ display: "flex", gap: "0.5rem" }}>
              <button
                type="button"
                className="btn"
                onClick={() => setEditor(null)}
              >
                {t("common.cancel")}
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={!editor.value.trim()}
              >
                {t("common.save")}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
