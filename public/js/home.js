import { $, $$, escapeHtml, addedAgo } from "./lib/dom.js";
import { api } from "./lib/api.js";
import { stripHarakat } from "./lib/harakat.js";

let openCardDetail = async () => {};

export function showView(id) {
  $$(".view").forEach((v) => v.classList.add("hidden"));
  $(`#${id}`).classList.remove("hidden");
}

function renderCard(entry) {
  const el = document.createElement("div");
  el.className = "word-card";
  el.dataset.id = entry.id;
  el.innerHTML = `
    <div class="card-word" dir="rtl">${escapeHtml(stripHarakat(entry.word_ar))}</div>
    <div class="card-added">${escapeHtml(addedAgo(entry.date_added))}</div>
  `;
  el.addEventListener("click", () => openCardDetail(entry.id));
  return el;
}

function renderGrid(container, entries) {
  container.innerHTML = "";
  if (!entries.length) {
    container.innerHTML = `<div class="empty-note">No words yet.</div>`;
    return;
  }
  entries.forEach((entry) => container.appendChild(renderCard(entry)));
}

export async function loadHome() {
  showView("homeView");
  const [randomWords, recentWords] = await Promise.all([
    api("/api/random?count=3"),
    api("/api/words?limit=24")
  ]);
  renderGrid($("#randomGrid"), randomWords);
  renderGrid($("#recentGrid"), recentWords);
}

export async function showRootCluster(root) {
  showView("resultsView");
  $("#resultsTitle").textContent = `Root: ${root}`;
  const entries = await api(`/api/root/${encodeURIComponent(root)}`);
  renderGrid($("#resultsGrid"), entries);
}

async function runSearch(q) {
  if (!q.trim()) {
    loadHome();
    return;
  }
  showView("resultsView");
  $("#resultsTitle").textContent = `Search: ${q}`;
  const entries = await api(`/api/search?q=${encodeURIComponent(q)}`);
  renderGrid($("#resultsGrid"), entries);
}

export function initHome({ openCard }) {
  openCardDetail = openCard;
  let searchDebounce = null;
  $("#searchInput").addEventListener("input", (e) => {
    clearTimeout(searchDebounce);
    const q = e.target.value;
    searchDebounce = setTimeout(() => runSearch(q), 250);
  });

  $$(`[data-nav="home"]`).forEach((el) => {
    el.addEventListener("click", () => {
      $("#searchInput").value = "";
      loadHome();
    });
  });
}
