import type { Metadata } from "next";

import { NotificationSettings } from "@/components/settings/SettingsPages";

export const metadata: Metadata = { title: "Notifications · Settings · Commons" };

export default function Page() {
  return <NotificationSettings />;
}
