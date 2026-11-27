import type { Metadata } from "next";

import { WorkspacesSettings } from "@/components/settings/SettingsPages";

export const metadata: Metadata = { title: "Workspaces · Settings · Commons" };

export default function Page() {
  return <WorkspacesSettings />;
}
