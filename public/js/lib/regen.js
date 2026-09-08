import { $, escapeHtml } from "./dom.js";
import { api } from "./api.js";
import { ICONS } from "./icons.js";
import { state } from "./state.js";

export function regenExpandHtml({ open = false, note = "" } = {}) {
  if (!state.config.hasApiKey) return "";
  return `
    <div class="icon-chip lg light search-expand regen-expand${open ? " is-open" : ""}">
      <button type="button" class="search-expand-btn" data-regen-toggle aria-expanded="${open}" aria-label="Regenerate" title="Regenerate"></button>
      <input class="regen-note" type="text" value="${escapeHtml(note)}" placeholder="e.g. colloquial, not MSA…" autocomplete="off" tabindex="${open ? "0" : "-1"}" />
    </div>
  `;
}

export function currentRegenNote(root = document) {
  return $(".regen-note", root)?.value || "";
}

export function isRegenOpen(root = document) {
  return !!$(".regen-expand", root)?.classList.contains("is-open");
}

export function setRegenOpen(open, root = document) {
  const wrap = $(".regen-expand", root);
  const btn = $("[data-regen-toggle]", root);
  const input = $(".regen-note", root);
  if (!wrap || !btn || !input) return;
  wrap.classList.toggle("is-open", open);
  btn.setAttribute("aria-expanded", String(open));
  input.tabIndex = open ? 0 : -1;
  if (open) requestAnimationFrame(() => input.focus());
}

export function bindRegenExpand(root, { getExisting, applyGuess, stillActive }) {
  const wrap = $(".regen-expand", root);
  const btn = $("[data-regen-toggle]", root);
  const input = $(".regen-note", root);
  if (!wrap || !btn || !input) return;
  btn.innerHTML = ICONS.reroll;

  btn.addEventListener("click", () => {
    if (btn.classList.contains("is-spinning")) return;
    if (wrap.classList.contains("is-open")) {
      if (input.value.trim()) submitRegen();
      else setRegenOpen(false, root);
      return;
    }
    setRegenOpen(true, root);
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      submitRegen();
    }
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      setRegenOpen(false, root);
    }
  });

  async function submitRegen() {
    const note = input.value.trim();
    if (!note || btn.classList.contains("is-spinning")) return;
    const existing = getExisting();
    btn.classList.add("is-spinning");
    btn.disabled = true;
    try {
      const guess = await api("/api/autofill", {
        method: "POST",
        body: JSON.stringify({ word_ar: existing.word_ar, note, existing })
      });
      if (stillActive && !stillActive()) return;
      applyGuess(guess);
    } catch (err) {
      btn.classList.remove("is-spinning");
      btn.disabled = false;
      alert(err.message || "Something went wrong");
    }
  }
}

export function collapseRegenOnPointerDown(e) {
  const wrap = e.currentTarget.querySelector(".regen-expand.is-open");
  if (!wrap) return;
  if (wrap.querySelector(".regen-note")?.value.trim()) return;
  if (e.target.closest(".regen-expand")) return;
  const root = wrap.closest(".entry-form") || e.currentTarget;
  setRegenOpen(false, root);
}
