#!/usr/bin/env node
// PreToolUse guard for Edit/Write. In-flight project plans are author-owned:
// changing a PRD, TDD or PLAN under apps/web/documentation/projects/ needs the
// author's approval, so an agent surfaces divergence instead of rewriting the
// plan to match the code.
import { readFileSync } from "node:fs";
import { basename } from "node:path";

let input = null;
try {
  input = JSON.parse(readFileSync(0, "utf8"));
} catch {
  process.exit(0);
}

const file = String(input?.tool_input?.file_path ?? "").replaceAll("\\", "/");
const name = basename(file);
const isProjectPlan =
  file.includes("/documentation/projects/") && /^(.*-)?(PRD|TDD|PLAN)\.md$/.test(name);

if (isProjectPlan) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "ask",
        permissionDecisionReason: `${name} is an in-flight plan owned by its author. Surface the divergence and stop; do not edit the plan to agree with the code without approval.`,
      },
    }),
  );
}
process.exit(0);
