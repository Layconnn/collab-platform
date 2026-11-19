#!/usr/bin/env node
// PreToolUse guard for Bash. Enforces docs/how-to-work-with-git-github.md:
// stage files by name, never commit or push to main/dev, and pause before
// history-destroying commands. Written in Node so it runs on Windows and Linux.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const PROTECTED = new Set(["main", "dev"]);

function readInput() {
  try {
    return JSON.parse(readFileSync(0, "utf8"));
  } catch {
    return null;
  }
}

function currentBranch(cwd) {
  try {
    return execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd, encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

function decide(permissionDecision, reason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision,
        permissionDecisionReason: `${reason} See docs/how-to-work-with-git-github.md.`,
      },
    }),
  );
  process.exit(0);
}

export function evaluate(command, branch) {
  // Each shell segment is checked on its own (cmd1 && cmd2; cmd3 | cmd4).
  for (const segment of command.split(/&&|\|\||;|\|/)) {
    const part = segment.trim();
    if (!/^git\b/.test(part)) continue;

    if (/^git\s+add\b/.test(part) && /(\s-A\b|\s--all\b|\s\.(\s|$)|\s:\/(\s|$))/.test(part)) {
      return ["deny", "Broad staging is blocked: add the files you changed by name."];
    }
    if (/^git\s+commit\b/.test(part) && /\s-[a-zA-Z]*a[a-zA-Z]*\b|\s--all\b/.test(part)) {
      return ["deny", "`git commit -a` stages every tracked change: add the files you changed by name."];
    }
    if (/^git\s+commit\b/.test(part) && branch && PROTECTED.has(branch)) {
      return ["deny", `Commits on ${branch} are blocked: create a branch for this change.`];
    }
    if (/^git\s+push\b/.test(part)) {
      const args = part.split(/\s+/).slice(2).filter((token) => !token.startsWith("-"));
      const targetsProtected = args.slice(1).some((ref) => PROTECTED.has(ref.split(":").pop()));
      // "git push" or "git push origin" pushes the current branch.
      const pushesCurrentProtected = args.length < 2 && branch && PROTECTED.has(branch);
      if (targetsProtected || pushesCurrentProtected) {
        return ["deny", "Pushes to main or dev are blocked: push a branch and open a pull request."];
      }
      if (/\s(--force|-f)(\s|$)/.test(part)) {
        return ["ask", "Plain force push: prefer --force-with-lease=<branch>:<expected-sha> and confirm with the author."];
      }
    }
    if (/^git\s+(reset\s+--hard|clean\s+-[a-zA-Z]*f|filter-branch|reflog\s+expire|gc\s+--prune)/.test(part)) {
      return ["ask", "This command discards work or history: confirm with the author first."];
    }
  }
  return null;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const input = readInput();
  const command = input?.tool_input?.command;
  if (typeof command === "string") {
    const verdict = evaluate(command, currentBranch(input.cwd || process.cwd()));
    if (verdict) decide(...verdict);
  }
  process.exit(0);
}
