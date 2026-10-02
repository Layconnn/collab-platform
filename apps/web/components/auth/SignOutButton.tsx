"use client";

import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";

export function SignOutButton() {
  const router = useRouter();
  const { logout } = useAuth();

  const signOut = async () => {
    await logout.mutateAsync({});
    router.replace("/login");
  };

  return (
    <button className="text-sm font-medium text-slate-600 disabled:opacity-60" onClick={signOut} disabled={logout.isPending}>
      {logout.isPending ? "Signing out..." : "Sign out"}
    </button>
  );
}
