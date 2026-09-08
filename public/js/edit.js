import { $, $$, escapeHtml, dateInputValue } from "./lib/dom.js";
import { api } from "./lib/api.js";
import { state } from "./lib/state.js";
import { loadHome } from "./home.js";
import { openCardDetail } from "./detail.js";

export async function openEditModal(entryOrId) {
  const entry = typeof entryOrId === "object" ? entryOrId : await api(`/api/words/${entryOrId}`);
  const body = $("#editModalBody");
  body.innerHTML = `
    <div class="add-step">
      <h2 class="modal-title">Edit word</h2>
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
      <div class="detail-field"><label>Date learned (optional)</label><input id="editDateLearned" type="date" value="${escapeHtml(dateInputValue(entry.date_learned))}" /></div>
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
      date_learned: $("#editDateLearned").value.trim(),
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

export function initEdit() {
  $("[data-close-edit]").addEventListener("click", closeEditModal);
  $("#editModal").addEventListener("click", (e) => {
    if (e.target.id === "editModal") closeEditModal();
  });

}
