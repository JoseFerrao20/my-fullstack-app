import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { useToast } from "@/components/ui/Toast";
import { notificationsApi } from "@/features/notifications/api";

export const notificationsKey = ["notifications"] as const;
export const POLL_INTERVAL_MS = 60_000;

export function useNotifications() {
  return useQuery({
    queryKey: notificationsKey,
    queryFn: notificationsApi.list,
    refetchInterval: POLL_INTERVAL_MS,
    refetchIntervalInBackground: false,
  });
}

/** Toasts unread notifications that appear after the first load. */
export function useNewNotificationToasts() {
  const { data } = useNotifications();
  const toast = useToast();
  const seen = useRef<Set<number> | null>(null);

  useEffect(() => {
    if (!data) return;
    const unread = data.data.filter((n) => !n.readAt);
    if (seen.current === null) {
      // First load: remember what's already there without toasting it.
      seen.current = new Set(data.data.map((n) => n.id));
      return;
    }
    for (const n of unread) {
      if (!seen.current.has(n.id)) toast(n.message);
    }
    for (const n of data.data) seen.current.add(n.id);
  }, [data, toast]);
}

export function useMarkRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: notificationsApi.markRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: notificationsKey }),
  });
}

export function useMarkAllRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: notificationsApi.markAllRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: notificationsKey }),
  });
}
