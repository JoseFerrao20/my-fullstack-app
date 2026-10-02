import { useTranslation } from "react-i18next";
import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";

const controlClass =
  "block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 aria-[invalid=true]:border-red-500";

interface FieldProps {
  label: string;
  /** A translation key (from zod schemas) or a ready-made message (e.g. from the server). */
  error?: string;
}

function FieldShell({ id, label, error, children }: FieldProps & { id: string; children: ReactNode }) {
  const { t, i18n } = useTranslation();
  const message = error && i18n.exists(error) ? t(error as "errors.generic") : error;
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium text-slate-700">
        {label}
      </label>
      {children}
      {message && (
        <p id={`${id}-error`} className="text-xs text-red-600">
          {message}
        </p>
      )}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & FieldProps>(
  function Input({ label, error, id, ...props }, ref) {
    const autoId = useId();
    const fieldId = id ?? autoId;
    return (
      <FieldShell id={fieldId} label={label} error={error}>
        <input
          ref={ref}
          id={fieldId}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${fieldId}-error` : undefined}
          className={controlClass}
          {...props}
        />
      </FieldShell>
    );
  },
);

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & FieldProps>(
  function Textarea({ label, error, id, ...props }, ref) {
    const autoId = useId();
    const fieldId = id ?? autoId;
    return (
      <FieldShell id={fieldId} label={label} error={error}>
        <textarea
          ref={ref}
          id={fieldId}
          rows={3}
          aria-invalid={error ? true : undefined}
          className={controlClass}
          {...props}
        />
      </FieldShell>
    );
  },
);

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & FieldProps>(
  function Select({ label, error, id, children, ...props }, ref) {
    const autoId = useId();
    const fieldId = id ?? autoId;
    return (
      <FieldShell id={fieldId} label={label} error={error}>
        <select ref={ref} id={fieldId} aria-invalid={error ? true : undefined} className={controlClass} {...props}>
          {children}
        </select>
      </FieldShell>
    );
  },
);
