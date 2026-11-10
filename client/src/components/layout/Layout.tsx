import { type ReactNode } from "react";
import { Header } from "./Header";
import { DemoBanner } from "./DemoBanner";
import { ToastStack, type ToastItem } from "../../lib/toasts";
import type { Settings } from "../../lib/api";

type LayoutProps = {
  settings: Settings | null;
  authRequired: boolean;
  toasts: ToastItem[];
  onDismissToast: (id: number) => void;
  onLogout?: () => void;
  children: ReactNode;
};

export function Layout({
  settings,
  authRequired,
  toasts,
  onDismissToast,
  onLogout,
  children,
}: LayoutProps) {
  return (
    <div className="app">
      <DemoBanner show={Boolean(settings?.demo)} />

      <Header
        settings={settings}
        authRequired={authRequired}
        onLogout={onLogout}
      />

      <main>
        {children}
      </main>

      <ToastStack toasts={toasts} onDismiss={onDismissToast} />
    </div>
  );
}
