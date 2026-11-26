import type { Metadata } from "next";

import { AccountSettings } from "@/components/settings/SettingsPages";

export const metadata: Metadata = { title: "Your account · Settings · Commons" };

export default function Page() {
  return <AccountSettings />;
}
