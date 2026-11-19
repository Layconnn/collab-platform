---
name: investigate-deployment-errors
description: Investigate a failed or misbehaving Vercel deployment of Commons — build failures, function errors after deploy, missing environment variables, queue consumer errors. Use when a deployment fails, a preview is broken, or production started erroring after a release.
argument-hint: "[deployment-url | branch]"
---

# Investigate Deployment Errors

Read @docs/how-to-do-devops.md, then:

1. Identify the deployment: the URL in `$ARGUMENTS`, the latest deployment for the named branch, or the latest production deployment.
2. `npx vercel inspect <url> --logs` for build output; find the first real error, not the last line.
3. For runtime failures, read the function logs around the first failing request.
4. Compare environment variable **names** between Preview and Production when a variable may be missing (`npx vercel env ls`); never pull or print values.
5. Reproduce locally with `pnpm -C apps/web run build` when the failure is a build error.

Report the root cause, the evidence, and a proposed fix. Do not commit or redeploy without approval.
