import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useToast } from "@/components/ui/Toast";
import { tasksApi } from "@/features/tasks/api";
import { tasksKey } from "@/features/tasks/hooks";
import type { ApiResult } from "@/lib/apiClient";
import { useErrorMessage } from "@/lib/errors";
import type { PageMeta, Task } from "@/lib/types";

type TaskPage = ApiResult<Task[], PageMeta>;

/** Change a task's due date; every cached copy moves at once and is rolled back on error. */
export function useRescheduleTask() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: ({ task, dueAt }: { task: Task; dueAt: Date }) => tasksApi.update(task.id, { dueAt: dueAt.toISOString() }),

    onMutate: async ({ task, dueAt }) => {
      await queryClient.cancelQueries({ queryKey: tasksKey });
      const snapshot = queryClient.getQueriesData<TaskPage>({ queryKey: tasksKey });
      const iso = dueAt.toISOString();
      for (const [key, page] of snapshot) {
        if (!page?.data.some((x) => x.id === task.id)) continue;
        queryClient.setQueryData<TaskPage>(key, {
          ...page,
          data: page.data.map((x) => (x.id === task.id ? { ...x, dueAt: iso } : x)),
        });
      }
      return { snapshot };
    },

    onError: (err, _vars, context) => {
      for (const [key, page] of context?.snapshot ?? []) queryClient.setQueryData(key, page);
      toast(t("calendar.moveFailed", { message: errorMessage(err) }), "error");
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: tasksKey });
      // A new due date resets reminders and due-soon/overdue notices.
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}
