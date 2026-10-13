"use client";

import { useParams } from "next/navigation";

import { WorkspaceHome } from "@/components/workspace/WorkspaceHome";

export default function WorkspaceOverviewPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  return <WorkspaceHome workspaceId={workspaceId} />;
}
