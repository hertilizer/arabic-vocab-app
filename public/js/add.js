import { $, $$, escapeHtml, dateInputValue } from "./lib/dom.js";
import { api } from "./lib/api.js";
import { state } from "./lib/state.js";
import { loadHome } from "./home.js";
import { openCardDetail } from "./detail.js";
import { noteWordAdded } from "./export.js";

let adding = false;

function closeAddModal() {
  adding = false;
  $("#addModal").classList.add("hidden");
}

function emptyGuess(word_ar) {
  return { word_ar, root: "", part_of_speech: "", meaning: "", word_ar_paired: [], date_learned: "" };
}

async function openExistingWord(entry) {
  adding = false;
  $("#addModal").classList.add("hidden");
  $("#addWordInput").value = "";
  openCardDetail(entry.id);
}

async function startAddAutofill(word) {
  const word_ar = (word || "").trim();
  if (!word_ar || adding) return;
  adding = true;
  state.currentAddWord = word_ar;
  state.currentAddGuess = null;

  try {
    const { existing } = await api("/api/duplicate", {
      method: "POST",
      body: JSON.stringify({ word_ar })
    });
    if (existing) {
      openExistingWord(existing);
      return;
    }
  } catch (err) {
    adding = false;
    alert(err.message || "Could not check for duplicates");
    return;
  }

  $("#addModal").classList.remove("hidden");

  if (!state.config.hasApiKey) {
    state.currentAddGuess = emptyGuess(word_ar);
    renderAddStepConfirm();
    return;
  }

  $("#addModalBody").innerHTML = `<div class="spinner-text">Analyzing with AI…</div>`;

  try {
    const guess = await api("/api/autofill", { method: "POST", body: JSON.stringify({ word_ar }) });
    if (!adding) return;
    const { existing } = await api("/api/duplicate", {
      method: "POST",
      body: JSON.stringify(guess)
    });
    if (existing) {
      openExistingWord(existing);
      return;
    }
    state.currentAddGuess = guess;
    renderAddStepConfirm();
  } catch (err) {
    if (!adding) return;
    closeAddModal();
    alert(err.message || "Autofill failed");
  }
}

function renderAddStepConfirm() {
  const g = state.currentAddGuess;
  const body = $("#addModalBody");
  body.innerHTML = `
    <div class="add-step">
      <h2 class="modal-title">Confirm entry</h2>

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

      <div class="field-row">
        <label>Date learned (optional)</label>
        <input data-field="date_learned" type="date" value="${escapeHtml(dateInputValue(g.date_learned))}" />
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
      state.currentAddGuess = { ...guess, notes: state.currentAddGuess.notes, date_learned: state.currentAddGuess.date_learned };
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
      $("#addWordInput").value = "";
      closeAddModal();
      loadHome();
    } catch (err) {
      if (err.status === 409 && err.body?.existing) {
        openExistingWord(err.body.existing);
        return;
      }
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

export function initAdd() {
  $("[data-close-add]").addEventListener("click", closeAddModal);
  $("#addModal").addEventListener("click", (e) => {
    if (e.target.id === "addModal") closeAddModal();
  });
  $("#addForm").addEventListener("submit", (e) => {
    e.preventDefault();
    startAddAutofill($("#addWordInput").value);
  });
}
