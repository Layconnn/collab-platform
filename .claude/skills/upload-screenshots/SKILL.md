---
name: upload-screenshots
description: Upload local screenshot files as draft GitHub release assets for a pull request and return their URLs for the description. Requires a pull request number and one or more absolute file paths.
argument-hint: "<pr-number> <file>..."
allowed-tools: Bash(gh release*), Bash(gh pr view*)
---

# Upload Screenshots to GitHub

Follow [docs/how-to-work-with-git-github.md § Screenshots and Recordings](../../../docs/how-to-work-with-git-github.md#screenshots-and-recordings): review-only images are draft release assets, never committed to the branch.

## Arguments

`$ARGUMENTS` — the pull request number, then one or more absolute file paths. If the number is missing, derive it with `gh pr view --json number --jq .number`; if that fails, stop and ask.

## Steps

```bash
set -- $ARGUMENTS
PR_NUM=$1
shift
TAG="v${PR_NUM}-screenshots"
REPO=Layconnn/collab-platform

gh release view "$TAG" --repo "$REPO" >/dev/null 2>&1 || \
  gh release create --repo "$REPO" --draft \
    --title "Screenshot assets: PR #${PR_NUM}" \
    --notes "Screenshots for PR #${PR_NUM}" "$TAG"

gh release upload --repo "$REPO" --clobber "$TAG" "$@"
gh release view "$TAG" --repo "$REPO" --json assets --jq '.assets[].url'
```

## Output

One asset URL per file. Embed with `![alt](<asset-url>)` in the pull request description.
