"use client";

import { trpc } from "@/lib/trpc/api-client";

export type ReactionSummary = { emoji: string; count: number; mine: boolean; people: string[] };

export function useDiscussionReactions(workspaceId: string, discussionId: string) {
  return trpc.reaction.forDiscussion.useQuery({ workspaceId, discussionId }, { enabled: Boolean(workspaceId && discussionId) });
}

// The member's own reaction turned on or off, applied before the server answers.
export function applyReaction(list: ReactionSummary[], emoji: string, active: boolean): ReactionSummary[] {
  const existing = list.find((item) => item.emoji === emoji);
  if (active) {
    if (existing?.mine) return list;
    if (existing) return list.map((item) => item.emoji === emoji ? { ...item, count: item.count + 1, mine: true, people: ["You", ...item.people] } : item);
    return [...list, { emoji, count: 1, mine: true, people: ["You"] }];
  }
  if (!existing?.mine) return list;
  return existing.count <= 1
    ? list.filter((item) => item.emoji !== emoji)
    : list.map((item) => item.emoji === emoji ? { ...item, count: item.count - 1, mine: false, people: item.people.filter((name) => name !== "You") } : item);
}

export function useSetReaction(workspaceId: string, discussionId: string) {
  const utils = trpc.useUtils();
  const key = { workspaceId, discussionId };
  return trpc.reaction.set.useMutation({
    onMutate: async (input) => {
      await utils.reaction.forDiscussion.cancel(key);
      const previous = utils.reaction.forDiscussion.getData(key);
      utils.reaction.forDiscussion.setData(key, (data) => {
        if (!data) return data;
        if (input.discussionId) return { ...data, discussion: applyReaction(data.discussion, input.emoji, input.active) };
        const id = input.commentId!;
        return { ...data, comments: { ...data.comments, [id]: applyReaction(data.comments[id] ?? [], input.emoji, input.active) } };
      });
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) utils.reaction.forDiscussion.setData(key, context.previous);
    },
    onSuccess: (result) => {
      utils.reaction.forDiscussion.setData(key, (data) => {
        if (!data) return data;
        if ("discussionId" in result && result.discussionId) return { ...data, discussion: result.reactions };
        if ("commentId" in result && result.commentId) return { ...data, comments: { ...data.comments, [result.commentId]: result.reactions } };
        return data;
      });
    },
  });
}
