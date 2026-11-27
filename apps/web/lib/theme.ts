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

// Reduced motion and density (settings PRD, FR-16), cached in this browser so
// they apply before first paint; the account copy syncs them across devices.
export const MOTION_STORAGE_KEY = "commons-motion";
export const DENSITY_STORAGE_KEY = "commons-density";

export function applyMotion(motion: string | null) {
  if (motion === "reduce") document.documentElement.dataset.motion = "reduce";
  else delete document.documentElement.dataset.motion;
}

export function applyDensity(density: string | null) {
  if (density === "compact") document.documentElement.dataset.density = "compact";
  else delete document.documentElement.dataset.density;
}

export const themeInitScript = `var mode="system";try{var saved=localStorage.getItem("commons-theme");if(saved==="light"||saved==="dark")mode=saved;if(localStorage.getItem("commons-motion")==="reduce")document.documentElement.dataset.motion="reduce";if(localStorage.getItem("commons-density")==="compact")document.documentElement.dataset.density="compact"}catch(e){}var systemDark=typeof matchMedia==="function"&&matchMedia("(prefers-color-scheme: dark)").matches;var dark=mode==="dark"||(mode==="system"&&systemDark);document.documentElement.dataset.theme=dark?"dark":"light";document.documentElement.classList.toggle("dark",dark);`;
