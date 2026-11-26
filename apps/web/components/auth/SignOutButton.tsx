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
      <button type="button" className="flex min-h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-[0.8125rem] text-text-secondary transition-colors duration-150 ease-out hover:bg-surface-hover hover:text-text-primary focus-visible:ring-2 focus-visible:ring-focus-ring disabled:opacity-60" onClick={() => void signOut()} disabled={logout.isPending}>
        <AppIcon name="logout" />
        {logout.isPending ? "Signing out..." : "Sign out"}
      </button>
      {error ? <p role="alert" className="px-2 pb-1 text-xs text-danger">Could not sign out. Please try again.</p> : null}
    </>
  );
}
