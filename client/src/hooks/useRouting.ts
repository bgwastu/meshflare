import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type ProfileInput, type RoutingIssue, type RoutingRoute, type RoutingSnapshot, type SplitTunnelItem } from "../lib/api";

const KEY = ["routing"] as const;

export function useRouting() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: KEY, queryFn: api.routing });

  const refreshRouting = () => queryClient.invalidateQueries({ queryKey: KEY });
  const refreshRoutes = () => Promise.all([
    refreshRouting(),
    queryClient.invalidateQueries({ queryKey: ["tunnel-routes"] }),
    queryClient.invalidateQueries({ queryKey: ["node-routes"] }),
  ]);

  const saveSplit = useMutation({
    mutationFn: (v: { profileId: string; mode: "include" | "exclude"; items: SplitTunnelItem[] }) =>
      api.saveProfileSplitTunnels(v.profileId, v.mode, v.items),
    onSuccess: refreshRouting,
  });

  const createProfile = useMutation({ mutationFn: api.createProfile, onSuccess: refreshRouting });
  const updateProfile = useMutation({
    mutationFn: (v: { id: string; input: ProfileInput }) => api.updateProfile(v.id, v.input),
    onSuccess: refreshRouting,
  });
  const deleteProfile = useMutation({ mutationFn: api.deleteProfile, onSuccess: refreshRouting });

  const fix = useMutation({
    mutationFn: (v: { profileId: string; fix: NonNullable<RoutingIssue["fix"]> }) =>
      api.fixProfile(v.profileId, v.fix),
    onSuccess: refreshRouting,
  });

  const createRoutes = useMutation({
    mutationFn: api.createRoutes,
    onSuccess: refreshRoutes,
  });

  const deleteRoute = useMutation({
    mutationFn: (route: Pick<RoutingRoute, "type" | "id">) => api.deleteRoute(route.type, route.id),
    onSuccess: (_, route) => {
      queryClient.setQueryData<RoutingSnapshot>(KEY, (prev) =>
        prev ? { ...prev, routes: prev.routes.filter((r) => r.id !== route.id) } : prev,
      );
      return refreshRoutes();
    },
  });

  const updateComment = useMutation({
    mutationFn: (v: { route: RoutingRoute; comment: string }) =>
      api.updateRouteComment(v.route.type, v.route.id, v.comment),
    onSuccess: (_, v) => {
      queryClient.setQueryData<RoutingSnapshot>(KEY, (prev) =>
        prev
          ? { ...prev, routes: prev.routes.map((r) => (r.id === v.route.id ? { ...r, comment: v.comment } : r)) }
          : prev,
      );
      return refreshRoutes();
    },
  });

  return {
    query,
    snapshot: query.data ?? null,
    saveSplit: saveSplit.mutateAsync,
    fixProfile: fix.mutateAsync,
    createProfile: createProfile.mutateAsync,
    updateProfile: updateProfile.mutateAsync,
    deleteProfile: deleteProfile.mutateAsync,
    createRoutes: createRoutes.mutateAsync,
    deleteRoute: deleteRoute.mutateAsync,
    updateComment: updateComment.mutateAsync,
    busy:
      saveSplit.isPending ||
      fix.isPending ||
      createRoutes.isPending ||
      createProfile.isPending ||
      updateProfile.isPending ||
      deleteProfile.isPending ||
      deleteRoute.isPending ||
      updateComment.isPending,
  };
}
