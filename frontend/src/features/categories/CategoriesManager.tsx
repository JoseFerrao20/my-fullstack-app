import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import {
  useCategories,
  useCreateCategory,
  useDeleteCategory,
  useUpdateCategory,
} from "@/features/categories/hooks";
import type { Category } from "@/lib/types";

const DEFAULT_COLOR = "#6366f1";

function errorMessage(err: unknown) {
  return err instanceof Error ? err.message : "Something went wrong";
}

function CategoryRow({ category }: { category: Category }) {
  const [name, setName] = useState(category.name);
  const [color, setColor] = useState(category.color);
  const colorTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const update = useUpdateCategory();
  const remove = useDeleteCategory();
  const toast = useToast();

  useEffect(() => () => clearTimeout(colorTimer.current), []);

  const save = (changes: { name?: string; color?: string }) =>
    update.mutate({ id: category.id, ...changes }, { onError: (e) => toast(errorMessage(e), "error") });

  return (
    <li className="flex items-center gap-2 py-2">
      <input
        type="color"
        aria-label={`Color for ${category.name}`}
        value={color}
        onChange={(e) => {
          // The picker fires continuously while dragging; save once it settles.
          const next = e.target.value;
          setColor(next);
          clearTimeout(colorTimer.current);
          colorTimer.current = setTimeout(() => save({ color: next }), 400);
        }}
        className="h-8 w-8 cursor-pointer rounded border border-slate-300"
      />
      <input
        aria-label={`Name for ${category.name}`}
        value={name}
        maxLength={50}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => {
          const trimmed = name.trim();
          if (!trimmed) setName(category.name);
          else if (trimmed !== category.name) save({ name: trimmed });
        }}
        className="flex-1 rounded-md border border-transparent px-2 py-1 text-sm hover:border-slate-300 focus:border-indigo-500 focus:outline-none"
      />
      <Button
        variant="ghost"
        aria-label={`Delete ${category.name}`}
        onClick={() => {
          if (confirm(`Delete "${category.name}"? Its tasks will become uncategorized.`)) {
            remove.mutate(category.id, { onError: (e) => toast(errorMessage(e), "error") });
          }
        }}
      >
        ✕
      </Button>
    </li>
  );
}

export function CategoriesManager() {
  const { data: categories = [], isPending } = useCategories();
  const create = useCreateCategory();
  const [name, setName] = useState("");
  const [color, setColor] = useState(DEFAULT_COLOR);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    create.mutate(
      { name: trimmed, color },
      {
        onSuccess: () => {
          setName("");
          setColor(DEFAULT_COLOR);
        },
      },
    );
  };

  return (
    <section className="rounded-lg bg-white p-4 shadow-sm">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Categories</h2>
      {isPending ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : categories.length === 0 ? (
        <p className="text-sm text-slate-500">No categories yet.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {categories.map((c) => (
            <CategoryRow key={`${c.id}-${c.name}`} category={c} />
          ))}
        </ul>
      )}
      <form onSubmit={onSubmit} className="mt-3 flex items-center gap-2">
        <input
          type="color"
          aria-label="New category color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          className="h-8 w-8 cursor-pointer rounded border border-slate-300"
        />
        <input
          aria-label="New category name"
          placeholder="New category"
          value={name}
          maxLength={50}
          onChange={(e) => setName(e.target.value)}
          className="flex-1 rounded-md border border-slate-300 px-2 py-1 text-sm focus:border-indigo-500 focus:outline-none"
        />
        <Button type="submit" variant="secondary" disabled={!name.trim() || create.isPending}>
          Add
        </Button>
      </form>
      {create.error && <p className="mt-2 text-xs text-red-600">{errorMessage(create.error)}</p>}
    </section>
  );
}
