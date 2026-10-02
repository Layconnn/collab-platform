"use client";

export function LoadingState({ label = "Loading..." }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 text-sm text-slate-600">
      <span aria-hidden="true" className="size-4 animate-spin rounded-full border-2 border-slate-300 border-t-teal-700" />
      <span>{label}</span>
    </div>
  );
}

export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div role="status" className="rounded border border-sky-200 bg-sky-50 p-4 text-sky-950">
      <p className="font-semibold">{title}</p>
      {description ? <p className="mt-1 text-sm">{description}</p> : null}
    </div>
  );
}

export function ErrorState({ title, description }: { title: string; description?: string }) {
  return (
    <div role="alert" className="rounded border border-red-200 bg-red-50 p-4 text-red-950">
      <p className="font-semibold">{title}</p>
      {description ? <p className="mt-1 text-sm">{description}</p> : null}
    </div>
  );
}
