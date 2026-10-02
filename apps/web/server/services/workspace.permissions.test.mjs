import assert from "node:assert/strict";
import test from "node:test";

import createJiti from "jiti";

const jiti = createJiti(import.meta.url);
const {
  WORKSPACE_ACTIONS,
  WORKSPACE_PERMISSIONS,
  canPerformWorkspaceAction,
  assertCanAssignRoleOnAddMember,
  assertExactlyOneOwner,
} = jiti("./workspace.permissions.ts");
const { AppError } = jiti("../errors/app-error.ts");

test("permission matrix grants expected actions by role", () => {
  assert.equal(canPerformWorkspaceAction("MEMBER", WORKSPACE_ACTIONS.CREATE_DISCUSSION), true);
  assert.equal(canPerformWorkspaceAction("MEMBER", WORKSPACE_ACTIONS.READ_DISCUSSION), true);
  assert.equal(canPerformWorkspaceAction("MEMBER", WORKSPACE_ACTIONS.MANAGE_DISCUSSION), false);
  assert.equal(canPerformWorkspaceAction("ADMIN", WORKSPACE_ACTIONS.ADD_MEMBER), true);
  assert.equal(canPerformWorkspaceAction("ADMIN", WORKSPACE_ACTIONS.MANAGE_DISCUSSION), true);
  assert.equal(canPerformWorkspaceAction("ADMIN", WORKSPACE_ACTIONS.TRANSFER_OWNERSHIP), false);
  assert.equal(canPerformWorkspaceAction("OWNER", WORKSPACE_ACTIONS.TRANSFER_OWNERSHIP), true);
});

test("admin cannot add owner role through addMember", () => {
  assert.throws(
    () => assertCanAssignRoleOnAddMember("ADMIN", "OWNER"),
    (error) =>
      error instanceof AppError &&
      error.code === "BAD_REQUEST" &&
      error.message.includes("transferOwnership"),
  );
});

test("exactly one owner invariant is enforced", () => {
  assert.doesNotThrow(() => assertExactlyOneOwner(["OWNER", "ADMIN", "MEMBER"]));

  assert.throws(
    () => assertExactlyOneOwner(["ADMIN", "MEMBER"]),
    (error) => error instanceof AppError && error.code === "INTERNAL",
  );

  assert.throws(
    () => assertExactlyOneOwner(["OWNER", "OWNER", "MEMBER"]),
    (error) => error instanceof AppError && error.code === "INTERNAL",
  );
});
