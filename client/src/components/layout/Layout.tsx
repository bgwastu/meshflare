import { type ReactNode } from "react";
import { Header } from "./Header";
import { DemoBanner } from "./DemoBanner";
import { NavTabs } from "./NavTabs";
import { ToastStack, type ToastItem } from "../../lib/toasts";
import type { Settings } from "../../lib/api";

type LayoutProps = {
  settings: Settings | null;
  authRequired: boolean;
  tunnelsCount?: number;
  toasts: ToastItem[];
  onDismissToast: (id: number) => void;
  onLogout?: () => void;
  children: ReactNode;
};

export function Layout({
  settings,
  authRequired,
  tunnelsCount,
  toasts,
  onDismissToast,
  onLogout,
  children,
}: LayoutProps) {
  return (
    <div className="app">
      <Header
        settings={settings}
        authRequired={authRequired}
        onLogout={onLogout}
      />

      <DemoBanner show={Boolean(settings?.demo)} />

      <NavTabs tunnelsCount={tunnelsCount} />

      <main style={{ marginTop: "1rem" }}>
        {children}
      </main>

      <ToastStack toasts={toasts} onDismiss={onDismissToast} />
    </div>
  );
}
