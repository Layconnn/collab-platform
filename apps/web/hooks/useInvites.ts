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
