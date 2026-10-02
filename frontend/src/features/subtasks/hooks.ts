import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/components/ui/Toast";
import { subtasksApi } from "@/features/subtasks/api";
import { tasksKey } from "@/features/tasks/hooks";
import type { ApiResult } from "@/lib/apiClient";
import { useErrorMessage } from "@/lib/errors";
import type { PageMeta, Subtask, Task } from "@/lib/types";

// Not under ["tasks"]: those caches all hold pages of tasks (see useMoveTask).
export const subtasksKey = (taskId: number) => ["subtasks", taskId] as const;

export function useSubtasks(taskId: number) {
  return useQuery({ queryKey: subtasksKey(taskId), queryFn: () => subtasksApi.list(taskId) });
}

function useRefresh(taskId: number) {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: subtasksKey(taskId) });
    // Tasks embed their checklist (progress badges).
    queryClient.invalidateQueries({ queryKey: tasksKey });
  };
}

function useOnError() {
  const toast = useToast();
  const errorMessage = useErrorMessage();
  return (err: unknown) => toast(errorMessage(err), "error");
}

export function useAddSubtask(taskId: number) {
  const onSuccess = useRefresh(taskId);
  const onError = useOnError();
  return useMutation({ mutationFn: (title: string) => subtasksApi.create(taskId, title), onSuccess, onError });
}

export function useRenameSubtask(taskId: number) {
  const onSuccess = useRefresh(taskId);
  const onError = useOnError();
  return useMutation({
    mutationFn: ({ id, title }: { id: number; title: string }) => subtasksApi.update(taskId, id, { title }),
    onSuccess,
    onError,
  });
}

export function useDeleteSubtask(taskId: number) {
  const onSuccess = useRefresh(taskId);
  const onError = useOnError();
  return useMutation({ mutationFn: (id: number) => subtasksApi.remove(taskId, id), onSuccess, onError });
}

export function useReorderSubtasks(taskId: number) {
  const queryClient = useQueryClient();
  const refresh = useRefresh(taskId);
  const onError = useOnError();
  return useMutation({
    mutationFn: (ids: number[]) => subtasksApi.reorder(taskId, ids),
    onSuccess: (steps) => {
      queryClient.setQueryData(subtasksKey(taskId), steps);
      refresh();
    },
    onError,
  });
}

type TaskPage = ApiResult<Task[], PageMeta>;

/** Tick a step on or off; every cached copy of the task updates at once, rolled back on error. */
export function useToggleSubtask(taskId: number) {
  const queryClient = useQueryClient();
  const refresh = useRefresh(taskId);
  const onError = useOnError();

  return useMutation({
    mutationFn: ({ id, done }: { id: number; done: boolean }) => subtasksApi.update(taskId, id, { done }),

    onMutate: async ({ id, done }) => {
      await queryClient.cancelQueries({ queryKey: tasksKey });
      await queryClient.cancelQueries({ queryKey: subtasksKey(taskId) });
      const pages = queryClient.getQueriesData<TaskPage>({ queryKey: tasksKey });
      const steps = queryClient.getQueryData<Subtask[]>(subtasksKey(taskId));
      const flip = (list: Subtask[]) => list.map((s) => (s.id === id ? { ...s, done } : s));

      for (const [key, page] of pages) {
        if (!page?.data.some((t) => t.id === taskId)) continue;
        queryClient.setQueryData<TaskPage>(key, {
          ...page,
          data: page.data.map((t) => (t.id === taskId ? { ...t, subtasks: flip(t.subtasks) } : t)),
        });
      }
      if (steps) queryClient.setQueryData(subtasksKey(taskId), flip(steps));
      return { pages, steps };
    },

    onError: (err, _vars, context) => {
      for (const [key, page] of context?.pages ?? []) queryClient.setQueryData(key, page);
      if (context?.steps) queryClient.setQueryData(subtasksKey(taskId), context.steps);
      onError(err);
    },

    onSettled: refresh,
  });
}
