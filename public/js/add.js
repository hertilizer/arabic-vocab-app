import { $, $$, escapeHtml } from "./lib/dom.js";
import { api } from "./lib/api.js";
import { state } from "./lib/state.js";
import { loadHome } from "./home.js";
import { noteWordAdded } from "./export.js";

function openAddModal() {
  state.currentAddGuess = null;
  state.currentAddWord = null;
  renderAddStepInput();
  $("#addModal").classList.remove("hidden");
}

function closeAddModal() {
  $("#addModal").classList.add("hidden");
}
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

export function initAdd() {
  $("[data-close-add]").addEventListener("click", closeAddModal);
  $("#addModal").addEventListener("click", (e) => {
    if (e.target.id === "addModal") closeAddModal();
  });
  $("#addBtn").addEventListener("click", openAddModal);

}
