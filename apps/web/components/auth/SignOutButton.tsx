"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { AppIcon } from "@/components/common/AppIcon";

export function SignOutButton() {
  const router = useRouter();
  const { logout } = useAuth();
  const [error, setError] = useState(false);
  const submittingRef = useRef(false);

  const signOut = async () => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setError(false);
    try {
      await logout.mutateAsync({});
    } catch {
      submittingRef.current = false;
      setError(true);
      return;
    }
    router.replace("/login");
  };

  return (
    <>
      <button type="button" className="flex min-h-10 w-full items-center gap-2 rounded px-2 py-2 text-left text-sm font-medium text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary focus-visible:ring-2 focus-visible:ring-focus-ring disabled:opacity-60" onClick={() => void signOut()} disabled={logout.isPending}>
        <AppIcon name="logout" />
        {logout.isPending ? "Signing out..." : "Sign out"}
      </button>
      {error ? <p role="alert" className="px-2 pb-1 text-xs text-danger">Could not sign out. Please try again.</p> : null}
    </>
  );
}
