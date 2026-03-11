import { initSentry, captureError } from "../../observability/sentry";
import { notificationWorker } from "./notification.worker";

initSentry();

function shutdown(signal: string) {
  console.info(
    JSON.stringify({
      level: "INFO",
      event: "notification.worker.shutdown",
      signal,
      timestamp: new Date().toISOString(),
    }),
  );

  notificationWorker
    .close()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      captureError(error, { signal, queue: "notification-delivery" });
      process.exit(1);
    });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("unhandledRejection", (reason) => {
  captureError(reason, { event: "unhandledRejection" });
});
process.on("uncaughtException", (error) => {
  captureError(error, { event: "uncaughtException" });
  shutdown("uncaughtException");
});
