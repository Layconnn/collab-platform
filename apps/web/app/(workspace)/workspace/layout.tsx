import type { ReactNode } from "react";

import { DataProviders } from "@/app/data-providers";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { WorkspaceAppShell, WorkspaceShellLoading } from "@/components/shell/WorkspaceAppShell";

export default function AuthenticatedWorkspaceLayout({ children }: { children: ReactNode }) {
  return (
    <DataProviders>
      <AuthGuard loadingFallback={<WorkspaceShellLoading />}>
        <WorkspaceAppShell>{children}</WorkspaceAppShell>
      </AuthGuard>
    </DataProviders>
  );
}
