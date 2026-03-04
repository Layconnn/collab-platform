import { redis } from "../cache/redis";
import type { NotificationType } from "../../app/generated/prisma/client";

type SecurityLevel = "INFO" | "WARN" | "ERROR";

type BaseEvent = {
  requestId: string;
  timestamp: string;
};

export const SECURITY_ALERT_THRESHOLDS = {
  authFailures: {
    limit: 5,
    windowSeconds: 300,
  },
  permissionEscalationAttempts: {
    limit: 3,
    windowSeconds: 300,
  },
  rateLimitViolationsPerUser: {
    limit: 10,
    windowSeconds: 300,
  },
  rateLimitViolationsPerRoute: {
    limit: 100,
    windowSeconds: 300,
  },
  discussionPermissionDenialsPerUser: {
    limit: 1000,
    windowSeconds: 300,
  },
  commentPermissionDenialsPerUser: {
    limit: 1000,
    windowSeconds: 300,
  },
  commentIdempotencyReplaysPerUser: {
    limit: 50,
    windowSeconds: 300,
  },
} as const;

const METRICS_DISABLED =
  process.env.NODE_ENV === "test" || process.env.DISABLE_SECURITY_METRICS === "1";

function logSecurityEvent(
  level: SecurityLevel,
  event: string,
  payload: Record<string, unknown>,
): void {
  const log = JSON.stringify({
    level,
    event,
    ...payload,
  });

  try {
    if (level === "ERROR") {
      console.error(log);
      return;
    }

    if (level === "WARN") {
      console.warn(log);
      return;
    }

    console.info(log);
  } catch {
    // Never fail request flow if logging sink is unavailable.
  }
}

async function incrementCounter(counterKey: string, windowSeconds: number): Promise<number> {
  const timeoutMs = 150;
  const timeout = <T>() =>
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error("metrics_timeout")), timeoutMs);
    });

  const count = await Promise.race([redis.incr(counterKey), timeout<number>()]);
  if (count === 1) {
    await Promise.race([redis.expire(counterKey, windowSeconds), timeout<void>()]);
  }
  return count;
}

async function maybeEmitThresholdAlert(params: {
  key: string;
  count: number;
  limit: number;
  requestId: string;
  userId?: string;
  routeKey?: string;
  alertType: string;
}): Promise<void> {
  if (params.count < params.limit) {
    return;
  }

  logSecurityEvent("ERROR", "security.alert.threshold_exceeded", {
    requestId: params.requestId,
    userId: params.userId,
    routeKey: params.routeKey,
    alertType: params.alertType,
    count: params.count,
    threshold: params.limit,
    counterKey: params.key,
    timestamp: new Date().toISOString(),
  });
}

async function trackCounterWriteFailure(data: {
  requestId: string;
  reason: string;
  userId?: string;
  routeKey?: string;
  timestamp: string;
  error: unknown;
}): Promise<void> {
  logSecurityEvent("ERROR", "security.metrics.failure", {
    requestId: data.requestId,
    userId: data.userId,
    routeKey: data.routeKey,
    reason: data.reason,
    error: String(data.error),
    timestamp: data.timestamp,
  });
}

export async function recordAuthFailure(data: BaseEvent & { userId?: string; reason: string }): Promise<void> {
  const userId = data.userId ?? "anonymous";
  const threshold = SECURITY_ALERT_THRESHOLDS.authFailures;
  const key = `security:auth_failures:user:${userId}`;

  if (METRICS_DISABLED) {
    logSecurityEvent("ERROR", "security.auth.failure", {
      requestId: data.requestId,
      userId,
      reason: data.reason,
      timestamp: data.timestamp,
    });
    return;
  }

  try {
    const count = await incrementCounter(key, threshold.windowSeconds);
    logSecurityEvent("ERROR", "security.auth.failure", {
      requestId: data.requestId,
      userId,
      reason: data.reason,
      count,
      timestamp: data.timestamp,
    });

    await maybeEmitThresholdAlert({
      key,
      count,
      limit: threshold.limit,
      requestId: data.requestId,
      userId,
      alertType: "auth_failures",
    });
  } catch (error) {
    await trackCounterWriteFailure({
      requestId: data.requestId,
      userId,
      reason: "auth_failure_counter_write_failed",
      error,
      timestamp: data.timestamp,
    });
  }
}

export async function recordPermissionDenied(data: BaseEvent & {
  userId: string;
  workspaceId: string;
  action: string;
  reason: string;
}): Promise<void> {
  logSecurityEvent("WARN", "security.permission.denied", data);

  if (METRICS_DISABLED) {
    return;
  }

  const key = `security:permission_denied:user:${data.userId}`;
  try {
    await incrementCounter(key, 300);
  } catch (error) {
    await trackCounterWriteFailure({
      requestId: data.requestId,
      userId: data.userId,
      reason: "permission_denied_counter_write_failed",
      error,
      timestamp: data.timestamp,
    });
  }
}

export async function recordDiscussionPermissionDenied(data: BaseEvent & {
  userId: string;
  workspaceId: string;
  action: string;
  reason: string;
}): Promise<void> {
  await recordPermissionDenied(data);

  if (METRICS_DISABLED) {
    return;
  }

  const threshold = SECURITY_ALERT_THRESHOLDS.discussionPermissionDenialsPerUser;
  const key = `security:discussion_permission_denied:user:${data.userId}`;

  try {
    const count = await incrementCounter(key, threshold.windowSeconds);
    await maybeEmitThresholdAlert({
      key,
      count,
      limit: threshold.limit,
      requestId: data.requestId,
      userId: data.userId,
      alertType: "discussion_permission_denials",
    });
  } catch (error) {
    await trackCounterWriteFailure({
      requestId: data.requestId,
      userId: data.userId,
      reason: "discussion_permission_denied_counter_write_failed",
      error,
      timestamp: data.timestamp,
    });
  }
}

export async function recordCommentPermissionDenied(data: BaseEvent & {
  userId: string;
  workspaceId: string;
  action: string;
  reason: string;
}): Promise<void> {
  await recordPermissionDenied(data);

  if (METRICS_DISABLED) {
    return;
  }

  const threshold = SECURITY_ALERT_THRESHOLDS.commentPermissionDenialsPerUser;
  const key = `security:comment_permission_denied:user:${data.userId}`;

  try {
    await redis.incr("metrics:comment:permission_denied:count");
    const count = await incrementCounter(key, threshold.windowSeconds);
    await maybeEmitThresholdAlert({
      key,
      count,
      limit: threshold.limit,
      requestId: data.requestId,
      userId: data.userId,
      alertType: "comment_permission_denials",
    });
  } catch (error) {
    await trackCounterWriteFailure({
      requestId: data.requestId,
      userId: data.userId,
      reason: "comment_permission_denied_counter_write_failed",
      error,
      timestamp: data.timestamp,
    });
  }
}

export async function recordPermissionEscalationAttempt(data: BaseEvent & {
  userId: string;
  workspaceId: string;
  attemptedRole: string;
}): Promise<void> {
  const threshold = SECURITY_ALERT_THRESHOLDS.permissionEscalationAttempts;
  const key = `security:permission_escalation_attempts:user:${data.userId}`;

  if (METRICS_DISABLED) {
    logSecurityEvent("WARN", "security.permission.escalation_attempt", data);
    return;
  }

  try {
    const count = await incrementCounter(key, threshold.windowSeconds);
    logSecurityEvent("WARN", "security.permission.escalation_attempt", {
      ...data,
      count,
    });

    await maybeEmitThresholdAlert({
      key,
      count,
      limit: threshold.limit,
      requestId: data.requestId,
      userId: data.userId,
      alertType: "permission_escalation_attempts",
    });
  } catch (error) {
    await trackCounterWriteFailure({
      requestId: data.requestId,
      userId: data.userId,
      reason: "permission_escalation_counter_write_failed",
      error,
      timestamp: data.timestamp,
    });
  }
}

export async function recordRateLimitHit(data: BaseEvent & {
  userId: string;
  routeKey: string;
  count: number;
}): Promise<void> {
  const byUserThreshold = SECURITY_ALERT_THRESHOLDS.rateLimitViolationsPerUser;
  const byRouteThreshold = SECURITY_ALERT_THRESHOLDS.rateLimitViolationsPerRoute;

  if (METRICS_DISABLED) {
    logSecurityEvent("WARN", "security.rate_limit.hit", data);
    return;
  }

  try {
    if (data.routeKey.startsWith("comment.")) {
      await redis.incr("metrics:comment:rate_limit:count");
      await redis.incr(`metrics:comment:rate_limit:route:${data.routeKey}:count`);
    }

    const userKey = `security:rate_limit_hits:user:${data.userId}`;
    const userCount = await incrementCounter(userKey, byUserThreshold.windowSeconds);

    const routeKey = `security:rate_limit_hits:route:${data.routeKey}`;
    const routeCount = await incrementCounter(routeKey, byRouteThreshold.windowSeconds);

    logSecurityEvent("WARN", "security.rate_limit.hit", {
      ...data,
      aggregateUserCount: userCount,
      aggregateRouteCount: routeCount,
    });

    await maybeEmitThresholdAlert({
      key: userKey,
      count: userCount,
      limit: byUserThreshold.limit,
      requestId: data.requestId,
      userId: data.userId,
      routeKey: data.routeKey,
      alertType: "rate_limit_violations_per_user",
    });

    await maybeEmitThresholdAlert({
      key: routeKey,
      count: routeCount,
      limit: byRouteThreshold.limit,
      requestId: data.requestId,
      routeKey: data.routeKey,
      alertType: "rate_limit_violations_per_route",
    });
  } catch (error) {
    await trackCounterWriteFailure({
      requestId: data.requestId,
      userId: data.userId,
      routeKey: data.routeKey,
      reason: "rate_limit_counter_write_failed",
      error,
      timestamp: data.timestamp,
    });
  }
}

export async function recordOwnershipTransfer(data: BaseEvent & {
  actorUserId: string;
  workspaceId: string;
  fromOwnerUserId: string;
  toOwnerUserId: string;
}): Promise<void> {
  logSecurityEvent("INFO", "workspace.ownership_transferred", data);
}

export async function recordWorkspacePermissionAudit(data: BaseEvent & {
  actorUserId: string;
  workspaceId: string;
  targetUserId: string;
  oldRole: string | null;
  newRole: string | null;
  operation: "addMember" | "removeMember" | "updateMemberRole" | "transferOwnership";
}): Promise<void> {
  logSecurityEvent("INFO", "workspace.permission.audit", data);
}

export async function recordDiscussionOperation(data: BaseEvent & {
  action: "create" | "update" | "delete" | "list";
  actorUserId: string;
  workspaceId: string;
  discussionId?: string | null;
}): Promise<void> {
  const metricKey = `metrics:discussion:operation:${data.action}:count`;

  if (!METRICS_DISABLED) {
    try {
      await redis.incr(metricKey);
    } catch (error) {
      await trackCounterWriteFailure({
        requestId: data.requestId,
        userId: data.actorUserId,
        reason: "discussion_operation_metric_write_failed",
        error,
        timestamp: data.timestamp,
      });
    }
  }

  logSecurityEvent("INFO", "discussion.operation", data);
}

export async function recordDiscussionAudit(data: BaseEvent & {
  actorUserId: string;
  workspaceId: string;
  discussionId: string | null;
  action: "create" | "update" | "delete" | "list";
}): Promise<void> {
  logSecurityEvent("INFO", "discussion.audit", data);
}

export async function recordCommentOperation(data: BaseEvent & {
  action: "create" | "update" | "delete" | "list";
  actorUserId: string;
  workspaceId: string;
  discussionId: string;
  commentId?: string | null;
}): Promise<void> {
  const metricKey = `metrics:comment:operation:${data.action}:count`;

  if (!METRICS_DISABLED) {
    try {
      await redis.incr(metricKey);
    } catch (error) {
      await trackCounterWriteFailure({
        requestId: data.requestId,
        userId: data.actorUserId,
        reason: "comment_operation_metric_write_failed",
        error,
        timestamp: data.timestamp,
      });
    }
  }

  logSecurityEvent("INFO", "comment.operation", data);
}

export async function recordCommentAudit(data: BaseEvent & {
  actorUserId: string;
  workspaceId: string;
  discussionId: string;
  commentId: string | null;
  parentCommentId: string | null;
  action: "create" | "update" | "delete" | "list";
}): Promise<void> {
  logSecurityEvent("INFO", "comment.audit", data);
}

export async function recordCommentIdempotency(data: BaseEvent & {
  actorUserId: string;
  discussionId: string;
  outcome: "hit" | "miss";
}): Promise<void> {
  const metricKey = `metrics:comment:idempotency:${data.outcome}:count`;
  const eventName =
    data.outcome === "hit" ? "comment.idempotency.replay" : "comment.idempotency.miss";

  if (METRICS_DISABLED) {
    logSecurityEvent("INFO", eventName, data);
    return;
  }

  try {
    await redis.incr(metricKey);

    if (data.outcome === "hit") {
      const threshold = SECURITY_ALERT_THRESHOLDS.commentIdempotencyReplaysPerUser;
      const key = `security:comment_idempotency_replay:user:${data.actorUserId}`;
      const count = await incrementCounter(key, threshold.windowSeconds);

      await maybeEmitThresholdAlert({
        key,
        count,
        limit: threshold.limit,
        requestId: data.requestId,
        userId: data.actorUserId,
        alertType: "comment_idempotency_replays",
      });
    }
  } catch (error) {
    await trackCounterWriteFailure({
      requestId: data.requestId,
      userId: data.actorUserId,
      reason: "comment_idempotency_metric_write_failed",
      error,
      timestamp: data.timestamp,
    });
  }

  logSecurityEvent("INFO", eventName, data);
}

type NotificationAction =
  | "enqueue"
  | "enqueue_failed"
  | "deliver"
  | "drop_non_member"
  | "list"
  | "mark_read"
  | "mark_all_read";

export async function recordNotificationOperation(data: BaseEvent & {
  action: NotificationAction;
  actorUserId: string | null;
  recipientUserId: string;
  workspaceId: string | null;
  notificationId: string | null;
}): Promise<void> {
  const metricKey = `metrics:notification:operation:${data.action}:count`;

  if (!METRICS_DISABLED) {
    try {
      await redis.incr(metricKey);
    } catch (error) {
      await trackCounterWriteFailure({
        requestId: data.requestId,
        userId: data.recipientUserId,
        reason: "notification_operation_metric_write_failed",
        error,
        timestamp: data.timestamp,
      });
    }
  }

  const eventName = `notification.operation.${data.action}`;
  if (data.action === "enqueue_failed") {
    logSecurityEvent("ERROR", eventName, data);
    return;
  }

  logSecurityEvent("INFO", eventName, data);
}

export async function recordNotificationAudit(data: BaseEvent & {
  actorUserId: string | null;
  recipientUserId: string;
  workspaceId: string | null;
  discussionId: string | null;
  commentId: string | null;
  type: NotificationType | null;
  action: Exclude<NotificationAction, "enqueue_failed" | "drop_non_member">;
}): Promise<void> {
  logSecurityEvent("INFO", "notification.audit", data);
}
