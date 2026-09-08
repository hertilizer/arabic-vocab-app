import { $ } from "./lib/dom.js";
import { api } from "./lib/api.js";

let addsSinceLastExport = 0;
const AUTO_EXPORT_EVERY_N_ADDS = 5;

async function triggerExport({ silent = false } = {}) {
  try {
    await api("/api/export", { method: "POST", keepalive: true });
    addsSinceLastExport = 0;
    if (!silent) {
      const btn = $("#exportBtn");
      const original = btn.textContent;
      btn.textContent = "Saved";
      setTimeout(() => { btn.textContent = original; }, 1500);
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
  $("#exportBtn").addEventListener("click", () => triggerExport());

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden" && addsSinceLastExport > 0) {
      triggerExport({ silent: true });
    }
  });
}
