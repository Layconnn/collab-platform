"use client";

import { createContext, useContext, useEffect, useSyncExternalStore, type ReactNode } from "react";

import { applyTheme, normalizeThemeMode, THEME_STORAGE_KEY, type ThemeMode } from "@/lib/theme";

const ThemeContext = createContext<{ mode: ThemeMode; setMode: (mode: ThemeMode) => void } | null>(null);
let fallbackMode: ThemeMode = "system";

function storedMode(): ThemeMode {
  try {
    return normalizeThemeMode(localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return fallbackMode;
  }
}

function subscribe(onChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key !== THEME_STORAGE_KEY && event.key !== null) return;
    applyTheme(storedMode(), window.matchMedia("(prefers-color-scheme: dark)").matches);
    onChange();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener("commons-theme-change", onChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener("commons-theme-change", onChange);
  };
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const mode = useSyncExternalStore<ThemeMode>(subscribe, storedMode, () => "system");

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    applyTheme(storedMode(), media.matches);
    const onSystemChange = () => {
      if (storedMode() === "system") applyTheme("system", media.matches);
    };
    media.addEventListener("change", onSystemChange);
    return () => media.removeEventListener("change", onSystemChange);
  }, []);

  const changeMode = (next: ThemeMode) => {
    fallbackMode = next;
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // The current tab still honors the selection when storage is unavailable.
    }
    applyTheme(next, window.matchMedia("(prefers-color-scheme: dark)").matches);
    window.dispatchEvent(new Event("commons-theme-change"));
  };

  return <ThemeContext.Provider value={{ mode, setMode: changeMode }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used within ThemeProvider");
  return context;
}
