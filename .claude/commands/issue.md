# Open an issue and its branch

Every pull request starts from a GitHub issue. Use this before writing code for a new task. `$ARGUMENTS` describes the task; ask if it does not say what changes and why.

1. **Draft the issue.** Title in product language, the same form as a pull request title without the number: `Commons: <Subdomain>: <task>` or `Platform: <Subdomain>: <task>` (subdomains from `apps/web/documentation/ARCHITECTURE-commons.md`). Body follows the matching template in `.github/ISSUE_TEMPLATE/` (feature, bug or chore): goal, testable acceptance criteria, notes. Label: `enhancement`, `bug`, `chore` or `documentation`.
2. **Check for duplicates:** `gh issue list --state open --search "<key words>"`. If one exists, use it instead.
3. **Create it** with `gh issue create --title ... --body-file <file> --label <label>`. Read the number from `gh issue list --limit 1` if the URL is not printed.
4. **Put it on the board** (Commons, project 1) and mark it In Progress:
   ```bash
   ITEM=$(gh project item-add 1 --owner Layconnn --url <issue-url> --format json --jq .id)
   gh project item-edit --id "$ITEM" --project-id PVT_kwHOB25dYM4Bseu1 \
     --field-id PVTSSF_lAHOB25dYM4Bseu1zhqstaI --single-select-option-id 47fc9ee4
   ```
   That is the In Progress option; other IDs: `gh project field-list 1 --owner Layconnn --format json`. Closed issues move to Done automatically.
5. **Create the branch** from the latest `dev`: `git switch dev && git pull --ff-only && git switch -c <N>-<short-slug>`.
6. Report the issue URL and the branch name.

For a planned project, `/prd` creates one issue per pull request in its delivery plan; start each from its existing issue at step 4.
