import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type TunnelEntry, type TunnelConnection, type TunnelIngressRule } from "../lib/api";

export function useTunnels(options?: { enabled?: boolean; selectedTunnelId?: string | null }) {
  const queryClient = useQueryClient();
  const enabled = options?.enabled !== false;
  const selectedId = options?.selectedTunnelId ?? null;

  const tunnelsQuery = useQuery({
    queryKey: ["tunnels"],
    queryFn: () => api.listTunnels(),
    enabled,
    refetchOnMount: false,
  });

  const tunnels: TunnelEntry[] = tunnelsQuery.data?.tunnels ?? [];

  const connectionsQuery = useQuery({
    queryKey: ["tunnel-connections", selectedId],
    queryFn: () => api.getTunnelConnections(selectedId!),
    enabled: Boolean(selectedId && enabled),
    staleTime: 60_000,
  });

  const configQuery = useQuery({
    queryKey: ["tunnel-config", selectedId],
    queryFn: () => api.getTunnelConfig(selectedId!),
    enabled: Boolean(selectedId && enabled),
    staleTime: 60_000,
  });

  const tokenQuery = useQuery({
    queryKey: ["tunnel-token", selectedId],
    queryFn: () => api.getTunnelToken(selectedId!),
    enabled: Boolean(selectedId && enabled),
  });

  const createTunnelMutation = useMutation({
    mutationFn: (name: string) => api.createTunnel(name),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["tunnels"] });
    },
  });

  const renameTunnelMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      api.updateTunnel(id, { name }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["tunnels"] });
    },
  });

  const deleteTunnelMutation = useMutation({
    mutationFn: (id: string) => api.deleteTunnel(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["tunnels"] });
    },
  });

  const updateConfigMutation = useMutation({
    mutationFn: ({ id, ingress }: { id: string; ingress: TunnelIngressRule[] }) =>
      api.setTunnelConfig(id, { config: { ingress } }),
    onSuccess: (_, vars) => {
      void queryClient.invalidateQueries({ queryKey: ["tunnel-config", vars.id] });
      void queryClient.invalidateQueries({ queryKey: ["tunnels"] });
    },
  });

  return {
    tunnelsQuery,
    tunnels,
    connectionsQuery,
    connections: (connectionsQuery.data ?? []) as TunnelConnection[],
    connectionsLoading: connectionsQuery.isFetching,
    configQuery,
    config: configQuery.data?.config ?? null,
    configLoading: configQuery.isFetching,
    tokenQuery,
    token: tokenQuery.data?.token ?? null,
    tokenLoading: tokenQuery.isFetching,

    createTunnel: createTunnelMutation.mutateAsync,
    isCreatingTunnel: createTunnelMutation.isPending,

    renameTunnel: renameTunnelMutation.mutateAsync,
    isRenamingTunnel: renameTunnelMutation.isPending,

    deleteTunnel: deleteTunnelMutation.mutateAsync,
    isDeletingTunnel: deleteTunnelMutation.isPending,

    updateConfig: updateConfigMutation.mutateAsync,
    isUpdatingConfig: updateConfigMutation.isPending,
  };
}
