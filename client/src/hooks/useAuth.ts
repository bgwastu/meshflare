import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";

export function useAuth() {
  const queryClient = useQueryClient();

  const authQuery = useQuery({
    queryKey: ["auth"],
    queryFn: api.authStatus,
    staleTime: Infinity,
  });

  const authRequired =
    authQuery.data?.required === true && !authQuery.data?.authenticated;

  const loginMutation = useMutation({
    mutationFn: api.login,
    onSuccess: () => {
      void queryClient.invalidateQueries();
    },
  });

  const logoutMutation = useMutation({
    mutationFn: api.logout,
    onSuccess: () => {
      void queryClient.invalidateQueries();
    },
  });

  return {
    authQuery,
    authRequired,
    isAuthenticated: Boolean(authQuery.data?.authenticated),
    isConfigured: Boolean(authQuery.data?.required),
    login: loginMutation.mutateAsync,
    logout: logoutMutation.mutateAsync,
    isLoggingIn: loginMutation.isPending,
    isLoggingOut: logoutMutation.isPending,
    loginError: loginMutation.error,
  };
}
