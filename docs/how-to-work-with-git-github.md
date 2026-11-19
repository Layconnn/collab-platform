# How to Work with Git & GitHub

## Branch Management

- **Always check which branch you're on before committing** (`git branch --show-current` or `git status`).
- Never commit, push or merge directly to `main` or `dev`. Every change gets its own branch, created from the latest `dev`, and reaches `dev` through a pull request.
- `dev` is promoted to `main` through a pull request; Vercel deploys `main` to production.
- Avoid `git add .` and `git add -A`. Add only the files you touched, by name: `git add apps/web/server/middleware/auth.ts apps/web/server/api/trpc.ts`. Before every commit, read `git status` and `git diff --cached --stat`.
- Never commit secrets, `.env*` files, database dumps or local snapshots. `.tmp/` is git-ignored for this reason; local snapshots belong there or outside the repository.
- One concern per branch. If a change depends on an unmerged branch, branch from that branch and say so in the pull request ("Stacked on #N; merge #N first").

### Branch Naming

- Start the branch name with the GitHub issue number when one exists: `42-session-refresh`, `57-decision-reviews`.
- Without an issue, start with the kind of change: `feat/`, `fix/`, `chore/`, `docs/`, `ci/`, `refactor/` (for example `fix/next-security-upgrade`).
- Use hyphens between words; keep names short and descriptive.

### Commits

Branch commits do not survive the merge (see Title below), so write them for the reviewer: tell the story of the change in episodes, one coherent step per commit, each with a message that explains what changed and why.

### Large Features

For work that spans several pull requests, keep a project folder under `apps/web/documentation/projects/<YYYY-MM-DD>-<name>/` with a `PRD.md` and, when useful, a `planning/` folder (see [Commons spec map](../apps/web/documentation/commons-spec-map.md)).

## Pull Requests

Create pull requests with `gh` (install with `winget install GitHub.cli`, then `gh auth login`), or in the GitHub web UI with the same title and body. The body template is [`.github/pull_request_template.md`](../.github/pull_request_template.md).

```bash
gh pr create --base dev --title "Commons: Identity and Access: keep sessions alive after the access token expires" --body-file pr-body.md
```

### Title

The repository squash-merges, so the pull request title becomes the commit subject on `dev` and `main`. Write it in product language:

```
Product: Subdomain: task in that subdomain
```

| Part | What to put |
|------|-------------|
| **Product** | `Commons` for product behavior. `Platform` for cross-cutting work: CI, dependencies, infrastructure, tooling and repository documentation. |
| **Subdomain** | A subdomain from [Commons Architecture](../apps/web/documentation/ARCHITECTURE-commons.md), such as `Identity and Access`, `Discussions` or `Decision Records`. For Platform work, the area: `CI`, `Dependencies`, `Infrastructure`, `Documentation`. |
| **Task** | What this pull request does in that subdomain. One clause, starting lowercase. |

Do not use conventional-commit prefixes (`feat:`, `fix(auth):`) in titles.

Examples:

```
Commons: Decision Records: supersede finalized decisions with a linear replacement history
Commons: Identity and Access: keep sessions alive and revoke tokens on logout
Commons: Notifications: deliver notifications through Vercel Queues on Vercel
Platform: Dependencies: upgrade Next.js to 16.4.6 for critical security advisories
Platform: CI: run every test suite and scan dependencies and secrets
```

### Description

Follow the template:

1. **Lead paragraph** — what changes for users or developers and why, in two or three sentences. Put draft or blocking notes first as a quote (`> Draft: …`).
2. **`## Changes`** — bullet list of what the pull request does.
3. **`## Validation`** — what was actually run and its result, and what was **not** verified (for example "not verified in a deployed environment"). Never claim checks that were not run.
4. **`## Review notes`** — decisions, risks, follow-ups and anything a reviewer must look at explicitly.
5. **`## Screenshots`** — required for visible UI changes (see below).

### Screenshots and Recordings

- **Required for visual UI changes.** Any pull request that changes rendered UI includes at least one screenshot; add more for distinct states (loading/empty/populated, light/dark, mobile/desktop).
- **Optional for context** elsewhere: diagrams, terminal output, before/after pairs.
- **Never commit review-only screenshots to the branch.** Host them as draft GitHub release assets, which stay out of the public Releases tab and render inline:

```bash
PR_NUM=<pr-number>
gh release create --repo Layconnn/collab-platform --draft \
  --title "Screenshot assets: PR #${PR_NUM}" --notes "Screenshots for PR #${PR_NUM}" \
  "v${PR_NUM}-screenshots" ./screenshot.png
gh release view "v${PR_NUM}-screenshots" --repo Layconnn/collab-platform --json assets --jq '.assets[].url'
```

Embed with `![alt](<asset-url>)`. Dragging an image into the web editor is a fine manual fallback.

### Referencing Requirements

When a change addresses a requirement with a stable ID from a project `PRD.md` (for example `FR-2`, `NFR-1`), put the ID at the end of the title in parentheses and add an `Addresses: FR-2` line near the top of the description.

### Reviewers and Labels

- Request a review from collaborators when there are any. Until then, run `/code-review` locally before marking the pull request ready.
- Do not add labels.

### Updating a Pull Request

```bash
gh pr edit <id> --title "new title" --body-file pr-body.md
gh pr view <id> --comments | cat
```

## Shipping a Change

1. Confirm you are on the expected branch, never `main` or `dev`.
2. Stage only the files that belong to this change and commit in story-style episodes.
3. Push the branch.
4. If no pull request exists for the branch, create one with the title and description rules above; report its URL.
5. Watch the checks (`gh pr checks <id> --watch`). If a check fails, investigate and propose the fix; do not commit fixes without the author's go-ahead.

## GitHub URLs

When someone shares a GitHub URL, explore it with `gh` rather than fetching the page; private resources need authentication.
