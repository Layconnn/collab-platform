import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

// The CSRF token lives in sessionStorage, so a signed-in journey must stay in
// one page. Each run uses a fresh user and its own client IP for rate limits.
const unique = () => randomUUID().replaceAll("-", "").slice(0, 10);

test.use({ extraHTTPHeaders: { "x-forwarded-for": `10.0.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` } });

test("the landing page invites people to sign up", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "A workspace for conversations worth keeping." })).toBeVisible();
  await page.getByRole("navigation", { name: "Public navigation" }).getByRole("link", { name: "Get started" }).click();
  await expect(page).toHaveURL(/\/register$/);
  await expect(page.getByRole("button", { name: "Create account" })).toBeVisible();
});

test("signed-out visitors are sent to sign in", async ({ page }) => {
  await page.goto("/workspace");
  await expect(page).toHaveURL(/\/login\?next=%2Fworkspace$/);
});

test("a new user registers, records a decision from a discussion and signs out", async ({ page }) => {
  const id = unique();
  const workspaceName = `Smoke ${id}`;
  const discussionTitle = `Which database for ${id}?`;
  const question = `Use PostgreSQL for ${id}?`;

  await test.step("register", async () => {
    await page.goto("/register");
    await page.getByLabel("Email").fill(`smoke_${id}@example.test`);
    await page.getByLabel("Username").fill(`smoke_${id}`);
    await page.getByLabel("Password", { exact: true }).fill(`smoke-password-${id}`);
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page).toHaveURL(/\/workspace$/);
    await expect(page.getByRole("heading", { level: 1, name: /^Good (morning|afternoon|evening)/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Start with a workspace" })).toBeVisible();
    await expect(page.getByRole("main").getByText(`smoke_${id}`, { exact: true })).toBeVisible();
  });

  await test.step("create a workspace", async () => {
    await page.getByRole("main").getByRole("button", { name: "Create a workspace" }).click();
    const dialog = page.getByRole("dialog", { name: "Create a workspace" });
    await dialog.getByLabel("Workspace name").fill(workspaceName);
    await dialog.getByLabel("Workspace address").fill(`smoke-${id}`);
    await dialog.getByRole("button", { name: "Create workspace" }).click();
    await expect(page).toHaveURL(/\/workspace\/[a-z0-9]+$/);
  });

  await test.step("start a discussion", async () => {
    await page.getByRole("link", { name: "Start a discussion" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Discussions" })).toBeVisible();
    const composer = page.getByRole("region", { name: "New discussion" });
    await composer.getByLabel("Title").fill(discussionTitle);
    await composer.getByLabel("Context").fill("We need transactions and constraints for decision records.");
    await composer.getByRole("button", { name: "Publish discussion" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Discussion published." })).toBeVisible();
    // Publishing queued a notification job; no worker runs here, so it is still
    // pending, and the health check counts it without reporting a delay.
    const health = await page.request.get("/api/health/notifications");
    expect(health.status()).toBe(200);
    const backlog = await health.json();
    expect(backlog.status).toBe("ok");
    expect(backlog.pending).toBeGreaterThanOrEqual(1);
    await page.getByRole("link", { name: `Open ${discussionTitle}` }).click();
    await expect(page.getByRole("heading", { level: 1, name: discussionTitle })).toBeVisible();
  });

  await test.step("propose a decision", async () => {
    await page.getByRole("button", { name: "Propose decision" }).click();
    await page.getByLabel("Decision question").fill(question);
    await page.getByLabel("Proposed outcome").fill("Use PostgreSQL");
    await page.getByLabel("Rationale").fill("Transactions and constraints fit the workflow.");
    await page.getByRole("button", { name: "Save proposal" }).click();
    await expect(page).toHaveURL(/\/decisions\/[a-z0-9]+$/);
    await expect(page.getByRole("heading", { level: 1, name: question })).toBeVisible();
    await expect(page.getByText("Proposal", { exact: true }).first()).toBeVisible();
  });

  await test.step("find it in the decision list", async () => {
    await page.getByRole("link", { name: "Back to decisions" }).click();
    await expect(page.getByRole("heading", { level: 3, name: question })).toBeVisible();
  });

  await test.step("jump with the command palette", async () => {
    await page.keyboard.press("Control+K");
    const palette = page.getByRole("dialog", { name: "Command palette" });
    await expect(palette).toBeVisible();
    await palette.getByRole("combobox").fill("open discussions");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/discussions$/);
    await expect(palette).toBeHidden();
  });

  await test.step("find it from the palette's live results", async () => {
    await page.keyboard.press("Control+K");
    const palette = page.getByRole("dialog", { name: "Command palette" });
    await palette.getByRole("combobox").fill(`PostgreSQL ${id}`);
    const result = palette.getByRole("option", { name: new RegExp(`^${question.replace(/[?]/g, "\\?")}`) });
    await expect(result).toBeVisible();
    await result.click();
    await expect(page).toHaveURL(/\/decisions\/[a-z0-9]+$/);
    await expect(page.getByRole("heading", { level: 1, name: question })).toBeVisible();
  });

  await test.step("find it with search", async () => {
    await page.goto(`/search?q=${id}`);
    const results = page.getByRole("region", { name: "Search results" });
    await expect(results.getByRole("link", { name: question })).toBeVisible();
    await expect(results.getByRole("link", { name: discussionTitle })).toBeVisible();
  });

  await test.step("sign out", async () => {
    await page.getByLabel(/^Account menu for /).click();
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goto("/workspace");
    await expect(page).toHaveURL(/\/login\?next=/);
  });
});
