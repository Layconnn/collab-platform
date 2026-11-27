import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  status: { enabled: false, enabledAt: null as Date | null, recoveryCodesLeft: 0 },
  begin: vi.fn(),
  enable: vi.fn(),
  disable: vi.fn(),
  regenerate: vi.fn(),
  beginData: null as null | { secret: string; otpauthUrl: string },
  mutation: (mutate: (...args: unknown[]) => unknown, data?: () => unknown) => () => ({ mutate, isPending: false, error: null, data: data?.() }),
}));

vi.mock("@/lib/trpc/api-client", () => ({
  trpc: {
    useUtils: () => ({ security: { twoStep: { invalidate: vi.fn() }, log: { invalidate: vi.fn() } } }),
    security: {
      twoStep: { useQuery: () => ({ data: mocks.status, error: null }) },
      beginTwoStep: { useMutation: mocks.mutation(mocks.begin, () => mocks.beginData) },
      enableTwoStep: { useMutation: mocks.mutation(mocks.enable) },
      disableTwoStep: { useMutation: mocks.mutation(mocks.disable) },
      regenerateRecoveryCodes: { useMutation: mocks.mutation(mocks.regenerate) },
    },
  },
}));

import { TwoStepSettings } from "./TwoStepSettings";

const CODES = ["abcde-fghjk", "mnpqr-stuvw", "xyz23-45678", "a2b3c-d4e5f", "ghjkm-npqrs", "tuvwx-yz234", "56789-abcde", "fghjk-mnpqr", "stuvw-xyz23", "45678-a2b3c"];

describe("Two-step sign-in settings", () => {
  beforeEach(() => {
    for (const fn of [mocks.begin, mocks.enable, mocks.disable, mocks.regenerate]) fn.mockReset();
    mocks.status = { enabled: false, enabledAt: null, recoveryCodesLeft: 0 };
    mocks.beginData = { secret: "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP", otpauthUrl: "otpauth://totp/Commons%3Ame%40example.com?secret=JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP&issuer=Commons" };
  });
  afterEach(cleanup);

  it("sets up with a QR code, a typed key and a confirming code, then shows the recovery codes once", () => {
    render(<TwoStepSettings />);
    expect(screen.getByText("Off")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Set up two-step sign-in" }));
    expect(mocks.begin).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("img", { name: "QR code to add Commons to your authenticator app" })).toBeTruthy();
    expect(screen.getByLabelText("Setup key").textContent).toBe("JBSW Y3DP EHPK 3PXP JBSW Y3DP EHPK 3PXP");

    const code = screen.getByLabelText("Enter the 6-digit code it shows");
    fireEvent.change(code, { target: { value: "12a" } });
    fireEvent.click(screen.getByRole("button", { name: "Turn on" }));
    expect(screen.getByRole("alert").textContent).toBe("Enter the 6-digit code from your app.");
    expect(mocks.enable).not.toHaveBeenCalled();

    fireEvent.change(code, { target: { value: "123 456" } });
    fireEvent.click(screen.getByRole("button", { name: "Turn on" }));
    expect(mocks.enable).toHaveBeenCalledWith({ code: "123456" }, expect.any(Object));

    // Turned on: the ten codes, shown until they're saved.
    act(() => mocks.enable.mock.calls[0]![1].onSuccess({ recoveryCodes: CODES }));
    expect(screen.getByRole("status").textContent).toBe("Two-step sign-in is on.");
    const list = within(screen.getByRole("list", { name: "Recovery codes" })).getAllByRole("listitem");
    expect(list.map((item) => item.textContent)).toEqual(CODES);
    const done = screen.getByRole("button", { name: "Done" });
    expect(done.hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByLabelText("I’ve saved my recovery codes"));
    fireEvent.click(done);
    expect(screen.queryByRole("list", { name: "Recovery codes" })).toBeNull();
  });

  it("cancels setup without turning anything on", () => {
    render(<TwoStepSettings />);
    fireEvent.click(screen.getByRole("button", { name: "Set up two-step sign-in" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("button", { name: "Set up two-step sign-in" })).toBeTruthy();
    expect(mocks.enable).not.toHaveBeenCalled();
  });

  it("when on, offers new codes with a code and turning off with the password and a code", () => {
    mocks.status = { enabled: true, enabledAt: new Date("2026-11-20T10:00:00Z"), recoveryCodesLeft: 2 };
    render(<TwoStepSettings />);
    expect(screen.getByText("On")).toBeTruthy();
    expect(screen.getByText("2 of 10 left. Get new codes soon.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Get new codes" }));
    const newCodes = screen.getByRole("form", { name: "Get new recovery codes" });
    fireEvent.change(within(newCodes).getByLabelText("Code from your app"), { target: { value: "654321" } });
    fireEvent.click(within(newCodes).getByRole("button", { name: "Get new codes" }));
    expect(mocks.regenerate).toHaveBeenCalledWith({ code: "654321" }, expect.any(Object));

    fireEvent.click(screen.getByRole("button", { name: "Turn off" }));
    const off = screen.getByRole("form", { name: "Turn off two-step sign-in" });
    fireEvent.change(within(off).getByLabelText("Password"), { target: { value: "my-password-1" } });
    fireEvent.change(within(off).getByLabelText("Code from your app or a recovery code"), { target: { value: "abcde-fghjk" } });
    fireEvent.click(within(off).getByRole("button", { name: "Turn off two-step sign-in" }));
    expect(mocks.disable).toHaveBeenCalledWith({ password: "my-password-1", code: "abcde-fghjk" }, expect.any(Object));
  });
});
