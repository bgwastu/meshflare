import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type MeshEntry, type MeshEntryPatch } from "../lib/api";

type EntryRef = { kind: MeshEntry["kind"]; id: string };

export function useMesh(options?: { enabled?: boolean; selectedNodeId?: string | null }) {
  const queryClient = useQueryClient();
  const enabled = options?.enabled !== false;
  const selectedNodeId = options?.selectedNodeId ?? null;
  const nodeQueriesEnabled = enabled && Boolean(selectedNodeId);

  const meshQuery = useQuery({
    queryKey: ["mesh"],
    queryFn: api.listMesh,
    enabled,
  });

  const routesQuery = useQuery({
    queryKey: ["node-routes", selectedNodeId],
    queryFn: () => api.listNodeRoutes(selectedNodeId!),
    enabled: nodeQueriesEnabled,
  });

  const installQuery = useQuery({
    queryKey: ["node-token", selectedNodeId],
    queryFn: () => api.getNodeToken(selectedNodeId!),
    enabled: nodeQueriesEnabled,
  });

  /** Mesh changes also move DNS rules, so refresh the health check too. */
  const invalidateMesh = () => {
    void queryClient.invalidateQueries({ queryKey: ["mesh"] });
    void queryClient.invalidateQueries({ queryKey: ["maintenance-health"] });
  };

  const syncDnsMutation = useMutation({
    mutationFn: api.syncDns,
    onSuccess: () => {
      invalidateMesh();
      void queryClient.invalidateQueries({ queryKey: ["settings"] });
    },
  });

  const createNodeMutation = useMutation({
    mutationFn: (name: string) => api.createNode(name),
    onSuccess: invalidateMesh,
  });

  const updateEntryMutation = useMutation({
    mutationFn: ({ kind, id, patch }: EntryRef & { patch: MeshEntryPatch }) =>
      api.updateEntry(kind, id, patch),
    onSuccess: invalidateMesh,
  });

  const deleteEntryMutation = useMutation({
    mutationFn: ({ kind, id }: EntryRef) => api.remove(kind, id),
    onSuccess: invalidateMesh,
  });

  const recreateNodeMutation = useMutation({
    mutationFn: (id: string) => api.recreateNode(id),
    onSuccess: ({ node }, id) => {
      // The node is replaced; point the cached entry at the new id right away.
      queryClient.setQueryData<{ entries: MeshEntry[] }>(["mesh"], (data) =>
        data && {
          entries: data.entries.map((e) =>
            e.kind === "node" && e.id === id ? { ...e, id: node.id } : e,
          ),
        },
      );
      invalidateMesh();
      queryClient.removeQueries({ queryKey: ["node-token", id] });
      queryClient.removeQueries({ queryKey: ["node-routes", id] });
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
    entries: meshQuery.data?.entries ?? [],
    routes: routesQuery.data?.routes ?? [],
    routesLoading: routesQuery.isPending && nodeQueriesEnabled,
    nodeToken: installQuery.data?.token ?? null,
    installLoading: installQuery.isPending && nodeQueriesEnabled,

    syncDns: syncDnsMutation.mutateAsync,
    isSyncingDns: syncDnsMutation.isPending,
    createNode: createNodeMutation.mutateAsync,
    updateEntry: updateEntryMutation.mutateAsync,
    deleteEntry: deleteEntryMutation.mutateAsync,
    recreateNode: recreateNodeMutation.mutateAsync,
    addRoute: addRouteMutation.mutateAsync,
    deleteRoute: deleteRouteMutation.mutateAsync,
  };
}
