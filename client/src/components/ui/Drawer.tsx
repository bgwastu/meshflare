import { useEffect, type ReactNode, type TransitionEvent } from "react";

type DrawerProps = {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  onTransitionEnd?: (e: TransitionEvent<HTMLDivElement>) => void;
};

export function Drawer({ isOpen, onClose, children, onTransitionEnd }: DrawerProps) {
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
