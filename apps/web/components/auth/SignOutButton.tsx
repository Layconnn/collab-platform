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
    <button className="whitespace-nowrap rounded-md px-2 py-2 text-sm font-medium text-[#63716a] transition-colors hover:bg-[#edf4ef] hover:text-[#17231f] disabled:opacity-60" onClick={signOut} disabled={logout.isPending}>
      {logout.isPending ? "Signing out..." : "Sign out"}
    </button>
  );
}
