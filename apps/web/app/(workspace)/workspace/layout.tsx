import type { ReactNode } from "react";

import { AuthGuard } from "@/components/auth/AuthGuard";
import { WorkspaceAppShell, WorkspaceShellLoading } from "@/components/shell/WorkspaceAppShell";

export default function AuthenticatedWorkspaceLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGuard loadingFallback={<WorkspaceShellLoading />}>
      <WorkspaceAppShell>{children}</WorkspaceAppShell>
    </AuthGuard>
  );
}
