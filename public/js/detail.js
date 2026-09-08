import { $, escapeHtml, addedAgo, entryDisplayDate } from "./lib/dom.js";
import { api } from "./lib/api.js";
import { state } from "./lib/state.js";
import { ICONS, harakatBtn, quietIconBtn } from "./lib/icons.js";
import { arHtml, syncHarakatToggle, resetHarakat } from "./lib/harakat.js";
import { showRootCluster } from "./home.js";
import { openEditModal } from "./edit.js";

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

export async function openCardDetail(id) {
  const entry = await api(`/api/words/${id}`);
  const body = $("#cardModalBody");
  const notesBlock = entry.notes
    ? `<div class="detail-block"><div class="detail-kicker">Notes</div><p class="detail-notes">${escapeHtml(entry.notes)}</p></div>`
    : "";
  const meaning = escapeHtml(entry.meaning) || "No meaning recorded.";
  detailEntry = entry;
  resetHarakat();
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
        <span class="detail-added">${escapeHtml(addedAgo(entryDisplayDate(entry)))}</span>
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
  resetHarakat();
  setCardFace("front");
  $("#cardModal").classList.add("hidden");
}

export function initDetail() {
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
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if ($("#cardModal").classList.contains("hidden")) return;
    if (!$("#addModal").classList.contains("hidden")) return;
    if (!$("#editModal").classList.contains("hidden")) return;
    e.preventDefault();
    closeCardModal();
  });
}
