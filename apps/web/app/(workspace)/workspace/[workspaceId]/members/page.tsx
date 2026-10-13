"use client";

import { useParams } from "next/navigation";

import { WorkspaceMembersPanel } from "@/components/workspace/WorkspaceMembersPanel";

export default function WorkspaceMembersPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  return <WorkspaceMembersPanel workspaceId={workspaceId} />;
}
