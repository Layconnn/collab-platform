import type { Metadata } from "next";

import { AppearanceSettings } from "@/components/settings/SettingsPages";

export const metadata: Metadata = { title: "Appearance · Settings · Commons" };

export default function Page() {
  return <AppearanceSettings />;
}
