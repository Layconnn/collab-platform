import { createTRPCRouter } from "./trpc";
import { commentRouter } from "./routers/comment.router";
import { discussionRouter } from "./routers/discussion.router";
import { notificationRouter } from "./routers/notification.router";
import { workspaceRouter } from "./routers/workspace.router";

export const appRouter = createTRPCRouter({
  workspace: workspaceRouter,
  discussion: discussionRouter,
  comment: commentRouter,
  notification: notificationRouter,
});

export type AppRouter = typeof appRouter;
