import type { Metadata } from "next";

import { DigestSettings } from "@/components/settings/SettingsPages";

export const metadata: Metadata = { title: "Daily digest · Settings · Commons" };

export default function Page() {
  return <DigestSettings />;
}
