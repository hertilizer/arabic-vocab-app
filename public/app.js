const state = {
  config: { hasApiKey: false, posList: [] },
  currentAddGuess: null, // { word_ar, root, part_of_speech, meaning, word_ar_paired }
  currentAddWord: null,
  showHarakat: localStorage.getItem("showHarakat") !== "false"
};

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const HARAKAT_REGEX = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E8\u06EA-\u06ED]/g;

function stripHarakat(str) {
  return String(str ?? "").replace(HARAKAT_REGEX, "");
}

function displayAr(str) {
  const raw = str ?? "";
  return state.showHarakat ? raw : stripHarakat(raw);
}

function arHtml(str) {
  const raw = str ?? "";
  return `<span class="ar-text" data-voweled="${escapeHtml(raw)}">${escapeHtml(displayAr(raw))}</span>`;
}

function syncHarakatToggle() {
  const btn = $("#harakatToggle");
  btn.setAttribute("aria-pressed", String(state.showHarakat));
  btn.textContent = state.showHarakat ? "Harakat on" : "Harakat off";
  btn.classList.toggle("toggle-on", state.showHarakat);
}

function applyHarakatToDom() {
  $$(".ar-text").forEach((el) => {
    const raw = el.dataset.voweled ?? "";
    el.textContent = displayAr(raw);
  });
}

$("#harakatToggle").addEventListener("click", () => {
  state.showHarakat = !state.showHarakat;
  localStorage.setItem("showHarakat", String(state.showHarakat));
  syncHarakatToggle();
  applyHarakatToDom();
});
syncHarakatToggle();

async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...opts
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = new Error(body.message || body.error || res.statusText);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return res.status === 204 ? null : res.json();
}

// ---------- Card rendering ----------

function pairedFormsHtml(paired) {
  if (!paired || !paired.length) return "";
  return paired
    .map((f) => `<span class="card-paired"><span class="label">${escapeHtml(f.label)}</span>${arHtml(f.word_ar)}</span>`)
    .join(" ");
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function addedAgo(dateAdded) {
  if (!dateAdded) return "";
  const iso = dateAdded.includes("T") ? dateAdded : dateAdded.replace(" ", "T") + "Z";
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return "";
  const startOf = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const days = Math.round((startOf(new Date()) - startOf(then)) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
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

// ---------- Views ----------

function showView(id) {
  $$(".view").forEach((v) => v.classList.add("hidden"));
  $(`#${id}`).classList.remove("hidden");
}

async function loadHome() {
  showView("homeView");
  const [randomWords, recentWords] = await Promise.all([
    api("/api/random?count=3"),
    api("/api/words?limit=24")
  ]);
  renderGrid($("#randomGrid"), randomWords);
  renderGrid($("#recentGrid"), recentWords);
}

async function showRootCluster(root) {
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

// ---------- Card detail modal ----------

async function openCardDetail(id) {
  const entry = await api(`/api/words/${id}`);
  const body = $("#cardModalBody");
  body.innerHTML = `
    <div class="detail-header">
      <span class="root-chip ${entry.root ? "" : "empty"}" id="detailRootChip">${escapeHtml(entry.root) || "—"}</span>
      <button class="btn small secondary" id="detailEditToggle">Edit</button>
    </div>
    <div class="detail-primary" dir="rtl">${arHtml(entry.word_ar)}</div>
    <div class="detail-paired-list">${pairedFormsHtml(entry.word_ar_paired) || `<span class="empty-note">No other forms</span>`}</div>

    <div id="detailReadOnly">
      <div class="detail-field"><label>Part of speech</label><div class="value">${escapeHtml(entry.part_of_speech) || "—"}</div></div>
      <div class="detail-field"><label>Notes</label><div class="value">${escapeHtml(entry.notes) || "—"}</div></div>
      <div class="reveal-meaning-block">
        <button class="reveal-btn" id="detailRevealMeaning">Reveal meaning</button>
        <div class="meaning-text hidden" id="detailMeaningText" style="margin-top:10px;">${escapeHtml(entry.meaning) || "<em>No meaning recorded</em>"}</div>
      </div>
    </div>

    <div id="detailEditForm" class="hidden">
      <div class="detail-field"><label>Arabic word</label><input id="editWordAr" dir="rtl" value="${escapeHtml(entry.word_ar)}" /></div>
      <div class="detail-field"><label>Root</label><input id="editRoot" dir="rtl" value="${escapeHtml(entry.root)}" /></div>
      <div class="detail-field"><label>Part of speech</label>
        <select id="editPos">
          <option value="">—</option>
          ${state.config.posList.map((p) => `<option value="${escapeHtml(p)}" ${p === entry.part_of_speech ? "selected" : ""}>${escapeHtml(p)}</option>`).join("")}
        </select>
      </div>
      <div class="detail-field"><label>Meaning</label><textarea id="editMeaning">${escapeHtml(entry.meaning)}</textarea></div>
      <div class="detail-field"><label>Notes</label><textarea id="editNotes">${escapeHtml(entry.notes)}</textarea></div>
      <div class="detail-field">
        <label>Other forms (label + Arabic)</label>
        <div id="editPairedList"></div>
        <button class="btn small secondary" id="addPairedFormBtn" type="button">+ Add form</button>
      </div>
      <div class="add-actions">
        <button class="btn secondary" id="deleteEntryBtn" type="button">Delete</button>
        <button class="btn primary" id="saveEntryBtn" type="button">Save</button>
      </div>
    </div>
  `;

  $("#detailRootChip").addEventListener("click", () => {
    if (entry.root) {
      closeCardModal();
      showRootCluster(entry.root);
    }
  });

  $("#detailRevealMeaning").addEventListener("click", () => {
    $("#detailMeaningText").classList.toggle("hidden");
  });

  $("#detailEditToggle").addEventListener("click", () => {
    $("#detailReadOnly").classList.add("hidden");
    $("#detailEditForm").classList.remove("hidden");
    renderPairedEditRows(entry.word_ar_paired);
  });

  $("#addPairedFormBtn").addEventListener("click", () => {
    const rows = getPairedRowsFromForm();
    rows.push({ label: "", word_ar: "" });
    renderPairedEditRows(rows);
  });

  $("#deleteEntryBtn").addEventListener("click", async () => {
    if (!confirm("Delete this word?")) return;
    await api(`/api/words/${id}`, { method: "DELETE" });
    closeCardModal();
    loadHome();
  });

  $("#saveEntryBtn").addEventListener("click", async () => {
    const payload = {
      word_ar: $("#editWordAr").value.trim(),
      root: $("#editRoot").value.trim(),
      part_of_speech: $("#editPos").value,
      meaning: $("#editMeaning").value.trim(),
      notes: $("#editNotes").value.trim(),
      word_ar_paired: getPairedRowsFromForm().filter((r) => r.word_ar.trim())
    };
    await api(`/api/words/${id}`, { method: "PUT", body: JSON.stringify(payload) });
    closeCardModal();
    loadHome();
  });

  $("#cardModal").classList.remove("hidden");
}

function renderPairedEditRows(rows) {
  const container = $("#editPairedList");
  container.innerHTML = "";
  rows.forEach((r, i) => {
    const row = document.createElement("div");
    row.className = "paired-form-row";
    row.innerHTML = `
      <input data-p-label value="${escapeHtml(r.label)}" placeholder="e.g. past" />
      <input data-p-word dir="rtl" value="${escapeHtml(r.word_ar)}" placeholder="Arabic form" />
      <button class="icon-btn" data-remove-paired="${i}" type="button">✕</button>
    `;
    container.appendChild(row);
  });
  $$(`[data-remove-paired]`, container).forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = parseInt(btn.dataset.removePaired);
      rows.splice(idx, 1);
      renderPairedEditRows(rows);
    });
  });
}

function getPairedRowsFromForm() {
  return $$(".paired-form-row", $("#editPairedList")).map((row) => ({
    label: $("[data-p-label]", row).value.trim(),
    word_ar: $("[data-p-word]", row).value.trim()
  }));
}

function closeCardModal() {
  $("#cardModal").classList.add("hidden");
}
$("[data-close-card]").addEventListener("click", closeCardModal);
$("#cardModal").addEventListener("click", (e) => {
  if (e.target.id === "cardModal") closeCardModal();
});

// ---------- Add flow ----------

function openAddModal() {
  state.currentAddGuess = null;
  state.currentAddWord = null;
  renderAddStepInput();
  $("#addModal").classList.remove("hidden");
}

function closeAddModal() {
  $("#addModal").classList.add("hidden");
}
$("[data-close-add]").addEventListener("click", closeAddModal);
$("#addModal").addEventListener("click", (e) => {
  if (e.target.id === "addModal") closeAddModal();
});
$("#addBtn").addEventListener("click", openAddModal);

function renderAddStepInput() {
  const body = $("#addModalBody");
  const warn = state.config.hasApiKey
    ? ""
    : `<div class="warn-box">No API key is set. You can add a word manually, or put ANTHROPIC_API_KEY in .env and restart the server.</div>`;
  body.innerHTML = `
    <div class="add-step">
      <h3>Add a new word</h3>
      ${warn}
      <div class="field-row">
        <label>Arabic word</label>
        <input id="newWordInput" placeholder="Type the word here" dir="rtl" autofocus />
      </div>
      <div class="add-actions">
        <button class="btn secondary" id="manualAddBtn" type="button">Add manually</button>
        <button class="btn primary" id="autofillBtn" type="button" ${state.config.hasApiKey ? "" : "disabled"}>Autofill with AI</button>
      </div>
    </div>
  `;

  $("#manualAddBtn").addEventListener("click", () => {
    const word = $("#newWordInput").value.trim();
    if (!word) return;
    state.currentAddGuess = { word_ar: word, root: "", part_of_speech: "", meaning: "", word_ar_paired: [] };
    renderAddStepConfirm();
  });

  $("#autofillBtn").addEventListener("click", async () => {
    const word = $("#newWordInput").value.trim();
    if (!word) return;
    state.currentAddWord = word;
    body.innerHTML = `<div class="spinner-text">Analyzing with AI…</div>`;
    try {
      const guess = await api("/api/autofill", { method: "POST", body: JSON.stringify({ word_ar: word }) });
      state.currentAddGuess = guess;
      renderAddStepConfirm();
    } catch (err) {
      renderAddStepInput();
      alert(err.message || "Autofill failed");
    }
  });
}

function renderAddStepConfirm() {
  const g = state.currentAddGuess;
  const body = $("#addModalBody");
  body.innerHTML = `
    <div class="add-step">
      <h3>Confirm entry</h3>

      <div class="field-row" data-field-row="word_ar">
        <div class="field-header"><label>Arabic word (with vowels)</label>${retryBtn("word_ar")}</div>
        <input data-field="word_ar" dir="rtl" value="${escapeHtml(g.word_ar)}" />
      </div>

      <div class="field-row" data-field-row="root">
        <div class="field-header"><label>Root</label>${retryBtn("root")}</div>
        <input data-field="root" dir="rtl" value="${escapeHtml(g.root)}" />
      </div>

      <div class="field-row" data-field-row="part_of_speech">
        <div class="field-header"><label>Part of speech</label>${retryBtn("part_of_speech")}</div>
        <select data-field="part_of_speech">
          <option value="">—</option>
          ${state.config.posList.map((p) => `<option value="${escapeHtml(p)}" ${p === g.part_of_speech ? "selected" : ""}>${escapeHtml(p)}</option>`).join("")}
        </select>
      </div>

      <div class="field-row" data-field-row="meaning">
        <div class="field-header"><label>Meaning</label>${retryBtn("meaning")}</div>
        <textarea data-field="meaning">${escapeHtml(g.meaning)}</textarea>
      </div>

      <div class="field-row" data-field-row="word_ar_paired">
        <div class="field-header"><label>Other forms (e.g. past / plural)</label>${retryBtn("word_ar_paired")}</div>
        <div id="addPairedList"></div>
        <button class="btn small secondary" id="addPairedFormBtnAdd" type="button">+ Add form</button>
      </div>

      <div class="field-row">
        <label>Notes</label>
        <textarea data-field="notes"></textarea>
      </div>

      <div class="note-box">
        <label>Note for regenerating (optional)</label>
        <textarea id="wholeNoteInput" placeholder="e.g. This is colloquial, not MSA…"></textarea>
        <button class="btn small secondary" id="regenerateAllBtn" type="button" style="margin-top:6px;" ${state.config.hasApiKey ? "" : "disabled"}>Regenerate all with this note</button>
      </div>

      <div class="add-actions">
        <button class="btn secondary" id="cancelAddBtn" type="button">Cancel</button>
        <button class="btn primary" id="commitAddBtn" type="button">Save word</button>
      </div>
    </div>
  `;

  renderAddPairedRows(g.word_ar_paired || []);

  $("#addPairedFormBtnAdd").addEventListener("click", () => {
    const rows = getAddPairedRows();
    rows.push({ label: "", word_ar: "" });
    renderAddPairedRows(rows);
  });

  $$("[data-retry-field]").forEach((btn) => {
    btn.addEventListener("click", () => retryField(btn.dataset.retryField));
  });

  $("#cancelAddBtn").addEventListener("click", closeAddModal);

  $("#regenerateAllBtn").addEventListener("click", async () => {
    const note = $("#wholeNoteInput").value.trim();
    if (!note) return;
    syncGuessFromForm();
    body.innerHTML = `<div class="spinner-text">Regenerating…</div>`;
    try {
      const guess = await api("/api/autofill", {
        method: "POST",
        body: JSON.stringify({ word_ar: state.currentAddGuess.word_ar, note, existing: state.currentAddGuess })
      });
      state.currentAddGuess = { ...guess, notes: state.currentAddGuess.notes };
      renderAddStepConfirm();
    } catch (err) {
      renderAddStepConfirm();
      alert(err.message || "Something went wrong");
    }
  });

  $("#commitAddBtn").addEventListener("click", async () => {
    syncGuessFromForm();
    const payload = { ...state.currentAddGuess, word_ar_paired: getAddPairedRows().filter((r) => r.word_ar.trim()) };
    try {
      await api("/api/words", { method: "POST", body: JSON.stringify(payload) });
      noteWordAdded();
      closeAddModal();
      loadHome();
    } catch (err) {
      alert(err.message || "Could not save");
    }
  });
}

function retryBtn(field) {
  return `<button class="btn small secondary" data-retry-field="${field}" type="button" ${state.config.hasApiKey ? "" : "disabled"}>Retry</button>`;
}

function renderAddPairedRows(rows) {
  const container = $("#addPairedList");
  container.innerHTML = "";
  rows.forEach((r, i) => {
    const row = document.createElement("div");
    row.className = "paired-form-row";
    row.innerHTML = `
      <input data-ap-label value="${escapeHtml(r.label)}" placeholder="e.g. past" />
      <input data-ap-word dir="rtl" value="${escapeHtml(r.word_ar)}" placeholder="Arabic form" />
      <button class="icon-btn" data-remove-ap="${i}" type="button">✕</button>
    `;
    container.appendChild(row);
  });
  $$(`[data-remove-ap]`, container).forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = parseInt(btn.dataset.removeAp);
      rows.splice(idx, 1);
      renderAddPairedRows(rows);
    });
  });
}

function getAddPairedRows() {
  return $$(".paired-form-row", $("#addPairedList")).map((row) => ({
    label: $("[data-ap-label]", row).value.trim(),
    word_ar: $("[data-ap-word]", row).value.trim()
  }));
}

function syncGuessFromForm() {
  const g = state.currentAddGuess;
  $$("[data-field]").forEach((el) => {
    if (el.dataset.field && el.dataset.field !== "word_ar_paired") {
      g[el.dataset.field] = el.value;
    }
  });
  g.word_ar_paired = getAddPairedRows();
}

async function retryField(field) {
  syncGuessFromForm();
  const rowEl = $(`[data-field-row="${field}"]`);
  const originalHtml = rowEl.innerHTML;
  rowEl.innerHTML = `<div class="spinner-text">...</div>`;
  try {
    const result = await api("/api/autofill/field", {
      method: "POST",
      body: JSON.stringify({ field, word_ar: state.currentAddGuess.word_ar, existing: state.currentAddGuess })
    });
    state.currentAddGuess = { ...state.currentAddGuess, ...result };
    renderAddStepConfirm();
  } catch (err) {
    rowEl.innerHTML = originalHtml;
    alert(err.message || "Something went wrong");
  }
}

// ---------- Export (manual + auto safety net) ----------

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

$("#exportBtn").addEventListener("click", () => triggerExport());

function noteWordAdded() {
  addsSinceLastExport += 1;
  if (addsSinceLastExport >= AUTO_EXPORT_EVERY_N_ADDS) {
    triggerExport({ silent: true });
  }
}

// Session-end checkpoint: if the tab is being hidden/closed and there's
// unexported work, fire a backup export automatically.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden" && addsSinceLastExport > 0) {
    triggerExport({ silent: true });
  }
});

// ---------- Init ----------

async function init() {
  state.config = await api("/api/config");
  loadHome();
}

init();

const SHEMAGH_PARALLAX = 0.4;
const shemaghBg = $(".shemagh-bg");
let shemaghTick = false;
function updateShemaghParallax() {
  if (shemaghBg) {
    shemaghBg.style.transform = `translate3d(0, ${-window.scrollY * SHEMAGH_PARALLAX}px, 0)`;
  }
  shemaghTick = false;
}
window.addEventListener("scroll", () => {
  if (!shemaghTick) {
    shemaghTick = true;
    requestAnimationFrame(updateShemaghParallax);
  }
}, { passive: true });
updateShemaghParallax();
