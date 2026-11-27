import type { Metadata } from "next";

import { SecurityOverview } from "@/components/settings/SecuritySettings";

export const metadata: Metadata = { title: "Security · Settings · Commons" };

export default function Page() {
  return <SecurityOverview />;
}
