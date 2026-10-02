import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "@/components/ui/Toast";
import { tasksApi, type TaskFilters, type TaskInput, type TaskUpdateMeta } from "@/features/tasks/api";
import type { ApiResult } from "@/lib/apiClient";
import { formatDueDate } from "@/lib/format";
import type { Task } from "@/lib/types";

export const tasksKey = ["tasks"] as const;

export function useTasks(filters: TaskFilters) {
  return useQuery({
    queryKey: [...tasksKey, filters],
    queryFn: () => tasksApi.list(filters),
    placeholderData: keepPreviousData,
  });
}

function useInvalidateTasks() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: tasksKey });
    // Due-date or status changes can add or clear notifications.
    queryClient.invalidateQueries({ queryKey: ["notifications"] });
    queryClient.invalidateQueries({ queryKey: tagsKey });
    queryClient.invalidateQueries({ queryKey: trashKey });
  };
}

export const tagsKey = ["tags"] as const;
export const trashKey = ["trash"] as const;

export function useTags() {
  return useQuery({ queryKey: tagsKey, queryFn: tasksApi.tags, staleTime: 60_000 });
}

/** Tells the user when completing a recurring task scheduled the next one. */
export function useNextOccurrenceToast() {
  const { t } = useTranslation();
  const toast = useToast();
  return useCallback(
    (result: ApiResult<Task, TaskUpdateMeta | null>) => {
      const next = result.meta?.nextOccurrence;
      if (next) toast(t("task.nextScheduled", { title: result.data.title, date: formatDueDate(next.dueAt) }));
    },
    [toast, t],
  );
}

export function useCreateTask() {
  const onSuccess = useInvalidateTasks();
  return useMutation({ mutationFn: tasksApi.create, onSuccess });
}

export function useUpdateTask() {
  const invalidate = useInvalidateTasks();
  const notifyNext = useNextOccurrenceToast();
  return useMutation({
    mutationFn: ({ id, ...input }: Partial<TaskInput> & { id: number }) => tasksApi.update(id, input),
    onSuccess: (result) => {
      invalidate();
      notifyNext(result);
    },
  });
}

/** Moves a task to the trash and offers "Undo" for a few seconds. */
export function useDeleteTask() {
  const invalidate = useInvalidateTasks();
  const restore = useRestoreTask();
  const toast = useToast();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: (task: Pick<Task, "id" | "title">) => tasksApi.remove(task.id),
    onSuccess: (_result, task) => {
      invalidate();
      toast(t("trash.moved", { title: task.title }), "info", {
        label: t("trash.undo"),
        onClick: () => restore.mutate(task),
      });
    },
  });
}

export function useRestoreTask() {
  const invalidate = useInvalidateTasks();
  const toast = useToast();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: (task: Pick<Task, "id" | "title">) => tasksApi.restore(task.id),
    onSuccess: (_result, task) => {
      invalidate();
      toast(t("trash.restored", { title: task.title }));
    },
  });
}

export function useTrash() {
  return useQuery({ queryKey: trashKey, queryFn: tasksApi.trash });
}

export function useDeleteForever() {
  const invalidate = useInvalidateTasks();
  return useMutation({ mutationFn: tasksApi.deleteForever, onSuccess: invalidate });
}

export function useEmptyTrash() {
  const invalidate = useInvalidateTasks();
  return useMutation({ mutationFn: tasksApi.emptyTrash, onSuccess: invalidate });
}
