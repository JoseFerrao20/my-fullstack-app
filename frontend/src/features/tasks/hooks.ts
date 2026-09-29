import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { tasksApi, type TaskFilters, type TaskInput } from "@/features/tasks/api";

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

export function useCreateTask() {
  const onSuccess = useInvalidateTasks();
  return useMutation({ mutationFn: tasksApi.create, onSuccess });
}

export function useUpdateTask() {
  const onSuccess = useInvalidateTasks();
  return useMutation({
    mutationFn: ({ id, ...input }: Partial<TaskInput> & { id: number }) => tasksApi.update(id, input),
    onSuccess,
  });
}

export function useDeleteTask() {
  const onSuccess = useInvalidateTasks();
  return useMutation({ mutationFn: tasksApi.remove, onSuccess });
}
