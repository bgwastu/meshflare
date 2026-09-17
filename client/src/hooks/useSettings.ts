import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type SettingsPatch, type SplitTunnelItem } from "../lib/api";

export function useSettings(options?: { enabled?: boolean }) {
  const queryClient = useQueryClient();
  const enabled = options?.enabled !== false;

  const settingsQuery = useQuery({
    queryKey: ["settings"],
    queryFn: api.settings,
    enabled,
  });

  const settings = settingsQuery.data ?? null;

  const splitTunnelsQuery = useQuery({
    queryKey: ["split-tunnels"],
    queryFn: api.splitTunnels,
    enabled,
  });

  const maintenanceHealthQuery = useQuery({
    queryKey: ["maintenance-health"],
    queryFn: api.maintenanceHealth,
    enabled,
    staleTime: 60_000,
    refetchInterval: (query) =>
      query.state.data?.ok ? false : 15_000,
  });

  // Poll settings when DNS filter is undergoing a background operation
  useEffect(() => {
    const status = settings?.dnsFilterStatus;
    if (
      !status ||
      !["pending_enable", "syncing", "pending_refresh", "pending_disable"].includes(status)
    ) {
      return;
    }
    const id = window.setInterval(() => {
      void queryClient.invalidateQueries({ queryKey: ["settings"] });
    }, 1500);
    return () => window.clearInterval(id);
  }, [settings?.dnsFilterStatus, queryClient]);

  const patchSettingsMutation = useMutation({
    mutationFn: (patch: SettingsPatch) => api.patchSettings(patch),
    onSuccess: (newSettings) => {
      queryClient.setQueryData(["settings"], newSettings);
      void queryClient.invalidateQueries({ queryKey: ["mesh"] });
    },
  });

  const saveSplitTunnelsMutation = useMutation({
    mutationFn: ({ mode, items }: { mode: "include" | "exclude"; items: SplitTunnelItem[] }) =>
      api.saveSplitTunnels(mode, items),
    onSuccess: (newConfig) => {
      queryClient.setQueryData(["split-tunnels"], newConfig);
    },
  });

  const repairMaintenanceMutation = useMutation({
    mutationFn: api.repairMaintenance,
    onSuccess: (health) => {
      queryClient.setQueryData(["maintenance-health"], health);
      void queryClient.invalidateQueries({ queryKey: ["settings"] });
    },
  });

  return {
    settingsQuery,
    settings,
    isSettingsLoading: settingsQuery.isFetching,

    splitTunnelsQuery,
    splitTunnels: splitTunnelsQuery.data ?? null,
    splitTunnelsLoading: splitTunnelsQuery.isFetching,
    splitTunnelsError:
      splitTunnelsQuery.error instanceof Error
        ? splitTunnelsQuery.error.message
        : null,

    maintenanceHealthQuery,
    maintenanceHealth: maintenanceHealthQuery.data ?? null,
    maintenanceLoading: maintenanceHealthQuery.isFetching,

    patchSettings: patchSettingsMutation.mutateAsync,
    isPatchingSettings: patchSettingsMutation.isPending,

    saveSplitTunnels: saveSplitTunnelsMutation.mutateAsync,
    isSavingSplitTunnels: saveSplitTunnelsMutation.isPending,

    repairMaintenance: repairMaintenanceMutation.mutateAsync,
    isRepairingMaintenance: repairMaintenanceMutation.isPending,
  };
}
