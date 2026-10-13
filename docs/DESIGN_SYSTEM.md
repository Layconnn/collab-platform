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

The complete frontend architecture and design conventions remain in
`docs/FRONTEND_CONTEXT.md` on the local machine. That file is currently
Git-ignored, so this note records the brand decision in version control.
