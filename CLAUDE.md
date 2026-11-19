# Commons

Read [`docs/AGENTS.md`](docs/AGENTS.md) and the [Commons spec map](apps/web/documentation/commons-spec-map.md) before planning changes. Source code and tests are authoritative over documents.

## Working rules

- Git and pull requests: [`docs/how-to-work-with-git-github.md`](docs/how-to-work-with-git-github.md). The `git-guard` hook blocks broad staging and commits or pushes to `main` or `dev`.
- New entities: [`docs/how-to-add-an-entity.md`](docs/how-to-add-an-entity.md).
- Production and deployments: [`docs/how-to-do-devops.md`](docs/how-to-do-devops.md).
- Finishing a pull request: [`docs/how-to-finish-pr.md`](docs/how-to-finish-pr.md).
- Local setup, CI and notification delivery: [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md).

## Skills and commands (`.claude/`)

| Need | Use |
|---|---|
| Ship the current task as a pull request | `/shipit` |
| One-pass cleanup of a pull request | `/check-pr-status` |
| Review-and-fix loop until clean | `/finish-pr` |
| Review a diff against house rules | `/review-commons` or the `review-agent` |
| Start a multi-PR project | `/prd`, then `/tdd` per change |
| Design a new entity | `entity-design` |
| Drive the app in a browser, take screenshots | `commons-browser`, then `/upload-screenshots` |
| Production health, failed deployments | `check-prod`, `investigate-deployment-errors` |
| Failing CI | `ci-workflow` |
| Dependency and secret sweep | `audit` |
