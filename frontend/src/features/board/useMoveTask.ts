import { useMutation, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { useToast } from "@/components/ui/Toast";
import { tasksApi, type TaskFilters } from "@/features/tasks/api";
import { tasksKey, useNextOccurrenceToast } from "@/features/tasks/hooks";
import type { ApiResult } from "@/lib/apiClient";
import type { PageMeta, Task, TaskStatus } from "@/lib/types";

type TaskPage = ApiResult<Task[], PageMeta>;

interface MoveInput {
  task: Task;
  status: TaskStatus;
}

/**
 * Change a task's status with an optimistic update: the card jumps to its new column
 * immediately, and every cached task list is rolled back if the server says no.
 */
export function useMoveTask() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const notifyNext = useNextOccurrenceToast();

  return useMutation({
    mutationFn: ({ task, status }: MoveInput) => tasksApi.update(task.id, { status }),

    onMutate: async ({ task, status }) => {
      await queryClient.cancelQueries({ queryKey: tasksKey });
      const snapshot = queryClient.getQueriesData<TaskPage>({ queryKey: tasksKey });
      const moved: Task = {
        ...task,
        status,
        completedAt: status === "done" ? new Date().toISOString() : null,
      };

      for (const [key, page] of snapshot) {
        if (!page) continue;
        const filters = ((key as QueryKey)[1] ?? {}) as TaskFilters;

        if (!filters.status) {
          // A list not split by status: just update the card in place.
          if (page.data.some((t) => t.id === task.id)) {
            queryClient.setQueryData<TaskPage>(key, {
              ...page,
              data: page.data.map((t) => (t.id === task.id ? moved : t)),
            });
          }
          continue;
        }

        const without = page.data.filter((t) => t.id !== task.id);
        const removed = without.length !== page.data.length;
        const belongs =
          filters.status === status &&
          (!filters.priority || filters.priority === task.priority) &&
          (filters.categoryId === undefined || filters.categoryId === task.categoryId);
        if (!removed && !belongs) continue;

        queryClient.setQueryData<TaskPage>(key, {
          data: belongs ? [moved, ...without] : without,
          meta: {
            ...page.meta,
            total: page.meta.total - (removed ? 1 : 0) + (belongs ? 1 : 0),
          },
        });
      }
      return { snapshot };
    },

    onSuccess: notifyNext,

    onError: (err, _input, context) => {
      for (const [key, page] of context?.snapshot ?? []) queryClient.setQueryData(key, page);
      toast(`Couldn't move the task: ${err.message}`, "error");
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: tasksKey });
      // Completing a task stops its due-date reminders.
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}
