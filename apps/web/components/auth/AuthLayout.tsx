import type { ReactNode } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  Bell,
  CornerDownRight,
  MessageSquareText,
} from "lucide-react";
import { TextReveal } from "@/components/marketing/TextReveal";

export function AuthLayout({
  variant,
  eyebrow,
  title,
  description,
  children,
  footer,
}: {
  variant: "login" | "register";
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  const registering = variant === "register";

  return (
    <main className="grid min-h-dvh bg-canvas lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <section className="flex min-w-0 flex-col px-5 pb-8 pt-6 sm:px-10 sm:pt-9 lg:min-h-dvh lg:px-12 xl:px-20">
        <Link
          href="/"
          className="inline-flex w-fit items-center gap-2.5 rounded-sm text-text-primary focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus-ring"
          aria-label="Commons home"
        >
          <span className="grid size-8 place-items-center rounded-md bg-brand-accent text-sm font-bold text-on-brand-accent">
            C
          </span>
          <span className="text-base font-semibold">Commons</span>
        </Link>
        <div
          className={`mx-auto flex w-full max-w-[440px] flex-1 flex-col justify-center ${registering ? "py-10 sm:py-12 lg:py-5" : "py-12 sm:py-16 lg:py-10"}`}
        >
          <p className="text-xs font-semibold uppercase text-brand-link">
            {eyebrow}
          </p>
          <TextReveal
            as="h1"
            text={title}
            variant="quiet"
            className={`type-editorial-display mt-4 text-[2.35rem] leading-[1.12] text-text-primary text-balance sm:text-[2.75rem] ${registering ? "lg:text-[2.5rem] xl:text-[2.75rem]" : ""}`}
          />
          <p
            className={`max-w-[39ch] text-[0.95rem] leading-7 text-text-secondary ${registering ? "mt-4" : "mt-5"}`}
          >
            {description}
          </p>
          <div
            className={`border-t border-border-subtle ${registering ? "mt-7 pt-6" : "mt-9 pt-8"}`}
          >
            {children}
          </div>
          <div
            className={`border-t border-border-subtle text-sm text-text-secondary ${registering ? "mt-6 pt-5" : "mt-7 pt-6"}`}
          >
            {footer}
          </div>
        </div>
        <p className="text-xs text-text-muted">Thoughtful work happens here.</p>
      </section>

      <aside
        className="relative hidden min-w-0 overflow-hidden bg-auth-stage px-8 py-12 text-auth-stage-text lg:flex lg:flex-col lg:justify-center xl:px-16"
        aria-hidden="true"
      >
        <div className="mx-auto w-full max-w-[570px]">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase text-auth-stage-muted">
            <span className="size-1.5 rounded-full bg-editorial-coral" />
            {registering
              ? "A place to begin together"
              : "A place for lasting conversations"}
          </div>
          <h2 className="type-editorial-display mt-5 max-w-[17ch] text-[3rem] text-auth-stage-text xl:text-[3.75rem]">
            {registering
              ? "Start a workspace. Start a conversation."
              : "Keep the question. Keep the context."}
          </h2>
          <p className="mt-4 max-w-[43ch] text-sm leading-6 text-auth-stage-muted">
            {registering
              ? "Bring contributors and the first important questions into one shared place."
              : "Give project conversations a home where every reply adds to the story."}
          </p>

          <div className="mt-10 overflow-hidden rounded-md border border-auth-stage-border bg-auth-stage-surface shadow-lg shadow-black/10">
            <div className="flex h-12 items-center justify-between border-b border-auth-stage-border px-4 text-xs text-auth-stage-muted">
              <div className="flex min-w-0 items-center gap-2">
                <span className="grid size-6 shrink-0 place-items-center rounded-sm bg-auth-stage-avatar font-bold text-auth-stage">
                  C
                </span>
                <span className="truncate font-semibold text-auth-stage-text">
                  Commons
                </span>
                <span>/</span>
                <span className="truncate">
                  {registering ? "Workspaces" : "Open Atlas"}
                </span>
              </div>
              {!registering ? (
                <Bell
                  aria-hidden="true"
                  size={18}
                  className="shrink-0 text-auth-stage-muted"
                />
              ) : null}
            </div>
            <div className="px-5 py-5 xl:px-7 xl:py-6">
              {registering ? (
                <>
                  <p className="text-xs font-semibold uppercase text-auth-stage-muted">
                    Workspace
                  </p>
                  <h3 className="mt-3 text-xl leading-snug font-semibold text-auth-stage-text">
                    Open Atlas
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-auth-stage-muted">
                    A shared home for a project and its contributors.
                  </p>
                  <div className="mt-5 border-t border-auth-stage-border pt-5">
                    <p className="flex items-center gap-2 text-xs font-semibold uppercase text-auth-stage-muted">
                      <MessageSquareText size={16} aria-hidden="true" /> First
                      discussion
                    </p>
                    <h4 className="mt-3 text-lg leading-snug font-semibold text-auth-stage-text">
                      Where should new contributors begin?
                    </h4>
                    <div className="mt-4 flex items-center gap-2 text-xs text-auth-stage-muted">
                      <span className="grid size-7 place-items-center rounded-full bg-auth-stage-avatar font-semibold text-auth-stage">
                        MC
                      </span>
                      <strong className="font-semibold text-auth-stage-text">
                        Maya Chen
                      </strong>
                      <span>started this conversation</span>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-auth-stage-text">
                      Let&apos;s make the first steps clear and keep the answers
                      here as the project grows.
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <p className="flex items-center gap-2 text-xs font-semibold uppercase text-auth-stage-muted">
                    <MessageSquareText size={16} aria-hidden="true" />{" "}
                    Discussion
                  </p>
                  <h3 className="mt-3 text-xl leading-snug font-semibold text-auth-stage-text">
                    How should first-time setup work?
                  </h3>
                  <div className="mt-5 flex items-center gap-2 text-xs text-auth-stage-muted">
                    <span className="grid size-7 place-items-center rounded-full bg-auth-stage-avatar font-semibold text-auth-stage">
                      MC
                    </span>
                    <span>
                      <strong className="font-semibold text-auth-stage-text">
                        Maya Chen
                      </strong>{" "}
                      started this conversation
                    </span>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-auth-stage-text">
                    New contributors lose context between the README and their
                    first local run. Could we make the initial path easier to
                    follow?
                  </p>
                  <div className="mt-5 border-t border-auth-stage-border pt-4">
                    <p className="text-xs font-semibold uppercase text-auth-stage-muted">
                      2 replies
                    </p>
                    <div className="mt-3 flex gap-3">
                      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-auth-stage-avatar text-xs font-semibold text-auth-stage">
                        LR
                      </span>
                      <p className="min-w-0 text-sm leading-6">
                        <strong className="font-semibold text-auth-stage-text">
                          Lina Rahman
                        </strong>
                        <br />
                        <span className="text-auth-stage-muted">
                          A quick-start beside the first command would help.
                        </span>
                      </p>
                    </div>
                    <div className="mt-3 flex gap-3 border-l border-auth-stage-border pl-3">
                      <CornerDownRight
                        size={16}
                        className="mt-1 shrink-0 text-auth-stage-muted"
                        aria-hidden="true"
                      />
                      <p className="min-w-0 text-sm leading-6">
                        <strong className="font-semibold text-auth-stage-text">
                          Sam Kim
                        </strong>
                        <br />
                        <span className="text-auth-stage-muted">
                          <span className="font-semibold text-auth-stage-text">
                            @maya
                          </span>{" "}
                          I can draft that flow for review.
                        </span>
                      </p>
                    </div>
                  </div>
                </>
              )}
            </div>
            <div className="flex items-center justify-between border-t border-auth-stage-border px-5 py-3 text-xs text-auth-stage-muted xl:px-7">
              <span>
                {registering
                  ? "Your first conversation has a home"
                  : "Context stays with the discussion"}
              </span>
              <ArrowUpRight size={16} aria-hidden="true" />
            </div>
          </div>
          <p className="mt-3 text-right text-[0.7rem] text-auth-stage-muted">
            Illustrative discussion. Names and content are examples.
          </p>
        </div>
      </aside>
    </main>
  );
}
