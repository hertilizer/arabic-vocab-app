import { $, $$, escapeHtml, dateInputValue } from "./lib/dom.js";
import { api } from "./lib/api.js";
import { state } from "./lib/state.js";
import { ICONS, quietIconBtn } from "./lib/icons.js";
import { stripHarakat } from "./lib/harakat.js";
import { regenExpandHtml, currentRegenNote, isRegenOpen, bindRegenExpand, collapseRegenOnPointerDown, stripRegenMeta, attachRegenMeta, mountRegenAside } from "./lib/regen.js";
import { loadHome } from "./home.js";
import { openCardDetail } from "./detail.js";
import { noteWordAdded } from "./export.js";

let adding = false;
let batch = null;
let batchAnimating = false;
let deckUid = 0;

function isBatch() {
  return !!batch;
}

function setAddModalKind(kind) {
  const overlay = $("#addModal");
  const modal = $("#addModal .modal");
  if (modal) {
    modal.classList.toggle("is-entry", kind === "entry" || kind === "deck");
    modal.classList.toggle("is-batch-start", kind === "batch-start");
    modal.classList.toggle("is-dup", kind === "dup");
    modal.classList.toggle("is-deck", kind === "deck");
    if (kind !== "deck") modal.classList.remove("has-reroll-aside");
  }
  overlay?.classList.toggle("is-deck", kind === "deck");
}

function formRoot() {
  return $(".deck-card.is-top") || $("#addModalBody");
}

function setBatchStartUi(on) {
  setAddModalKind(on ? "batch-start" : null);
}

function abortAdd() {
  adding = false;
  batch = null;
  batchAnimating = false;
  setAddModalKind(null);
  $("#addModal").classList.add("hidden");
}

function closeAddModal() {
  if (batchAnimating) return;
  if (batch && batch.items.length) {
    if (!confirm("Stop adding this list?")) return;
  }
  abortAdd();
}

function emptyGuess(word_ar, date_learned = "") {
  return { word_ar, root: "", part_of_speech: "", meaning: "", word_ar_paired: [], notes: "", date_learned };
}

function shouldApplyBatchDate(current, batchDate) {
  const next = String(batchDate || "").trim();
  if (!next) return false;
  const prev = String(current || "").trim();
  return !prev || next < prev;
}

async function applyBatchLearnedDate(entry) {
  const date_learned = batch?.dateLearned || "";
  if (!entry || !shouldApplyBatchDate(entry.date_learned, date_learned)) {
    return entry ? { ...entry, date_updated: false } : entry;
  }
  try {
    const result = await api(`/api/words/${entry.id}/date-learned`, {
      method: "PATCH",
      body: JSON.stringify({ date_learned })
    });
    return { ...(result.entry || entry), date_updated: !!result.updated };
  } catch {
    return { ...entry, date_updated: false };
  }
}

function todayYmd() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function parseWordList(text) {
  const seen = new Set();
  const words = [];
  for (const line of String(text || "").split(/\r?\n/)) {
    const word = line.trim();
    if (!word) continue;
    const key = stripHarakat(word);
    if (seen.has(key)) continue;
    seen.add(key);
    words.push(word);
  }
  return words;
}

async function openExistingWord(entry) {
  abortAdd();
  $("#addWordInput").value = "";
  openCardDetail(entry.id);
}

async function startAddAutofill(word) {
  const word_ar = (word || "").trim();
  if (!word_ar || adding) return;
  adding = true;
  batch = null;
  state.currentAddWord = word_ar;
  state.currentAddGuess = null;

  try {
    const { existing } = await api("/api/duplicate", {
      method: "POST",
      body: JSON.stringify({ word_ar })
    });
    if (existing) {
      $("#addModal").classList.remove("hidden");
      renderResultSummary({ duplicates: [existing] });
      return;
    }
  } catch (err) {
    adding = false;
    alert(err.message || "Could not check for duplicates");
    return;
  }

  $("#addModal").classList.remove("hidden");
  setAddModalKind("deck");

  if (!state.config.hasApiKey) {
    state.currentAddGuess = emptyGuess(word_ar);
    renderAddStepConfirm();
    return;
  }

  $("#addModalBody").innerHTML = `<div class="deck-layout">${addLoadingHtml(word_ar)}</div>`;

  try {
    const guess = await api("/api/autofill", { method: "POST", body: JSON.stringify({ word_ar }) });
    if (!adding) return;
    const { existing } = await api("/api/duplicate", {
      method: "POST",
      body: JSON.stringify(guess)
    });
    if (existing) {
      renderResultSummary({ duplicates: [existing] });
      return;
    }
    state.currentAddGuess = guess;
    renderAddStepConfirm();
  } catch (err) {
    if (!adding) return;
    abortAdd();
    alert(err.message || "Autofill failed");
  }
}

function openBatchStart() {
  if (adding) return;
  adding = true;
  batch = null;
  $("#addModal").classList.remove("hidden");
  setBatchStartUi(true);
  renderBatchStart();
}

function renderBatchStart() {
  const body = $("#addModalBody");
  body.innerHTML = `
    <div class="batch-start">
      <p class="entry-kicker">Add a list</p>
      <textarea id="batchWordList" class="batch-sheet" dir="rtl" placeholder="كلمة في كل سطر…"></textarea>
      <div class="batch-bar">
        <label class="batch-date">
          <span>Learned</span>
          <input id="batchDateLearned" type="date" value="${escapeHtml(todayYmd())}" />
        </label>
        <span id="batchCount" class="batch-count">0</span>
        <button class="btn primary" id="startBatchBtn" type="button" disabled>Review</button>
      </div>
    </div>
  `;
  const list = $("#batchWordList");
  const countEl = $("#batchCount");
  const startBtn = $("#startBatchBtn");

  function syncCount() {
    const n = parseWordList(list.value).length;
    countEl.textContent = String(n);
    startBtn.disabled = n === 0;
  }

  list.addEventListener("input", syncCount);
  startBtn.addEventListener("click", () => {
    const words = parseWordList(list.value);
    if (!words.length) return;
    setBatchStartUi(false);
    startBatch(words, $("#batchDateLearned").value.trim());
  });
  list.focus();
}

function startBatch(words, dateLearned) {
  batch = {
    items: words.map((typed) => ({
      uid: ++deckUid,
      typed,
      guess: null,
      existing: null,
      loading: false,
      promise: null,
      seq: 0
    })),
    index: 0,
    dateLearned: dateLearned || "",
    saved: 0,
    skipped: 0,
    added: [],
    duplicates: [],
    total: words.length
  };
  setAddModalKind("deck");
  prefetchBatch();
  showCurrentDeckItem();
}

function fillItem(item) {
  if (item.promise) return item.promise;
  if (item.guess || item.existing) return Promise.resolve();
  item.loading = true;
  const seq = ++item.seq;
  item.promise = (async () => {
    try {
      const { existing } = await api("/api/duplicate", {
        method: "POST",
        body: JSON.stringify({ word_ar: item.typed })
      });
      if (item.seq !== seq || !batch) return;
      if (existing) {
        const dated = await applyBatchLearnedDate(existing);
        if (item.seq !== seq || !batch) return;
        item.existing = dated;
        return;
      }
      if (!state.config.hasApiKey) {
        item.guess = emptyGuess(item.typed, batch?.dateLearned || "");
        return;
      }
      const guess = await api("/api/autofill", {
        method: "POST",
        body: JSON.stringify({ word_ar: item.typed })
      });
      if (item.seq !== seq || !batch) return;
      const after = await api("/api/duplicate", {
        method: "POST",
        body: JSON.stringify(guess)
      });
      if (item.seq !== seq || !batch) return;
      if (after.existing) {
        const dated = await applyBatchLearnedDate(after.existing);
        if (item.seq !== seq || !batch) return;
        item.existing = dated;
        return;
      }
      item.guess = { ...guess, notes: "", date_learned: batch?.dateLearned || "" };
    } catch {
      if (item.seq !== seq || !batch) return;
      item.guess = emptyGuess(item.typed, batch?.dateLearned || "");
    } finally {
      if (item.seq === seq) {
        item.loading = false;
        if (batch) refreshDeckCard(item);
      }
    }
  })();
  return item.promise;
}

function prefetchBatch() {
  if (!batch) return;
  for (const item of batch.items) fillItem(item);
}

async function showCurrentDeckItem() {
  if (!batch) return;
  drainKnownDuplicates();
  if (!batch.items.length) {
    finishBatch();
    return;
  }
  const item = batch.items[0];
  if (item.existing) {
    takeDuplicate(item.existing, item);
    return showCurrentDeckItem();
  }
  state.currentAddWord = item.typed;
  state.currentAddGuess = item.guess;
  renderDeck();
  if (!item.guess) await fillItem(item);
}

function waitCardAnim(card, ms = 450) {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    card.addEventListener("animationend", (e) => {
      if (e.target === card) finish();
    });
    setTimeout(finish, ms);
  });
}

function waitCardTransition(card, ms = 450) {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    card.addEventListener("transitionend", (e) => {
      if (e.target === card && (e.propertyName === "transform" || e.propertyName === "left")) finish();
    });
    setTimeout(finish, ms);
  });
}

function deckCardEl(item) {
  return item ? $(`.deck-card[data-uid="${item.uid}"]`) : null;
}

function setCardLayer(card, i) {
  card.classList.remove("is-top", "is-next", "is-back", "is-tucking", "is-flying-add", "is-flying-skip", "is-flying-reroll-solo");
  card.classList.add(layerClass(i));
  if (i === 0) {
    card.removeAttribute("inert");
    card.style.zIndex = "";
  } else {
    card.setAttribute("inert", "");
  }
}

function syncDeckLayout() {
  const scene = $(".deck-scene");
  const top = $(".deck-card.is-top");
  if (!scene || !top) return;
  top.style.height = "auto";
  const h = Math.max(top.scrollHeight, 460);
  const layout = $(".deck-layout");
  scene.style.setProperty("--deck-h", `${h}px`);
  layout?.style.setProperty("--deck-h", `${h}px`);
  top.style.height = "";
}

function layerClass(i) {
  if (i === 0) return "is-top";
  if (i === 1) return "is-next";
  return "is-back";
}

function fillCard(card, item, i) {
  card.dataset.uid = String(item.uid);
  card.className = `deck-card ${layerClass(i)}`;
  delete card.dataset.bound;
  delete card.dataset.ready;
  if (i > 1) {
    card.classList.add("is-blank");
    card.innerHTML = "";
    card.setAttribute("inert", "");
    return;
  }
  if (!item.guess) {
    card.classList.remove("is-blank");
    card.removeAttribute("data-ready");
    card.innerHTML = addLoadingHtml(item.typed, { isBatch: true });
    if (i > 0) card.setAttribute("inert", "");
    else card.removeAttribute("inert");
    return;
  }
  card.classList.remove("is-blank");
  card.dataset.ready = "1";
  card.innerHTML = entryFormHtml(item.guess, { isBatch: true });
  if (i === 0) {
    card.removeAttribute("inert");
    bindTopCard(card, item);
  } else {
    card.setAttribute("inert", "");
  }
}

function deckCardHtml(item, i) {
  return `<div class="deck-card ${layerClass(i)}" data-uid="${item.uid}"></div>`;
}

function bindTopCard(card, item) {
  if (!card || card.dataset.bound === "1") return;
  if (item?.guess) {
    state.currentAddGuess = item.guess;
    state.currentAddWord = item.typed;
  }
  if (!state.currentAddGuess) return;
  card.dataset.bound = "1";
  bindEntryForm(card);
}

function refreshDeckCard(item) {
  if (!batch || batchAnimating) return;
  if (item.existing) {
    takeDuplicate(item.existing, item);
    afterDeckChange();
    return;
  }
  const idx = batch.items.indexOf(item);
  if (idx < 0 || idx > 2) return;
  const card = deckCardEl(item);
  if (!card) return;
  const sameReady = item.guess && card.dataset.ready === "1" && card.dataset.uid === String(item.uid);
  if (sameReady && idx === 0 && card.dataset.bound === "1") {
    writeGuessFields(item.guess, card);
    mountRegenAside($(".deck-layout"), item.guess);
    return;
  }
  if (sameReady && idx > 0) return;
  fillCard(card, item, idx);
  if (idx === 0) {
    state.currentAddWord = item.typed;
    state.currentAddGuess = item.guess;
    mountRegenAside($(".deck-layout"), item.guess);
  }
  requestAnimationFrame(syncDeckLayout);
}

function renderDeck() {
  if (!batch) return;
  setAddModalKind("deck");
  const layers = batch.items.slice(0, 3);
  $("#addModalBody").innerHTML = `<div class="deck-layout"><div class="deck-scene">${layers.map((item, i) => deckCardHtml(item, i)).join("")}</div></div>`;
  layers.forEach((item, i) => {
    const card = deckCardEl(item);
    if (card) fillCard(card, item, i);
  });
  mountRegenAside($(".deck-layout"), batch.items[0]?.guess);
  requestAnimationFrame(syncDeckLayout);
}

async function dismissTop(kind) {
  const top = $(".deck-card.is-top");
  const next = $(".deck-card.is-next");
  if (!top) return;
  batchAnimating = true;
  top.classList.remove("is-top");
  top.classList.add(`is-flying-${kind}`);
  if (next) {
    next.classList.remove("is-next");
    next.classList.add("is-top");
    next.removeAttribute("inert");
  }
  await waitCardAnim(top, 430);
  top.remove();
}

function restackDom() {
  const scene = $(".deck-scene");
  if (!scene || !batch) return;
  const keep = new Set(batch.items.slice(0, 3).map((item) => String(item.uid)));
  $$(".deck-card", scene).forEach((card) => {
    if (!keep.has(card.dataset.uid)) card.remove();
  });
  batch.items.slice(0, 3).forEach((item, i) => {
    let card = deckCardEl(item);
    if (!card) {
      scene.insertAdjacentHTML("beforeend", deckCardHtml(item, i));
      card = deckCardEl(item);
      fillCard(card, item, i);
      return;
    }
    setCardLayer(card, i);
    const sameReady = item.guess && card.dataset.ready === "1" && card.dataset.uid === String(item.uid);
    if (i === 0 && sameReady) bindTopCard(card, item);
    else if (!(i === 1 && sameReady)) fillCard(card, item, i);
  });
  const topItem = batch.items[0];
  if (topItem) {
    state.currentAddWord = topItem.typed;
    state.currentAddGuess = topItem.guess;
  }
  mountRegenAside($(".deck-layout"), topItem?.guess);
  requestAnimationFrame(syncDeckLayout);
}

async function tuckTopToBack() {
  const scene = $(".deck-scene");
  const top = $(".deck-card.is-top");
  const next = $(".deck-card.is-next");
  if (!top || !next || !scene) return;
  batchAnimating = true;
  const toBack = $$(".deck-card", scene).length > 2;
  scene.appendChild(top);
  void top.offsetWidth;
  top.classList.remove("is-top");
  top.classList.add(toBack ? "is-tucking" : "is-next");
  next.classList.remove("is-next");
  next.classList.add("is-top");
  next.removeAttribute("inert");
  await Promise.all([waitCardTransition(next, 430), waitCardTransition(top, 430)]);
}

async function afterDeckChange() {
  if (!batch) return;
  drainKnownDuplicates();
  if (!batch.items.length) {
    finishBatch();
    return;
  }
  restackDom();
  const item = batch.items[0];
  if (!item.guess && !item.existing) await fillItem(item);
  if (!batch) return;
  if (item.existing) {
    takeDuplicate(item.existing, item);
    await afterDeckChange();
  }
}

function takeDuplicate(entry, item) {
  if (!batch) return;
  if (entry) {
    const i = batch.duplicates.findIndex((d) => d.id === entry.id);
    if (i < 0) batch.duplicates.push(entry);
    else if (entry.date_updated) batch.duplicates[i] = entry;
  }
  if (item) {
    const idx = batch.items.indexOf(item);
    if (idx >= 0) batch.items.splice(idx, 1);
  }
}

function drainKnownDuplicates() {
  if (!batch) return;
  const keep = [];
  for (const item of batch.items) {
    if (item.existing) {
      takeDuplicate(item.existing, null);
    } else {
      keep.push(item);
    }
  }
  batch.items = keep;
  if (batch.index >= batch.items.length) batch.index = 0;
}

function finishBatch() {
  const added = batch?.added || [];
  const duplicates = batch?.duplicates || [];
  loadHome();
  if (added.length || duplicates.length) {
    renderResultSummary({ added, duplicates });
    return;
  }
  abortAdd();
}

function currentBatchItem() {
  return batch ? batch.items[0] : null;
}

async function rerollCurrentToBack({ note, existing }) {
  const item = currentBatchItem();
  if (!item || !note || batchAnimating) return;
  const existingGuess = { ...(existing || item.guess) };
    item.seq += 1;
    const seq = item.seq;
    item.loading = true;
    if (batch.items.length > 1) item.guess = null;
  item.promise = (async () => {
    try {
      const guess = await api("/api/autofill", {
        method: "POST",
        body: JSON.stringify({
          word_ar: existingGuess.word_ar || item.typed,
          note,
          existing: stripRegenMeta(existingGuess)
        })
      });
      if (item.seq !== seq || !batch) return;
      item.guess = attachRegenMeta({
        ...guess,
        notes: existingGuess.notes || "",
        date_learned: existingGuess.date_learned || batch.dateLearned || ""
      }, note);
    } catch (err) {
      if (item.seq !== seq) return;
      item.guess = existingGuess;
      alert(err.message || "Something went wrong");
    } finally {
      if (item.seq === seq) {
        item.loading = false;
        if (batch) refreshDeckCard(item);
      }
    }
  })();
  if (batch.items.length === 1) {
    batchAnimating = true;
    const top = $(".deck-card.is-top");
    top?.classList.add("is-flying-reroll-solo");
    if (top) await waitCardAnim(top, 520);
    top?.classList.remove("is-flying-reroll-solo");
    batchAnimating = false;
    if (!batch) return;
    refreshDeckCard(item);
    return;
  }
  try {
    await tuckTopToBack();
    if (!batch) return;
    batch.items.splice(0, 1);
    batch.items.push(item);
    await afterDeckChange();
  } finally {
    batchAnimating = false;
  }
}

function addLoadingHtml(word, { isBatch = false } = {}) {
  return `
    <div class="entry-form is-loading" aria-busy="true">
      <p class="entry-kicker">Looking up</p>
      <div class="entry-grid">
        <div class="entry-col">
          <div class="entry-field entry-word">
            <div class="entry-label"><label>Word</label></div>
            <input dir="rtl" value="${escapeHtml(word)}" readonly tabindex="-1" />
          </div>
          <div class="entry-split">
            <div class="entry-field">
              <div class="entry-label"><label>Root</label></div>
              <span class="skel"></span>
            </div>
            <div class="entry-field">
              <div class="entry-label"><label>Part of speech</label></div>
              <span class="skel"></span>
            </div>
          </div>
          <div class="entry-field">
            <div class="entry-label"><label>Other forms</label></div>
            <span class="skel skel-row"></span>
            <span class="entry-add-form is-ghost">+ Add form</span>
          </div>
        </div>
        <div class="entry-col">
          <div class="entry-field">
            <div class="entry-label"><label>Meaning</label></div>
            <span class="skel skel-meaning"></span>
          </div>
          <div class="entry-field">
            <div class="entry-label"><label>Notes</label></div>
            <span class="skel skel-notes"></span>
          </div>
          <div class="entry-field">
            <div class="entry-label"><label>Date learned</label></div>
            <span class="skel skel-date"></span>
          </div>
        </div>
      </div>
      <div class="entry-actions">
        <button class="btn secondary" data-cancel-add type="button">${isBatch ? "Skip" : "Cancel"}</button>
      </div>
    </div>
  `;
}

function posOptions(selected) {
  return state.config.posList.map((p) => `<option value="${escapeHtml(p)}" ${p === selected ? "selected" : ""}>${escapeHtml(p)}</option>`).join("");
}

function entryFormHtml(g, { isBatch = false } = {}) {
  return `
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
            <div class="paired-form-list" data-paired-list>${(g.word_ar_paired || []).map((r) => `
              <div class="paired-form-row">
                <input data-ap-word dir="rtl" value="${escapeHtml(r.word_ar)}" placeholder="الصيغة" />
                <input data-ap-label dir="rtl" value="${escapeHtml(r.label)}" placeholder="ماضٍ" />
                <button class="icon-btn" type="button">✕</button>
              </div>
            `).join("")}</div>
            <button class="entry-add-form" data-add-paired type="button">+ Add form</button>
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
          <button class="btn secondary" data-cancel-add type="button">${isBatch ? "Skip" : "Cancel"}</button>
          ${regenExpandHtml()}
        </div>
        <button class="btn primary" data-commit-add type="button">Add</button>
      </div>
    </div>
  `;
}

function bindEntryForm(root) {
  bindRegenExpand(root, {
    getExisting() {
      syncGuessFromForm();
      return stripRegenMeta(state.currentAddGuess);
    },
    applyGuess(guess) {
      state.currentAddGuess = { ...guess, notes: state.currentAddGuess?.notes, date_learned: state.currentAddGuess?.date_learned };
      if (isBatch() && currentBatchItem()) currentBatchItem().guess = state.currentAddGuess;
      writeGuessFields(state.currentAddGuess);
      mountRegenAside($(".deck-layout"), state.currentAddGuess);
    },
    stillActive: () => adding,
    startRegen: isBatch() ? rerollCurrentToBack : undefined
  });

  const g = state.currentAddGuess;
  if (g) renderAddPairedRows(g.word_ar_paired || [], root);

  $("[data-add-paired]", root)?.addEventListener("click", () => {
    const rows = getAddPairedRows(root);
    rows.push({ label: "", word_ar: "" });
    renderAddPairedRows(rows, root);
  });

  $$("[data-retry-field]", root).forEach((btn) => {
    btn.addEventListener("click", () => retryField(btn.dataset.retryField));
  });

  $("[data-commit-add]", root)?.addEventListener("click", commitCurrentWord);
}

function renderAddStepConfirm({ keepRegen = true } = {}) {
  const g = state.currentAddGuess;
  if (isBatch()) {
    renderDeck();
    return;
  }
  const body = $("#addModalBody");
  const regenNote = keepRegen ? currentRegenNote(body) : "";
  const regenOpen = keepRegen && isRegenOpen(body);
  setAddModalKind("deck");
  body.innerHTML = `<div class="deck-layout">${entryFormHtml(g, { isBatch: false })}</div>`;
  mountRegenAside($(".deck-layout", body), g);
  const input = $(".regen-note", body);
  if (input) {
    input.value = regenNote;
    input.tabIndex = regenOpen ? 0 : -1;
  }
  if (regenOpen) {
    $(".regen-expand", body)?.classList.add("is-open");
    $("[data-regen-toggle]", body)?.setAttribute("aria-expanded", "true");
  }
  bindEntryForm(body);
}

async function skipCurrentBatchItem() {
  if (!batch || batchAnimating) return;
  batchAnimating = true;
  batch.skipped += 1;
  try {
    await dismissTop("skip");
    if (!batch) return;
    batch.items.splice(0, 1);
    await afterDeckChange();
  } finally {
    batchAnimating = false;
  }
}

function uniqEntries(entries) {
  const list = [];
  const seen = new Set();
  for (const entry of entries || []) {
    if (!entry || seen.has(entry.id)) continue;
    seen.add(entry.id);
    list.push(entry);
  }
  return list;
}

function summarySection({ entries, stamp, variant, delay = 0 }) {
  if (!entries.length) return "";
  const words = entries.map((entry, i) => `
    <button type="button" class="dup-word" dir="rtl" data-entry-id="${entry.id}" style="animation-delay:${0.05 + delay + i * 0.07}s">${escapeHtml(entry.word_ar)}${entry.date_updated ? `<span class="dup-date-mark" title="Learned date updated">${ICONS.calendar}</span>` : ""}</button>
  `).join("");
  return `
    <div class="dup-section${variant === "added" ? " is-added" : ""}">
      <div class="dup-grid">${words}</div>
      <p class="dup-stamp${variant === "added" ? " is-added" : ""}" dir="rtl" style="animation-delay:${0.2 + delay}s">
        <span class="dup-stamp-mark">${ICONS.check}</span>
        ${stamp}
      </p>
    </div>
  `;
}

function renderResultSummary({ added = [], duplicates = [] } = {}) {
  const addedList = uniqEntries(added);
  const addedIds = new Set(addedList.map((e) => e.id));
  const dupList = uniqEntries(duplicates).filter((e) => !addedIds.has(e.id));
  if (!addedList.length && !dupList.length) {
    abortAdd();
    return;
  }
  $("#addModal").classList.remove("hidden");
  setAddModalKind("dup");
  const addedDelay = 0;
  const dupDelay = addedList.length ? 0.12 + addedList.length * 0.05 : 0;
  $("#addModalBody").innerHTML = `
    <div class="dup-notice">
      ${summarySection({ entries: addedList, stamp: "أُضيفت", variant: "added", delay: addedDelay })}
      ${summarySection({ entries: dupList, stamp: "في الدفتر", variant: "dup", delay: dupDelay })}
      <div class="entry-actions">
        <span></span>
        <button class="btn primary" id="dupContinueBtn" type="button">Done</button>
      </div>
    </div>
  `;
  const byId = new Map([...addedList, ...dupList].map((e) => [String(e.id), e]));
  $$("[data-entry-id]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const entry = byId.get(btn.dataset.entryId);
      if (entry) openExistingWord(entry);
    });
  });
  $("#dupContinueBtn").addEventListener("click", abortAdd);
}

async function commitCurrentWord() {
  if (batchAnimating) return;
  if (isBatch()) batchAnimating = true;
  syncGuessFromForm();
  const payload = stripRegenMeta({ ...state.currentAddGuess, word_ar_paired: getAddPairedRows().filter((r) => r.word_ar.trim()) });
  try {
    const saved = await api("/api/words", { method: "POST", body: JSON.stringify(payload) });
    noteWordAdded();
    if (!isBatch()) {
      $("#addWordInput").value = "";
      abortAdd();
      loadHome();
      return;
    }
    if (saved) batch.added.push(saved);
    batch.saved += 1;
    await dismissTop("add");
    if (!batch) return;
    batch.items.splice(0, 1);
    await afterDeckChange();
  } catch (err) {
    if (err.status === 409 && err.body?.existing) {
      if (isBatch()) {
        await dismissTop("skip");
        if (!batch) return;
        const existing = await applyBatchLearnedDate(err.body.existing);
        takeDuplicate(existing, currentBatchItem());
        await afterDeckChange();
        return;
      }
      renderResultSummary({ duplicates: [err.body.existing] });
      return;
    }
    alert(err.message || "Could not save");
  } finally {
    batchAnimating = false;
  }
}

function retryBtn(field) {
  return quietIconBtn({
    icon: ICONS.reroll,
    label: "Retry",
    extra: `data-retry-field="${field}" ${state.config.hasApiKey ? "" : "disabled"}`
  });
}

function writeGuessFields(g, root = formRoot()) {
  if (!g || !root) return;
  $$("[data-field]", root).forEach((el) => {
    const key = el.dataset.field;
    if (!key || key === "notes" || key === "date_learned") return;
    if (g[key] == null) return;
    el.value = g[key];
  });
  renderAddPairedRows(g.word_ar_paired || [], root);
}

function renderAddPairedRows(rows, root = formRoot()) {
  const container = $("[data-paired-list]", root);
  if (!container) return;
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
      renderAddPairedRows(rows, root);
    });
  });
}

function getAddPairedRows(root = formRoot()) {
  const container = $("[data-paired-list]", root);
  if (!container) return [];
  return $$(".paired-form-row", container).map((row) => ({
    label: $("[data-ap-label]", row).value.trim(),
    word_ar: $("[data-ap-word]", row).value.trim()
  }));
}

function syncGuessFromForm() {
  const g = state.currentAddGuess;
  if (!g) return;
  const root = formRoot();
  $$("[data-field]", root).forEach((el) => {
    if (el.dataset.field && el.dataset.field !== "word_ar_paired") {
      g[el.dataset.field] = el.value;
    }
  });
  g.word_ar_paired = getAddPairedRows(root);
}

async function retryField(field) {
  const root = formRoot();
  const btn = $(`[data-retry-field="${field}"]`, root);
  if (!btn || btn.disabled || btn.classList.contains("is-spinning")) return;
  syncGuessFromForm();
  btn.classList.add("is-spinning");
  btn.disabled = true;
  try {
    const result = await api("/api/autofill/field", {
      method: "POST",
      body: JSON.stringify({ field, word_ar: state.currentAddGuess.word_ar, existing: stripRegenMeta(state.currentAddGuess) })
    });
    if (!adding) return;
    state.currentAddGuess = { ...state.currentAddGuess, ...result };
    if (isBatch() && currentBatchItem()) currentBatchItem().guess = state.currentAddGuess;
    writeGuessFields(state.currentAddGuess);
    btn.classList.remove("is-spinning");
    btn.disabled = false;
  } catch (err) {
    btn.classList.remove("is-spinning");
    btn.disabled = false;
    alert(err.message || "Something went wrong");
  }
}

export function initAdd() {
  const batchBtn = $("#batchAddBtn");
  if (batchBtn) {
    batchBtn.innerHTML = ICONS.notebook;
    batchBtn.addEventListener("click", openBatchStart);
  }
  $("[data-close-add]").addEventListener("click", closeAddModal);
  $("#addModal").addEventListener("click", (e) => {
    if (e.target.id === "addModal") closeAddModal();
    const cancel = e.target.closest("[data-cancel-add]");
    if (!cancel || !$("#addModal").contains(cancel)) return;
    if (isBatch()) skipCurrentBatchItem();
    else abortAdd();
  });
  $("#addModal").addEventListener("pointerdown", collapseRegenOnPointerDown);
  $("#addForm").addEventListener("submit", (e) => {
    e.preventDefault();
    startAddAutofill($("#addWordInput").value);
  });
}
