"use client";

import { trpc } from "@/lib/trpc/api-client";

// Invite links (invite links PRD): the Members page's list, create and revoke.
export function useInvites(workspaceId: string, enabled = true) {
  const utils = trpc.useUtils();
  const list = trpc.invite.list.useQuery({ workspaceId }, { enabled: enabled && Boolean(workspaceId) });
  const refresh = () => utils.invite.list.invalidate({ workspaceId });
  const create = trpc.invite.create.useMutation({ onSuccess: refresh });
  const revoke = trpc.invite.revoke.useMutation({ onSettled: refresh });
  return { list, create, revoke };
}

// The join page (invite links PRD, FR-6 to FR-9). `ready` waits for the
// session check, so the answer knows whether the viewer is already a member.
export function useInviteLink(token: string, ready = true) {
  const utils = trpc.useUtils();
  const describe = trpc.invite.describe.useQuery({ token }, { enabled: ready, retry: false, refetchOnWindowFocus: false });
  const join = trpc.invite.join.useMutation({
    onSuccess: () => Promise.all([utils.workspace.listForUser.invalidate(), utils.home.invalidate()]),
  });
  return { describe, join };
}
