import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowDown,
  ArrowRight,
  Bell,
  CornerDownRight,
  MessageSquare,
  Users,
} from "lucide-react";

import { ProductPreview } from "@/components/marketing/ProductPreview";

export const metadata: Metadata = {
  title: "Commons | Conversations worth keeping",
  description:
    "Keep project discussions, threaded replies, and the context that matters together in Commons workspaces.",
};

const discussions = [
  {
    title: "How should first-time setup work?",
    author: "Maya Chen",
    initials: "MC",
    kind: "Question",
    replies: "2",
  },
  {
    title: "The contributor guide is ready for review",
    author: "Lina Rahman",
    initials: "LR",
    kind: "Update",
    replies: "4",
  },
  {
    title: "A clearer path for reporting bugs",
    author: "Sam Kim",
    initials: "SK",
    kind: "Idea",
    replies: "1",
  },
];

const workflow = [
  {
    number: "01",
    from: "Workspace",
    to: "Discussion",
    detail: "Give the project a place, then start with a clear question.",
  },
  {
    number: "02",
    from: "Replies",
    to: "Mention",
    detail: "Build the answer in context and bring a teammate in.",
  },
  {
    number: "03",
    from: "Notification",
    to: "Return",
    detail: "Know what needs attention, then pick up the thread.",
  },
];

const primaryAction =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-brand-700 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-800 active:bg-brand-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring";
const secondaryAction =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-md border border-border bg-surface px-5 py-3 text-sm font-semibold text-text-primary transition-colors hover:bg-surface-hover active:bg-surface-active focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring";

export default function Home() {
  return (
    <div className="min-w-0 bg-surface text-text-primary">
      <a
        href="#main-content"
        className="sr-only z-50 rounded bg-surface px-3 py-2 text-sm font-medium text-text-primary focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
      >
        Skip to content
      </a>
      <header className="relative z-20 border-b border-border-subtle bg-surface">
        <div className="mx-auto flex h-[68px] max-w-[1280px] items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
          <Link
            href="/"
            aria-label="Commons home"
            className="flex min-w-0 items-center gap-2.5 rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus-ring"
          >
            <span
              aria-hidden="true"
              className="grid size-8 shrink-0 place-items-center rounded bg-brand-700 text-sm font-bold text-white"
            >
              C
            </span>
            <span className="truncate text-[15px] font-semibold text-text-primary">
              Commons
            </span>
          </Link>
          <nav
            aria-label="Public navigation"
            className="flex shrink-0 items-center gap-1 sm:gap-2"
          >
            <Link
              href="/login"
              className="inline-flex min-h-10 items-center rounded-md px-2.5 text-xs font-semibold text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring sm:px-3 sm:text-sm"
            >
              Sign in
            </Link>
            <Link
              href="/register"
              className="inline-flex min-h-10 items-center gap-1.5 rounded-md bg-brand-700 px-3 text-xs font-semibold text-white transition-colors hover:bg-brand-800 active:bg-brand-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring sm:px-4 sm:text-sm"
            >
              Get started{" "}
              <ArrowRight
                aria-hidden="true"
                size={14}
                className="hidden sm:block"
              />
            </Link>
          </nav>
        </div>
      </header>

      <main id="main-content">
        <section
          aria-labelledby="hero-title"
          className="border-b border-border-subtle bg-[#f7f9f8]"
        >
          <div className="mx-auto max-w-[1280px] px-4 pb-12 pt-14 text-center sm:px-6 sm:pb-16 sm:pt-20 lg:px-8 lg:pt-24">
            <p className="flex items-center justify-center gap-2 text-[11px] font-semibold uppercase text-brand-700">
              <span
                aria-hidden="true"
                className="size-1.5 rounded-full bg-brand-600"
              />{" "}
              Commons for teams building in the open
            </p>
            <h1
              id="hero-title"
              className="mx-auto mt-6 max-w-[900px] text-[36px] font-semibold leading-[1.1] text-text-primary sm:text-[46px] lg:text-[58px]"
            >
              A workspace for conversations worth keeping.
            </h1>
            <p className="mx-auto mt-5 max-w-[600px] text-[15px] leading-7 text-text-secondary sm:text-[17px]">
              Give questions, decisions, and the replies that shape them a clear
              place to live, beyond the noise of real-time chat.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3 max-[360px]:mt-6">
              <Link href="/register" className={primaryAction}>
                Get started <ArrowRight aria-hidden="true" size={16} />
              </Link>
              <Link
                href="#product"
                className={`${secondaryAction} max-[360px]:hidden`}
              >
                Explore the product <ArrowDown aria-hidden="true" size={16} />
              </Link>
            </div>
          </div>
        </section>

        <section
          id="product"
          aria-label="Commons product preview"
          className="border-b border-border-subtle bg-[#eaf0ec]"
        >
          <div className="mx-auto max-w-[1280px] px-3 pb-10 pt-5 sm:px-6 sm:pb-16 sm:pt-8 lg:px-8 lg:pb-20">
            <ProductPreview />
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 px-1 text-[11px] text-text-muted">
              <span>
                Illustrative product view. Names and content are examples.
              </span>
              <span className="font-mono uppercase text-text-muted">
                Workspace / Discussion / Replies
              </span>
            </div>
          </div>
        </section>

        <section
          aria-labelledby="organized-title"
          className="border-b border-border-subtle bg-surface py-20 sm:py-24 lg:py-28"
        >
          <div className="mx-auto grid max-w-[1280px] items-center gap-12 px-4 sm:px-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16 lg:px-8">
            <div className="max-w-[470px]">
              <p className="font-mono text-xs font-medium uppercase text-brand-700">
                01 / Workspaces and discussions
              </p>
              <h2
                id="organized-title"
                className="mt-5 text-[30px] font-semibold leading-[1.16] text-text-primary sm:text-[38px]"
              >
                Give every project a place to think.
              </h2>
              <p className="mt-5 max-w-[430px] text-[15px] leading-7 text-text-secondary">
                A workspace keeps its people and project conversations together.
                Titled discussions give each question or update its own lasting
                context.
              </p>
              <div className="mt-7 flex items-center gap-2 text-sm font-medium text-text-primary">
                <Users
                  aria-hidden="true"
                  size={17}
                  className="text-brand-700"
                />{" "}
                Workspace membership stays visible
              </div>
            </div>
            <div
              role="img"
              aria-label="Illustrative discussion list in the Open Atlas workspace"
              className="min-w-0 border-y border-border bg-surface"
            >
              <div aria-hidden="true">
                <div className="flex items-baseline justify-between gap-3 border-b border-border-subtle py-4">
                  <div>
                    <span className="text-xs text-text-muted">
                      Open Atlas /{" "}
                    </span>
                    <strong className="text-sm font-semibold text-text-primary">
                      Discussions
                    </strong>
                  </div>
                  <span className="text-xs text-text-muted">Recent</span>
                </div>
                {discussions.map((item) => (
                  <div
                    key={item.title}
                    className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3 border-b border-border-subtle py-4 last:border-b-0 sm:gap-4 sm:py-5"
                  >
                    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-100 text-[10px] font-semibold text-brand-800">
                      {item.initials}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold leading-5 text-text-primary">
                        {item.title}
                      </p>
                      <p className="mt-1.5 text-xs text-text-muted">
                        {item.kind} <span aria-hidden="true">&middot;</span>{" "}
                        {item.author}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1 text-xs text-text-muted">
                      <MessageSquare size={14} />
                      <span>{item.replies}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section
          aria-labelledby="conversation-title"
          className="border-b border-border-subtle bg-[#f2f5f3] py-20 sm:py-24 lg:py-28"
        >
          <div className="mx-auto grid max-w-[1280px] items-center gap-12 px-4 sm:px-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-20 lg:px-8">
            <div
              role="img"
              aria-label="Illustrative threaded replies with a username mention and unread notification"
              className="order-2 min-w-0 lg:order-1"
            >
              <div
                aria-hidden="true"
                className="border-l-2 border-brand-300 pl-4 sm:pl-7"
              >
                <div className="border-b border-border pb-6">
                  <div className="flex items-center gap-3">
                    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-100 text-[11px] font-semibold text-brand-800">
                      LR
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-text-primary">
                        Lina Rahman
                      </p>
                      <p className="text-xs text-text-muted">
                        Reply in setup discussion
                      </p>
                    </div>
                  </div>
                  <p className="mt-4 max-w-[510px] text-sm leading-7 text-text-secondary">
                    A single quick-start path would help. We could move the
                    environment notes next to the first command.
                  </p>
                </div>
                <div className="ml-3 border-l-2 border-border py-6 pl-4 sm:ml-6 sm:pl-6">
                  <div className="flex items-center gap-3">
                    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-active text-[11px] font-semibold text-brand-800">
                      SK
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-text-primary">
                        Sam Kim
                      </p>
                      <p className="text-xs text-text-muted">Reply to Lina</p>
                    </div>
                    <CornerDownRight
                      aria-hidden="true"
                      size={15}
                      className="ml-auto text-text-muted"
                    />
                  </div>
                  <p className="mt-4 max-w-[480px] text-sm leading-7 text-text-secondary">
                    <span className="font-semibold text-info">@maya</span> I can
                    draft that flow and bring it back here for review.
                  </p>
                </div>
                <div className="flex items-start gap-3 border-t border-border bg-surface px-4 py-4">
                  <Bell
                    aria-hidden="true"
                    size={17}
                    className="mt-0.5 shrink-0 text-brand-700"
                  />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-text-primary">
                      Mention in a discussion
                    </p>
                    <p className="mt-1 text-xs leading-5 text-text-secondary">
                      Sam mentioned you in &quot;How should first-time setup
                      work?&quot;
                    </p>
                  </div>
                  <span
                    aria-hidden="true"
                    className="mt-1 size-2 shrink-0 rounded-full bg-brand-600"
                  />
                </div>
              </div>
            </div>
            <div className="order-1 max-w-[460px] lg:order-2">
              <p className="font-mono text-xs font-medium uppercase text-brand-700">
                02 / Replies and mentions
              </p>
              <h2
                id="conversation-title"
                className="mt-5 text-[30px] font-semibold leading-[1.16] text-text-primary sm:text-[38px]"
              >
                Keep the answer attached to the question.
              </h2>
              <p className="mt-5 text-[15px] leading-7 text-text-secondary">
                Threaded replies preserve the path from first thought to useful
                answer. Mentions bring a teammate into the discussion;
                notifications tell them they were needed.
              </p>
            </div>
          </div>
        </section>

        <section
          aria-labelledby="workflow-title"
          className="bg-[#1c2621] py-20 text-white sm:py-24 lg:py-28"
        >
          <div className="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8">
            <div className="max-w-[680px]">
              <p className="font-mono text-xs uppercase text-[#86d0aa]">
                The collaboration path
              </p>
              <h2
                id="workflow-title"
                className="mt-5 text-[30px] font-semibold leading-[1.16] sm:text-[38px]"
              >
                A clear path back to what matters.
              </h2>
              <p className="mt-5 text-[15px] leading-7 text-white/70">
                Each step adds context instead of burying the last one.
              </p>
            </div>
            <ol className="mt-10 border-t border-white/15">
              {workflow.map((step) => (
                <li
                  key={step.number}
                  className="grid grid-cols-[36px_minmax(0,1fr)] gap-x-4 gap-y-2 border-b border-white/15 py-5 sm:grid-cols-[56px_minmax(0,1fr)_minmax(0,1fr)] sm:items-center sm:gap-x-6 sm:py-6"
                >
                  <span className="font-mono text-xs text-[#86d0aa]">
                    {step.number}
                  </span>
                  <div className="flex min-w-0 items-center gap-3 text-sm font-semibold sm:text-base">
                    <span>{step.from}</span>
                    <ArrowRight
                      aria-hidden="true"
                      size={16}
                      className="shrink-0 text-[#86d0aa]"
                    />
                    <span>{step.to}</span>
                  </div>
                  <p className="col-start-2 text-xs leading-5 text-white/65 sm:col-auto sm:text-sm">
                    {step.detail}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section
          aria-labelledby="cta-title"
          className="border-b border-border-subtle bg-[#eaf0ec] py-20 sm:py-24 lg:py-28"
        >
          <div className="mx-auto grid max-w-[1280px] gap-8 px-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end lg:px-8">
            <div className="max-w-[720px]">
              <p className="font-mono text-xs font-medium uppercase text-brand-700">
                Start with a workspace
              </p>
              <h2
                id="cta-title"
                className="mt-5 text-[32px] font-semibold leading-[1.15] sm:text-[42px]"
              >
                Make room for conversations worth keeping.
              </h2>
              <p className="mt-5 text-[15px] leading-7 text-text-secondary">
                Create an account and start a workspace for your project.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 lg:justify-end">
              <Link href="/register" className={primaryAction}>
                Create an account <ArrowRight aria-hidden="true" size={16} />
              </Link>
              <Link
                href="/login"
                className="inline-flex min-h-12 items-center gap-2 rounded-md px-3 text-sm font-semibold text-text-secondary transition-colors hover:text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
              >
                Sign in <ArrowRight aria-hidden="true" size={15} />
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-surface">
        <div className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-between gap-5 px-4 py-7 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2.5">
            <span
              aria-hidden="true"
              className="grid size-7 place-items-center rounded bg-brand-700 text-xs font-bold text-white"
            >
              C
            </span>
            <span className="text-sm font-semibold text-text-primary">
              Commons
            </span>
            <span className="hidden border-l border-border pl-3 text-xs text-text-muted sm:inline">
              Thoughtful work happens here.
            </span>
          </div>
          <nav
            aria-label="Footer"
            className="flex items-center gap-5 text-xs font-medium text-text-secondary"
          >
            <Link
              href="/login"
              className="hover:text-text-primary focus-visible:outline-2 focus-visible:outline-focus-ring"
            >
              Sign in
            </Link>
            <Link
              href="/register"
              className="hover:text-text-primary focus-visible:outline-2 focus-visible:outline-focus-ring"
            >
              Get started
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
