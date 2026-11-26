import type { ReactNode } from "react";

import WorkspaceLayout from "../workspace/layout";
import { SettingsFrame } from "@/components/settings/SettingsFrame";

// Settings span every workspace, so they use the same signed-in shell, with
// the category column beside each page (dashboard redesign PRD, FR-8).
export default function SettingsLayout({ children }: { children: ReactNode }) {
  return <WorkspaceLayout><SettingsFrame>{children}</SettingsFrame></WorkspaceLayout>;
}
