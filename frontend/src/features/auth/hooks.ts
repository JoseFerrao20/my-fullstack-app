import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { authApi } from "@/features/auth/api";
import { ApiError } from "@/lib/apiClient";

export const meKey = ["auth", "me"] as const;

export function useMe() {
  return useQuery({
    queryKey: meKey,
    queryFn: async () => {
      try {
        return await authApi.me();
      } catch (err) {
        // Logged out is a normal state, not an error.
        if (err instanceof ApiError && err.status === 401) return null;
        throw err;
      }
    },
    staleTime: Infinity,
  });
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: authApi.login,
    onSuccess: (user) => queryClient.setQueryData(meKey, user),
  });
}

export function useSignup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: authApi.signup,
    onSuccess: (user) => queryClient.setQueryData(meKey, user),
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: authApi.logout,
    onSettled: () => {
      // Drop every cached query so the next user starts clean.
      queryClient.clear();
      queryClient.setQueryData(meKey, null);
    },
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: authApi.updateProfile,
    onSuccess: (user) => queryClient.setQueryData(meKey, user),
  });
}

/** Forget everything about the current user (after logout-all or account deletion). */
function useSignedOut() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.clear();
    queryClient.setQueryData(meKey, null);
  };
}

export function useLogoutAll() {
  const signedOut = useSignedOut();
  return useMutation({ mutationFn: authApi.logoutAll, onSuccess: signedOut });
}

export function useDeleteAccount() {
  const signedOut = useSignedOut();
  return useMutation({ mutationFn: authApi.deleteAccount, onSuccess: signedOut });
}

export function useChangePassword() {
  return useMutation({ mutationFn: authApi.changePassword });
}
