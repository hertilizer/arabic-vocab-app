import { $, $$, escapeHtml, dateInputValue } from "./lib/dom.js";
import { api } from "./lib/api.js";
import { state } from "./lib/state.js";
import { loadHome } from "./home.js";
import { openCardDetail, closeCardModal } from "./detail.js";
import { regenExpandHtml, currentRegenNote, isRegenOpen, setRegenOpen, bindRegenExpand, collapseRegenOnPointerDown, stripRegenMeta, attachFieldRegen, mountRegenAside } from "./lib/regen.js";
import { ICONS, quietIconBtn } from "./lib/icons.js";

let editingId = null;

function posOptions(selected) {
  return state.config.posList.map((p) => `<option value="${escapeHtml(p)}" ${p === selected ? "selected" : ""}>${escapeHtml(p)}</option>`).join("");
}

export async function openEditModal(entryOrId) {
  const entry = typeof entryOrId === "object" ? entryOrId : await api(`/api/words/${entryOrId}`);
  editingId = entry.id;
  renderEditForm(entry, { keepRegen: false });
  $("#editModal").classList.remove("hidden");
}

function renderEditForm(entry, { keepRegen = true } = {}) {
  const body = $("#editModalBody");
  const regenNote = keepRegen ? currentRegenNote(body) : "";
  const regenOpen = keepRegen && isRegenOpen(body);
  $("#editModal").classList.add("is-deck");
  $("#editModal .modal")?.classList.add("is-entry", "is-deck");
  body.innerHTML = `
    <div class="deck-layout">
    <div class="entry-form">
      <p class="entry-kicker">Edit word</p>
      <div class="entry-grid">
        <div class="entry-col">
          <div class="entry-field entry-word">
            <div class="entry-label"><label>Word</label>${retryBtn("word_ar")}</div>
            <input id="editWordAr" dir="rtl" value="${escapeHtml(entry.word_ar)}" />
          </div>
          <div class="entry-split">
            <div class="entry-field">
              <div class="entry-label"><label>Root</label>${retryBtn("root")}</div>
              <input id="editRoot" dir="rtl" value="${escapeHtml(entry.root)}" />
            </div>
            <div class="entry-field">
              <div class="entry-label"><label>Part of speech</label>${retryBtn("part_of_speech")}</div>
              <select id="editPos" class="entry-pos" dir="rtl">
                <option value="">—</option>
                ${posOptions(entry.part_of_speech)}
              </select>
            </div>
          </div>
          <div class="entry-field">
            <div class="entry-label"><label>Other forms</label>${retryBtn("word_ar_paired")}</div>
            <div id="editPairedList" class="paired-form-list"></div>
            <button class="entry-add-form" id="addPairedFormBtn" type="button">+ Add form</button>
          </div>
        </div>
        <div class="entry-col">
          <div class="entry-field entry-meaning">
            <div class="entry-label"><label>Meaning</label>${retryBtn("meaning")}</div>
            <textarea id="editMeaning">${escapeHtml(entry.meaning)}</textarea>
          </div>
          <div class="entry-field entry-notes">
            <div class="entry-label"><label>Notes</label></div>
            <textarea id="editNotes">${escapeHtml(entry.notes)}</textarea>
          </div>
          <div class="entry-field entry-date">
            <div class="entry-label"><label>Date learned</label></div>
            <input id="editDateLearned" type="date" value="${escapeHtml(dateInputValue(entry.date_learned))}" />
          </div>
        </div>
      </div>
      <div class="entry-actions">
        <div class="entry-actions-start">
          <button class="btn secondary" id="cancelEditBtn" type="button">Cancel</button>
          ${regenExpandHtml({ open: regenOpen, note: regenNote })}
        </div>
        <div class="entry-actions-end">
          <button class="btn danger" id="deleteEntryBtn" type="button">Delete</button>
          <button class="btn primary" id="saveEntryBtn" type="button">Save</button>
        </div>
      </div>
    </div>
    </div>
  `;
  mountRegenAside($(".deck-layout", body), entry);

  renderPairedEditRows(entry.word_ar_paired || []);

  $("#addPairedFormBtn").addEventListener("click", () => {
    const rows = getPairedRowsFromForm();
    rows.push({ label: "", word_ar: "" });
    renderPairedEditRows(rows);
  });

  $("#cancelEditBtn").addEventListener("click", dismissEdit);

  $$("[data-retry-field]").forEach((btn) => {
    btn.addEventListener("click", () => retryEditField(btn.dataset.retryField));
  });

  bindRegenExpand(body, {
    getExisting: () => stripRegenMeta(getEditPayload()),
    applyGuess(guess) {
      writeEditFields({
        ...guess,
        notes: $("#editNotes").value,
        date_learned: $("#editDateLearned").value
      });
    },
    stillActive: () => editingId != null
  });

  $("#deleteEntryBtn").addEventListener("click", async () => {
    if (!confirm("Delete this word?")) return;
    try {
      await api(`/api/words/${entry.id}`, { method: "DELETE" });
      closeEditModal();
      closeCardModal();
      loadHome();
    } catch (err) {
      alert(err.message || "Could not delete");
    }
  });

  $("#saveEntryBtn").addEventListener("click", async () => {
    try {
      await api(`/api/words/${entry.id}`, { method: "PUT", body: JSON.stringify(getEditPayload()) });
      closeEditModal();
      loadHome();
      await openCardDetail(entry.id, { saved: true });
    } catch (err) {
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

async function retryEditField(field) {
  const btn = $(`[data-retry-field="${field}"]`);
  if (!btn || btn.disabled || btn.classList.contains("is-spinning")) return;
  const existing = getEditPayload();
  btn.classList.add("is-spinning");
  btn.disabled = true;
  try {
    const result = await api("/api/autofill/field", {
      method: "POST",
      body: JSON.stringify({ field, word_ar: existing.word_ar, existing: stripRegenMeta(existing) })
    });
    if (editingId == null) return;
    writeEditFields(attachFieldRegen(existing, result, field));
    btn.classList.remove("is-spinning");
    btn.disabled = false;
  } catch (err) {
    btn.classList.remove("is-spinning");
    btn.disabled = false;
    alert(err.message || "Something went wrong");
  }
}

function getEditPayload() {
  return {
    word_ar: $("#editWordAr").value.trim(),
    root: $("#editRoot").value.trim(),
    part_of_speech: $("#editPos").value,
    meaning: $("#editMeaning").value.trim(),
    notes: $("#editNotes").value.trim(),
    date_learned: $("#editDateLearned").value.trim(),
    word_ar_paired: getPairedRowsFromForm().filter((r) => r.word_ar.trim())
  };
}

function writeEditFields(guess, { keepAside = false } = {}) {
  $("#editWordAr").value = guess.word_ar || "";
  $("#editRoot").value = guess.root || "";
  $("#editPos").value = guess.part_of_speech || "";
  $("#editMeaning").value = guess.meaning || "";
  renderPairedEditRows(guess.word_ar_paired || []);
  if (!keepAside) mountRegenAside($(".deck-layout", $("#editModalBody")), guess);
}

function closeEditModal() {
  editingId = null;
  $("#editModal .modal")?.classList.remove("is-entry", "is-deck", "has-reroll-aside");
  $("#editModal").classList.remove("is-deck");
  $("#editModal").classList.add("hidden");
}

function dismissEdit() {
  closeEditModal();
}

function renderPairedEditRows(rows) {
  const container = $("#editPairedList");
  container.innerHTML = "";
  rows.forEach((r, i) => {
    const row = document.createElement("div");
    row.className = "paired-form-row";
    row.innerHTML = `
      <input data-p-word dir="rtl" value="${escapeHtml(r.word_ar)}" placeholder="الصيغة" />
      <input data-p-label dir="rtl" value="${escapeHtml(r.label)}" placeholder="ماضٍ" />
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

export function initEdit() {
  $("[data-close-edit]").addEventListener("click", dismissEdit);
  $("#editModal").addEventListener("click", (e) => {
    if (e.target.id === "editModal") dismissEdit();
  });
  $("#editModal").addEventListener("pointerdown", collapseRegenOnPointerDown);
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if ($("#editModal").classList.contains("hidden")) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (isRegenOpen($("#editModal"))) {
      setRegenOpen(false, $("#editModal"));
      return;
    }
    dismissEdit();
  });
}
