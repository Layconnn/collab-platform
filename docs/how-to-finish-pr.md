# Finishing a Pull Request

Two loops, run in order, until no consequential findings remain:

1. **Local loop** — review the diff with the `review-commons` skill, fix, repeat.
2. **Checks loop** — make CI green and address review comments on GitHub.

## Local loop

1. Spawn a sub-agent (or use the `review-agent`) to run `/review-commons <pr>` against `gh pr diff <pr>` and return its findings.
2. Fix every `blocker` and `should-fix`; fix a `nit` only when it is trivial.
3. Commit each iteration with a message that names what the review found, and push.
4. Stop when the review reports no consequential findings, or after five iterations; then report what remains.

## Checks loop

1. `gh pr checks <pr>`; for each failing job, diagnose with the `ci-workflow` skill and fix the cause. Never skip hooks or weaken a check to make it pass.
2. Read unresolved comments: `gh pr view <pr> --comments` and `gh api repos/{owner}/{repo}/pulls/<pr>/comments`.
3. Fix consequential comments, push, and reply in each thread with what changed.
4. Stop when checks are green and no consequential comments are open.

## Before marking ready

- The description's Validation section lists only what was actually run, plus what was not verified.
- UI changes include screenshots (`commons-browser`, then `/upload-screenshots`).
- The title follows `Product: Subdomain: task`.
