"use client";

export function LoadingState({ label = "Loading..." }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="flex min-w-0 items-center gap-3 wrap-anywhere text-sm text-text-secondary">
      <span aria-hidden="true" className="size-4 animate-spin rounded-full border-2 border-border border-t-brand" />
      <span>{label}</span>
    </div>
  );
}

export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div role="status" className="min-w-0 wrap-anywhere border border-border-subtle border-l-2 border-l-info bg-surface p-4 text-text-primary">
      <p className="font-semibold">{title}</p>
      {description ? <p className="mt-1 text-sm text-text-secondary">{description}</p> : null}
    </div>
  );
}

export function ErrorState({ title, description, onRetry, retrying = false }: {
  title: string;
  description?: string;
  onRetry?: () => void;
  retrying?: boolean;
}) {
  return (
    <div role="alert" className="min-w-0 wrap-anywhere border border-border-subtle border-l-2 border-l-danger bg-surface p-4 text-text-primary">
      <p className="font-semibold">{title}</p>
      {description ? <p className="mt-1 text-sm text-text-secondary">{description}</p> : null}
      {onRetry ? (
        <button type="button" onClick={onRetry} disabled={retrying} className="mt-3 inline-flex min-h-10 items-center rounded-sm font-semibold text-brand-link hover:text-brand-link-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring disabled:cursor-wait disabled:opacity-60">
          {retrying ? "Trying again..." : "Try again"}
        </button>
      ) : null}
    </div>
  );
}
