import { $, $$, escapeHtml, dateInputValue } from "./lib/dom.js";
import { api } from "./lib/api.js";
import { state } from "./lib/state.js";
import { ICONS, quietIconBtn } from "./lib/icons.js";
import { regenExpandHtml, currentRegenNote, isRegenOpen, bindRegenExpand, collapseRegenOnPointerDown } from "./lib/regen.js";
import { loadHome } from "./home.js";
import { openCardDetail } from "./detail.js";
import { noteWordAdded } from "./export.js";

let adding = false;

function closeAddModal() {
  adding = false;
  $("#addModal .modal")?.classList.remove("is-entry");
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
  $("#addModal .modal")?.classList.add("is-entry");

  if (!state.config.hasApiKey) {
    state.currentAddGuess = emptyGuess(word_ar);
    renderAddStepConfirm();
    return;
  }

    $("#addModalBody").innerHTML = `<div class="spinner-text is-spinning">${ICONS.reroll}</div>`;

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

function posOptions(selected) {
  return state.config.posList.map((p) => `<option value="${escapeHtml(p)}" ${p === selected ? "selected" : ""}>${escapeHtml(p)}</option>`).join("");
}

function renderAddStepConfirm({ keepRegen = true } = {}) {
  const g = state.currentAddGuess;
  const body = $("#addModalBody");
  const regenNote = keepRegen ? currentRegenNote(body) : "";
  const regenOpen = keepRegen && isRegenOpen(body);
  $("#addModal .modal")?.classList.add("is-entry");
  body.innerHTML = `
    <div class="entry-form">
      <p class="entry-kicker">Confirm entry</p>
      <div class="entry-grid">
        <div class="entry-col">
          <div class="entry-field entry-word" data-field-row="word_ar">
            <div class="entry-label"><label>Word</label>${retryBtn("word_ar")}</div>
            <input data-field="word_ar" dir="rtl" value="${escapeHtml(g.word_ar)}" />
          </div>
          <div class="entry-split">
            <div class="entry-field" data-field-row="root">
              <div class="entry-label"><label>Root</label>${retryBtn("root")}</div>
              <input data-field="root" dir="rtl" value="${escapeHtml(g.root)}" />
            </div>
            <div class="entry-field" data-field-row="part_of_speech">
              <div class="entry-label"><label>Part of speech</label>${retryBtn("part_of_speech")}</div>
              <select data-field="part_of_speech" class="entry-pos" dir="rtl">
                <option value="">—</option>
                ${posOptions(g.part_of_speech)}
              </select>
            </div>
          </div>
          <div class="entry-field" data-field-row="word_ar_paired">
            <div class="entry-label"><label>Other forms</label>${retryBtn("word_ar_paired")}</div>
            <div id="addPairedList" class="paired-form-list"></div>
            <button class="entry-add-form" id="addPairedFormBtnAdd" type="button">+ Add form</button>
          </div>
        </div>
        <div class="entry-col">
          <div class="entry-field entry-meaning" data-field-row="meaning">
            <div class="entry-label"><label>Meaning</label>${retryBtn("meaning")}</div>
            <textarea data-field="meaning">${escapeHtml(g.meaning)}</textarea>
          </div>
          <div class="entry-field entry-notes">
            <div class="entry-label"><label>Notes</label></div>
            <textarea data-field="notes">${escapeHtml(g.notes || "")}</textarea>
          </div>
          <div class="entry-field entry-date">
            <div class="entry-label"><label>Date learned</label></div>
            <input data-field="date_learned" type="date" value="${escapeHtml(dateInputValue(g.date_learned))}" />
          </div>
        </div>
      </div>
      <div class="entry-actions">
        <div class="entry-actions-start">
          <button class="btn secondary" id="cancelAddBtn" type="button">Cancel</button>
          ${regenExpandHtml({ open: regenOpen, note: regenNote })}
        </div>
        <button class="btn primary" id="commitAddBtn" type="button">Add</button>
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
  bindRegenExpand(body, {
    getExisting() {
      syncGuessFromForm();
      return state.currentAddGuess;
    },
    applyGuess(guess) {
      state.currentAddGuess = { ...guess, notes: state.currentAddGuess.notes, date_learned: state.currentAddGuess.date_learned };
      renderAddStepConfirm({ keepRegen: false });
    },
    stillActive: () => adding
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
  return quietIconBtn({
    icon: ICONS.reroll,
    label: "Retry",
    extra: `data-retry-field="${field}" ${state.config.hasApiKey ? "" : "disabled"}`
  });
}

function renderAddPairedRows(rows) {
  const container = $("#addPairedList");
  container.innerHTML = "";
  rows.forEach((r, i) => {
    const row = document.createElement("div");
    row.className = "paired-form-row";
    row.innerHTML = `
      <input data-ap-word dir="rtl" value="${escapeHtml(r.word_ar)}" placeholder="الصيغة" />
      <input data-ap-label dir="rtl" value="${escapeHtml(r.label)}" placeholder="ماضٍ" />
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
  const btn = $(`[data-retry-field="${field}"]`);
  if (!btn || btn.disabled || btn.classList.contains("is-spinning")) return;
  syncGuessFromForm();
  btn.classList.add("is-spinning");
  btn.disabled = true;
  try {
    const result = await api("/api/autofill/field", {
      method: "POST",
      body: JSON.stringify({ field, word_ar: state.currentAddGuess.word_ar, existing: state.currentAddGuess })
    });
    if (!adding) return;
    state.currentAddGuess = { ...state.currentAddGuess, ...result };
    renderAddStepConfirm();
  } catch (err) {
    btn.classList.remove("is-spinning");
    btn.disabled = false;
    alert(err.message || "Something went wrong");
  }
}

export function initAdd() {
  $("[data-close-add]").addEventListener("click", closeAddModal);
  $("#addModal").addEventListener("click", (e) => {
    if (e.target.id === "addModal") closeAddModal();
  });
  $("#addModal").addEventListener("pointerdown", collapseRegenOnPointerDown);
  $("#addForm").addEventListener("submit", (e) => {
    e.preventDefault();
    startAddAutofill($("#addWordInput").value);
  });
}
