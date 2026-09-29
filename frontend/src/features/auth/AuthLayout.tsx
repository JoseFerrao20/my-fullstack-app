import type { ReactNode } from "react";

export function AuthLayout({ title, children, footer }: { title: string; children: ReactNode; footer: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm space-y-6 rounded-lg bg-white p-8 shadow">
        <div className="text-center">
          <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">Task Manager</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">{title}</h1>
        </div>
        {children}
        <p className="text-center text-sm text-slate-600">{footer}</p>
      </div>
    </main>
  );
}
