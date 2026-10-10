"use client";

import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { AppIcon } from "@/components/common/AppIcon";

export function SignOutButton() {
  const router = useRouter();
  const { logout } = useAuth();

  const signOut = async () => {
    await logout.mutateAsync({});
    router.replace("/login");
  };

  return (
    <button type="button" className="flex min-h-10 w-full items-center gap-2 rounded px-2 py-2 text-left text-sm font-medium text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary disabled:opacity-60" onClick={signOut} disabled={logout.isPending}>
      <AppIcon name="logout" />
      {logout.isPending ? "Signing out..." : "Sign out"}
    </button>
  );
}
