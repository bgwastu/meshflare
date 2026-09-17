import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";
import { useLanguage } from "../../hooks/useLanguage";

type ModalProps = {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  width?: string;
};

export function Modal({ isOpen, onClose, title, children, width }: ModalProps) {
  const { t } = useLanguage();

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="modal"
        style={width ? { width } : undefined}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.85rem" }}>
          <h3 style={{ margin: 0 }}>{title}</h3>
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            title={t("common.close")}
            aria-label={t("common.close")}
          >
            <X size={15} aria-hidden />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
