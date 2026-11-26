import type { Metadata } from "next";

import { SettingsWelcome } from "@/components/settings/SettingsPages";

export const metadata: Metadata = { title: "Settings · Commons" };

export default function Page() {
  return <SettingsWelcome />;
}
