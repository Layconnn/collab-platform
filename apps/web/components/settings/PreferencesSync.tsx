"use client";

import { useEffect, useRef } from "react";

import { applyDensity, applyMotion, DENSITY_STORAGE_KEY, MOTION_STORAGE_KEY, THEME_STORAGE_KEY } from "@/lib/theme";
import { trpc } from "@/lib/trpc/api-client";

// Keeps this browser in step with the account (settings PRD, FR-15, FR-16).
// The browser caches appearance so it applies before first paint; on sign-in
// the account's saved values win, and a person who never saved any uploads
// what this browser already had. It also remembers the last workspace when
// the person opens Commons there.

function read(key: string) {
  try { return localStorage.getItem(key); } catch { return null; }
}

export function cacheAppearance(values: { theme?: string; motion?: string; density?: string }) {
  try {
    if (values.theme) localStorage.setItem(THEME_STORAGE_KEY, values.theme);
    if (values.motion) localStorage.setItem(MOTION_STORAGE_KEY, values.motion);
    if (values.density) localStorage.setItem(DENSITY_STORAGE_KEY, values.density);
  } catch {
    // Without storage the page still applies the values for this visit.
  }
  if (values.motion) applyMotion(values.motion);
  if (values.density) applyDensity(values.density);
  if (values.theme) window.dispatchEvent(new StorageEvent("storage", { key: THEME_STORAGE_KEY }));
}

export function PreferencesSync({ workspaceId }: { workspaceId?: string }) {
  const preferences = trpc.preferences.get.useQuery(undefined, { staleTime: 5 * 60_000 });
  const update = trpc.preferences.update.useMutation();
  const visit = trpc.preferences.visit.useMutation();
  const synced = useRef(false);
  const data = preferences.data;

  useEffect(() => {
    if (!data || synced.current) return;
    synced.current = true;
    if (data.saved) {
      cacheAppearance(data);
      return;
    }
    const local = {
      theme: read(THEME_STORAGE_KEY) === "light" || read(THEME_STORAGE_KEY) === "dark" ? read(THEME_STORAGE_KEY) as "light" | "dark" : undefined,
      motion: read(MOTION_STORAGE_KEY) === "reduce" ? "reduce" as const : undefined,
      density: read(DENSITY_STORAGE_KEY) === "compact" ? "compact" as const : undefined,
    };
    if (local.theme || local.motion || local.density) update.mutate(local);
  }, [data, update]);

  useEffect(() => {
    if (!workspaceId || data?.startPage !== "last" || data.lastWorkspaceId === workspaceId) return;
    visit.mutate({ workspaceId });
    // Only a change of workspace matters here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, data?.startPage]);

  return null;
}
