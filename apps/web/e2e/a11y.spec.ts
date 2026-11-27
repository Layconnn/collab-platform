import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

// Every signed-in page passes axe's WCAG 2.2 AA rules in light and dark
// (dashboard redesign, #177). Runs against the production build like the
// smoke journey, so CI keeps the audit from regressing.
// axe-core is a direct dev dependency, linked into this package's node_modules.
const axeSource = path.resolve(process.cwd(), "node_modules/axe-core/axe.min.js");
const unique = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

type Violation = { id: string; impact: string | null; help: string; nodes: Array<{ target: string[] }> };

async function audit(page: Page, path: string) {
  await page.goto(path);
  await expect(page.getByRole("main")).toBeVisible();
  await page.waitForLoadState("networkidle");
  await page.addScriptTag({ path: axeSource });
  const violations = await page.evaluate(async () => {
    const result = await (window as unknown as { axe: { run: (context: Document, options: object) => Promise<{ violations: Violation[] }> } })
      .axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] } });
    return result.violations.map((violation) => ({ id: violation.id, impact: violation.impact, help: violation.help, targets: violation.nodes.slice(0, 3).map((node) => node.target.join(" ")) }));
  });
  return violations;
}

test("signed-in pages meet WCAG 2.2 AA in light and dark", async ({ page }) => {
  test.setTimeout(120_000);
  const id = unique();

  await page.goto("/register");
  await page.getByLabel("Email").fill(`a11y_${id}@example.test`);
  await page.getByLabel("Username").fill(`a11y_${id}`);
  await page.getByLabel("Password", { exact: true }).fill(`a11y-password-${id}`);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/workspace$/);

  await page.getByRole("main").getByRole("button", { name: "Create a workspace" }).click();
  const dialog = page.getByRole("dialog", { name: "Create a workspace" });
  await dialog.getByLabel("Workspace name").fill(`A11y ${id}`);
  await dialog.getByLabel("Workspace address").fill(`a11y-${id}`);
  await dialog.getByRole("button", { name: "Create workspace" }).click();
  await expect(page).toHaveURL(/\/workspace\/[a-z0-9]+$/);
  const workspace = new URL(page.url()).pathname;

  await page.getByRole("link", { name: "Start a discussion" }).click();
  const composer = page.getByRole("region", { name: "New discussion" });
  await composer.getByLabel("Title").fill(`Which queue for ${id}?`);
  await composer.getByLabel("Context").fill("Comparing hosted queues against running our own.");
  await composer.getByRole("button", { name: "Publish discussion" }).click();
  await page.getByRole("link", { name: `Open Which queue for ${id}?` }).click();
  const discussion = new URL(page.url()).pathname;

  const pages = [
    "/workspace", workspace, `${workspace}/discussions`, discussion, `${workspace}/decisions`,
    `${workspace}/members`, "/search?q=queue", "/saved", "/settings", "/settings/account",
    "/settings/account/profile", "/settings/account/password", "/settings/account/data", "/settings/notifications", "/settings/notifications/digest", "/settings/notifications/kinds", "/settings/notifications/workspaces", "/settings/workspaces", "/settings/security", "/settings/security/sessions", "/settings/security/two-step", "/settings/security/log", "/settings/appearance",
  ];
  const problems: string[] = [];
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    for (const path of pages) {
      for (const violation of await audit(page, path)) {
        problems.push(`${colorScheme} ${path.replace(/c[a-z0-9]{24}/g, ":id")}: ${violation.id} (${violation.impact}) ${violation.help} at ${violation.targets.join(", ")}`);
      }
    }
  }
  expect(problems, problems.join("\n")).toEqual([]);
});
