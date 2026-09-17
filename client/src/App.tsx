import { useLocation } from "react-router";
import { Layout } from "./components/layout/Layout";
import { MeshView } from "./components/mesh/MeshView";
import { TunnelsView } from "./components/tunnels/TunnelsView";
import { SettingsView } from "./components/settings/SettingsView";
import { LoginForm } from "./components/auth/LoginForm";
import { useAuth } from "./hooks/useAuth";
import { useSettings } from "./hooks/useSettings";
import { useTunnels } from "./hooks/useTunnels";
import { useToasts } from "./lib/toasts";

export function App() {
  const location = useLocation();
  const { toasts, push, dismiss } = useToasts();

  const {
    authRequired,
    isConfigured,
    login,
    logout,
  } = useAuth();

  const { settings } = useSettings({
    enabled: !authRequired,
  });

  const { tunnels } = useTunnels({
    enabled: !authRequired,
  });

  const handleToast = (msg: string, tone?: "success" | "error" | "warn") => {
    push(msg, tone === "error" ? "error" : tone === "success" ? "success" : "info");
  };

  if (authRequired) {
    return (
      <LoginForm
        onLogin={async (password) => {
          await login(password);
        }}
      />
    );
  }

  const tab = location.pathname.startsWith("/settings")
    ? "settings"
    : location.pathname.startsWith("/tunnels")
      ? "tunnels"
      : "mesh";

  const locked = Boolean(settings?.demo);

  return (
    <Layout
      settings={settings}
      authRequired={isConfigured}
      tunnelsCount={tunnels.length}
      toasts={toasts}
      onDismissToast={dismiss}
      onLogout={async () => {
        await logout();
      }}
    >
      {tab === "settings" ? (
        <SettingsView locked={locked} onToast={handleToast} />
      ) : tab === "tunnels" ? (
        <TunnelsView locked={locked} onToast={handleToast} />
      ) : (
        <MeshView locked={locked} onToast={handleToast} />
      )}
    </Layout>
  );
}
