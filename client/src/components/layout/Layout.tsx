import { type ReactNode } from "react";
import { Header } from "./Header";
import { DemoBanner } from "./DemoBanner";
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
      <DemoBanner show={Boolean(settings?.demo)} />

      <Header
        settings={settings}
        authRequired={authRequired}
        tunnelsCount={tunnelsCount}
        onLogout={onLogout}
      />

      <main>
        {children}
      </main>

      <ToastStack toasts={toasts} onDismiss={onDismissToast} />
    </div>
  );
}
