import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { uiSystem } from "@/lib/ui-system";

const mocks = vi.hoisted(() => ({
  user: { id: "user-1" },
  workspace: null as unknown,
  members: null as unknown,
  resolve: vi.fn(),
  add: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  transfer: vi.fn(),
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock("@/hooks/useWorkspace", () => ({
  useWorkspaceDetail: () => mocks.workspace,
}));
vi.mock("@/hooks/useWorkspaceMembers", () => ({
  useWorkspaceMembers: () => ({
    members: mocks.members,
    resolveMemberCandidate: { mutateAsync: mocks.resolve, isPending: false },
    addMemberByUsername: { mutateAsync: mocks.add, isPending: false },
    updateRole: { mutateAsync: mocks.update, isPending: false },
    removeMember: { mutateAsync: mocks.remove, isPending: false },
    transferOwnership: { mutateAsync: mocks.transfer, isPending: false },
  }),
}));

import { WorkspaceMembersPanel } from "@/components/workspace/WorkspaceMembersPanel";

const owner = {
  id: "membership-1",
  userId: "user-1",
  role: "OWNER",
  createdAt: new Date("2026-01-01"),
  user: { id: "user-1", name: null, username: "owner" },
};
const teammate = {
  id: "membership-2",
  userId: "user-2",
  role: "MEMBER",
  createdAt: new Date("2026-01-02"),
  user: { id: "user-2", name: "Maya Chen", username: "maya" },
};

function show() {
  return render(
    <ChakraProvider value={uiSystem}>
      <WorkspaceMembersPanel workspaceId="cmv43rf4h00065ohrigqlxlf1" />
    </ChakraProvider>,
  );
}

describe("WorkspaceMembersPanel", () => {
  beforeEach(() => {
    mocks.user = { id: "user-1" };
    mocks.workspace = {
      data: {
        id: "workspace-1",
        name: "Open Atlas",
        slug: "open-atlas",
        ownerId: "user-1",
      },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    };
    mocks.members = {
      data: { pages: [{ items: [owner, teammate], nextCursor: null }] },
      isLoading: false,
      error: null,
      hasNextPage: false,
      fetchNextPage: vi.fn(),
      refetch: vi.fn(),
    };
    mocks.add.mockReset();
    mocks.resolve.mockReset();
    mocks.update.mockReset();
    mocks.remove.mockReset();
    mocks.transfer.mockReset();
  });
  afterEach(cleanup);

  it("shows real identities and owner-only role controls", () => {
    show();
    expect(screen.getByText("Maya Chen")).toBeTruthy();
    expect(screen.getByText("@maya")).toBeTruthy();
    expect(
      screen.getByRole("combobox", { name: "Role for Maya Chen" }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("combobox", { name: "Role for owner" }),
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: "Actions for Maya Chen" }),
    ).toBeTruthy();
  });

  it("allows an admin to manage ordinary members but not their roles or other admins", () => {
    mocks.workspace = {
      ...(mocks.workspace as object),
      data: {
        id: "workspace-1",
        name: "Open Atlas",
        slug: "open-atlas",
        ownerId: "user-3",
      },
    };
    mocks.members = {
      ...(mocks.members as object),
      data: {
        pages: [
          {
            items: [
              { ...owner, role: "ADMIN" },
              teammate,
              {
                ...teammate,
                id: "membership-3",
                userId: "user-3",
                role: "ADMIN",
                user: { id: "user-3", name: "Other Admin", username: "other" },
              },
            ],
            nextCursor: null,
          },
        ],
      },
    };
    show();
    expect(
      screen.queryByRole("combobox", { name: "Role for Maya Chen" }),
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: "Actions for Maya Chen" }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Actions for Other Admin" }),
    ).toBeNull();
  });

  it("does not expose a cached roster or management controls after access is denied", () => {
    mocks.members = {
      ...(mocks.members as object),
      error: { data: { code: "FORBIDDEN" } },
    };
    show();
    expect(screen.getByText("Member directory unavailable")).toBeTruthy();
    expect(screen.queryByText("Maya Chen")).toBeNull();
    expect(screen.queryByRole("button", { name: "Find account" })).toBeNull();
  });

  it("validates a username and handles an unavailable account", async () => {
    mocks.resolve.mockResolvedValue({ status: "unavailable" });
    show();
    fireEvent.change(
      screen.getByRole("textbox", { name: "Commons username" }),
      {
        target: { value: "x" },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: "Find account" }));
    await waitFor(() =>
      expect(
        screen
          .getByRole("textbox", { name: "Commons username" })
          .getAttribute("aria-invalid"),
      ).toBe("true"),
    );
    expect(mocks.resolve).not.toHaveBeenCalled();
    fireEvent.change(
      screen.getByRole("textbox", { name: "Commons username" }),
      {
        target: { value: "missing_user" },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: "Find account" }));
    await waitFor(() => expect(mocks.resolve).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(
        screen.getByText("No available account matches that exact username."),
      ).toBeTruthy(),
    );
    expect(mocks.add).not.toHaveBeenCalled();
  });

  it("identifies an existing member without offering confirmation", async () => {
    mocks.resolve.mockResolvedValue({ status: "already_member" });
    show();
    fireEvent.change(
      screen.getByRole("textbox", { name: "Commons username" }),
      { target: { value: "maya" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Find account" }));
    await waitFor(() =>
      expect(
        screen.getByText("This account already belongs to the workspace."),
      ).toBeTruthy(),
    );
    expect(
      screen.queryByRole("button", { name: "Add to workspace" }),
    ).toBeNull();
  });

  it("paginates the member directory", () => {
    const query = mocks.members as Record<string, unknown>;
    query.hasNextPage = true;
    show();
    expect(screen.getByText("2+ members")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Load more members" }));
    expect(query.fetchNextPage).toHaveBeenCalledTimes(1);
  });

  it("confirms identity before adding and clears the username after success", async () => {
    mocks.resolve.mockResolvedValue({
      status: "ready",
      user: { name: "Maya Chen", username: "maya" },
    });
    mocks.add.mockResolvedValue({});
    show();
    const input = screen.getByRole("textbox", {
      name: "Commons username",
    }) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "MAYA" } });
    fireEvent.click(screen.getByRole("button", { name: "Find account" }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Add to workspace" }),
      ).toBeTruthy(),
    );
    expect(screen.getAllByText("Maya Chen").length).toBeGreaterThan(1);
    expect(mocks.add).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Add to workspace" }));
    await waitFor(() =>
      expect(screen.getByText("Account added to this workspace.")).toBeTruthy(),
    );
    expect(input.value).toBe("");
    expect(mocks.add).toHaveBeenCalledWith({
      workspaceId: "cmv43rf4h00065ohrigqlxlf1",
      username: "maya",
      role: "MEMBER",
    });
    expect(screen.queryByLabelText("Your account ID")).toBeNull();
  });

  it("handles an empty roster and long identities without substituting private data", () => {
    mocks.workspace = {
      ...(mocks.workspace as object),
      data: {
        id: "workspace-1",
        name: "A very long workspace name that must wrap inside the header rather than overflow",
        slug: "very-long-workspace-name",
        ownerId: "user-1",
      },
    };
    mocks.members = {
      ...(mocks.members as object),
      data: { pages: [{ items: [], nextCursor: null }] },
    };
    show();
    expect(
      screen.getByRole("link", { name: /A very long workspace name/ }),
    ).toBeTruthy();
    expect(
      screen.getByText("No members are available right now."),
    ).toBeTruthy();
    expect(screen.queryByText(/@.*\.com/)).toBeNull();
  });

  it("refreshes access and reports a rejected add after permissions change", async () => {
    mocks.resolve.mockResolvedValue({
      status: "ready",
      user: { name: "Maya Chen", username: "maya" },
    });
    mocks.add.mockRejectedValue({ data: { code: "FORBIDDEN" } });
    show();
    fireEvent.change(
      screen.getByRole("textbox", { name: "Commons username" }),
      {
        target: { value: "maya" },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: "Find account" }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Add to workspace" }),
      ).toBeTruthy(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Add to workspace" }));
    await waitFor(() =>
      expect(
        screen.getByText("You no longer have permission to add members."),
      ).toBeTruthy(),
    );
    expect(
      (mocks.members as { refetch: ReturnType<typeof vi.fn> }).refetch,
    ).toHaveBeenCalledTimes(1);
    expect(
      (mocks.workspace as { refetch: ReturnType<typeof vi.fn> }).refetch,
    ).toHaveBeenCalledTimes(1);
  });

  it("reverts the role selection and reports a rejected role change", async () => {
    mocks.update.mockRejectedValue({ data: { code: "FORBIDDEN" } });
    show();
    fireEvent.change(
      screen.getByRole("combobox", { name: "Role for Maya Chen" }),
      { target: { value: "ADMIN" } },
    );
    await waitFor(() =>
      expect(
        screen.getByText("You no longer have permission to change roles."),
      ).toBeTruthy(),
    );
    expect(
      (
        screen.getByRole("combobox", {
          name: "Role for Maya Chen",
        }) as HTMLSelectElement
      ).value,
    ).toBe("MEMBER");
  });
});
