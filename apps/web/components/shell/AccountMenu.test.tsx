import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/components/theme/ThemeModePicker", () => ({ ThemeModePicker: () => <button>Appearance</button> }));
vi.mock("@/components/auth/SignOutButton", () => ({ SignOutButton: () => <button>Sign out</button> }));

import { AccountMenu } from "@/components/shell/AccountMenu";

describe("AccountMenu", () => {
  afterEach(cleanup);

  it("dismisses with Escape and restores focus to the account summary", async () => {
    const { container } = render(<AccountMenu user={{ name: "Maya Chen", username: "maya", email: "maya@example.com" }} />);
    const summary = container.querySelector("summary")!;
    const details = container.querySelector("details")!;
    await userEvent.setup().click(summary);
    expect(details.open).toBe(true);
    await userEvent.setup().keyboard("{Escape}");
    expect(details.open).toBe(false);
    expect(document.activeElement).toBe(summary);
  });
});
