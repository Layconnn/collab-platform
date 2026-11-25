import type { Metadata } from "next";

import { JoinPage } from "@/components/invite/JoinPage";

// No referrer, so the token never leaks to other sites (invite links PRD, NFR-3).
export const metadata: Metadata = { title: "Join a workspace · Commons", robots: { index: false }, referrer: "no-referrer" };

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <JoinPage token={decodeURIComponent(token)} />;
}
