import type { Metadata } from "next";

import { NotificationKindsSettings } from "@/components/settings/NotificationPreferences";

export const metadata: Metadata = { title: "What notifies you · Settings · Commons" };

export default function Page() {
  return <NotificationKindsSettings />;
}
