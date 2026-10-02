import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
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
  };
}

/** Tells the user when completing a recurring task scheduled the next one. */
export function useNextOccurrenceToast() {
  const toast = useToast();
  return useCallback(
    (result: ApiResult<Task, TaskUpdateMeta | null>) => {
      const next = result.meta?.nextOccurrence;
      if (next) toast(`Next "${result.data.title}" scheduled for ${formatDueDate(next.dueAt)}`);
    },
    [toast],
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

export function useDeleteTask() {
  const onSuccess = useInvalidateTasks();
  return useMutation({ mutationFn: tasksApi.remove, onSuccess });
}
