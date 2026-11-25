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

Marketing and authentication pages (the landing page, sign-in, registration,
the join and unsubscribe cards) are outside these rules.

The complete frontend architecture and design conventions remain in
`docs/FRONTEND_CONTEXT.md` on the local machine. That file is currently
Git-ignored, so this note records the brand decision in version control.
