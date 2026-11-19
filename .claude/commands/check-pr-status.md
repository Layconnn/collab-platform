# Check PR status

Bring the pull request for the current branch to a clean state in one pass. For repeated review rounds, use `/finish-pr`.

1. **Identify the pull request** with `gh pr view --json number,headRefName,baseRefName,url,state`. If none exists, stop and say so.
2. **Sync with the base:** `git fetch origin <base>`. If behind, rebase onto it and resolve conflicts without discarding work; if the rebase looks risky, stop and ask. Push with `--force-with-lease=<branch>:<expected-sha>`, never plain `--force`.
3. **Failing checks:** `gh pr checks <pr>`; diagnose each failure with the `ci-workflow` skill; fix the cause and push. Never skip hooks or bypass checks.
4. **Review comments:** read `gh pr view <pr> --comments` and the inline comments (`gh api repos/{owner}/{repo}/pulls/<pr>/comments`). Fix consequential ones that are not yet addressed; skip nits unless trivial.
5. **Report** sync state, check status, comments addressed and left, and the pull request URL as the last line.
