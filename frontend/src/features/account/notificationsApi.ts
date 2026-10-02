import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/apiClient";

export interface NotificationPreferences {
  emailReminders: boolean;
  pushReminders: boolean;
  dailyDigest: boolean;
  digestHour: number;
  timezone: string;
}

export const reminderApi = {
  preferences: () => api.get<NotificationPreferences>("/reminders/preferences").then((r) => r.data),
  updatePreferences: (input: Partial<NotificationPreferences>) =>
    api.patch<NotificationPreferences>("/reminders/preferences", input).then((r) => r.data),
  pushConfig: () => api.get<{ publicKey: string | null }>("/reminders/push/config").then((r) => r.data),
  subscribe: (subscription: PushSubscriptionJSON) => api.post<null>("/reminders/push/subscriptions", subscription),
  unsubscribe: (endpoint: string) => api.delete("/reminders/push/subscriptions", { endpoint }),
  sendTest: () => api.post<null>("/reminders/push/test"),
};

const preferencesKey = ["reminders", "preferences"] as const;

export function usePreferences() {
  return useQuery({ queryKey: preferencesKey, queryFn: reminderApi.preferences });
}

export function useUpdatePreferences() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: reminderApi.updatePreferences,
    onSuccess: (prefs) => queryClient.setQueryData(preferencesKey, prefs),
  });
}

export function usePushConfig() {
  return useQuery({ queryKey: ["reminders", "push-config"], queryFn: reminderApi.pushConfig, staleTime: Infinity });
}
