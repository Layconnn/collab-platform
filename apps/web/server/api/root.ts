import { createTRPCRouter } from "./trpc";
import { commentRouter } from "./routers/comment.router";
import { discussionRouter } from "./routers/discussion.router";
import { workspaceRouter } from "./routers/workspace.router";

export const appRouter = createTRPCRouter({
  workspace: workspaceRouter,
  discussion: discussionRouter,
  comment: commentRouter,
});

export type AppRouter = typeof appRouter;
