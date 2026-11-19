---
name: commons-browser
description: Drive Commons in a real browser with agent-browser. Use to verify a change in the running app, take screenshots for pull request descriptions, test two-account flows (mentions, notifications, membership), check light and dark themes, or exercise a Vercel preview deployment.
allowed-tools: Bash(agent-browser*), Bash(npx agent-browser*), Bash(curl*)
---

# Commons Browser Automation

## 1. Pre-flight

```bash
npx agent-browser --version
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/login
```

If the app does not answer, start it as described in `docs/DEVELOPMENT.md` (verified Windows setup: Windows PostgreSQL, Docker Redis, `RUN_WORKER_IN_API=1`, `pnpm dev`) and stop until it is running. Never point the browser at production data for tests.

## 2. Environment

| Target | URL |
|---|---|
| Local app | http://localhost:3000 |
| Production (read-only checks only) | https://collab-platform-web.vercel.app |
| Preview deployments | `npx vercel ls collab-platform-web` |

Test accounts are created through `/register`; use two accounts for any flow that involves another member.

## 3. Working pattern

```bash
npx agent-browser open http://localhost:3000/login
npx agent-browser wait --load networkidle
npx agent-browser snapshot -i          # find refs for inputs and buttons
npx agent-browser fill @e1 "alice@example.test"
npx agent-browser fill @e2 "<password>"
npx agent-browser click @e3
npx agent-browser screenshot /tmp/commons-<state>.png
```

Use a separate session per account (`--session alice`, `--session bob`) so cookies do not mix.

## 4. Flows worth scripting

- **Mention and notification:** Alice creates a workspace, adds Bob by username, writes a discussion mentioning `@bob`; Bob's notification bell shows the mention after the next poll.
- **Access revocation:** Alice removes Bob; Bob's open workspace pages show the restricted state, not cached content.
- **Decision lifecycle:** propose from a discussion, edit, finalize as a manager, supersede with another finalized decision, read both revision histories.
- **Themes and widths:** capture light and dark, and a 375px mobile width, for every UI change.

## 5. Output

Screenshots go to a temporary folder, never into the repository. Upload them with `/upload-screenshots <pr> <files>` and embed the returned URLs in the pull request description.
