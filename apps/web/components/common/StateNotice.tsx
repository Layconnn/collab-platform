"use client";

export function LoadingState({ label = "Loading..." }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="flex min-w-0 items-center gap-3 wrap-anywhere text-sm text-text-secondary">
      <span aria-hidden="true" className="size-4 animate-spin rounded-full border-2 border-border border-t-live motion-reduce:animate-none" />
      <span>{label}</span>
    </div>
  );
}

export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div role="status" className="min-w-0 wrap-anywhere rounded-2xl border border-dashed border-border px-5 py-5 text-text-primary">
      <p className="font-serif text-[1.25rem] leading-snug">{title}</p>
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
    <div role="alert" className="min-w-0 wrap-anywhere rounded-xl border border-danger/35 bg-surface px-4 py-3.5 text-text-primary">
      <p className="flex items-center gap-2 font-medium"><span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-danger" />{title}</p>
      {description ? <p className="mt-1 text-sm text-text-secondary">{description}</p> : null}
      {onRetry ? (
        <button type="button" onClick={onRetry} disabled={retrying} className="mt-2.5 inline-flex min-h-9 items-center rounded-[9px] border border-border px-3 text-[0.8125rem] font-medium text-text-primary hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring disabled:cursor-wait disabled:opacity-60">
          {retrying ? "Trying again..." : "Try again"}
        </button>
      ) : null}
    </div>
  );
}
