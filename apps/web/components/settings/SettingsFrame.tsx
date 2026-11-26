"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, ChevronRight, Search } from "lucide-react";
import { useState, type ReactNode } from "react";

import { AppIcon } from "@/components/common/AppIcon";
import { SETTINGS_CATEGORIES, categoryOf, searchSettings } from "@/components/settings/settingsIndex";

// Settings, in the pattern of X (dashboard redesign PRD, FR-8): the category
// column with a search beside the open category. On phones the category list
// is the /settings page and each category opens full width with a way back.
export function SettingsFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [query, setQuery] = useState("");
  const atIndex = pathname === "/settings";
  const matches = searchSettings(query);

  return <div className="flex min-w-0 flex-col gap-8 lg:flex-row lg:items-start lg:gap-0">
    <nav aria-label="Settings" className={`canopy-rise min-w-0 lg:sticky lg:top-24 lg:w-[22rem] lg:shrink-0 lg:border-r lg:border-border-subtle lg:pr-5 ${atIndex ? "" : "max-lg:hidden"}`}>
      {/* The list is the page on /settings; elsewhere each page names itself. */}
      {atIndex ? <h1 className="type-canopy-title text-[2.5rem]">Settings</h1> : <p className="type-canopy-title text-[2.5rem]">Settings</p>}
      <label className="canopy-field-frame mt-4 flex min-h-10 items-center gap-2 rounded-[10px] border border-border-subtle bg-surface px-3 text-text-muted">
        <Search size={15} aria-hidden="true" />
        <span className="sr-only">Search settings</span>
        <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search settings" className="canopy-inset min-w-0 flex-1 bg-transparent text-[0.875rem] text-text-primary outline-none placeholder:text-text-muted" />
      </label>

      {query.trim() ? <div className="mt-4">
        <p role="status" className="px-1 text-xs text-text-muted">{matches.length ? `${matches.length} ${matches.length === 1 ? "setting" : "settings"}` : `No setting matches “${query.trim()}”`}</p>
        <ul aria-label="Matching settings" className="mt-2 flex flex-col gap-0.5">
          {matches.map((entry) => <li key={entry.href + entry.label}>
            <Link href={entry.href} onClick={() => setQuery("")} className="canopy-row block rounded-[10px] px-3 py-2.5 hover:bg-surface-subtle focus-visible:outline-2 focus-visible:outline-focus-ring">
              <span className="block text-[0.875rem] font-medium text-text-primary">{entry.label}</span>
              <span className="mt-0.5 block text-xs text-text-muted">{categoryOf(entry.category)?.name} · {entry.description}</span>
            </Link>
          </li>)}
        </ul>
      </div> : <ul className="canopy-stagger mt-4 flex flex-col gap-0.5">
        {SETTINGS_CATEGORIES.map((category) => {
          const current = pathname === category.href || pathname.startsWith(`${category.href}/`);
          return <li key={category.id}>
            <Link href={category.href} aria-current={current ? "page" : undefined} className={`canopy-row flex min-w-0 items-center gap-3 rounded-[10px] px-3 py-3 focus-visible:outline-2 focus-visible:outline-focus-ring ${current ? "bg-surface-active shadow-[inset_2px_0_0_var(--live)]" : "hover:bg-surface-subtle"}`}>
              <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-callout text-brand-link"><AppIcon name={category.icon} /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-[0.875rem] font-medium text-text-primary">{category.name}</span>
                <span className="mt-0.5 block text-xs leading-snug text-text-muted">{category.description}</span>
              </span>
              <ChevronRight size={16} aria-hidden="true" className="shrink-0 text-text-muted" />
            </Link>
          </li>;
        })}
      </ul>}
    </nav>
    <div className={`min-w-0 flex-1 lg:pl-10 ${atIndex ? "max-lg:hidden" : ""}`}>{children}</div>
  </div>;
}

// The top of a category or a deeper page: a back link (to the category list on
// phones, or to the category from a deeper page), a serif title and an intro.
export function SettingsHeader({ title, intro, back }: { title: string; intro?: string; back?: { href: string; label: string } }) {
  return <header className="canopy-rise border-b border-border-subtle pb-6">
    {back ? <Link href={back.href} className="mb-3 inline-flex min-h-9 items-center gap-2 text-sm font-medium text-brand-link hover:underline focus-visible:outline-2 focus-visible:outline-focus-ring"><ArrowLeft size={16} aria-hidden="true" /> {back.label}</Link>
      : <Link href="/settings" className="mb-3 inline-flex min-h-9 items-center gap-2 text-sm font-medium text-brand-link hover:underline focus-visible:outline-2 focus-visible:outline-focus-ring lg:hidden"><ArrowLeft size={16} aria-hidden="true" /> Settings</Link>}
    <h1 className="type-canopy-title text-[2.125rem] sm:text-[2.5rem]">{title}</h1>
    {intro ? <p className="mt-2 max-w-[62ch] text-[0.875rem] leading-6 text-text-secondary">{intro}</p> : null}
  </header>;
}

// A group of setting rows, as on X: a mono label over rows in one card.
export function SettingsGroup({ label, children }: { label: string; children: ReactNode }) {
  const id = `group-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return <section aria-labelledby={id} className="mt-7">
    <h2 id={id} className="type-canopy-label m-0 mb-2.5">{label}</h2>
    <div className="overflow-hidden rounded-2xl border border-border-subtle bg-surface shadow-card">{children}</div>
  </section>;
}

// One setting row: a label and a description, the current value, and a
// chevron when it opens a deeper page.
export function SettingsRow({ label, description, value, href }: { label: string; description?: string; value?: ReactNode; href?: string }) {
  const body = <>
    <span className="min-w-0 flex-1">
      <span className="block text-[0.9375rem] font-medium text-text-primary">{label}</span>
      {description ? <span className="mt-0.5 block text-[0.8125rem] leading-snug text-text-muted">{description}</span> : null}
    </span>
    {value !== undefined ? <span className="min-w-0 max-w-[50%] shrink-0 truncate text-right text-[0.8125rem] text-text-secondary">{value}</span> : null}
    {href ? <ChevronRight size={16} aria-hidden="true" className="shrink-0 text-text-muted" /> : null}
  </>;
  const classes = "flex min-w-0 items-center gap-4 border-t border-border-subtle px-5 py-4 first:border-t-0";
  return href
    ? <Link href={href} className={`canopy-row ${classes} hover:bg-surface-subtle focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-ring`}>{body}</Link>
    : <div className={classes}>{body}</div>;
}
