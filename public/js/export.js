import { $ } from "./lib/dom.js";
import { api } from "./lib/api.js";
import { ICONS } from "./lib/icons.js";

let addsSinceLastExport = 0;
const AUTO_EXPORT_EVERY_N_ADDS = 5;

async function triggerExport({ silent = false } = {}) {
  try {
    await api("/api/export", { method: "POST", keepalive: true });
    addsSinceLastExport = 0;
    if (!silent) {
      const btn = $("#exportBtn");
      btn.innerHTML = ICONS.check;
      btn.classList.add("is-saved");
      setTimeout(() => {
        btn.innerHTML = ICONS.export;
        btn.classList.remove("is-saved");
      }, 1500);
    }
  } catch (err) {
    if (!silent) alert(err.message || "Export failed");
    else console.error("Auto-export failed", err);
  }
}

export function noteWordAdded() {
  addsSinceLastExport += 1;
  if (addsSinceLastExport >= AUTO_EXPORT_EVERY_N_ADDS) {
    triggerExport({ silent: true });
  }
}

export function initExport() {
  const btn = $("#exportBtn");
  btn.innerHTML = ICONS.export;
  btn.addEventListener("click", () => triggerExport());

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden" && addsSinceLastExport > 0) {
      triggerExport({ silent: true });
    }
  });
}
