import type { ReactNode } from "react";
import Link from "next/link";

type Breadcrumb = { label: string; href?: string };

export function PageHeader({
  title,
  description,
  breadcrumbs,
  actions,
  metadata,
}: {
  title: string;
  description?: string;
  breadcrumbs?: Breadcrumb[];
  actions?: ReactNode;
  metadata?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-start justify-between gap-4 border-b border-border-subtle pb-5">
      <div className="min-w-0">
        {breadcrumbs?.length ? (
          <nav aria-label="Breadcrumb" className="mb-2 flex min-w-0 flex-wrap items-center gap-2 text-xs text-text-muted">
            {breadcrumbs.map((item, index) => (
              <span className="inline-flex min-w-0 items-center gap-2" key={`${item.label}-${index}`}>
                {index > 0 ? <span aria-hidden="true">/</span> : null}
                {item.href ? <Link href={item.href} className="truncate hover:text-text-primary">{item.label}</Link> : <span aria-current="page" className="truncate text-text-secondary">{item.label}</span>}
              </span>
            ))}
          </nav>
        ) : null}
        <h1 className="text-2xl font-semibold leading-8 text-text-primary">{title}</h1>
        {description ? <p className="mt-1 max-w-3xl text-sm leading-6 text-text-secondary">{description}</p> : null}
        {metadata ? <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-text-muted">{metadata}</div> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
