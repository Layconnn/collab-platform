import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";

import { TopBarActions, TopBarSlotProvider, useTopBarSlot } from "./TopBarActions";

function Shell({ children }: { children: React.ReactNode }) {
  const { slot, slotRef } = useTopBarSlot();
  return <><header><div data-testid="slot" ref={slotRef} /></header><main><TopBarSlotProvider slot={slot}>{children}</TopBarSlotProvider></main></>;
}

describe("TopBarActions", () => {
  afterEach(() => cleanup());

  it("puts a page's actions in the shell's top bar, even when both mount together", () => {
    render(<Shell><p>Page</p><TopBarActions><button type="button">Propose decision</button></TopBarActions></Shell>);
    expect(within(screen.getByTestId("slot")).getByRole("button", { name: "Propose decision" })).toBeTruthy();
    expect(within(screen.getByRole("main")).queryByRole("button")).toBeNull();
  });

  it("renders nothing outside a shell", () => {
    render(<TopBarActions><button type="button">Alone</button></TopBarActions>);
    expect(screen.queryByRole("button", { name: "Alone" })).toBeNull();
  });
});
