import { api } from "@/lib/apiClient";
import type { Subtask } from "@/lib/types";

const base = (taskId: number) => `/tasks/${taskId}/subtasks`;

export const subtasksApi = {
  list: (taskId: number) => api.get<Subtask[]>(base(taskId)).then((r) => r.data),
  create: (taskId: number, title: string) => api.post<Subtask>(base(taskId), { title }).then((r) => r.data),
  update: (taskId: number, id: number, input: { title?: string; done?: boolean }) =>
    api.patch<Subtask>(`${base(taskId)}/${id}`, input).then((r) => r.data),
  remove: (taskId: number, id: number) => api.delete(`${base(taskId)}/${id}`),
  reorder: (taskId: number, ids: number[]) => api.put<Subtask[]>(`${base(taskId)}/order`, { ids }).then((r) => r.data),
};
