import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";
import { useEscapeLayer } from "../../hooks/useEscapeLayer";
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

  useEscapeLayer(isOpen, onClose);

  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

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
        <div className="modal-head">
          <h3>{title}</h3>
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
        <div className="modal-stack">
          {children}
        </div>
      </div>
    </div>
  );
}
