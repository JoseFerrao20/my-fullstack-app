/**
 * Light/dark theme. The choice is per device (localStorage); "system" follows the OS.
 * index.html applies it before first paint; this module keeps it in sync afterwards.
 */
export type Theme = "system" | "light" | "dark";

const STORAGE_KEY = "theme";
const darkQuery = () => window.matchMedia?.("(prefers-color-scheme: dark)");

export function storedTheme(): Theme {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === "light" || value === "dark" ? value : "system";
  } catch {
    return "system";
  }
}

export function isDark(theme: Theme): boolean {
  return theme === "dark" || (theme === "system" && Boolean(darkQuery()?.matches));
}

export function applyTheme(theme: Theme = storedTheme()) {
  document.documentElement.classList.toggle("dark", isDark(theme));
}

export function setTheme(theme: Theme) {
  try {
    if (theme === "system") localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Private mode: applies for this visit only.
  }
  applyTheme(theme);
}

/** Re-applies when the OS switches between light and dark (only matters for "system"). */
export function watchSystemTheme() {
  darkQuery()?.addEventListener?.("change", () => applyTheme());
}
