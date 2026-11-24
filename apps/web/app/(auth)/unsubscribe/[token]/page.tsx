import type { Metadata } from "next";

import { UnsubscribePage } from "@/components/settings/UnsubscribePage";

export const metadata: Metadata = { title: "Daily digest · Commons", robots: { index: false } };

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <UnsubscribePage token={decodeURIComponent(token)} />;
}
