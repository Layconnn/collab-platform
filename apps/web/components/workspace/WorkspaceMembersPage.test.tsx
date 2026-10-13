import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  workspaceId: "c000000000000000000000001",
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ workspaceId: mocks.workspaceId }),
}));

vi.mock("@/components/workspace/WorkspaceMembersPanel", () => ({
  WorkspaceMembersPanel: ({ workspaceId }: { workspaceId: string }) => (
    <div>Members route for {workspaceId}</div>
  ),
}));

import WorkspaceMembersPage from "@/app/(workspace)/workspace/[workspaceId]/members/page";

describe("workspace members route", () => {
  afterEach(cleanup);

  it("resolves the dynamic workspace ID into the real members screen", () => {
    render(<WorkspaceMembersPage />);
    expect(
      screen.getByText(`Members route for ${mocks.workspaceId}`),
    ).toBeTruthy();
  });
});
