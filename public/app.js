const state = {
  config: { hasApiKey: false, posList: [] },
  currentAddGuess: null, // { word_ar, root, part_of_speech, meaning, word_ar_paired }
  currentAddWord: null,
  showHarakat: localStorage.getItem("showHarakat") !== "false"
};

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const HARAKAT_REGEX = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E8\u06EA-\u06ED]/g;

const ICONS = {
  harakat: `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <g fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" transform="translate(12 12) rotate(-38)">
        <path d="M-6.1 -3.2 H6.1"/>
        <path d="M-6.1 3.2 H6.1"/>
      </g>
    </svg>`,
  edit: `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"
        d="M4.4 19.6 5.3 15.2 16.6 3.9l3.5 3.5-11.3 11.3zM13.8 6.7l3.5 3.5"/>
    </svg>`,
  reroll: `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"
        d="M4.2 12a7.8 7.8 0 0 1 12.9-5.9L20 8.8M19.8 12a7.8 7.8 0 0 1-12.9 5.9L4 15.2M20 3.8v5h-5M4 20.2v-5h5"/>
    </svg>`,
  eye: `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
        d="M2.8 12s3.2-7 9.2-7 9.2 7 9.2 7-3.2 7-9.2 7-9.2-7-9.2-7z"/>
      <circle cx="12" cy="12" r="2.6" fill="none" stroke="currentColor" stroke-width="2"/>
    </svg>`
};

function iconToggle({ icon, pressed = false, label, title, extra = "" }) {
  const tip = title || label;
  return `<button class="icon-toggle" type="button" aria-pressed="${pressed}" aria-label="${escapeHtml(label)}" title="${escapeHtml(tip)}" ${extra}>${icon}</button>`;
}

function harakatBtn() {
  return iconToggle({
    icon: ICONS.harakat,
    pressed: state.showHarakat,
    label: state.showHarakat ? "Harakat on" : "Harakat off",
    extra: 'data-harakat-toggle title="Harakat"'
  });
}

function quietIconBtn({ icon, label, extra = "", id = "" }) {
  const idAttr = id ? ` id="${id}"` : "";
  return `<button class="icon-btn quiet" type="button" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}"${idAttr} ${extra}>${icon}</button>`;
}

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
  $$("[data-harakat-toggle]").forEach((btn) => {
    btn.setAttribute("aria-pressed", String(state.showHarakat));
    btn.setAttribute("aria-label", state.showHarakat ? "Harakat on" : "Harakat off");
  });
}

function applyHarakatToDom() {
  $$(".ar-text").forEach((el) => {
    const raw = el.dataset.voweled ?? "";
    el.textContent = displayAr(raw);
  });
}

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

const CARD_TAP_MS = 200;
const CARD_HOLD_MS = 1500;
const CARD_FLIP_MS = 600;
const FACE_ROTATE = { front: 0, example: -180, meaning: 180 };

let detailEntry = null;
let exampleLoading = false;
let holdTimer = null;
let barTimer = null;
let holdStarted = 0;
let holdFired = false;
let lastHoldPoint = { x: 0, y: 0 };
let flipEnd = null;
let flipTimer = null;

function detailPairedHtml(paired) {
  if (!paired || !paired.length) return "";
  return `<ul class="detail-forms">${paired.map((f) => {
    const tip = f.label ? ` data-tooltip="${escapeHtml(f.label)}" tabindex="0"` : "";
    return `<li><span class="detail-form-word${f.label ? " has-pos-tip" : ""}" dir="rtl"${tip}>${arHtml(f.word_ar)}</span></li>`;
  }).join("")}</ul>`;
}

function clearFlipEnd() {
  if (flipEnd) {
    $("#cardModalBody")?.removeEventListener("transitionend", flipEnd);
    flipEnd = null;
  }
  clearTimeout(flipTimer);
  flipTimer = null;
}

function setCardFace(face) {
  const card = $("#cardModalBody");
  if (!card) return;
  clearFlipEnd();
  card.style.transform = `rotateY(${FACE_ROTATE[face]}deg)`;

  if (face === "front") {
    const finish = (e) => {
      if (e && e.type === "transitionend" && e.target !== card) return;
      clearFlipEnd();
      card.classList.remove("is-example", "is-meaning");
    };
    flipEnd = finish;
    card.addEventListener("transitionend", finish);
    flipTimer = setTimeout(finish, CARD_FLIP_MS);
    return;
  }

  card.classList.toggle("is-example", face === "example");
  card.classList.toggle("is-meaning", face === "meaning");
}

function currentCardFace() {
  const card = $("#cardModalBody");
  if (!card) return "front";
  if (card.classList.contains("is-example")) return "example";
  if (card.classList.contains("is-meaning")) return "meaning";
  return "front";
}

function cardChrome(el) {
  return el.closest("[data-harakat-toggle], .root-chip, .icon-btn");
}

function isCardBodyEvent(e) {
  return !!e.target.closest(".flip-card") && !cardChrome(e.target);
}

function placeHoldBar(e) {
  const bar = $("#holdBar");
  if (!bar) return;
  const x = e?.clientX ?? lastHoldPoint.x;
  const y = e?.clientY ?? lastHoldPoint.y;
  bar.style.left = `${x}px`;
  bar.style.top = `${y}px`;
}

function startHoldBar() {
  const bar = $("#holdBar");
  if (!bar) return;
  placeHoldBar();
  bar.classList.remove("is-holding");
  void bar.offsetWidth;
  bar.classList.add("is-holding");
}

function stopHoldBar() {
  $("#holdBar")?.classList.remove("is-holding");
}

function clearHold() {
  clearTimeout(holdTimer);
  clearTimeout(barTimer);
  holdTimer = null;
  barTimer = null;
  holdStarted = 0;
  stopHoldBar();
}

function exampleStorageKey(id) {
  return `example:${id}`;
}

function loadCachedExample(id) {
  try {
    return sessionStorage.getItem(exampleStorageKey(id));
  } catch {
    return null;
  }
}

function saveCachedExample(id, sentence) {
  try {
    sessionStorage.setItem(exampleStorageKey(id), sentence);
  } catch { /* ignore quota */ }
}

function renderExampleSentence(el, sentence) {
  el.innerHTML = `<span dir="rtl">${arHtml(sentence)}</span>`;
}

function setExampleBusy(on) {
  exampleLoading = on;
  const btn = $("[data-reroll-example]");
  if (!btn) return;
  btn.disabled = on;
  btn.classList.toggle("is-spinning", on);
}

function showExampleFace() {
  const el = $("#cardModalBody")?.querySelector(".detail-example");
  if (!el || !detailEntry) return;
  const cached = loadCachedExample(detailEntry.id);
  setCardFace("example");
  if (cached) {
    renderExampleSentence(el, cached);
    return;
  }
  fetchAndShowExample();
}

async function fetchAndShowExample() {
  const el = $("#cardModalBody")?.querySelector(".detail-example");
  if (!el || !detailEntry || exampleLoading) return;
  setCardFace("example");
  if (!state.config.hasApiKey) {
    el.textContent = "Add an API key to get example sentences.";
    return;
  }
  const hasSentence = !!el.querySelector(".ar-text");
  setExampleBusy(true);
  if (!hasSentence) {
    el.innerHTML = `<span class="example-loading">Getting an example…</span>`;
  }
  try {
    const forms = [
      detailEntry.word_ar,
      ...(detailEntry.word_ar_paired || []).map((f) => f.word_ar)
    ].filter(Boolean);
    const result = await api("/api/example", {
      method: "POST",
      body: JSON.stringify({
        forms,
        meaning: detailEntry.meaning,
        part_of_speech: detailEntry.part_of_speech
      })
    });
    const sentence = result.sentence_ar || "";
    if (sentence) saveCachedExample(detailEntry.id, sentence);
    renderExampleSentence(el, sentence);
  } catch (err) {
    const cached = loadCachedExample(detailEntry.id);
    if (cached) renderExampleSentence(el, cached);
    else el.textContent = err.message || "Could not get an example.";
  } finally {
    setExampleBusy(false);
  }
}

async function openCardDetail(id) {
  const entry = await api(`/api/words/${id}`);
  const body = $("#cardModalBody");
  const notesBlock = entry.notes
    ? `<div class="detail-block"><div class="detail-kicker">Notes</div><p class="detail-notes">${escapeHtml(entry.notes)}</p></div>`
    : "";
  const meaning = escapeHtml(entry.meaning) || "No meaning recorded.";
  detailEntry = entry;
  body.innerHTML = `
    <div class="flip-face flip-front">
      <div class="detail-kicker-row">
        <span class="root-chip ${entry.root ? "" : "empty"}" id="detailRootChip">${escapeHtml(entry.root) || "no root"}</span>
        ${harakatBtn()}
      </div>
      <div class="detail-primary${entry.part_of_speech ? " has-pos-tip" : ""}" dir="rtl"${entry.part_of_speech ? ` data-tooltip="${escapeHtml(entry.part_of_speech)}" tabindex="0"` : ""}>${arHtml(entry.word_ar)}</div>
      ${detailPairedHtml(entry.word_ar_paired)}
      ${notesBlock}
      <div class="detail-footer">
        <span class="detail-added">${escapeHtml(addedAgo(entry.date_added))}</span>
        ${quietIconBtn({ icon: ICONS.edit, label: "Edit", id: "detailEditBtn" })}
      </div>
    </div>
    <div class="flip-face flip-back">
      <div class="flip-back-pane flip-back-example">
        <div class="detail-kicker-row">${harakatBtn()}</div>
        <p class="detail-example"></p>
        <div class="detail-footer">
          ${quietIconBtn({ icon: ICONS.reroll, label: "New example", extra: "data-reroll-example" })}
        </div>
      </div>
      <div class="flip-back-pane flip-back-meaning">
        <p class="detail-meaning">${meaning}</p>
      </div>
    </div>
  `;

  $("#detailRootChip").addEventListener("click", () => {
    if (entry.root) {
      closeCardModal();
      showRootCluster(entry.root);
    }
  });

  $("#detailEditBtn").addEventListener("click", () => {
    closeCardModal();
    openEditModal(entry);
  });

  setCardFace("front");
  syncHarakatToggle();
  $("#cardModal").classList.remove("hidden");
}

function closeCardModal() {
  clearHold();
  holdFired = false;
  setExampleBusy(false);
  detailEntry = null;
  setCardFace("front");
  $("#cardModal").classList.add("hidden");
}

$("#cardModal").addEventListener("pointerdown", (e) => {
  if (e.target.id === "cardModal") return;
  if (e.button && e.button !== 0) return;
  if (!isCardBodyEvent(e)) return;
  holdFired = false;
  holdStarted = Date.now();
  lastHoldPoint = { x: e.clientX, y: e.clientY };
  barTimer = setTimeout(startHoldBar, CARD_TAP_MS);
  holdTimer = setTimeout(() => {
    holdFired = true;
    stopHoldBar();
    holdTimer = null;
    setCardFace("meaning");
  }, CARD_HOLD_MS);
});

document.addEventListener("pointerup", (e) => {
  if (!holdStarted && !holdTimer && !barTimer && !holdFired) return;
  const elapsed = holdStarted ? Date.now() - holdStarted : 0;
  const fired = holdFired;
  clearHold();
  if (fired) {
    holdFired = false;
    return;
  }
  if (elapsed >= CARD_TAP_MS) return;
  if (e.target.id === "cardModal") return;
  if (!isCardBodyEvent(e)) return;
  if (currentCardFace() !== "front") {
    setCardFace("front");
    return;
  }
  showExampleFace();
});

document.addEventListener("pointermove", (e) => {
  if (!holdTimer && !holdStarted && !barTimer) return;
  lastHoldPoint = { x: e.clientX, y: e.clientY };
  placeHoldBar(e);
});
document.addEventListener("pointercancel", () => {
  holdFired = false;
  clearHold();
});

$("#cardModal").addEventListener("contextmenu", (e) => {
  if (isCardBodyEvent(e)) e.preventDefault();
});
$("#cardModal").addEventListener("click", (e) => {
  if (e.target.id === "cardModal") closeCardModal();
  if (e.target.closest("[data-reroll-example]")) fetchAndShowExample();
});

// ---------- Edit modal ----------

async function openEditModal(entryOrId) {
  const entry = typeof entryOrId === "object" ? entryOrId : await api(`/api/words/${entryOrId}`);
  const body = $("#editModalBody");
  body.innerHTML = `
    <div class="add-step">
      <h3>Edit word</h3>
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

  renderPairedEditRows(entry.word_ar_paired || []);

  $("#addPairedFormBtn").addEventListener("click", () => {
    const rows = getPairedRowsFromForm();
    rows.push({ label: "", word_ar: "" });
    renderPairedEditRows(rows);
  });

  $("#deleteEntryBtn").addEventListener("click", async () => {
    if (!confirm("Delete this word?")) return;
    await api(`/api/words/${entry.id}`, { method: "DELETE" });
    closeEditModal();
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
    await api(`/api/words/${entry.id}`, { method: "PUT", body: JSON.stringify(payload) });
    closeEditModal();
    loadHome();
    openCardDetail(entry.id);
  });

  $("#editModal").classList.remove("hidden");
}

function closeEditModal() {
  $("#editModal").classList.add("hidden");
}
$("[data-close-edit]").addEventListener("click", closeEditModal);
$("#editModal").addEventListener("click", (e) => {
  if (e.target.id === "editModal") closeEditModal();
});

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
