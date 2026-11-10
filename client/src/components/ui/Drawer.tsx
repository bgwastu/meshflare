import type { ReactNode, TransitionEvent } from "react";
import { useEscapeLayer } from "../../hooks/useEscapeLayer";

type DrawerProps = {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  onTransitionEnd?: (e: TransitionEvent<HTMLDivElement>) => void;
};

export function Drawer({ isOpen, onClose, children, onTransitionEnd }: DrawerProps) {
  useEscapeLayer(isOpen, onClose);

  return (
    <div
      className={`drawer-backdrop ${isOpen ? "is-open" : ""}`}
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="drawer"
        role="region"
        aria-hidden={!isOpen}
        onTransitionEnd={onTransitionEnd}
      >
        {children}
      </div>
    </div>
  );
}
