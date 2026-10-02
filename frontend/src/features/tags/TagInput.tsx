import { useId, useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { useTags } from "@/features/tasks/hooks";

const MAX_TAGS = 10;

/** Normalizes what was typed: no leading @/#, trimmed, at most 30 characters. */
export function cleanTag(raw: string): string {
  return raw.trim().replace(/^[@#]+/, "").trim().slice(0, 30);
}

/** Small "@name" pills. */
export function TagPills({ tags }: { tags: string[] }) {
  const { t } = useTranslation();
  return (
    <>
      {tags.map((tag) => (
        <span
          key={tag}
          aria-label={t("tags.label", { name: tag })}
          className="inline-flex items-center rounded-full border border-slate-300 px-2 py-0.5 text-xs text-slate-600"
        >
          @{tag}
        </span>
      ))}
    </>
  );
}

/** Chips + text box; Enter or comma adds, Backspace on an empty box removes the last one. */
export function TagInput({ value, onChange, label }: { value: string[]; onChange: (tags: string[]) => void; label: string }) {
  const { t } = useTranslation();
  const { data: known = [] } = useTags();
  const [draft, setDraft] = useState("");
  const listId = useId();
  const inputId = useId();

  const add = (raw: string) => {
    const name = cleanTag(raw);
    setDraft("");
    if (!name || value.length >= MAX_TAGS) return;
    if (value.some((v) => v.toLowerCase() === name.toLowerCase())) return;
    // Reuse the existing spelling of a known tag.
    const existing = known.find((k) => k.name.toLowerCase() === name.toLowerCase());
    onChange([...value, existing?.name ?? name]);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault(); // Enter must not submit the task form
      add(draft);
    } else if (e.key === "Backspace" && draft === "" && value.length) {
      onChange(value.slice(0, -1));
    }
  };

  return (
    <div className="space-y-1">
      <label htmlFor={inputId} className="block text-sm font-medium text-slate-700">
        {label}
      </label>
      <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2 py-1.5 focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500">
        {value.map((tag) => (
          <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-slate-100 py-0.5 pl-2 pr-1 text-xs text-slate-700">
            @{tag}
            <button
              type="button"
              onClick={() => onChange(value.filter((v) => v !== tag))}
              aria-label={t("tags.remove", { name: tag })}
              className="rounded-full px-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
            >
              ✕
            </button>
          </span>
        ))}
        {value.length < MAX_TAGS && (
          <input
            id={inputId}
            value={draft}
            list={listId}
            maxLength={31}
            placeholder={value.length ? "" : t("tags.add")}
            aria-describedby={`${inputId}-hint`}
            onChange={(e) => (e.target.value.endsWith(",") ? add(e.target.value.slice(0, -1)) : setDraft(e.target.value))}
            onKeyDown={onKeyDown}
            onBlur={() => draft && add(draft)}
            className="min-w-24 flex-1 border-0 bg-transparent p-0.5 text-sm focus:outline-none"
          />
        )}
      </div>
      <p id={`${inputId}-hint`} className="text-xs text-slate-400">
        {t("tags.hint")}
      </p>
      <datalist id={listId}>
        {known
          .filter((k) => !value.some((v) => v.toLowerCase() === k.name.toLowerCase()))
          .map((k) => (
            <option key={k.id} value={k.name} />
          ))}
      </datalist>
    </div>
  );
}
