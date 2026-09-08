import { $, $$, escapeHtml } from "./dom.js";
import { state } from "./state.js";
import { harakatBtn, ICONS } from "./icons.js";

const HARAKAT_REGEX = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E8\u06EA-\u06ED]/g;

export function stripHarakat(str) {
  return String(str ?? "").replace(HARAKAT_REGEX, "");
}

export function displayAr(str) {
  const raw = str ?? "";
  return state.showHarakat ? raw : stripHarakat(raw);
}

export function arHtml(str) {
  const raw = str ?? "";
  return `<span class="ar-text" data-voweled="${escapeHtml(raw)}">${escapeHtml(displayAr(raw))}</span>`;
}

export function syncHarakatToggle() {
  $$("[data-harakat-toggle]").forEach((btn) => {
    btn.setAttribute("aria-pressed", String(state.showHarakat));
    btn.setAttribute("aria-label", state.showHarakat ? "Harakat on" : "Harakat off");
  });
}

export function applyHarakatToDom() {
  $$(".ar-text").forEach((el) => {
    const raw = el.dataset.voweled ?? "";
    el.textContent = displayAr(raw);
  });
}

export function initHarakat() {
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-harakat-toggle]");
    if (!btn) return;
    state.showHarakat = !state.showHarakat;
    localStorage.setItem("showHarakat", String(state.showHarakat));
    syncHarakatToggle();
    applyHarakatToDom();
  });
  $("#exportBtn").insertAdjacentHTML("beforebegin", harakatBtn());
  $("#holdBar").insertAdjacentHTML("beforeend", ICONS.eye);
  syncHarakatToggle();
}
