import { createTRPCRouter } from "./trpc";
import { authRouter } from "./routers/auth.router";
import { commentRouter } from "./routers/comment.router";
import { discussionRouter } from "./routers/discussion.router";
import { activityRouter } from "./routers/activity.router";
import { searchRouter } from "./routers/search.router";
import { homeRouter } from "./routers/home.router";
import { decisionRouter } from "./routers/decision.router";
import { decisionReviewRouter } from "./routers/decision-review.router";
import { reactionRouter } from "./routers/reaction.router";
import { followRouter } from "./routers/follow.router";
import { pinRouter } from "./routers/pin.router";
import { savedRouter } from "./routers/saved.router";
import { digestRouter } from "./routers/digest.router";
import { attachmentRouter } from "./routers/attachment.router";
import { notificationRouter } from "./routers/notification.router";
import { workspaceRouter } from "./routers/workspace.router";

export const appRouter = createTRPCRouter({
  auth: authRouter,
  workspace: workspaceRouter,
  discussion: discussionRouter,
  decision: decisionRouter,
  decisionReview: decisionReviewRouter,
  reaction: reactionRouter,
  follow: followRouter,
  pin: pinRouter,
  saved: savedRouter,
  digest: digestRouter,
  attachment: attachmentRouter,
  comment: commentRouter,
  notification: notificationRouter,
  activity: activityRouter,
  search: searchRouter,
  home: homeRouter,
});

export type AppRouter = typeof appRouter;
