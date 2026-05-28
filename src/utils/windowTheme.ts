import { getCurrentWindow } from "@tauri-apps/api/window";

const THEME_BG = "#1e1e1e";

export async function applyWindowTheme() {
  if (!("__TAURI_INTERNALS__" in window)) return;
  const win = getCurrentWindow();
  await Promise.all([
    win.setTheme("dark"),
    win.setBackgroundColor(THEME_BG),
  ]);
}
