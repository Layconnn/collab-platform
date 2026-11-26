# Commons Brand System

Commons' canonical primary brand color is forest green `#192D20`. It replaces
`#105D47` as the product's identity color. The single source in the web app is
`--brand-primary` in `apps/web/styles/globals.css`; Tailwind v4 and Chakra v3
map to the same semantic CSS variables. Chakra preflight remains disabled.

In light mode, brand marks and primary actions use forest with white text.
Links, hover/active controls and focus rings use contrast-tested companion
greens. In dark mode, the canonical forest still anchors editorial surfaces,
while interactive marks and actions use a lighter mint with forest text so they
remain distinguishable against dark application surfaces. Components should use
`brand-accent`, `brand-action`, `brand-link`, `focus-ring` and their foreground
and state companions rather than assuming one palette shade works everywhere.

Cream `#EEE5D2`, coral `#CD6055` and paper `#F7F7F2` support the botanical
editorial identity. Coral is decorative unless a contrast-safe text companion
is used; it does not replace danger, warning or success semantics. Marketing
and authentication can use the expressive forest stage. Authenticated
workspaces should retain neutral, information-dense surfaces for daily use.

## Dashboard layout

Decided by the author on 2026-11-25. These rules apply to every page in the
signed-in dashboard (`/workspace/**`, `/search`, `/saved`, `/settings/**` and
any page added beside them).

1. **Full width.** A dashboard page uses all the space beside the sidebar: its
   outer container is `max-w-none`, never a page-level cap such as
   `max-w-[52rem]`, `max-w-2xl` or `mx-auto max-w-…`. Use the width the way
   Slack, Notion and GitHub do: columns, side panels, tables and split views,
   not one narrow centred column.
2. **The bar is Slack, Notion and GitHub.** Today's pages are too minimal to give
   people anything to remember. Every page is to be redesigned so it holds up
   next to those products: clear information hierarchy, dense but calm
   surfaces, purposeful panels and toolbars, rich empty, loading and error
   states, considered motion, and the same quality on a phone and in dark mode.
   A new or changed dashboard page should be built to this bar now rather
   than to the current minimal style.
3. **Until each page is redesigned**, pages that still carry a width cap are
   known debt for the dashboard redesign project (see the roadmap); do not
   copy their layout into new pages.

4. **One header everywhere.** The approved reference is the discussion page of
   the "Canopy" redesign: a glass top bar (breadcrumb left, actions right), then
   a small Geist Mono uppercase label, an Instrument Serif page title and one
   plain meta line, with mono uppercase section labels below. Every dashboard
   page uses this pattern. The forest sidebar is final and the same on every
   page.
5. **Settings follow X's web settings.** A category list (with search and a
   one-line description per category) beside the selected category's grouped
   setting rows, with deeper pages inside that column and a single column on
   phones. See the redesign PRD,
   [`apps/web/documentation/projects/2026-11-25-dashboard-redesign/PRD.md`](../apps/web/documentation/projects/2026-11-25-dashboard-redesign/PRD.md).

### Canopy tokens and building blocks

Defined in `apps/web/styles/globals.css` (light in `:root`, dark in
`[data-theme="dark"]`) and named for Tailwind in `apps/web/app/globals.css`.
`components/theme/BrandTokens.test.tsx` checks every text pair below for AA
contrast in both themes.

| Purpose | Tailwind names |
| --- | --- |
| Work surfaces | `bg-canvas`, `bg-surface`, `bg-surface-subtle`, `bg-surface-hover`, `bg-surface-active`, `border-border`, `border-border-subtle` |
| Text | `text-text-primary`, `text-text-secondary`, `text-text-muted` |
| Forest sidebar | `bg-sidebar`, `text-sidebar-text`, `text-sidebar-text-strong`, `text-sidebar-muted`, `bg-sidebar-hover`, `bg-sidebar-active`, `bg-sidebar-field`, `border-sidebar-line`, `bg-sidebar-live` |
| Needs you (coral) | `bg-attention` + `text-on-attention` (badges), `bg-attention-soft` + `text-attention-text` (pills, waiting states) |
| Decision status | `bg-status-proposal` + `text-on-status-proposal`, `bg-status-decided` + `text-on-status-decided`, `bg-status-replaced` + `text-on-status-replaced` |
| Live and callouts | `bg-live`, `bg-callout`, `border-callout-line` |
| Elevation | `shadow-card`, `shadow-lift`, `shadow-float` |
| Type | `font-serif` (Instrument Serif, page titles only), `type-canopy-title`, `type-canopy-label` (mono section labels) |
| Glass | `glass-bar` (top bar), `glass-float` (floating composers and action bars, menus and popovers over page content); both fall back to solid without `backdrop-filter` or under reduced transparency. Menus over the forest sidebar and the command palette stay solid: glass loses contrast over the sidebar and turns grey over a scrim |
| Motion | `canopy-rise`, `canopy-stagger` (children rise in 40 ms steps), `canopy-lift`, `canopy-zoom`, `canopy-row`, `canopy-live`, `canopy-grow`; all off under reduced motion |
| Overlays | `canopy-scrim` (the layer behind dialogs and the palette, `--scrim`), `canopy-fade`, `canopy-pop` (anything that opens), `canopy-panel` (overlay frames: no focus ring on the frame, its rows show focus) |
| Form fields | Global in `styles/globals.css` (#193): inputs, textareas and selects never draw an outline (`!outline-none`); focus shows as a `--focus-ring` border and a soft ring, or on the frame for a field marked `canopy-inset`. Every select gets the same chevron (`--select-chevron`), inset by `0.85em` with `2.6em` kept on the right, so it scales with the field. Don't add per-field outline or arrow styles |
| Accessibility | `apps/web/e2e/a11y.spec.ts` runs axe (WCAG 2.2 AA) on every signed-in page in light and dark with reduced motion, in CI with the smoke journey (#177). Every page has one `h1` (Settings and Decisions name the page itself when the list column is hidden); headings don't skip levels; muted sidebar text keeps 4.5:1 on hover and active rows (`BrandTokens.test.tsx`). A new page joins the list in that spec |

Building blocks in `apps/web/components/ui/`: `Button` and `ButtonLink`
(primary, secondary, ghost, danger), `PageIntro` (the standard page header),
`StatusPill`, `CountBadge`, `LiveDot`, `SectionLabel`, `Kbd`, `Card`,
`ContextPanel`, `SegmentedControl`, `AvatarStack`, `TableFrame` and
`tableClasses`. Use them before writing new styles; add to them when a page
needs something they lack.

Everything that floats uses the classes in `components/ui/overlay.ts`:
`floatPanelClasses` (glass menus and popovers), `solidPanelClasses` (sidebar
menus, the palette), `menuItemClasses` (one row), `scrimClasses`,
`dialogPanelClasses`, `dialogTitleClasses` (serif, like page titles) and
`overlayLabelClasses` (the mono label above a dialog title). Dialogs build on
`components/common/Modal.tsx`, which handles focus, Escape, the scrim and the
phone bottom sheet.

Marketing and authentication pages (the landing page, sign-in, registration,
the join and unsubscribe cards) are outside these rules.

The complete frontend architecture and design conventions remain in
`docs/FRONTEND_CONTEXT.md` on the local machine. That file is currently
Git-ignored, so this note records the brand decision in version control.
