import { $, $$, escapeHtml, addedAgo, entryDisplayDate } from "./lib/dom.js";
import { api } from "./lib/api.js";
import { stripHarakat } from "./lib/harakat.js";
import { ICONS } from "./lib/icons.js";

let openCardDetail = async () => {};

export function showView(id) {
  $$(".view").forEach((v) => v.classList.add("hidden"));
  $(`#${id}`).classList.remove("hidden");
  $(".hero").classList.toggle("hidden", id !== "homeView");
}

function renderCard(entry) {
  const el = document.createElement("div");
  el.className = "word-card";
  el.dataset.id = entry.id;
  el.innerHTML = `
    <div class="card-word" dir="rtl">${escapeHtml(stripHarakat(entry.word_ar))}</div>
    <div class="card-added">${escapeHtml(addedAgo(entryDisplayDate(entry)))}</div>
  `;
  el.addEventListener("click", () => openCardDetail(entry.id));
  return el;
}

function renderGrid(container, entries, emptyHtml) {
  container.innerHTML = "";
  if (!entries.length) {
    container.innerHTML = emptyHtml || `<div class="empty-note">No words yet.</div>`;
    return;
  }
  entries.forEach((entry) => container.appendChild(renderCard(entry)));
}

function renderStats({ words = 0, roots = 0 } = {}) {
  const set = (key, n) => {
    const el = $(`[data-stat="${key}"]`);
    if (el) el.textContent = Number(n).toLocaleString("en-US");
  };
  set("words", words);
  set("roots", roots);
}

export async function loadHome() {
  showView("homeView");
  const [randomWords, recentWords, stats] = await Promise.all([
    api("/api/random?count=3"),
    api("/api/words?limit=100"),
    api("/api/stats").catch(() => ({ words: 0, roots: 0 }))
  ]);
  renderGrid($("#randomGrid"), randomWords);
  renderGrid($("#recentGrid"), recentWords);
  renderStats(stats);
}

export async function showRootCluster(root) {
  showView("resultsView");
  const title = $("#resultsTitle");
  title.textContent = `Root: ${root}`;
  title.classList.remove("hidden");
  const entries = await api(`/api/root/${encodeURIComponent(root)}`);
  renderGrid($("#resultsGrid"), entries);
}

async function runSearch(q) {
  if (!q.trim()) {
    loadHome();
    return;
  }
  showView("resultsView");
  $("#resultsTitle").classList.add("hidden");
  const entries = await api(`/api/search?q=${encodeURIComponent(q)}`);
  renderGrid($("#resultsGrid"), entries, `
    <div class="empty-state">
      <p class="empty-state-mark" dir="rtl">لا نتائج</p>
      <p class="empty-state-query" dir="rtl">${escapeHtml(q)}</p>
      <p class="empty-state-hint">Nothing in the notebook matches this search.</p>
    </div>
  `);
}

let collapseSearch = () => {};

export function initHome({ openCard }) {
  openCardDetail = openCard;
  collapseSearch = initSearch();

  $$(`[data-nav="home"]`).forEach((el) => {
    el.addEventListener("click", () => {
      collapseSearch({ clear: true });
      loadHome();
    });
  });
}

function initSearch() {
  const wrap = $("#searchExpand");
  const input = $("#searchInput");
  const btn = $("#searchToggle");
  const clearBtn = $("#searchClear");
  btn.innerHTML = ICONS.search;
  clearBtn.innerHTML = ICONS.close;

  let searchDebounce = null;

  function isOpen() {
    return wrap.classList.contains("is-open");
  }

  function syncClear() {
    wrap.classList.toggle("has-query", !!input.value.trim());
  }

  function setOpen(open) {
    wrap.classList.toggle("is-open", open);
    btn.setAttribute("aria-expanded", String(open));
    input.tabIndex = open ? 0 : -1;
    if (open) requestAnimationFrame(() => input.focus());
  }

  function collapse({ clear = false } = {}) {
    if (clear) {
      input.value = "";
      clearTimeout(searchDebounce);
    }
    setOpen(false);
    syncClear();
  }

  btn.addEventListener("click", () => {
    if (isOpen() && !input.value.trim()) {
      setOpen(false);
      return;
    }
    setOpen(true);
  });

  input.addEventListener("input", (e) => {
    syncClear();
    clearTimeout(searchDebounce);
    const q = e.target.value;
    searchDebounce = setTimeout(() => runSearch(q), 250);
  });

  clearBtn.addEventListener("click", () => {
    input.value = "";
    syncClear();
    clearTimeout(searchDebounce);
    loadHome();
    input.focus();
  });

  input.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    collapse({ clear: true });
    loadHome();
  });

  document.addEventListener("pointerdown", (e) => {
    if (!isOpen() || input.value.trim()) return;
    if (e.target.closest("#searchExpand")) return;
    setOpen(false);
  });

  return collapse;
}
