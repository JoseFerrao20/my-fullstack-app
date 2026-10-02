import { api } from "@/lib/apiClient";
import type { Notification } from "@/lib/types";

export interface NotificationsMeta {
  unreadCount: number;
}

export const notificationsApi = {
  list: () => api.get<Notification[], NotificationsMeta>("/notifications", { limit: 20 }),
  markRead: (id: number) => api.patch<Notification>(`/notifications/${id}/read`).then((r) => r.data),
  markAllRead: () => api.post<null>("/notifications/read-all"),
};
