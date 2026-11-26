import type { Metadata } from "next";

import { PasswordSettings } from "@/components/settings/SettingsPages";

export const metadata: Metadata = { title: "Change your password · Settings · Commons" };

export default function Page() {
  return <PasswordSettings />;
}
