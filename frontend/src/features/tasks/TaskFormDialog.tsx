import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Input, Select, Textarea } from "@/components/ui/Field";
import { CategorySelect } from "@/features/categories/CategorySelect";
import { useCreateTask, useUpdateTask } from "@/features/tasks/hooks";
import {
  emptyTaskForm,
  formToInput,
  PRIORITY_LABELS,
  STATUS_LABELS,
  taskFormSchema,
  taskToForm,
  type TaskFormValues,
} from "@/features/tasks/schema";
import { ApiError } from "@/lib/apiClient";
import type { Task } from "@/lib/types";

interface Props {
  open: boolean;
  /** The task to edit, or null to create a new one. */
  task: Task | null;
  onClose: () => void;
}

export function TaskFormDialog({ open, task, onClose }: Props) {
  const create = useCreateTask();
  const update = useUpdateTask();
  const mutation = task ? update : create;

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<TaskFormValues>({
    resolver: zodResolver(taskFormSchema),
    defaultValues: emptyTaskForm,
  });

  useEffect(() => {
    if (open) {
      reset(task ? taskToForm(task) : emptyTaskForm);
      create.reset();
      update.reset();
    }
  }, [open, task, reset]);

  const onSubmit = handleSubmit((values) => {
    const input = formToInput(values);
    const options = {
      onSuccess: onClose,
      onError: (err: Error) => {
        if (err instanceof ApiError) {
          for (const fe of err.fieldErrors) {
            if (fe.field in emptyTaskForm) setError(fe.field as keyof TaskFormValues, { message: fe.message });
          }
        }
      },
    };
    if (task) update.mutate({ id: task.id, ...input }, options);
    else create.mutate(input, options);
  });

  const generalError =
    mutation.error && !(mutation.error instanceof ApiError && mutation.error.fieldErrors.length)
      ? mutation.error.message
      : null;

  return (
    <Dialog open={open} title={task ? "Edit task" : "New task"} onClose={onClose}>
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {generalError && (
          <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">
            {generalError}
          </p>
        )}
        <Input label="Title" autoFocus error={errors.title?.message} {...register("title")} />
        <Textarea label="Description" error={errors.description?.message} {...register("description")} />
        <div className="grid grid-cols-2 gap-4">
          <Select label="Status" {...register("status")}>
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
          <Select label="Priority" {...register("priority")}>
            {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
          <Input label="Due date" type="datetime-local" error={errors.dueAt?.message} {...register("dueAt")} />
          <CategorySelect label="Category" error={errors.categoryId?.message} {...register("categoryId")} />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? "Saving…" : task ? "Save changes" : "Create task"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
