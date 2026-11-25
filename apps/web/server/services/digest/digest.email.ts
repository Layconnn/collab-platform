import type { NeedItem } from "../home.service";
import type { Digest } from "./digest.service";

// HTML and plain-text renderings of a digest (daily digest PRD, FR-4, NFR-4).
// Email clients ignore stylesheets and most layout CSS, so the HTML uses
// tables and inline styles, real text only, and colours that stay readable
// when a client darkens the message.

export type DigestLinks = {
  baseUrl: string;
  // Added by the unsubscribe pull request; optional until then.
  unsubscribeAll?: string;
  unsubscribeWorkspace?: Record<string, string>;
};

const DAY_MS = 24 * 60 * 60 * 1000;

// A count only; the digest never carries file content (file uploads PRD, FR-10).
const filesNote = (files: number | undefined) => (files ? ` · ${files} ${files === 1 ? "file" : "files"}` : "");

export function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

const days = (from: Date, now: Date) => {
  const count = Math.floor((now.getTime() - from.getTime()) / DAY_MS);
  return count < 1 ? "less than a day" : count === 1 ? "1 day" : `${count} days`;
};

export function needLine(item: NeedItem, now: Date) {
  const who = item.actor ?? "Someone";
  switch (item.kind) {
    case "REVIEW_REQUESTED": return `${who} asked for your review`;
    case "MENTION": return `${who} mentioned you`;
    case "REPLY": return `${who} replied to your discussion`;
    case "PROPOSAL_WAITING": return `Proposed by ${who}, waiting ${days(new Date(item.at), now)} for a decision`;
    case "OWN_PROPOSAL": return `Your proposal, open for ${days(new Date(item.at), now)}`;
  }
}

export function needUrl(item: NeedItem, baseUrl: string) {
  const base = `${baseUrl}/workspace/${item.workspace.id}`;
  return item.decisionId ? `${base}/decisions/${item.decisionId}` : `${base}/discussions/${item.discussionId ?? ""}`;
}

function activityLine(row: Digest["activity"][number]) {
  const parts = [
    row.discussions ? `${row.discussions} new ${row.discussions === 1 ? "discussion" : "discussions"}` : "",
    row.replies ? `${row.replies} ${row.replies === 1 ? "reply" : "replies"}` : "",
    row.decisions ? `${row.decisions} ${row.decisions === 1 ? "decision" : "decisions"} finalized` : "",
  ].filter(Boolean);
  return parts.join(", ");
}

const INK = "#192D20";
const MUTED = "#55665A";
const ACCENT = "#B44F45";
const LINE = "#D9D2BF";

function section(title: string, body: string) {
  return `<tr><td style="padding:24px 0 4px 0;font:600 12px/1.4 Arial,Helvetica,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:${ACCENT};">${escapeHtml(title)}</td></tr>${body}`;
}

function row(title: string, href: string, detail: string) {
  return `<tr><td style="padding:10px 0;border-bottom:1px solid ${LINE};">
<a href="${escapeHtml(href)}" style="font:600 15px/1.45 Arial,Helvetica,sans-serif;color:${INK};text-decoration:underline;">${escapeHtml(title)}</a>
<div style="font:14px/1.5 Arial,Helvetica,sans-serif;color:${MUTED};">${escapeHtml(detail)}</div>
</td></tr>`;
}

export function renderDigest(digest: Digest, links: DigestLinks): { subject: string; html: string; text: string } {
  const now = digest.generatedAt;
  const home = `${links.baseUrl}/workspace`;
  const settings = `${links.baseUrl}/settings/email`;
  const more = digest.needs.total - digest.needs.items.length;

  const needsHtml = digest.needs.items.map((item) => row(item.title, needUrl(item, links.baseUrl), `${needLine(item, now)} · ${item.workspace.name}`)).join("")
    + (more > 0 ? `<tr><td style="padding:10px 0;font:14px/1.5 Arial,Helvetica,sans-serif;color:${MUTED};">And ${more} more on <a href="${escapeHtml(home)}" style="color:${INK};">Home</a>.</td></tr>` : "");
  const decidedHtml = digest.decided.map((item) => row(
    item.question,
    `${links.baseUrl}/workspace/${item.workspace.id}/decisions/${item.decisionId}`,
    `${item.action === "SUPERSEDED" ? `Replaced${item.replacement ? ` by “${item.replacement.question}”` : ""}` : "Finalized"} by ${item.actor} · ${item.workspace.name}${filesNote(item.files)}`,
  )).join("");
  const activityHtml = digest.activity.map((item) => row(item.workspace.name, `${links.baseUrl}/workspace/${item.workspace.id}`, activityLine(item))).join("");

  const workspaceStops = Object.entries(links.unsubscribeWorkspace ?? {});
  const footerLinks = [
    links.unsubscribeAll ? `<a href="${escapeHtml(links.unsubscribeAll)}" style="color:${MUTED};">Stop daily digests</a>` : "",
    ...workspaceStops.map(([name, href]) => `<a href="${escapeHtml(href)}" style="color:${MUTED};">Stop digests for ${escapeHtml(name)}</a>`),
    `<a href="${escapeHtml(settings)}" style="color:${MUTED};">Email settings</a>`,
  ].filter(Boolean).join(" &middot; ");

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><title>${escapeHtml(digest.subject)}</title></head>
<body style="margin:0;padding:0;background:#F6F2E8;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F6F2E8;"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#FFFDF7;border:1px solid ${LINE};border-radius:8px;"><tr><td style="padding:28px 28px 8px 28px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr><td style="font:700 13px/1.4 Arial,Helvetica,sans-serif;color:${INK};">Commons</td></tr>
<tr><td style="padding-top:12px;font:700 22px/1.3 Arial,Helvetica,sans-serif;color:${INK};">Good morning, ${escapeHtml(digest.user.name)}</td></tr>
<tr><td style="padding-top:6px;font:15px/1.5 Arial,Helvetica,sans-serif;color:${MUTED};">Here is what happened in your workspaces in the last day.</td></tr>
${digest.needs.items.length ? section(`Needs you · ${digest.needs.total}`, needsHtml) : ""}
${digest.decided.length ? section("Decided in the last day", decidedHtml) : ""}
${digest.activity.length ? section("In your workspaces", activityHtml) : ""}
<tr><td style="padding:28px 0 24px 0;"><a href="${escapeHtml(home)}" style="display:inline-block;background:${INK};color:#FFFDF7;font:600 15px/1 Arial,Helvetica,sans-serif;text-decoration:none;padding:14px 20px;border-radius:6px;">Open Commons</a></td></tr>
</table></td></tr></table>
<p style="max-width:600px;margin:16px auto 0 auto;font:12px/1.6 Arial,Helvetica,sans-serif;color:${MUTED};">You get this email once a day when something needs you or changed in your workspaces. ${footerLinks}</p>
</td></tr></table></body></html>`;

  const lines = [`Good morning, ${digest.user.name}`, "Here is what happened in your workspaces in the last day.", ""];
  if (digest.needs.items.length) {
    lines.push(`NEEDS YOU (${digest.needs.total})`);
    for (const item of digest.needs.items) lines.push(`- ${item.title}`, `  ${needLine(item, now)} · ${item.workspace.name}`, `  ${needUrl(item, links.baseUrl)}`);
    if (more > 0) lines.push(`And ${more} more on Home: ${home}`);
    lines.push("");
  }
  if (digest.decided.length) {
    lines.push("DECIDED IN THE LAST DAY");
    for (const item of digest.decided) lines.push(`- ${item.question}`, `  ${item.action === "SUPERSEDED" ? "Replaced" : "Finalized"} by ${item.actor} · ${item.workspace.name}${filesNote(item.files)}`, `  ${links.baseUrl}/workspace/${item.workspace.id}/decisions/${item.decisionId}`);
    lines.push("");
  }
  if (digest.activity.length) {
    lines.push("IN YOUR WORKSPACES");
    for (const item of digest.activity) lines.push(`- ${item.workspace.name}: ${activityLine(item)}`);
    lines.push("");
  }
  lines.push(`Open Commons: ${home}`, "", `Email settings: ${settings}`);
  if (links.unsubscribeAll) lines.push(`Stop daily digests: ${links.unsubscribeAll}`);
  return { subject: digest.subject, html, text: lines.join("\n") };
}

export function appBaseUrl() {
  const configured = process.env.NEXT_PUBLIC_APP_URL;
  if (configured) return configured.replace(/\/$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return "http://localhost:3000";
}
