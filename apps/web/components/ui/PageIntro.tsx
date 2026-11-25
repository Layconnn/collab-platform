import type { ReactNode } from "react";

// The standard page header (dashboard redesign PRD, FR-7): a small mono label,
// the serif title and one plain line of facts, as on the discussion page.
export function PageIntro({ eyebrow, title, meta, actions, children, titleId }: {
  eyebrow?: ReactNode;
  title: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  titleId?: string;
}) {
  return (
    <header className="canopy-rise flex flex-wrap items-end gap-x-6 gap-y-4 border-b border-border-subtle pb-7">
      <div className="min-w-0 flex-[1_1_24rem]">
        {eyebrow ? <p className="type-canopy-label m-0 text-xs tracking-[0.06em]">{eyebrow}</p> : null}
        <h1 id={titleId} className="type-canopy-title mt-2 text-[2.35rem] wrap-anywhere sm:text-[2.875rem]">{title}</h1>
        {meta ? <div className="mt-4 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[0.8125rem] text-text-muted">{meta}</div> : null}
        {children}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
