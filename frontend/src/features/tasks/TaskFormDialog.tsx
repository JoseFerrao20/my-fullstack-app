import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Input, Select, Textarea } from "@/components/ui/Field";
import { CategorySelect } from "@/features/categories/CategorySelect";
import { subtasksApi } from "@/features/subtasks/api";
import { DraftChecklistEditor, LiveChecklistEditor } from "@/features/subtasks/ChecklistEditor";
import { tasksKey, useCreateTask, useUpdateTask } from "@/features/tasks/hooks";
import {
  emptyTaskForm,
  formToInput,
  PRIORITIES,
  RECURRENCES,
  REMIND_OPTIONS,
  remindLabel,
  recurrenceUnit,
  STATUSES,
  taskFormSchema,
  taskToForm,
  type TaskFormValues,
} from "@/features/tasks/schema";
import { ApiError } from "@/lib/apiClient";
import { useErrorMessage } from "@/lib/errors";
import type { Task } from "@/lib/types";

interface Props {
  open: boolean;
  /** The task to edit, or null to create a new one. */
  task: Task | null;
  onClose: () => void;
}

export function TaskFormDialog({ open, task, onClose }: Props) {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const create = useCreateTask();
  const update = useUpdateTask();
  const mutation = task ? update : create;
  const queryClient = useQueryClient();
  // Steps typed while creating a task; saved once the task exists.
  const [draftSteps, setDraftSteps] = useState<string[]>([]);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    watch,
    formState: { errors },
  } = useForm<TaskFormValues>({
    resolver: zodResolver(taskFormSchema),
    defaultValues: emptyTaskForm,
  });

  useEffect(() => {
    if (open) {
      reset(task ? taskToForm(task) : emptyTaskForm);
      setDraftSteps([]);
      create.reset();
      update.reset();
    }
  }, [open, task, reset]);

  const recurrence = watch("recurrence");
  // Keep a non-preset value (e.g. set through the API) selectable.
  const savedRemind = task?.remindBeforeMinutes;
  const remindOptions =
    savedRemind != null && !REMIND_OPTIONS.includes(savedRemind) ? [...REMIND_OPTIONS, savedRemind].sort((a, b) => a - b) : REMIND_OPTIONS;
  const interval = Number(watch("recurrenceInterval")) || 1;

  const onSubmit = handleSubmit((values) => {
    const input = formToInput(values, task);
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
    else
      create.mutate(input, {
        ...options,
        onSuccess: async (created) => {
          // In order, so the checklist keeps the order it was typed in.
          for (const title of draftSteps) await subtasksApi.create(created.id, title);
          if (draftSteps.length) await queryClient.invalidateQueries({ queryKey: tasksKey });
          onClose();
        },
      });
  });

  const generalError =
    mutation.error && !(mutation.error instanceof ApiError && mutation.error.fieldErrors.length)
      ? errorMessage(mutation.error)
      : null;

  return (
    <Dialog open={open} title={task ? t("taskForm.editTitle") : t("taskForm.newTitle")} onClose={onClose}>
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {generalError && (
          <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">
            {generalError}
          </p>
        )}
        <Input label={t("taskForm.title")} autoFocus error={errors.title?.message} {...register("title")} />
        <Textarea
          label={t("taskForm.description")}
          error={errors.description?.message}
          {...register("description")}
        />
        {task ? (
          <LiveChecklistEditor taskId={task.id} />
        ) : (
          <DraftChecklistEditor steps={draftSteps} onChange={setDraftSteps} />
        )}
        <div className="grid grid-cols-2 gap-4">
          <Select label={t("taskForm.status")} {...register("status")}>
            {STATUSES.map((value) => (
              <option key={value} value={value}>
                {t(`task.status.${value}`)}
              </option>
            ))}
          </Select>
          <Select label={t("taskForm.priority")} {...register("priority")}>
            {PRIORITIES.map((value) => (
              <option key={value} value={value}>
                {t(`task.priority.${value}`)}
              </option>
            ))}
          </Select>
          <Input
            label={t("taskForm.dueDate")}
            type="datetime-local"
            error={errors.dueAt?.message}
            {...register("dueAt")}
          />
          <CategorySelect
            label={t("taskForm.category")}
            error={errors.categoryId?.message}
            {...register("categoryId")}
          />
          <Select label={t("taskForm.remind")} {...register("remindBeforeMinutes")}>
            <option value="">{t("taskForm.noReminder")}</option>
            {remindOptions.map((minutes) => (
              <option key={minutes} value={minutes}>
                {remindLabel(t, minutes)}
              </option>
            ))}
          </Select>
          <Select label={t("taskForm.repeat")} {...register("recurrence")}>
            <option value="">{t("taskForm.never")}</option>
            {RECURRENCES.map((value) => (
              <option key={value} value={value}>
                {t(`task.recurrenceOption.${value}`)}
              </option>
            ))}
          </Select>
          {recurrence && (
            <div className="flex items-end gap-2">
              <div className="w-24">
                <Input
                  label={t("taskForm.every")}
                  type="number"
                  min={1}
                  max={365}
                  error={errors.recurrenceInterval?.message}
                  {...register("recurrenceInterval")}
                />
              </div>
              <span className="pb-2 text-sm text-slate-600">{recurrenceUnit(t, recurrence, interval)}</span>
            </div>
          )}
        </div>
        {recurrence && <p className="text-xs text-slate-500">{t("taskForm.repeatHint")}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>
            {t("taskForm.cancel")}
          </Button>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? t("taskForm.saving") : task ? t("taskForm.save") : t("taskForm.create")}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
