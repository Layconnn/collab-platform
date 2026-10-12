"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { useAuth } from "@/hooks/useAuth";
import { ErrorState, LoadingState } from "@/components/common/StateNotice";

export function AuthGuard({
  children,
  loadingFallback,
}: {
  children: ReactNode;
  loadingFallback?: ReactNode;
}) {
  const router = useRouter();
  const { me } = useAuth();

  const unauthorized = me.error?.data?.code === "UNAUTHORIZED";
  useEffect(() => {
    if (unauthorized) router.replace("/login");
  }, [unauthorized, router]);

  if (me.isLoading || unauthorized || !me.data && !me.isError) {
    if (loadingFallback) return loadingFallback;
    return <main className="mx-auto max-w-5xl px-6 py-10"><LoadingState label="Checking your session..." /></main>;
  }
  if (me.isError) return <main className="mx-auto max-w-5xl px-6 py-10"><ErrorState title="Could not verify your session" description="Please try again in a moment." onRetry={() => void me.refetch()} retrying={me.isFetching} /></main>;

  return children;
}
