import { $ } from "./dom.js";
import { ICONS } from "./icons.js";

const KEY = "theme";

export function currentTheme() {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

function syncToggle() {
  const btn = $("#themeToggle");
  if (!btn) return;
  const light = currentTheme() === "light";
  btn.innerHTML = light ? ICONS.moon : ICONS.sun;
  btn.setAttribute("aria-label", light ? "Dark mode" : "Light mode");
  btn.title = light ? "Dark mode" : "Light mode";
  btn.setAttribute("aria-pressed", String(light));
}

export function setTheme(theme) {
  const next = theme === "light" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem(KEY, next); } catch { /* ignore */ }
  syncToggle();
}

export function initTheme() {
  const saved = (() => {
    try { return localStorage.getItem(KEY); } catch { return null; }
  })();
  if (saved === "light" || saved === "dark") setTheme(saved);
  else syncToggle();
  $("#themeToggle")?.addEventListener("click", () => {
    setTheme(currentTheme() === "light" ? "dark" : "light");
  });
}
