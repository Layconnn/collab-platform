# Commons — Codex UI prompts 25–37

**Purpose:** A visually ambitious, cohesive UI implementation phase for the existing Commons collaboration platform. Give Codex **one prompt at a time**. Review rendered screenshots and user flows, then commit before the next prompt. Do not paste all prompts as one task.

## Shared instruction — prepend to EACH prompt

```text
Before edits, read docs/PROJECT_CONTEXT.md, docs/FRONTEND_CONTEXT.md and docs/CODEX_PROMPT_FRAMEWORK.md completely; inspect actual routes, hooks, components, installed dependencies, token definitions and the previous UI work. Resolve conflicts in favor of the repository's actual implemented functionality; report uncertainties rather than guessing.

Commons must be visually distinctive and ambitious: editorial typography, deep-forest-green identity, warm premium neutrals, highly intentional layout, precise information hierarchy, real product-led visual detail, restrained tasteful depth and motion. Aim for the product quality and precision associated with best-in-class developer tools without cloning their distinctive appearance. Do not settle for generic cards, an unstyled form, stock SaaS templates or sparse sections with unexplained empty space.

Preserve Next.js App Router, Tailwind v4, Chakra UI v3, React Query server state, Zustand UI-only state, React Hook Form and shared Zod, the hook → tRPC boundary, and the real domain/permissions. Tailwind owns the global reset and Chakra's custom system has preflight:false. Do not re-enable Chakra preflight. Preserve the grid-based desktop shell; keep mobile drawer and focus management intact. Continue using Lucide icons. No new UI framework, fabricated APIs, unsupported actions, or irrelevant backend refactors.

Before coding, state the design composition in 5–8 concrete sentences, including content hierarchy, desktop/tablet/mobile behavior, signature Commons visual detail and meaningful motion (if any). Then implement rather than stopping at an abstract plan.

For every significant view handle: populated, empty, loading, error, unauthorized (where relevant), long text and mobile. Every visible action must work through existing capabilities; omit unsupported functions rather than creating dead controls. Follow WCAG 2.2 AA design principles as practical, including keyboard use, focus-visible, contrast and prefers-reduced-motion.

Motion is welcome when purposeful: roughly 120–180ms micro-feedback, 160–240ms overlays, 220–350ms layout transitions as initial tuning guidance, not rigid requirements. Prefer CSS/installed capabilities; justify any new dependency. Avoid scroll-jacking, endless ambient motion, excessive reveal animations or blocking interactions.

After implementation run web typecheck, lint and relevant tests. If browser automation is available, inspect actual screenshots at 1440, 1024, 768, 430 and 390px and test keyboard interactions; otherwise state that rendered verification remains open and provide a concise manual QA checklist. Never call a screen visually verified based only on CSS class names or tests. Report files changed, UI decisions, states, motion, responsive choices, tests, limitations and tradeoffs. STOP at the feature scope specified by this prompt.
```

---

## Prompt 25 — Signature authentication experience

```text
Implement a complete, visually distinctive Commons authentication experience: existing login, registration, auth-route layout and loading/redirect states. This should feel like a considered entry into the product, not a generic centered card or a copy of an external login screen.

FIRST inspect real routes, existing LoginForm/RegisterForm/AuthGuard, shared Zod rules, actual cookie/session workflow and any existing error components. Make no changes to auth semantics, schemas or endpoints except reporting a blocking bug.

DESIGN: Create a recognisable Commons composition: strong wordmark/identity, memorable editorial typographic hierarchy, carefully differentiated form surface, warm neutral backdrop and restrained forest-green emphasis. On wider viewports use one deliberate supporting visual area showing an abstract editorial conversation/thread motif, made from existing CSS/UI primitives, rather than a stock photograph or fake features. It must support the story of keeping context; no decorative noise. At mobile sizes focus on the actual form, reduce visual extras and keep tap targets generous. Match landing-page branding without forcing marketing navigation into authenticated flows.

FORMS: clearly differentiated default/focus/filled/invalid/disabled/submitting/server-error states; readable field-level errors mapped to fields via accessible attributes; password visibility toggle with keyboard support; appropriate autocomplete and inputmode; error messages that don't leak account existence or sensitive details. Show supported login/register links. Do not invent Google login, password reset or email verification flows if absent.

INTERACTIONS: subtle focus and CTA feedback, validation transitions without moving the entire layout, motion-reduced alternative. Preserve React Hook Form + shared Zod. Auth-check loading must never flash protected UI. Prevent double submission. Redirect behavior must match existing system.

ACCEPTANCE: take or request screenshots of login and register at desktop/mobile, including one error state; test keyboard-only submission and long error messages; confirm good spacing and typography. Finish only these auth screens; do not redesign workspace pages.
```

## Prompt 26 — Workspace home: the unmistakable Commons dashboard

```text
Redesign the existing workspace home at /workspace/[workspaceId] as a premium, information-rich COMMUNICATION HOME, not a template analytics dashboard.

Inspect actual workspace/role/recent discussion/member endpoints and the previous shell. Preserve fetching through existing hooks, session permissions and URL-derived active workspace.

COMPOSITION: Build a confident editorial page header that identifies the workspace with a small distinctive monogram/mark, name, contextual description, role and contextual actions. Avoid an oversized solid-green hero rectangle. Use subtle layered surfaces and brand detail, readable white space and visible but not noisy information hierarchy. Design the page around the next action: start/open a discussion, scan recent conversations, understand who participates. Include counts only if real data exists. Do not invent charts or fake activity.

INFORMATION: integrate the real recent discussion list and useful workspace context; present contributors/members if backed by the existing route. If the onboarding/community guidance block already exists, integrate it as a crafted sidebar note or a restrained onboarding panel instead of a detached generic card. Choose desktop asymmetric columns only when appropriate; on mobile stack by priority. Use coherent avatar, metadata and timeline patterns reusable later in Discussions.

STATES: empty first workspace should feel inviting and actionable, not vacant. Handle 1/100 discussions, long workspace names, roles, missing images, loading, errors and restricted actions. Use contextual skeletons and accurate counts.

MOTION: optional small entrance for new discussion row, button feedback and subtle expandable help disclosure only if it already exists. Nothing constantly moving.

REVIEW: verify real dashboard at 1440/1024/768/390; ensure enough density without crowding and the sidebar rail never overlaps content. Do not redesign discussion-detail or members pages in this task.
```

## Prompt 27 — Discussion list and new-discussion composer

```text
Redesign the discussion list and create-discussion experience. This is a central Commons workflow and must feel like a serious product users could work in all day.

Inspect supported list/create queries, cursor pagination, title/body schemas, author data, timestamps and permissions. Existing hooks own tRPC access. Do not invent categories, labels, pinning, advanced search or sort controls unless supported.

VISUAL: Replace generic giant card grids with a precise, highly scannable conversational index. Make title the strongest visual anchor; use restrained author identity, time, reply count, locked indicator and available excerpt. Establish a distinctive Commons thread/wayfinding motif through minimal vertical accents, typographic metadata and active/hover states. Group or filter only when real data supports it. Maintain a compact and a comfortable rhythm without bloating row height. Ensure an obvious primary “New discussion” action.

COMPOSER: create a beautifully composed focused writing experience, as a dedicated page, modal or in-context surface according to existing structure. Clear title/body emphasis, helpful real schema guidance, keyboard-friendly text area, cancel/submit hierarchy, validation, unsaved-state handling if appropriate, duplicate-submit prevention. No fake rich-text editor or backend changes. Ensure form labels and errors are accessible.

RESPONSIVE: on desktop use readable list width and optional side context only if it adds value; on mobile keep every title and action discoverable. Cursor loading must not reset list, jump scroll or duplicate records.

MOTION: purposeful row-hover feedback, composer opening/closing and submission feedback; never animate every row on every refetch. Confirm populated, empty, loading, error, one-item and long-title states.

Do not redesign individual discussion threads yet.
```

## Prompt 28 — Thread detail and nested conversation experience

```text
Make the discussion detail and threaded comments the signature Commons experience: a place where people can actually follow a conversation's reasoning over time.

Audit existing detail/comment/reply hooks, schema constraints, pagination, nesting, locked state, mentions and permission rules. Retain actual content format; do not pretend plain text is rich markdown.

LAYOUT: give the title substantial but controlled typographic presence, with clear creator/metadata and a relaxed reading measure. Distinguish the original discussion from replies by hierarchy, not by enclosing everything in big cards. Create an elegant thread anatomy: subtle connection lines, thoughtfully inset nested replies, author identity, timestamps, actions and body text. Use restrained green cues for active thread context. Deep nesting must gracefully cap visual indentation on mobile. Handle long prose, URLs, code-looking text and missing avatars.

COMPOSER: develop a refined reply area with visibly clear reply-to context, submit/cancel states, keyboard-friendly interaction, validation and error feedback. If mentioning another person is supported, visually highlight actual @username text; build autocomplete only if its data source truly exists. For locked discussions show an intentional informative read-only state. Permissions and backend checks are authoritative.

MOTION: introduce subtle context-preserving transitions when opening reply composer, inserting one successful reply, navigating to an anchor or expanding a collapsed subtree if already supported. Respect reduced motion and preserve focus/scroll. Never apply theatrical staggered animations to large comment histories.

VERIFY: short/very long discussions, 0/100+ comments, replies within replies, pagination, locked state, deleted/unavailable content, mobile, keyboard focus and pending mutation. Do not add new comment functionality.
```

## Prompt 29 — Notifications as a compact attention system

```text
Polish the existing notification bell, dropdown/popover and any current notifications surface. Previous route inspection found no dedicated notifications page: DO NOT fabricate a route merely to have one.

Inspect actual listForUser hook, read mutations, notification types, unread counts and navigation targets. Design the notification experience to be compact, crisp and distinctive, with enough context to show what changed and where it leads.

Create clear unread/read hierarchy without relying on green alone; typography + a small marker + background shift can signal attention. Each item should show type, actor/context if available, time, readable summary and destination where supported. Support count overflow (e.g. 99+ only when accurately derived), long text, no data, loading, error and more notifications than fit the popover. Use lightweight pagination/load-more only if existing hooks support it.

Handle focus trap/restore as appropriate to chosen Chakra primitive, Escape, outside click, scrolling, mobile placement, and mark-as-read pending/rollback behavior. Do not create duplicate toasts for normal marking as read.

MOTION: a tiny unread indicator transition or item-state morph is fine; never animate notifications continuously. Verify with 0, 1, many and lengthy items. Keep all API activity inside hooks.
```

## Prompt 30 — Workspace management, switching and membership

```text
Polish workspace creation, workspace list/switcher integration and the existing members screen. First inspect which invite, role, membership and removal operations actually exist; omit unsupported controls.

DESIGN: Workspace creation should feel like creating a new shared place: concise editorial introduction, purposeful name field, clear validation and preview of a simple workspace monogram if possible without backend changes. Avoid a generic admin wizard or unnecessary multi-step form. The members screen should present people and roles in a beautifully structured directory with strong identity, deliberate whitespace and practical scanning, not a huge table for a handful of entries.

Show actual available data; no invented avatars, titles, status indicators or online presence. If roles are supported, display them with appropriately restrained status treatments; permission-sensitive actions must be correctly gated but still validated server-side. For any supported destructive actions, require explicit meaningful confirmation and mutation feedback.

The existing workspace switcher must handle many workspaces, pagination and long names; preserve route validity when switching sections. On narrow screens use a content-aware list rather than a horizontally overflowing table.

MOTION: modest switcher disclosure and workspace-created confirmation. Verify zero/many workspaces, 0/50+ members, duplicate names, long identities, loading, errors and keyboard traversal. Do not change backend membership rules.
```

## Prompt 31 — Empty/loading/error/feedback orchestration

```text
Perform a route-by-route experience pass, keeping the Commons visual language unmistakable even when content or the network is missing. Do not add new features.

For all implemented public/auth/workspace/discussion/thread/members/notification surfaces, audit populated, empty, loading, failure, unauthorized and mutation states. Create thoughtful context-specific illustrations using lightweight CSS/icons only where they aid explanation; don't import generic stock art. Shape skeletons like actual finished layouts to reduce jumps. Make errors plain-language with useful retry where safe; avoid raw stack traces. Preserve shared StateNotice patterns and semantic tokens rather than multiplying one-off components.

Check permission failures, expired sessions, no workspaces, zero discussions, blank notification inbox, locked thread, mutation retry and network loss. Prefer non-intrusive inline feedback; use toasts only when warranted. Ensure optimistic mutation rollback is correct if implemented.

Do not modify business logic. Output a route-by-route state matrix and list any legitimate missing backend capability separately.
```

## Prompt 32 — Responsive composition audit

```text
Perform a true responsive design pass, not a breakpoint sprinkling pass. Review all existing routes at 1440, 1280, 1024, 768, 430, 390 and 320px and browser zoom 200% if browser tooling is available.

Check shell expanded/collapsed grid, tablet navigation breakpoint, mobile drawer, hero and product preview, auth forms, workspace summaries, discussion list, threaded comments, member layout and notification popovers. Find overflow, clipping, unsafely tiny touch targets, difficult reading measures, impossible nested comment indentation, overly large empty areas, orphan headings, sticky/fixed collisions and modals falling offscreen.

Recompose information hierarchy for mobile: primary actions remain visible, secondary metadata may move beneath the title, the preview can simplify, and comments should remain fully readable. Avoid hiding essential capabilities. Maintain desktop's ambitious visual identity in a quieter mobile adaptation. Do not regress focus, Escape or scroll locking.

If screenshots unavailable, clearly provide a manual viewport checklist. List specific fixes with before/after behavior.
```

## Prompt 33 — Fully art-directed dark theme

```text
Design and implement/audit a genuinely premium DARK THEME using existing semantic tokens and Chakra integration. This is not an invert-colors exercise. Preserve Tailwind reset ownership and Chakra preflight:false.

Define appropriate dark surface levels: outer canvas, sidebar/nav, content panel, popover, input, hover and selected. Use nuanced charcoal/deep green with readable warm-neutral text, subtle borders and controlled accent saturation. Preserve deliberate typography and hierarchy. Avoid pure black everywhere, neon greens, low-contrast metadata or glowing borders on all components.

Add an accessible theme control through the current established client-preference solution if not present; support system setting where straightforward and prevent flash of wrong theme. Store only preference, not backend data. Check Chakra overlays, portal components, disabled/hover/focus/error treatments and all marketing/auth/workspace routes. Respect reduced motion if transitioning themes; avoid flashing or animating the entire page distractingly.

Verify light/dark parity via screenshots and contrast inspections at desktop/mobile. Do not introduce another theme provider unnecessarily.
```

## Prompt 34 — Signature Commons interactions and motion pass

```text
Now perform a purposeful motion and interaction pass that makes Commons feel like a crafted product rather than a static set of screens. First produce an interaction inventory and justify each motion by its effect on comprehension or feedback.

Candidate interactions: sidebar collapse/expand, workspace switcher, mobile drawer, buttons/focus, discussion row active states, reply composer, comment insertion, notification attention state, landing-page preview storytelling and CTA transitions. Do not animate unsupported functionality. Consider one distinctive marketing-only animated walkthrough demonstrating discussion → reply → mention → notification if it can be built without new data/APIs, and ensure it stops/respects reduced motion, does not autoplay forever, and doesn't dominate text.

Prefer CSS transitions and existing Chakra capabilities; add no new animation library without identifying an actual unmet need. Keep motion short and crisp; avoid scroll-jacking, heavy parallax and layout thrashing. No infinite shimmer outside necessary loading states. Check keyboard focus, mobile performance and repeated open-close cycles. Output a motion inventory: trigger, animation, duration/easing, reduced-motion fallback and rationale.
```

## Prompt 35 — Accessibility and usability audit

```text
Audit the current application against WCAG 2.2 AA principles where applicable, using actual interactions rather than sprinkling ARIA attributes. Inspect semantics, heading sequence, links vs buttons, labels/autocomplete, error descriptions, announcements, focus visibility/order, dialog and drawer focus management, Escape/focus return, keyboard-operated dropdowns and workspace switcher, meaningful alt text, touch targets, contrast, text at zoom 200%, reduced motion and content overflow.

Verify user flows for register/login, create workspace, switch workspace, create discussion, reply, mark notification read and logout. Don't claim automated tools alone establish accessibility. Fix actionable issues without replacing the UI architecture; document manual screen-reader/browser tests left to do. Include high-severity findings first.
```

## Prompt 36 — Product-wide visual consistency, polish and performance

```text
Audit Commons as ONE product across landing, auth, shell, workspace home, discussions, thread, notifications and members. Compare actual rendered results, not just source. The result should feel authored by one design team: consistent brand identity, scales, tokens, content widths, navigation placement, surface depth, spacing, icons, avatar treatments, metadata, interactive feedback, light/dark theme and mobile adaptation.

Remove unintended duplication and accidental visual inconsistencies. Keep distinctive editorial moments, but avoid every page inventing a new convention. Audit React performance only for measurable issues: unwanted rerenders, payload/bundle growth from visual dependencies, unnecessary client components and expensive animations. Don't micro-optimize speculatively. Use existing primitives or make small justified abstractions only when multiple real usages exist.

Run typecheck/lint/tests/build if viable; inspect app at multiple viewport sizes and states where possible. Provide screenshot checklist and a before/after audit table with changes and remaining limitations. No new features or backend changes.
```

## Prompt 37 — Adversarial visual/UX edge-case test

```text
Stress test the completed Commons frontend with realistic extreme data and interactions, preferably through test fixtures, mocks or safe dev-only tools without changing production business rules.

Scenarios: 320px mobile, 200% zoom, very long workspace names/usernames, absent avatars, 0/1/100+ discussions, long discussion titles, lengthy body and URLs, deep comment trees, many notifications and 99+ badge behavior, members with varied roles, no workspace, locked discussion, forbidden/deleted resources, session expiration, slow/offline APIs, rapid double-submits, navigating during mutation, repeated drawer/switcher open-close, keyboard-only navigation, reduced motion, light/dark themes.

Check for overflow, inaccessible controls, visual fragmentation, jumpy skeletons, lost focus, duplicate network mutations and misleading feedback. Fix issues in UI only within existing contracts; raise genuine backend issues separately. Report a scenario matrix with previous behavior, fix, tests, remaining risk and manual checks. Stop after this final review.
```

---

## Suggested execution sequence and sign-off

1. Replace `docs/FRONTEND_CONTEXT.md` with the supplied updated version, preserving any later legitimate repo-only changes (review diff first).
2. If you still want a stronger landing page, request a *separate* landing-page art-direction pass after stable CSS and before/auth alongside 25; the present landing page's styling regression is resolved but its visual identity is not automatically final.
3. Run 25 and review **rendered login + register screenshots** before 26.
4. Run 26–30 one at a time, commit each accepted surface.
5. Run 31–37 as systematic whole-product passes.
6. Keep a short design decisions file or screenshot record to anchor the visual identity between Codex sessions.
