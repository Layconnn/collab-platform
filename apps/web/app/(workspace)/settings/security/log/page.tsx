import type { Metadata } from "next";

import { SecurityLogSettings } from "@/components/settings/SecuritySettings";

export const metadata: Metadata = { title: "Security log · Settings · Commons" };

export default function Page() {
  return <SecurityLogSettings />;
}
