export type ThemeMode = "light" | "dark" | "system";

export const THEME_STORAGE_KEY = "commons-theme";

export function normalizeThemeMode(value: string | null): ThemeMode {
  return value === "light" || value === "dark" ? value : "system";
}

export function resolveTheme(mode: ThemeMode, systemDark: boolean): "light" | "dark" {
  return mode === "system" ? (systemDark ? "dark" : "light") : mode;
}

export function applyTheme(mode: ThemeMode, systemDark: boolean) {
  const resolved = resolveTheme(mode, systemDark);
  document.documentElement.dataset.theme = resolved;
  document.documentElement.classList.toggle("dark", resolved === "dark");
}

export const themeInitScript = `var mode="system";try{var saved=localStorage.getItem("commons-theme");if(saved==="light"||saved==="dark")mode=saved}catch(e){}var systemDark=typeof matchMedia==="function"&&matchMedia("(prefers-color-scheme: dark)").matches;var dark=mode==="dark"||(mode==="system"&&systemDark);document.documentElement.dataset.theme=dark?"dark":"light";document.documentElement.classList.toggle("dark",dark);`;
