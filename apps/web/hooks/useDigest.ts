"use client";

import { trpc } from "@/lib/trpc/api-client";

export function useDigestPreview(enabled: boolean) {
  return trpc.digest.preview.useQuery(undefined, { enabled, staleTime: 60_000 });
}

export function useDigestPreferences() {
  return trpc.digest.preferences.useQuery();
}

// Switches change on screen at once and roll back if saving fails.
export function useDigestPreferenceActions() {
  const utils = trpc.useUtils();
  type Preferences = Awaited<ReturnType<typeof utils.digest.preferences.fetch>>;
  const optimistic = async (change: (data: Preferences) => Preferences) => {
    await utils.digest.preferences.cancel();
    const previous = utils.digest.preferences.getData();
    if (previous) utils.digest.preferences.setData(undefined, change(previous));
    return { previous };
  };
  const onError = (_error: unknown, _input: unknown, context?: { previous?: Preferences }) => {
    if (context?.previous) utils.digest.preferences.setData(undefined, context.previous);
  };
  const onSuccess = (data: Preferences) => {
    utils.digest.preferences.setData(undefined, data);
    void utils.digest.preview.invalidate();
  };
  return {
    setEnabled: trpc.digest.setEnabled.useMutation({
      onMutate: (input) => optimistic((data) => ({ ...data, enabled: input.enabled })),
      onError,
      onSuccess,
    }),
    setWorkspace: trpc.digest.setWorkspace.useMutation({
      onMutate: (input) => optimistic((data) => ({ ...data, workspaces: data.workspaces.map((w) => (w.id === input.workspaceId ? { ...w, included: input.included } : w)) })),
      onError,
      onSuccess,
    }),
  };
}

export function useUnsubscribeLink(token: string) {
  const describe = trpc.digest.describeUnsubscribe.useQuery({ token }, { retry: false });
  const apply = trpc.digest.unsubscribe.useMutation();
  return { describe, apply };
}
