import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen bg-slate-50">
      <main className="mx-auto flex max-w-5xl flex-col gap-8 px-6 py-16">
        <div className="space-y-4">
          <h1 className="text-4xl font-semibold text-slate-900">
            Collaboration platform foundation
          </h1>
          <p className="max-w-2xl text-base text-slate-600">
            Workspaces, discussions, comments, and notifications backed by a production-ready
            backend. This frontend is intentionally minimal and wired to real APIs.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/login"
            className="rounded bg-teal-600 px-4 py-2 text-sm font-semibold text-white"
          >
            Sign in
          </Link>
          <Link
            href="/workspace"
            className="rounded border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
          >
            Go to workspaces
          </Link>
        </div>
      </main>
    </div>
  );
}
