import { $, $$, escapeHtml, dateInputValue } from "./lib/dom.js";
import { api } from "./lib/api.js";
import { state } from "./lib/state.js";
import { ICONS, quietIconBtn } from "./lib/icons.js";
import { stripHarakat } from "./lib/harakat.js";
import { regenExpandHtml, currentRegenNote, isRegenOpen, bindRegenExpand, collapseRegenOnPointerDown, stripAutofillExisting, attachRegenMeta, attachFieldRegen, mountRegenAside, adoptRegenAside } from "./lib/regen.js";
import { formOptions } from "./lib/form.js";
import { loadHome } from "./home.js";
import { openCardDetail } from "./detail.js";
import { noteWordAdded } from "./export.js";
import { navigate, read, navBack } from "./lib/nav.js";

let adding = false;
let batch = null;
let batchAnimating = false;
let deckUid = 0;
let reviewKeep = false;

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
    if (kind !== "dup") {
      modal.style.removeProperty("--dup-count");
      modal.classList.remove("is-dup-lg", "is-dup-xl");
    }
    if (kind !== "deck") modal.classList.remove("has-reroll-aside");
  }
  overlay?.classList.toggle("is-deck", kind === "deck");
}

function scaleDupModal(count) {
  const modal = $("#addModal .modal");
  if (!modal) return;
  const n = Math.max(count, 1);
  modal.style.setProperty("--dup-count", String(n));
  modal.classList.toggle("is-dup-lg", n >= 6);
  modal.classList.toggle("is-dup-xl", n >= 12);
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
  reviewKeep = false;
  setAddModalKind(null);
  $("#addModal").classList.add("hidden");
}

function finishReview() {
  abortAdd();
  if (read().review) navBack();
}

function closeAddModal() {
  if (batchAnimating) return;
  if (reviewKeep) {
    finishReview();
    return;
  }
  if (batch && batch.items.length) {
    if (!confirm("Stop adding this list?")) return;
    abortAdd();
    return;
  }
  if ($(".deck-card.is-top")) {
    cancelSingleAdd();
    return;
  }
  abortAdd();
}

function emptyGuess(word_ar, date_learned = "") {
  return { word_ar, root: "", part_of_speech: "", form: "", meaning: "", word_ar_paired: [], notes: "", date_learned };
}

const STEM_AUTOFILL_NOTES = {
  I: "Treat this as Form I (الفعل المجرد / فَعَلَ). word_ar is the 3ms present of Form I. Fill past and imperative as Form I. Do not switch it to Form II or Form IV.",
  II: "Treat this as Form II (فَعَّلَ / يُفَعِّلُ), with shadda on the middle radical. word_ar is the 3ms present of Form II. Fill past and imperative as Form II. Do not treat it as Form I even if the letters match.",
  IV: "Treat this as Form IV (أَفْعَلَ / يُفْعِلُ). word_ar is the 3ms present يُفْعِلُ (damma on the prefix, no shadda). Past is أَفْعَلَ. Fill meaning for the Form IV verb. Do not treat it as Form I even if the unvoweled letters match."
};

const STEM_FORMS = ["I", "II", "IV"];

function isVerbPos(pos) {
  return String(pos || "").startsWith("فعل");
}

function shouldOfferStemSwitch(g) {
  const stems = g?.stems;
  if (stems?.family !== "I-II-IV" || !stems.forms || stems.form === "other") return false;
  if (isVerbPos(g?.part_of_speech)) return true;
  return STEM_FORMS.includes(String(g?.form || ""));
}

function attachStems(guess, check) {
  if (!guess) return guess;
  const stems = check?.stems || guess.stems;
  if (!stems) return guess;
  if (!shouldOfferStemSwitch({ ...guess, stems })) {
    return { ...guess, stems };
  }
  const stemForm = STEM_FORMS.includes(guess.stemForm)
    ? guess.stemForm
    : (STEM_FORMS.includes(stems.form) ? stems.form : "I");
  const next = { ...guess, stems, stemForm };
  if (!String(guess.form || "") && isVerbPos(guess.part_of_speech)) next.form = stemForm;
  else if (guess.form == null) next.form = stemForm;
  return next;
}

function currentStemForm(g) {
  if (STEM_FORMS.includes(g?.stemForm)) return g.stemForm;
  if (STEM_FORMS.includes(g?.stems?.form)) return g.stems.form;
  return "I";
}

function cloneStemSnapshot(g) {
  if (!g) return g;
  const { stemVersions, ...rest } = g;
  return {
    ...rest,
    word_ar_paired: (g.word_ar_paired || []).map((row) => ({ ...row }))
  };
}

function storeStemVersion(host, form, snapshot) {
  const stems = host?.stems || snapshot?.stems;
  const versions = { ...(host?.stemVersions || {}) };
  versions[form] = cloneStemSnapshot({ ...snapshot, stemForm: form, stems, stemVersions: undefined });
  return {
    ...snapshot,
    stems,
    stemForm: form,
    stemVersions: versions,
    allowNewStem: snapshot.allowNewStem || host?.allowNewStem || form !== (stems?.form || "I")
  };
}

function rememberCurrentStem(g) {
  if (!g?.stems || g.stems.family !== "I-II-IV") return g;
  if (!g.meaning && !(g.word_ar_paired || []).length && !g.root) return g;
  return storeStemVersion(g, currentStemForm(g), g);
}

function restoreStemVersion(g, form) {
  const cached = g?.stemVersions?.[form];
  if (!cached) return null;
  return {
    ...cloneStemSnapshot(cached),
    stems: g.stems,
    stemForm: form,
    stemVersions: g.stemVersions,
    date_learned: g.date_learned,
    allowNewStem: cached.allowNewStem || g.allowNewStem || form !== (g.stems?.form || "I")
  };
}

function paintCurrentGuess() {
  const g = state.currentAddGuess;
  if (!g) return;
  if (isBatch()) {
    const item = currentBatchItem();
    if (item) item.guess = g;
    const card = formRoot();
    if (!card || !card.classList.contains("deck-card")) {
      renderDeck();
      return;
    }
    card.innerHTML = withCardClose(entryFormHtml(g, { isBatch: true }));
    delete card.dataset.bound;
    bindTopCard(card, item);
    mountRegenAside($(".deck-layout"), g);
    requestAnimationFrame(syncDeckLayout);
    return;
  }
  renderAddStepConfirm({ keepRegen: false });
}

function setCurrentGuess(next) {
  state.currentAddGuess = next;
  saveGuessToJob(next);
  if (isBatch() && currentBatchItem()) currentBatchItem().guess = next;
}

const stemJobs = Object.create(null);

function familyKeyOf(stems) {
  return stems?.family === "I-II-IV" && stems.radicals ? stems.radicals : "";
}

function isTakenStem(g, form = currentStemForm(g)) {
  const taken = g?.takenStems || stemJobs[familyKeyOf(g?.stems)]?.taken || [];
  return taken.includes(form);
}

function snapshotFromEntry(entry, form, stems) {
  if (!entry) return null;
  return {
    word_ar: entry.word_ar,
    root: entry.root || "",
    part_of_speech: entry.part_of_speech || "",
    form: entry.form || "",
    meaning: entry.meaning || "",
    notes: entry.notes || "",
    word_ar_paired: (entry.word_ar_paired || []).map((row) => ({ ...row })),
    date_learned: entry.date_learned || "",
    stemForm: form,
    stems,
    existingId: entry.id
  };
}

function saveGuessToJob(g) {
  const key = familyKeyOf(g?.stems);
  if (!key || !g) return;
  const job = stemJobs[key] || (stemJobs[key] = { key, typed: state.currentAddWord || "", stems: g.stems, versions: {}, promises: {}, taken: [] });
  job.stems = g.stems || job.stems;
  const form = currentStemForm(g);
  if (job.taken.includes(form) && job.versions[form]?.existingId) return;
  job.versions[form] = cloneStemSnapshot(g);
}

function ensureStemJob({ typed, stems, seed, taken, takenEntries } = {}) {
  const key = familyKeyOf(stems);
  if (!key) return null;
  if (!stemJobs[key]) {
    stemJobs[key] = { key, typed: typed || "", stems, versions: {}, promises: {}, taken: [], takenEntries: {} };
  }
  const job = stemJobs[key];
  job.stems = stems || job.stems;
  if (typed) job.typed = typed;
  if (takenEntries) {
    job.takenEntries = { ...(job.takenEntries || {}), ...takenEntries };
  }
  const takenSet = new Set([
    ...(Array.isArray(taken) ? taken : job.taken || []),
    ...Object.keys(job.takenEntries || {})
  ]);
  job.taken = STEM_FORMS.filter((form) => takenSet.has(form));
  for (const form of job.taken) {
    const entry = job.takenEntries[form];
    if (entry) job.versions[form] = snapshotFromEntry(entry, form, job.stems);
    if (job.promises[form]) {
      delete job.promises[form];
    }
  }
  const seedVersions = seed?.stemVersions || {};
  for (const form of STEM_FORMS) {
    if (job.taken.includes(form)) continue;
    if (seedVersions[form] && !job.versions[form]) {
      job.versions[form] = cloneStemSnapshot(seedVersions[form]);
    }
  }
  if (seed?.stems && (seed.meaning || seed.root || (seed.word_ar_paired || []).length)) {
    const form = currentStemForm(seed);
    if (!job.taken.includes(form) && !job.versions[form]) job.versions[form] = cloneStemSnapshot(seed);
  }
  for (const form of STEM_FORMS) {
    if (job.taken.includes(form) || job.versions[form] || job.promises[form]) continue;
    const word_ar = job.typed;
    job.promises[form] = autofillAsStem(form, word_ar, {
      stems: job.stems,
      word_ar,
      date_learned: seed?.date_learned || batch?.dateLearned || ""
    }).then((guess) => {
      if (job.taken.includes(form) && job.takenEntries[form]) {
        job.versions[form] = snapshotFromEntry(job.takenEntries[form], form, job.stems);
        return job.versions[form];
      }
      if (!job.versions[form]) {
        job.versions[form] = cloneStemSnapshot({ ...guess, stemForm: form, stems: job.stems });
      }
      return job.versions[form];
    }).finally(() => {
      delete job.promises[form];
    });
  }
  return job;
}

function availableStemForms(job, g) {
  const taken = new Set(g?.takenStems || job?.taken || []);
  return STEM_FORMS.filter((form) => !taken.has(form));
}

function defaultNewStem(check, job) {
  const available = job ? availableStemForms(job) : STEM_FORMS.filter((form) => !(check?.taken || []).includes(form));
  const incoming = check?.collision?.incomingForm;
  if (incoming && available.includes(incoming)) return incoming;
  return available[0] || null;
}

function buildGuessFromJob(job, form, extras = {}) {
  const snap = job?.versions?.[form];
  if (!snap) return null;
  const stemVersions = {};
  for (const f of STEM_FORMS) {
    if (job.versions[f]) stemVersions[f] = cloneStemSnapshot(job.versions[f]);
  }
  return {
    ...cloneStemSnapshot(snap),
    stems: job.stems,
    stemForm: form,
    stemVersions,
    takenStems: [...(job.taken || [])],
    existingId: snap.existingId,
    date_learned: extras.date_learned ?? snap.date_learned ?? "",
    allowNewStem: !job.taken.includes(form)
  };
}

async function waitStemForm(job, form) {
  if (!job) return null;
  if (job.versions[form]) return job.versions[form];
  if (job.taken?.includes(form)) return job.versions[form] || null;
  if (job.promises[form]) return job.promises[form];
  ensureStemJob({ typed: job.typed, stems: job.stems, taken: job.taken, takenEntries: job.takenEntries });
  if (job.versions[form]) return job.versions[form];
  if (job.promises[form]) return job.promises[form];
  return null;
}

async function waitAllStems(job) {
  if (!job) return;
  await Promise.all(availableStemForms(job).map((form) => waitStemForm(job, form).catch(() => null)));
}

function preferredStemForm(stems) {
  return STEM_FORMS.includes(stems?.form) ? stems.form : "I";
}

function asCollisionCheck(check) {
  if (!check) return check;
  if (check.collision) return check;
  if (!check.existing || !check.otherStems?.length) return check;
  return {
    ...check,
    collision: {
      existing: check.existing,
      existingForm: check.existingForm || "I",
      incomingForm: check.stems?.form || "unknown",
      taken: check.taken || []
    }
  };
}

function stemSwitchHtml(g) {
  if (!shouldOfferStemSwitch(g)) return "";
  const stems = g.stems;
  const current = currentStemForm(g);
  if (current === "other") return "";
  const job = stemJobs[familyKeyOf(stems)];
  const taken = new Set(g.takenStems || job?.taken || []);
  const labels = { I: "I", II: "II", IV: "IV" };
  return `<div class="stem-switch" data-stem-switch>
    ${STEM_FORMS.map((form) => {
      const dbWord = job?.takenEntries?.[form]?.word_ar || (job?.versions?.[form]?.existingId ? job.versions[form].word_ar : "");
      const present = dbWord || stems.forms[form]?.present || "";
      const isTaken = taken.has(form);
      return `<button type="button" class="stem-switch-btn${form === current ? " is-active" : ""}${isTaken ? " is-taken" : ""}" data-stem-form="${form}">
        ${isTaken ? `<span class="stem-switch-taken" title="Already in the notebook">${ICONS.check}</span>` : ""}
        <span class="stem-switch-form">${labels[form]}</span>
        <span class="stem-switch-word" dir="rtl">${escapeHtml(present)}</span>
      </button>`;
    }).join("")}
  </div>`;
}

function bindStemSwitch(root) {
  $$("[data-stem-form]", root).forEach((btn) => {
    btn.addEventListener("click", () => applyStemForm(btn.dataset.stemForm));
  });
}

async function applyStemForm(form) {
  if (!form || batchAnimating) return;
  if (!isTakenStem(state.currentAddGuess)) {
    syncGuessFromForm();
    const remembered = rememberCurrentStem(state.currentAddGuess);
    if (remembered) setCurrentGuess(remembered);
  }
  const g = state.currentAddGuess;
  if (!g) return;
  if (form === currentStemForm(g)) return;
  await showStemForm(form, {
    typed: state.currentAddWord || g.word_ar,
    guess: g,
    stems: g.stems,
    instant: true
  });
}

async function autofillAsStem(form, word_ar, previous) {
  const { stemVersions: _versions, ...prior } = previous || emptyGuess(word_ar);
  const applied = await api("/api/stems/apply", {
    method: "POST",
    body: JSON.stringify({
      word_ar,
      word_ar_paired: prior.word_ar_paired || [],
      form
    })
  });
  const note = STEM_AUTOFILL_NOTES[form];
  let guess = {
    ...prior,
    ...applied,
    meaning: "",
    notes: prior.notes || "",
    date_learned: prior.date_learned || batch?.dateLearned || ""
  };
  if (state.config.hasApiKey) {
    const filled = await api("/api/autofill", {
      method: "POST",
      body: JSON.stringify({
        word_ar: applied.word_ar,
        note,
        existing: stripAutofillExisting(guess)
      })
    });
    guess = attachRegenMeta({
      ...filled,
      word_ar: applied.word_ar,
      word_ar_paired: applied.word_ar_paired,
      root: filled.root || applied.root,
      part_of_speech: filled.part_of_speech || applied.part_of_speech,
      form: filled.form || applied.form || form,
      notes: prior.notes || "",
      date_learned: guess.date_learned
    }, note, { kind: "full" });
  }
  return attachStems({
    ...guess,
    allowNewStem: true,
    stemForm: form
  }, { stems: applied.stems || previous?.stems });
}

async function showStemForm(form, { typed, guess, stems, instant = false } = {}) {
  const word_ar = typed || state.currentAddWord || guess?.word_ar;
  const stemSrc = stems || guess?.stems || state.currentAddGuess?.stems;
  if (!word_ar || !form) return;
  adding = true;
  const job = ensureStemJob({
    typed: word_ar,
    stems: stemSrc,
    seed: guess || state.currentAddGuess,
    taken: (guess || state.currentAddGuess)?.takenStems,
    takenEntries: stemJobs[familyKeyOf(stemSrc)]?.takenEntries
  });
  const ready = job && job.versions[form];
  const item = isBatch() ? currentBatchItem() : null;
  if (!ready) {
    if (item) {
      item.loading = true;
      refreshDeckCard(item);
    } else {
      $("#addModal").classList.remove("hidden");
      renderSoloCard(addLoadingHtml(word_ar));
    }
    try {
      await waitAllStems(job);
    } catch (err) {
      if (item) item.loading = false;
      alert(err.message || "Could not fill that form");
      if (guess) {
        setCurrentGuess(guess);
        if (item && batch) refreshDeckCard(item);
        else renderAddStepConfirm({ keepRegen: false });
      }
      return;
    }
  } else if (!instant) {
    await waitAllStems(job);
  }
  if (!adding) return;
  const next = buildGuessFromJob(job, form, {
    date_learned: state.currentAddGuess?.date_learned || guess?.date_learned || batch?.dateLearned || ""
  });
  if (!next) {
    alert("Could not fill that form");
    return;
  }
  setCurrentGuess(next);
  if (item && batch) {
    item.collisionCheck = null;
    item.stemResolved = true;
    item.loading = false;
    if (ready && instant && formRoot()?.querySelector("[data-stem-switch]")) {
      paintCurrentGuess();
      return;
    }
    renderDeck();
    return;
  }
  if (ready && instant && formRoot()?.querySelector("[data-stem-switch]")) {
    paintCurrentGuess();
    return;
  }
  renderAddStepConfirm({ keepRegen: true });
}

function chooseStemForm(form, opts = {}) {
  return showStemForm(form, opts);
}

function formLabel(form) {
  if (form === "II") return "Form II";
  if (form === "IV") return "Form IV";
  if (form === "I") return "Form I";
  return "this verb";
}

function renderStemCollision(check, guess) {
  adding = true;
  ensureStemJob({
    typed: state.currentAddWord || guess?.word_ar,
    stems: check.stems,
    seed: guess,
    taken: check.collision?.taken || check.taken,
    takenEntries: check.takenEntries
  });
  $("#addModal").classList.remove("hidden");
  setAddModalKind("dup");
  const existing = check.collision.existing;
  const taken = new Set(check.collision.taken || [check.collision.existingForm]);
  const forms = check.stems?.forms || {};
  const options = ["I", "II", "IV"].filter((form) => !taken.has(form) && forms[form]);
  $("#addModalBody").innerHTML = `
    <div class="dup-notice collision-notice">
      <p class="collision-kicker">Same letters, maybe a different Form</p>
      <p class="collision-copy">
        ${escapeHtml(formLabel(check.collision.existingForm))} is already in the notebook.
        Same word, or add another stem of this root?
      </p>
      <button type="button" class="dup-word" dir="rtl" data-collision-same>${escapeHtml(existing.word_ar)}</button>
      <p class="dup-stamp" dir="rtl">في الدفتر</p>
      ${options.length ? `
        <div class="stem-choices">
          ${options.map((form) => `
            <button type="button" class="stem-choice" data-collision-stem="${form}">
              <span class="stem-choice-label">${escapeHtml(formLabel(form))}</span>
              <span class="stem-choice-word" dir="rtl">${escapeHtml(forms[form].present)}</span>
            </button>
          `).join("")}
        </div>
      ` : ""}
      <div class="entry-actions">
        <button class="btn secondary" data-cancel-add type="button">Cancel</button>
        <span></span>
      </div>
    </div>
  `;
  $("[data-collision-same]")?.addEventListener("click", () => openExistingWord(existing));
  $$("[data-collision-stem]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const form = btn.dataset.collisionStem;
      const base = guess || emptyGuess(state.currentAddWord || existing.word_ar);
      chooseStemForm(form, {
        typed: state.currentAddWord || base.word_ar,
        guess: state.currentAddGuess || base,
        stems: check.stems
      });
    });
  });
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
  if (!entry?.id || batchAnimating) return;
  $("#addWordInput").value = "";
  adding = false;
  const keepReview = reviewKeep;
  if (!keepReview) batch = null;
  else $("#addModal").classList.add("hidden");
  const pending = api(`/api/words/${entry.id}`);
  const flying = (!keepReview && $(".deck-card.is-top")) ? dismissTop("skip") : Promise.resolve();
  let word;
  try {
    word = await pending;
  } catch {
    await flying.catch(() => {});
    abortAdd();
    return;
  }
  const cardModal = $("#cardModal");
  cardModal?.classList.add("from-add");
  try {
    await openCardDetail(entry.id, { entry: word });
    const incoming = cardModal?.querySelector(".flip-scene");
    await Promise.all([
      flying,
      incoming ? waitCardAnim(incoming, 430) : Promise.resolve()
    ]);
  } finally {
    cardModal?.classList.remove("from-add");
    if (!keepReview) abortAdd();
  }
}

async function startAddAutofill(word) {
  const word_ar = (word || "").trim();
  if (!word_ar || adding) return;
  adding = true;
  batch = null;
  state.currentAddWord = word_ar;
  state.currentAddGuess = null;

  let lastCheck = null;
  try {
    lastCheck = await api("/api/duplicate", {
      method: "POST",
      body: JSON.stringify({ word_ar })
    });
  } catch (err) {
    adding = false;
    alert(err.message || "Could not check for duplicates");
    return;
  }

  const job = lastCheck?.stems ? ensureStemJob({ typed: word_ar, stems: lastCheck.stems, taken: lastCheck.taken || [], takenEntries: lastCheck.takenEntries }) : null;

  if (lastCheck.existing) {
    $("#addModal").classList.remove("hidden");
    renderResultSummary({
      duplicates: [lastCheck.existing],
      check: lastCheck,
      typedWord: word_ar
    });
    return;
  }

  $("#addModal").classList.remove("hidden");

  if (lastCheck?.collision) {
    renderStemCollision(lastCheck, emptyGuess(word_ar));
    return;
  }

  if (job) {
    renderSoloCard(addLoadingHtml(word_ar));
    try {
      await waitAllStems(job);
      if (!adding) return;
      const next = buildGuessFromJob(job, preferredStemForm(lastCheck.stems), {
        date_learned: ""
      });
      if (!next) throw new Error("Could not fill that form");
      setCurrentGuess(next);
      renderAddStepConfirm();
    } catch (err) {
      if (!adding) return;
      abortAdd();
      alert(err.message || "Autofill failed");
    }
    return;
  }

  if (!state.config.hasApiKey) {
    state.currentAddGuess = rememberCurrentStem(attachStems(emptyGuess(word_ar), lastCheck));
    renderAddStepConfirm();
    return;
  }

  renderSoloCard(addLoadingHtml(word_ar));

  try {
    const guess = await api("/api/autofill", { method: "POST", body: JSON.stringify({ word_ar }) });
    if (!adding) return;
    const check = await api("/api/duplicate", {
      method: "POST",
      body: JSON.stringify(guess)
    });
    if (check.existing) {
      renderResultSummary({
        duplicates: [check.existing],
        check,
        typedWord: word_ar
      });
      return;
    }
    if (check.collision) {
      ensureStemJob({ typed: word_ar, stems: check.stems, seed: attachStems(guess, check), taken: check.taken || [], takenEntries: check.takenEntries });
      renderStemCollision(check, guess);
      return;
    }
    state.currentAddGuess = rememberCurrentStem(attachStems(guess, check));
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
      const check = await api("/api/duplicate", {
        method: "POST",
        body: JSON.stringify({ word_ar: item.typed })
      });
      if (item.seq !== seq || !batch) return;
      if (check.existing) {
        const dated = await applyBatchLearnedDate(check.existing);
        if (item.seq !== seq || !batch) return;
        if (check.otherStems?.length && check.stems?.family === "I-II-IV" && isVerbPos(check.existing.part_of_speech)) {
          const job = ensureStemJob({ typed: item.typed, stems: check.stems, taken: check.taken || [], takenEntries: check.takenEntries });
          await waitAllStems(job);
          if (item.seq !== seq || !batch) return;
          const form = defaultNewStem(check, job);
          if (!form) {
            item.existing = dated;
            return;
          }
          item.guess = buildGuessFromJob(job, form, { date_learned: batch?.dateLearned || "" });
          item.stemResolved = true;
          return;
        }
        item.existing = dated;
        return;
      }
      if (!state.config.hasApiKey) {
        if (check.collision && check.stems?.family === "I-II-IV") {
          const job = ensureStemJob({ typed: item.typed, stems: check.stems, taken: check.taken || check.collision.taken || [], takenEntries: check.takenEntries });
          await waitAllStems(job);
          if (item.seq !== seq || !batch) return;
          const form = defaultNewStem(check, job);
          if (!form) {
            const dated = await applyBatchLearnedDate(check.collision.existing);
            if (item.seq !== seq || !batch) return;
            item.existing = dated;
            return;
          }
          item.guess = buildGuessFromJob(job, form, { date_learned: batch?.dateLearned || "" });
          item.stemResolved = true;
          return;
        }
        item.guess = rememberCurrentStem(attachStems(emptyGuess(item.typed, batch?.dateLearned || ""), check));
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
        if (after.otherStems?.length && after.stems?.family === "I-II-IV" && isVerbPos(after.existing.part_of_speech) && shouldOfferStemSwitch({ ...guess, stems: after.stems })) {
          const job = ensureStemJob({ typed: item.typed, stems: after.stems, taken: after.taken || [], takenEntries: after.takenEntries });
          await waitAllStems(job);
          if (item.seq !== seq || !batch) return;
          const form = defaultNewStem(after, job);
          if (!form) {
            item.existing = dated;
            return;
          }
          item.guess = buildGuessFromJob(job, form, { date_learned: batch?.dateLearned || "" });
          item.stemResolved = true;
          return;
        }
        item.existing = dated;
        return;
      }
      if (after.collision && after.stems?.family === "I-II-IV" && shouldOfferStemSwitch({ ...guess, stems: after.stems })) {
        const job = ensureStemJob({ typed: item.typed, stems: after.stems, taken: after.taken || after.collision.taken || [], takenEntries: after.takenEntries });
        await waitAllStems(job);
        if (item.seq !== seq || !batch) return;
        const form = defaultNewStem(after, job);
        if (!form) {
          item.guess = rememberCurrentStem(attachStems({ ...guess, notes: "", date_learned: batch?.dateLearned || "" }, after));
          return;
        }
        item.guess = buildGuessFromJob(job, form, { date_learned: batch?.dateLearned || "" });
        item.stemResolved = true;
        return;
      }
      item.guess = rememberCurrentStem(attachStems({ ...guess, notes: "", date_learned: batch?.dateLearned || "" }, after));
      if (shouldOfferStemSwitch(item.guess)) {
        ensureStemJob({ typed: item.typed, stems: after.stems, seed: item.guess, taken: after.taken || [], takenEntries: after.takenEntries });
      }
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
  if (item.collisionCheck && !item.stemResolved) {
    const check = item.collisionCheck;
    const job = ensureStemJob({
      typed: item.typed,
      stems: check.stems,
      taken: check.taken || check.collision?.taken || [],
      takenEntries: check.takenEntries
    });
    const form = defaultNewStem(check, job);
    if (form) {
      state.currentAddWord = item.typed;
      state.currentAddGuess = item.guess;
      renderDeck();
      await showStemForm(form, { typed: item.typed, guess: item.guess, stems: check.stems });
      return;
    }
    renderStemCollision(check, item.guess || emptyGuess(item.typed));
    return;
  }
  state.currentAddWord = item.typed;
  state.currentAddGuess = item.guess;
  renderDeck();
  if (!item.guess) await fillItem(item);
}

function flyingRegenAside(top) {
  const layout = top?.closest(".deck-layout") || $(".deck-layout");
  if (!layout) return null;
  const aside = layout.querySelector(":scope > .reroll-aside") || top?.querySelector(":scope > .reroll-aside");
  if (aside && aside.parentElement !== layout) layout.appendChild(aside);
  return aside;
}

function startAsideFly(aside, kind) {
  if (!aside) return;
  aside.style.animation = "none";
  aside.classList.remove("is-flying-skip", "is-flying-add");
  void aside.offsetWidth;
  aside.style.removeProperty("animation");
  aside.classList.add(`is-flying-${kind}`);
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
      if (e.target !== card) return;
      const name = String(e.animationName || "");
      if (!/fly|tuck|blank/i.test(name)) return;
      if (e.elapsedTime < 0.12) return;
      finish();
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
  card.classList.remove("is-top", "is-next", "is-back", "is-tucking", "is-flying-add", "is-flying-skip");
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
  const w = `${Math.round(scene.getBoundingClientRect().width)}px`;
  scene.style.setProperty("--deck-w", w);
  layout?.style.setProperty("--deck-w", w);
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
    card.innerHTML = withCardClose(addLoadingHtml(item.typed, { isBatch: true }));
    if (i > 0) card.setAttribute("inert", "");
    else card.removeAttribute("inert");
    return;
  }
  card.classList.remove("is-blank");
  card.dataset.ready = "1";
  card.innerHTML = withCardClose(entryFormHtml(item.guess, { isBatch: true }));
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
  const aside = flyingRegenAside(top);
  batchAnimating = true;
  top.classList.remove("is-top");
  top.classList.add(`is-flying-${kind}`);
  startAsideFly(aside, kind);
  if (next) {
    next.classList.remove("is-next");
    next.classList.add("is-top");
    next.removeAttribute("inert");
  }
  await Promise.all([
    waitCardAnim(top, 450),
    aside ? waitCardAnim(aside, kind === "add" ? 580 : 360) : Promise.resolve()
  ]);
  aside?.remove();
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
  const aside = adoptRegenAside(top);
  const toBack = $$(".deck-card", scene).length > 2;
  scene.appendChild(top);
  void top.offsetWidth;
  top.classList.remove("is-top");
  top.classList.add(toBack ? "is-tucking" : "is-next");
  next.classList.remove("is-next");
  next.classList.add("is-top");
  next.removeAttribute("inert");
  await Promise.all([waitCardTransition(next, 430), waitCardTransition(top, 430)]);
  aside?.remove();
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

function deckCanCycle() {
  return isBatch() && batch.items.length > 1;
}

function withCardClose(html) {
  return `<button class="modal-close" type="button" data-close-add aria-label="Close">&times;</button>${html}`;
}

function renderSoloCard(innerHtml) {
  setAddModalKind("deck");
  $("#addModalBody").innerHTML = `<div class="deck-layout"><div class="deck-scene"><div class="deck-card is-top">${withCardClose(innerHtml)}</div></div></div>`;
  requestAnimationFrame(syncDeckLayout);
}

async function cancelSingleAdd() {
  if (batchAnimating) return;
  batchAnimating = true;
  adding = false;
  try {
    await dismissTop("skip");
  } finally {
    abortAdd();
  }
}

async function rerollCurrentToBack({ note, existing }) {
  const item = currentBatchItem();
  if (!item || !note || batchAnimating || !deckCanCycle()) return;
  const existingGuess = { ...(existing || item.guess), stemVersions: (existing || item.guess)?.stemVersions || item.guess?.stemVersions };
  const form = currentStemForm(existingGuess);
  const versions = existingGuess.stemVersions;
  item.seq += 1;
  const seq = item.seq;
  item.loading = true;
  item.guess = null;
  item.promise = (async () => {
    try {
      const guess = await api("/api/autofill", {
        method: "POST",
        body: JSON.stringify({
          word_ar: existingGuess.word_ar || item.typed,
          note,
          existing: stripAutofillExisting(existingGuess)
        })
      });
      if (item.seq !== seq || !batch) return;
      const filled = attachRegenMeta({
        ...guess,
        notes: existingGuess.notes || "",
        date_learned: existingGuess.date_learned || batch.dateLearned || "",
        stemForm: form,
        allowNewStem: existingGuess.allowNewStem
      }, note, { kind: "full" });
      item.guess = storeStemVersion(
        rememberCurrentStem(attachStems({ ...existingGuess, stemVersions: versions }, { stems: existingGuess.stems })),
        form,
        attachStems(filled, { stems: existingGuess.stems })
      );
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
            <div class="entry-field">
              <div class="entry-label"><label>Form</label></div>
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
  const locked = isTakenStem(g);
  const ro = locked ? " readonly tabindex=\"-1\"" : "";
  const dis = locked ? " disabled" : "";
  return `
    <div class="entry-form${locked ? " is-existing" : ""}">
      <p class="entry-kicker">${locked ? "Already in the notebook" : "Confirm entry"}</p>
      <div class="entry-grid">
        <div class="entry-col">
          <div class="entry-field entry-word" data-field-row="word_ar">
            <div class="entry-label"><label>Word</label>${locked ? "" : retryBtn("word_ar")}</div>
            <input data-field="word_ar" dir="rtl" value="${escapeHtml(g.word_ar)}"${ro} />
            ${stemSwitchHtml(g)}
          </div>
          <div class="entry-split">
            <div class="entry-field" data-field-row="root">
              <div class="entry-label"><label>Root</label>${locked ? "" : retryBtn("root")}</div>
              <input data-field="root" dir="rtl" value="${escapeHtml(g.root)}"${ro} />
            </div>
            <div class="entry-field" data-field-row="part_of_speech">
              <div class="entry-label"><label>Part of speech</label>${locked ? "" : retryBtn("part_of_speech")}</div>
              <select data-field="part_of_speech" class="entry-pos" dir="rtl"${dis}>
                <option value="">—</option>
                ${posOptions(g.part_of_speech)}
              </select>
            </div>
            <div class="entry-field" data-field-row="form">
              <div class="entry-label"><label>Form</label>${locked ? "" : retryBtn("form")}</div>
              <select data-field="form" class="entry-form-select"${dis}>
                ${formOptions(g.form)}
              </select>
            </div>
          </div>
          <div class="entry-field" data-field-row="word_ar_paired">
            <div class="entry-label"><label>Other forms</label>${locked ? "" : retryBtn("word_ar_paired")}</div>
            <div class="paired-form-list" data-paired-list></div>
            ${locked ? "" : `<button class="entry-add-form" data-add-paired type="button">+ Add form</button>`}
          </div>
        </div>
        <div class="entry-col">
          <div class="entry-field entry-meaning" data-field-row="meaning">
            <div class="entry-label"><label>Meaning</label>${locked ? "" : retryBtn("meaning")}</div>
            <textarea data-field="meaning"${ro}>${escapeHtml(g.meaning)}</textarea>
          </div>
          <div class="entry-field entry-notes">
            <div class="entry-label"><label>Notes</label></div>
            <textarea data-field="notes"${ro}>${escapeHtml(g.notes || "")}</textarea>
          </div>
          <div class="entry-field entry-date">
            <div class="entry-label"><label>Date learned</label></div>
            <input data-field="date_learned" type="date" value="${escapeHtml(dateInputValue(g.date_learned))}"${ro}${dis} />
          </div>
        </div>
      </div>
      <div class="entry-actions">
        <div class="entry-actions-start">
          <button class="btn secondary" data-cancel-add type="button">${isBatch ? "Skip" : "Cancel"}</button>
          ${locked ? "" : regenExpandHtml()}
        </div>
        ${locked
          ? (!isBatch && g.existingId ? `<button class="btn primary" data-open-existing type="button">Open</button>` : "<span></span>")
          : `<button class="btn primary" data-commit-add type="button">Add</button>`}
      </div>
    </div>
  `;
}

function bindEntryForm(root) {
  if (!isTakenStem(state.currentAddGuess)) {
    bindRegenExpand(root, {
      getExisting() {
        syncGuessFromForm();
        return state.currentAddGuess;
      },
      applyGuess(guess) {
        const prev = state.currentAddGuess;
        setCurrentGuess(rememberCurrentStem(attachStems({
          ...guess,
          notes: prev?.notes,
          date_learned: prev?.date_learned,
          stemVersions: prev?.stemVersions,
          allowNewStem: prev?.allowNewStem,
          stemForm: prev?.stemForm,
          takenStems: prev?.takenStems
        }, { stems: prev?.stems })));
        paintCurrentGuess();
      },
      stillActive: () => adding,
      startRegen: deckCanCycle() ? rerollCurrentToBack : undefined
    });
  }

  const g = state.currentAddGuess;
  if (g) renderAddPairedRows(g.word_ar_paired || [], root, isTakenStem(g));

  $("[data-add-paired]", root)?.addEventListener("click", () => {
    const rows = getAddPairedRows(root);
    rows.push({ label: "", word_ar: "" });
    renderAddPairedRows(rows, root, false);
  });

  $$("[data-retry-field]", root).forEach((btn) => {
    btn.addEventListener("click", () => retryField(btn.dataset.retryField));
  });

  $("[data-commit-add]", root)?.addEventListener("click", commitCurrentWord);
  $("[data-open-existing]", root)?.addEventListener("click", () => {
    const entry = { id: state.currentAddGuess?.existingId, word_ar: state.currentAddGuess?.word_ar };
    if (entry.id) openExistingWord(entry);
  });
  bindStemSwitch(root);
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
  renderSoloCard(entryFormHtml(g, { isBatch: false }));
  const card = $(".deck-card.is-top", body);
  mountRegenAside($(".deck-layout", body), g);
  const input = $(".regen-note", card);
  if (input) {
    input.value = regenNote;
    input.tabIndex = regenOpen ? 0 : -1;
  }
  if (regenOpen) {
    $(".regen-expand", card)?.classList.add("is-open");
    $("[data-regen-toggle]", card)?.setAttribute("aria-expanded", "true");
  }
  bindEntryForm(card);
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

function renderResultSummary({ added = [], duplicates = [], check = null, typedWord = "" } = {}) {
  const addedList = uniqEntries(added);
  const addedIds = new Set(addedList.map((e) => e.id));
  const dupList = uniqEntries(duplicates).filter((e) => !addedIds.has(e.id));
  if (!addedList.length && !dupList.length) {
    abortAdd();
    return;
  }
  const showOtherStems = !addedList.length && dupList.length === 1 && check?.otherStems?.length && isVerbPos(dupList[0].part_of_speech);
  if (showOtherStems) {
    ensureStemJob({
      typed: typedWord || state.currentAddWord,
      stems: check.stems,
      seed: state.currentAddGuess,
      taken: check.taken || [],
      takenEntries: check.takenEntries
    });
  }
  $("#addModal").classList.remove("hidden");
  setAddModalKind("dup");
  scaleDupModal(addedList.length + dupList.length);
  reviewKeep = true;
  if (!read().review) navigate({ review: true }, { silent: true });
  const addedDelay = 0;
  const dupDelay = addedList.length ? 0.12 + addedList.length * 0.05 : 0;
  $("#addModalBody").innerHTML = `
    <div class="dup-notice${showOtherStems ? " collision-notice" : ""}">
      ${summarySection({ entries: addedList, stamp: "أُضيفت", variant: "added", delay: addedDelay })}
      ${summarySection({ entries: dupList, stamp: "في الدفتر", variant: "dup", delay: dupDelay })}
      <div class="entry-actions">
        ${showOtherStems
          ? `<button class="btn secondary" data-open-other-stem type="button">Or another Form</button>`
          : "<span></span>"}
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
  $("[data-open-other-stem]")?.addEventListener("click", () => {
    const job = ensureStemJob({
      typed: typedWord || state.currentAddWord,
      stems: check.stems,
      seed: state.currentAddGuess,
      taken: check.taken || [],
      takenEntries: check.takenEntries
    });
    const form = defaultNewStem(check, job);
    if (!form) return;
    chooseStemForm(form, {
      typed: typedWord || state.currentAddWord,
      guess: state.currentAddGuess,
      stems: check.stems
    });
  });
  $("#dupContinueBtn").addEventListener("click", finishReview);
}

async function commitCurrentWord() {
  if (isTakenStem(state.currentAddGuess)) return;
  if (batchAnimating) return;
  batchAnimating = true;
  syncGuessFromForm();
  saveGuessToJob(state.currentAddGuess);
  const payload = stripAutofillExisting({
    ...state.currentAddGuess,
    word_ar_paired: getAddPairedRows().filter((r) => r.word_ar.trim()),
    allowNewStem: !!state.currentAddGuess.allowNewStem
  });
  try {
    const saved = await api("/api/words", { method: "POST", body: JSON.stringify(payload) });
    noteWordAdded();
    if (!isBatch()) {
      $("#addWordInput").value = "";
      await dismissTop("add");
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
    if (err.status === 409 && err.body?.error === "STEM_COLLISION" && err.body?.collision) {
      renderStemCollision(err.body, state.currentAddGuess);
      return;
    }
    if (err.status === 409 && err.body?.existing) {
      if (isBatch()) {
        await dismissTop("skip");
        if (!batch) return;
        const existing = await applyBatchLearnedDate(err.body.existing);
        takeDuplicate(existing, currentBatchItem());
        await afterDeckChange();
        return;
      }
      renderResultSummary({
        duplicates: [err.body.existing],
        check: err.body,
        typedWord: state.currentAddWord
      });
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

function renderAddPairedRows(rows, root = formRoot(), locked = isTakenStem(state.currentAddGuess)) {
  const container = $("[data-paired-list]", root);
  if (!container) return;
  container.innerHTML = "";
  rows.forEach((r, i) => {
    const row = document.createElement("div");
    row.className = "paired-form-row";
    row.innerHTML = `
      <input data-ap-word dir="rtl" value="${escapeHtml(r.word_ar)}" placeholder="الصيغة"${locked ? " readonly tabindex=\"-1\"" : ""} />
      <input data-ap-label dir="rtl" value="${escapeHtml(r.label)}" placeholder="ماضٍ"${locked ? " readonly tabindex=\"-1\"" : ""} />
      ${locked ? "" : `<button class="icon-btn" data-remove-ap="${i}" type="button">✕</button>`}
    `;
    container.appendChild(row);
  });
  if (locked) return;
  $$(`[data-remove-ap]`, container).forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = parseInt(btn.dataset.removeAp);
      rows.splice(idx, 1);
      renderAddPairedRows(rows, root, false);
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
  if (isTakenStem(state.currentAddGuess)) return;
  const root = formRoot();
  const btn = $(`[data-retry-field="${field}"]`, root);
  if (!btn || btn.disabled || btn.classList.contains("is-spinning")) return;
  syncGuessFromForm();
  btn.classList.add("is-spinning");
  btn.disabled = true;
  try {
    const result = await api("/api/autofill/field", {
      method: "POST",
      body: JSON.stringify({ field, word_ar: state.currentAddGuess.word_ar, existing: stripAutofillExisting(state.currentAddGuess) })
    });
    if (!adding) return;
    setCurrentGuess(rememberCurrentStem(attachFieldRegen(state.currentAddGuess, result, field)));
    paintCurrentGuess();
    btn.classList.remove("is-spinning");
    btn.disabled = false;
  } catch (err) {
    btn.classList.remove("is-spinning");
    btn.disabled = false;
    alert(err.message || "Something went wrong");
  }
}

export function applyAddNav(nav) {
  if (nav.review && nav.card) {
    $("#addModal").classList.add("hidden");
    return;
  }
  if (nav.review) {
    if (reviewKeep) $("#addModal").classList.remove("hidden");
    return;
  }
  if (reviewKeep) abortAdd();
}

export function initAdd() {
  const batchBtn = $("#batchAddBtn");
  if (batchBtn) {
    batchBtn.innerHTML = ICONS.notebook;
    batchBtn.addEventListener("click", openBatchStart);
  }
  $("#addModal").addEventListener("click", (e) => {
    if (e.target.id === "addModal" || e.target.closest("[data-close-add]")) {
      closeAddModal();
      return;
    }
    const cancel = e.target.closest("[data-cancel-add]");
    if (!cancel || !$("#addModal").contains(cancel)) return;
    if (isBatch()) skipCurrentBatchItem();
    else cancelSingleAdd();
  });
  $("#addModal").addEventListener("pointerdown", collapseRegenOnPointerDown);
  $("#addForm").addEventListener("submit", (e) => {
    e.preventDefault();
    startAddAutofill($("#addWordInput").value);
  });
}
