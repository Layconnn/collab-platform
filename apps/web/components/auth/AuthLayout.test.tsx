import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { AuthLayout } from "@/components/auth/AuthLayout";

describe("AuthLayout previews", () => {
  afterEach(cleanup);

  it("shows returning discussion context for login", () => {
    render(<AuthLayout variant="login" eyebrow="Welcome back" title="Sign in" description="Return to the conversation." footer={null}><div>Form</div></AuthLayout>);

    expect(screen.getByText("Keep the question. Keep the context.")).toBeTruthy();
    expect(screen.getByText("2 replies")).toBeTruthy();
    expect(screen.queryByText("First discussion")).toBeNull();
  });

  it("shows a workspace's first discussion for registration", () => {
    render(<AuthLayout variant="register" eyebrow="Join" title="Register" description="Start a workspace." footer={null}><div>Form</div></AuthLayout>);

    expect(screen.getByText("Start a workspace. Start a conversation.")).toBeTruthy();
    expect(screen.getByText("First discussion")).toBeTruthy();
    expect(screen.getByText("Where should new contributors begin?")).toBeTruthy();
    expect(screen.queryByText("2 replies")).toBeNull();
  });
});
