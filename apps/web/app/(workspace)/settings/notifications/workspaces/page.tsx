import type { Metadata } from "next";

import { WorkspaceLevelsSettings } from "@/components/settings/NotificationPreferences";

export const metadata: Metadata = { title: "Workspace notifications · Settings · Commons" };

export default function Page() {
  return <WorkspaceLevelsSettings />;
}
