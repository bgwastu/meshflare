import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type MeshEntry } from "../lib/api";

export function useMesh(options?: { enabled?: boolean; selectedNodeId?: string | null }) {
  const queryClient = useQueryClient();
  const enabled = options?.enabled !== false;
  const selectedNodeId = options?.selectedNodeId ?? null;

  const meshQuery = useQuery({
    queryKey: ["mesh"],
    queryFn: () => api.listMesh(),
    enabled,
  });

  const entries = meshQuery.data?.entries ?? [];

  const routesQuery = useQuery({
    queryKey: ["node-routes", selectedNodeId],
    queryFn: () => api.listNodeRoutes(selectedNodeId!),
    enabled: Boolean(selectedNodeId && enabled),
  });

  const installQuery = useQuery({
    queryKey: ["node-token", selectedNodeId],
    queryFn: () => api.getNodeToken(selectedNodeId!),
    enabled: Boolean(selectedNodeId && enabled),
  });

  const syncDnsMutation = useMutation({
    mutationFn: api.syncDns,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["mesh"] });
      void queryClient.invalidateQueries({ queryKey: ["settings"] });
    },
  });

  const cleanupMutation = useMutation({
    mutationFn: api.cleanup,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["mesh"] });
      void queryClient.invalidateQueries({ queryKey: ["settings"] });
    },
  });

  const createNodeMutation = useMutation({
    mutationFn: (name: string) => api.createNode(name),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["mesh"] });
    },
  });

  const renameMachineMutation = useMutation({
    mutationFn: ({ kind, id, name }: { kind: "node" | "device"; id: string; name: string }) =>
      api.rename(kind, id, name),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["mesh"] });
    },
  });

  const deleteMachineMutation = useMutation({
    mutationFn: ({ kind, id }: { kind: "node" | "device"; id: string }) =>
      api.remove(kind, id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["mesh"] });
    },
  });

  const recreateNodeMutation = useMutation({
    mutationFn: (id: string) => api.recreateNode(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["mesh"] });
      if (selectedNodeId) {
        void queryClient.invalidateQueries({ queryKey: ["node-token", selectedNodeId] });
      }
    },
  });

  const addRouteMutation = useMutation({
    mutationFn: ({
      nodeId,
      type,
      value,
      comment = "",
    }: {
      nodeId: string;
      type: "cidr" | "hostname";
      value: string;
      comment?: string;
    }) => api.createNodeRoute(nodeId, type, value, comment),
    onSuccess: (_, vars) => {
      void queryClient.invalidateQueries({ queryKey: ["node-routes", vars.nodeId] });
    },
  });

  const deleteRouteMutation = useMutation({
    mutationFn: ({ nodeId, routeId }: { nodeId: string; routeId: string }) =>
      api.removeNodeRoute(nodeId, routeId),
    onSuccess: (_, vars) => {
      void queryClient.invalidateQueries({ queryKey: ["node-routes", vars.nodeId] });
    },
  });

  return {
    meshQuery,
    entries,
    routesQuery,
    routes: routesQuery.data?.routes ?? [],
    routesLoading: routesQuery.isFetching,
    installQuery,
    nodeToken: installQuery.data?.token ?? null,
    installLoading: installQuery.isFetching,

    syncDns: syncDnsMutation.mutateAsync,
    isSyncingDns: syncDnsMutation.isPending,

    cleanup: cleanupMutation.mutateAsync,
    isCleaning: cleanupMutation.isPending,

    createNode: createNodeMutation.mutateAsync,
    isCreatingNode: createNodeMutation.isPending,

    renameMachine: renameMachineMutation.mutateAsync,
    isRenamingMachine: renameMachineMutation.isPending,

    deleteMachine: deleteMachineMutation.mutateAsync,
    isDeletingMachine: deleteMachineMutation.isPending,

    recreateNode: recreateNodeMutation.mutateAsync,
    isRecreatingNode: recreateNodeMutation.isPending,

    addRoute: addRouteMutation.mutateAsync,
    isAddingRoute: addRouteMutation.isPending,

    deleteRoute: deleteRouteMutation.mutateAsync,
    isDeletingRoute: deleteRouteMutation.isPending,
  };
}
