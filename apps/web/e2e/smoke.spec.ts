import { createHmac, randomUUID } from "node:crypto";

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

test("signed-out visitors are sent to sign in from every signed-in page", async ({ page }) => {
  for (const path of ["/workspace", "/search", "/saved", "/settings", "/settings/email"]) {
    await page.goto(path);
    await expect(page).toHaveURL((url) => url.pathname === "/login" && url.searchParams.get("next") === path);
  }
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

  await test.step("add a profile photo", async () => {
    // Settings PRD, FR-3: crop in the browser, upload, and serve it back.
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
    await page.goto("/settings/account/profile");
    await page.locator('input[type="file"]').setInputFiles({ name: "me.png", mimeType: "image/png", buffer: png });
    const crop = page.getByRole("dialog", { name: "Crop your photo" });
    await crop.getByRole("button", { name: "Save photo" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Photo saved." })).toBeVisible();
    const photo = page.getByRole("region", { name: "Photo" }).locator("img");
    await expect.poll(() => photo.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBe(256);
    await page.goto("/workspace");
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

  await test.step("reply with a screenshot", async () => {
    // A 1x1 PNG, uploaded through the local-folder storage (FILES_LOCAL_DIR).
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
    const composer = page.getByRole("region", { name: "Add your perspective" });
    await composer.locator('input[type="file"]').setInputFiles({ name: "screen.png", mimeType: "image/png", buffer: png });
    const attached = composer.getByRole("list", { name: "Attached files" });
    await expect(attached.getByText(/^Image · \d+ B$/)).toBeVisible();
    await page.getByRole("button", { name: "Post comment" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Comment posted." })).toBeVisible();
    const image = page.getByRole("article", { name: /^Comment by / }).getByRole("img", { name: "screen.png" });
    await expect(image).toBeVisible();
    await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBe(1);
  });

  await test.step("edit the reply and read its history", async () => {
    // Edit history PRD: an edit keeps the version it replaced.
    const reply = page.getByRole("article", { name: /^Comment by / }).first();
    await reply.getByRole("button", { name: /^Actions for comment by / }).click();
    await page.getByRole("menuitem", { name: "Edit comment" }).click();
    await reply.getByLabel("Edit comment").fill("The screenshot shows the queue backlog.");
    await reply.getByRole("button", { name: "Save comment" }).click();
    await reply.getByRole("button", { name: /Edited.*show edit history/ }).click();
    const history = page.getByRole("dialog", { name: "Reply history" });
    await expect(history.getByRole("heading", { name: "Current version" })).toBeVisible();
    await expect(history.getByRole("heading", { name: "Original" })).toBeVisible();
    await expect(history.locator("ins").filter({ hasText: "queue backlog" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(history).toBeHidden();
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
    // The grouped list sits beside the record (Decisions v2).
    const rail = page.getByRole("navigation", { name: "Decision list" });
    await expect(rail.getByRole("link", { name: question })).toHaveAttribute("aria-current", "page");
    await page.getByRole("navigation", { name: "Breadcrumb" }).getByRole("link", { name: "Decisions" }).click();
    await expect(rail.getByRole("region", { name: /^Proposals/ }).getByRole("link", { name: question })).toBeVisible();
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

  await test.step("open Commons on the default workspace", async () => {
    // Settings PRD, FR-15.
    await page.goto("/settings/workspaces");
    await page.getByLabel("Workspace", { exact: true }).selectOption({ label: workspaceName });
    const startOnDefault = page.getByRole("radio", { name: /^Your default workspace/ });
    await startOnDefault.click();
    await expect(startOnDefault).toBeChecked();
    await expect(page.getByRole("status").filter({ hasText: "Saved." })).toBeVisible();
  });

  await test.step("sign out", async () => {
    await page.getByLabel(/^Account menu for /).click();
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goto("/workspace");
    await expect(page).toHaveURL(/\/login\?next=/);
  });

  await test.step("signing in opens the default workspace", async () => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(`smoke_${id}@example.test`);
    await page.getByLabel("Password", { exact: true }).fill(`smoke-password-${id}`);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/workspace\/[a-z0-9]+$/);
    await expect(page.getByRole("heading", { level: 1, name: workspaceName })).toBeVisible();
  });
});

// The code an authenticator app shows for a base32 key (RFC 6238), to sign in
// the way a person would.
function authenticatorCode(key: string): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const char of key.replace(/\s/g, "")) bits += alphabet.indexOf(char).toString(2).padStart(5, "0");
  const secret = Buffer.from(bits.match(/.{8}/g)!.map((byte) => parseInt(byte, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)));
  const digest = createHmac("sha1", secret).update(counter).digest();
  const offset = digest[digest.length - 1]! & 15;
  return ((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).toString().padStart(6, "0");
}

test("two-step sign-in asks for a code after the password", async ({ page }) => {
  const id = unique();
  const email = `twostep_${id}@example.test`;
  const password = `twostep-password-${id}`;
  let recoveryCode = "";

  await test.step("turn it on", async () => {
    await page.goto("/register");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Username").fill(`twostep_${id}`);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page).toHaveURL(/\/workspace$/);

    await page.goto("/settings/security/two-step");
    await page.getByRole("button", { name: "Set up two-step sign-in" }).click();
    await expect(page.getByRole("img", { name: /QR code/ })).toBeVisible();
    const key = (await page.getByLabel("Setup key").textContent()) ?? "";
    await page.getByLabel("Enter the 6-digit code it shows").fill(authenticatorCode(key));
    await page.getByRole("button", { name: "Turn on" }).click();
    const codes = page.getByRole("list", { name: "Recovery codes" }).getByRole("listitem");
    await expect(codes).toHaveCount(10);
    recoveryCode = (await codes.first().textContent()) ?? "";
    await page.getByLabel("I’ve saved my recovery codes").check();
    await page.getByRole("button", { name: "Done" }).click();
    await expect(page.getByText("10 of 10 left")).toBeVisible();
  });

  await test.step("sign out and back in with a recovery code", async () => {
    await page.getByLabel(/^Account menu for /).click();
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
    // The password alone opens nothing.
    await expect(page.getByLabel("Authentication code")).toBeFocused();
    await expect(page).toHaveURL(/\/login$/);
    await page.getByRole("button", { name: "Use a recovery code" }).click();
    await page.getByLabel("Recovery code").fill(recoveryCode);
    await page.getByRole("button", { name: "Verify" }).click();
    await expect(page).toHaveURL(/\/workspace$/);
    await page.goto("/settings/security/log");
    await expect(page.getByRole("list", { name: "Security events" }).getByText("Signed in with a recovery code")).toBeVisible();
  });
});

test("a person downloads their data, closes their account and reopens it by signing in", async ({ page }) => {
  const id = unique();
  const email = `closing_${id}@example.test`;
  const password = `closing-password-${id}`;
  await page.goto("/register");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Username").fill(`closing_${id}`);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/workspace$/);

  await page.goto("/settings/account/data");
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download your data" }).click();
  const file = await downloading;
  expect(file.suggestedFilename()).toMatch(new RegExp(`^commons-closing_${id}-\\d{4}-\\d{2}-\\d{2}\\.json$`));

  await page.getByRole("button", { name: "Close your account…" }).click();
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Close my account" }).click();
  await expect(page).toHaveURL(/\/login\?closed=1$/);
  await expect(page.getByRole("status").filter({ hasText: "Sign in within 30 days to reopen it." })).toBeVisible();
  await page.goto("/workspace");
  await expect(page).toHaveURL(/\/login\?next=/);

  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/workspace$/);
  await page.goto("/settings/security/log");
  const log = page.getByRole("list", { name: "Security events" });
  await expect(log.getByText("Account reopened by signing in")).toBeVisible();
  await expect(log.getByText("Account closed")).toBeVisible();
  await expect(log.getByText("Downloaded your data")).toBeVisible();
});

test("a teammate without an account joins with an invite link", async ({ page, browser }) => {
  const id = unique();
  const workspaceName = `Invite ${id}`;
  let link = "";

  await test.step("the owner creates a link", async () => {
    await page.goto("/register");
    await page.getByLabel("Email").fill(`owner_${id}@example.test`);
    await page.getByLabel("Username").fill(`owner_${id}`);
    await page.getByLabel("Password", { exact: true }).fill(`owner-password-${id}`);
    await page.getByRole("button", { name: "Create account" }).click();
    await page.getByRole("main").getByRole("button", { name: "Create a workspace" }).click();
    const dialog = page.getByRole("dialog", { name: "Create a workspace" });
    await dialog.getByLabel("Workspace name").fill(workspaceName);
    await dialog.getByLabel("Workspace address").fill(`invite-${id}`);
    await dialog.getByRole("button", { name: "Create workspace" }).click();
    await expect(page).toHaveURL(/\/workspace\/[a-z0-9]+$/);
    await page.goto(`${new URL(page.url()).pathname}/members`);
    await page.getByRole("button", { name: "Invite people" }).click();
    await page.getByRole("dialog", { name: "Invite people" }).getByRole("button", { name: "Create link" }).click();
    link = await page.getByRole("dialog", { name: "Your invite link" }).getByLabel("Link").inputValue();
    expect(link).toMatch(/\/join\/[A-Za-z0-9_-]{43}$/);
  });

  await test.step("a new person registers from the link and joins", async () => {
    const guest = await browser.newPage();
    await guest.goto(link);
    await expect(guest.getByRole("heading", { name: `owner_${id} invited you to join ${workspaceName}` })).toBeVisible();
    await guest.getByRole("link", { name: "Create account" }).click();
    await guest.getByLabel("Email").fill(`guest_${id}@example.test`);
    await guest.getByLabel("Username").fill(`guest_${id}`);
    await guest.getByLabel("Password", { exact: true }).fill(`guest-password-${id}`);
    await guest.getByRole("button", { name: "Create account" }).click();
    await expect(guest).toHaveURL(/\/join\//);
    await guest.getByRole("button", { name: `Join ${workspaceName}` }).click();
    await expect(guest).toHaveURL(/\/workspace\/[a-z0-9]+$/);

    // Settings PRD, FR-14: leave again from Settings → Workspaces.
    await guest.goto("/settings/workspaces");
    await guest.getByRole("button", { name: `Leave ${workspaceName}` }).click();
    await guest.getByRole("group", { name: `Confirm leaving ${workspaceName}` }).getByRole("button", { name: "Leave workspace" }).click();
    await expect(guest.getByRole("status").filter({ hasText: `You left ${workspaceName}.` })).toBeVisible();
    await expect(guest.getByRole("list", { name: "Your workspaces" })).toHaveCount(0);
    await guest.close();
  });

  await test.step("the owner sees the use", async () => {
    await page.reload();
    await expect(page.getByRole("list", { name: "Invite links" }).getByText(/^1 joined/)).toBeVisible();
  });

  await test.step("the owner can't leave, and sees who left", async () => {
    await page.goto("/settings/workspaces");
    await expect(page.getByRole("button", { name: `Leave ${workspaceName}` })).toBeDisabled();
    await page.getByRole("list", { name: "Your workspaces" }).getByRole("link", { name: workspaceName, exact: true }).click();
    await expect(page.getByRole("list", { name: "Recent activity" }).getByRole("listitem").filter({ hasText: `guest_${id} left the workspace` })).toBeVisible();
  });
});
