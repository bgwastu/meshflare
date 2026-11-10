import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type Settings, type SettingsPatch, type SplitTunnelItem } from "../lib/api";

/** DNS filter states where the server is still working in the background. */
export const DNS_FILTER_BUSY_STATUSES = [
  "pending_enable",
  "syncing",
  "pending_refresh",
  "pending_disable",
];

export const isDnsFilterBusy = (settings: Settings | null | undefined) =>
  DNS_FILTER_BUSY_STATUSES.includes(settings?.dnsFilterStatus ?? "");

/**
 * The settings row alone. Used by the app shell (account line, demo lock);
 * polls only while a DNS filter operation is running.
 */
export function useSettingsQuery(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ["settings"],
    queryFn: api.settings,
    enabled: options?.enabled !== false,
    refetchInterval: (query) => (isDnsFilterBusy(query.state.data) ? 1500 : false),
  });
}

/** Everything the Settings page needs. */
export function useSettings() {
  const queryClient = useQueryClient();
  const settingsQuery = useSettingsQuery();

  const splitTunnelsQuery = useQuery({
    queryKey: ["split-tunnels"],
    queryFn: api.splitTunnels,
  });

  const maintenanceHealthQuery = useQuery({
    queryKey: ["maintenance-health"],
    queryFn: api.maintenanceHealth,
    staleTime: 60_000,
    refetchInterval: (query) => (query.state.data && !query.state.data.ok ? 15_000 : false),
  });

  const patchSettingsMutation = useMutation({
    mutationFn: (patch: SettingsPatch) => api.patchSettings(patch),
    onSuccess: (next, patch) => {
      queryClient.setQueryData(["settings"], next);
      if (patch.meshSuffix !== undefined) {
        void queryClient.invalidateQueries({ queryKey: ["mesh"] });
      }
      void queryClient.invalidateQueries({ queryKey: ["maintenance-health"] });
    },
  });

  const saveSplitTunnelsMutation = useMutation({
    mutationFn: ({ mode, items }: { mode: "include" | "exclude"; items: SplitTunnelItem[] }) =>
      api.saveSplitTunnels(mode, items),
    onSuccess: (config) => queryClient.setQueryData(["split-tunnels"], config),
  });

  const ensureMeshRoutingMutation = useMutation({
    mutationFn: api.ensureMeshRouting,
    onSuccess: (config) => queryClient.setQueryData(["split-tunnels"], config),
  });

  const repairMaintenanceMutation = useMutation({
    mutationFn: api.repairMaintenance,
    onSuccess: (health) => {
      queryClient.setQueryData(["maintenance-health"], health);
      void queryClient.invalidateQueries({ queryKey: ["settings"] });
    },
  });

  const syncDnsMutation = useMutation({
    mutationFn: api.syncDns,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["settings"] });
      void queryClient.invalidateQueries({ queryKey: ["mesh"] });
      void queryClient.invalidateQueries({ queryKey: ["maintenance-health"] });
    },
  });

  const cleanupMutation = useMutation({
    mutationFn: api.cleanup,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["settings"] });
      void queryClient.invalidateQueries({ queryKey: ["mesh"] });
    },
  });

  return {
    settingsQuery,
    settings: settingsQuery.data ?? null,

    splitTunnels: splitTunnelsQuery.data ?? null,
    // First load only; background refetches keep the current list on screen.
    splitTunnelsLoading: splitTunnelsQuery.isPending,
    splitTunnelsError: splitTunnelsQuery.error?.message ?? null,
    refetchSplitTunnels: splitTunnelsQuery.refetch,

    maintenanceHealth: maintenanceHealthQuery.data ?? null,

    patchSettings: patchSettingsMutation.mutateAsync,
    saveSplitTunnels: saveSplitTunnelsMutation.mutateAsync,
    ensureMeshRouting: ensureMeshRoutingMutation.mutateAsync,
    repairMaintenance: repairMaintenanceMutation.mutateAsync,
    isRepairingMaintenance: repairMaintenanceMutation.isPending,
    syncDns: syncDnsMutation.mutateAsync,
    cleanup: cleanupMutation.mutateAsync,
  };
}
