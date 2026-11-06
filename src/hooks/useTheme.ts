import { useEffect } from "react";
import type { ThemeMode } from "../types";
import { useAppStore } from "../stores/appStore";

export function useTheme() {
  const theme = useAppStore((state) => state.settings?.theme ?? "system");

  useEffect(() => {
    applyTheme(theme);
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme(theme);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [theme]);
}

export function applyTheme(theme: ThemeMode) {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const dark = theme === "dark" || (theme === "system" && media.matches);
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
}
