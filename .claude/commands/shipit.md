# Ship it!

You have been asked to ship the current task. First confirm you are on the branch you expect (`git branch --show-current`); the user may have switched branches. Never commit or push to `main` or `dev`; if in doubt, ask.

Then, following `docs/how-to-work-with-git-github.md`:

1. Stage only the files that belong to this task, by name. Read `git status` and `git diff --cached --stat` before committing.
2. Commit in story-style episodes: each commit one coherent step with a message that says what changed and why.
3. Push the branch.
4. Check for an existing pull request (`gh pr view --json url`):
   - **Exists:** report its URL. Done.
   - **Missing:** create it against `dev` (or the stacked base) with a `Product: Subdomain: task` title and a description that follows `.github/pull_request_template.md`. When the branch starts with an issue number (`<N>-slug`), the description's first line is `Closes #N`, and the squash commit body must end with `Closes #N` when the pull request is merged (the `Close issues on dev` workflow closes the issue when that commit lands on `dev`). Validation lists only checks you actually ran. Report the URL.
5. Watch the checks in the background (`gh pr checks <pr> --watch`). If a check fails, investigate with the `ci-workflow` skill and propose a fix, but do not commit it without the user's go-ahead.
