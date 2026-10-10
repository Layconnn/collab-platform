"use client";

export function LoadingState({ label = "Loading..." }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="flex items-center gap-3 text-sm text-text-secondary">
      <span aria-hidden="true" className="size-4 animate-spin rounded-full border-2 border-border border-t-brand" />
      <span>{label}</span>
    </div>
  );
}

export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div role="status" className="border border-border-subtle border-l-2 border-l-info bg-surface p-4 text-text-primary">
      <p className="font-semibold">{title}</p>
      {description ? <p className="mt-1 text-sm text-text-secondary">{description}</p> : null}
    </div>
  );
}

export function ErrorState({ title, description }: { title: string; description?: string }) {
  return (
    <div role="alert" className="border border-border-subtle border-l-2 border-l-danger bg-surface p-4 text-text-primary">
      <p className="font-semibold">{title}</p>
      {description ? <p className="mt-1 text-sm text-text-secondary">{description}</p> : null}
    </div>
  );
}
