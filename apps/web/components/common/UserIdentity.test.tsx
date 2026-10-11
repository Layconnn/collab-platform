import { describe, expect, it } from "vitest";

import { resolveUserIdentity } from "@/lib/user-identity";

describe("resolveUserIdentity", () => {
  it("prefers a nonempty display name and derives avatar initials from it", () => {
    expect(resolveUserIdentity({ name: "  Maya Chen  ", username: "maya" })).toEqual({
      label: "Maya Chen",
      avatarName: "Maya Chen",
    });
  });

  it("uses the username when the display name is absent or blank", () => {
    expect(resolveUserIdentity({ name: null, username: "maya" }).label).toBe("maya");
    expect(resolveUserIdentity({ name: "  ", username: "maya" }).avatarName).toBe("maya");
  });

  it("never turns an email into public display identity", () => {
    const user = { name: null, username: "", email: "private@example.test" };
    expect(resolveUserIdentity(user)).toEqual({
      label: "Workspace member",
      avatarName: null,
    });
  });

  it("uses a safe fallback for an unavailable author", () => {
    expect(resolveUserIdentity(null)).toEqual({ label: "Unavailable account", avatarName: null });
    expect(resolveUserIdentity(undefined)).toEqual({ label: "Unavailable account", avatarName: null });
  });
});
