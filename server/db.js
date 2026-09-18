const path = require("path");
const Database = require("better-sqlite3");

const ROOT = path.join(__dirname, "..");
const db = new Database(path.join(ROOT, "vocab.db"));
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS words (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    word_ar TEXT NOT NULL,
    word_ar_paired TEXT NOT NULL DEFAULT '[]', -- JSON array of {label, word_ar}
    root TEXT NOT NULL DEFAULT '',
    part_of_speech TEXT NOT NULL DEFAULT '',
    meaning TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    search_blob TEXT NOT NULL DEFAULT '',
    date_added TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_words_root ON words(root);
  CREATE INDEX IF NOT EXISTS idx_words_search_blob ON words(search_blob);
`);

const wordCols = db.prepare("PRAGMA table_info(words)").all().map((c) => c.name);
if (!wordCols.includes("date_learned")) {
  db.exec(`ALTER TABLE words ADD COLUMN date_learned TEXT NOT NULL DEFAULT ''`);
}

db.exec(`
  CREATE TABLE IF NOT EXISTS daily_picks (
    day TEXT PRIMARY KEY,
    word_ids TEXT NOT NULL DEFAULT '[]'
  );
`);

// Vowels, tanween, sukoon, and other combining marks.
// Kept, because they can be the only difference between distinct words:
//   shadda (U+0651)  كتب vs كتّب
//   maddah (U+0653)  and hamza above/below (U+0654, U+0655) — NFC usually
//   folds these into أ إ آ ؤ ئ, but un-normalized input must not lose them.
const HARAKAT_REGEX = /[\u0610-\u061A\u064B-\u0650\u0652\u0656-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E8\u06EA-\u06ED]/g;
const SHADDA = "\u0651";

function stripHarakat(str) {
  if (!str) return "";
  return str.normalize("NFC").replace(HARAKAT_REGEX, "");
}

function stripAllMarks(str) {
  return stripHarakat(str)
    .replaceAll(SHADDA, "")
    .replace(/[\u0622\u0623\u0625\u0671]/g, "ا")
    .replace(/\u0624/g, "و")
    .replace(/\u0626/g, "ي")
    .replace(/\u0621/g, "");
}

// Builds the space-separated blob of every unvoweled form (primary + paired)
// used for simple, harakat-insensitive LIKE search. Both identity tokens
// (shadda + hamza kept) and folded tokens are stored so a search for كتب
// still finds كتّب, and سال still finds سأل.
function buildSearchBlob(word_ar, word_ar_paired) {
  const forms = [word_ar, ...(word_ar_paired || []).map((f) => f.word_ar)];
  const tokens = forms.flatMap((f) => [stripHarakat(f), stripAllMarks(f)]).filter(Boolean);
  return [...new Set(tokens)].join(" ");
}

function rowToEntry(row) {
  if (!row) return null;
  return {
    id: row.id,
    word_ar: row.word_ar,
    word_ar_paired: JSON.parse(row.word_ar_paired || "[]"),
    root: row.root,
    part_of_speech: row.part_of_speech,
    meaning: row.meaning,
    notes: row.notes,
    date_added: row.date_added,
    date_learned: row.date_learned || ""
  };
}

const {
  verbCore,
  familyKey,
  classifyEntry,
  sameStem,
  stemPayload
} = require("./stems");

function isVerbPos(pos) {
  return String(pos || "").startsWith("فعل");
}

function entryForms(row) {
  const paired = Array.isArray(row.word_ar_paired)
    ? row.word_ar_paired
    : JSON.parse(row.word_ar_paired || "[]");
  return [row.word_ar, ...paired.map((f) => f.word_ar)].filter(Boolean);
}

function entryPaired(row) {
  return Array.isArray(row.word_ar_paired)
    ? row.word_ar_paired
    : JSON.parse(row.word_ar_paired || "[]");
}

function findExactFormMatch(incoming, { excludeId } = {}) {
  const skip = (row) => excludeId && Number(row.id) === Number(excludeId);
  for (const form of incoming) {
    const key = stripHarakat(form).trim();
    if (!key) continue;
    const rows = db.prepare("SELECT * FROM words WHERE search_blob LIKE ?").all(`%${key}%`);
    for (const row of rows) {
      if (skip(row)) continue;
      const hit = entryForms(row).some((f) => stripHarakat(f) === key);
      if (!hit) continue;
      if (familyKey(form).length === 3) {
        const incomingForm = classifyEntry(form, []);
        const existingForm = classifyEntry(row.word_ar, entryPaired(row));
        if (!sameStem(incomingForm, existingForm)) continue;
      }
      return rowToEntry(row);
    }
  }
  return null;
}

function verbRows(excludeId) {
  return db.prepare("SELECT * FROM words WHERE part_of_speech LIKE 'فعل%'").all()
    .filter((row) => !(excludeId && Number(row.id) === Number(excludeId)));
}

function checkDuplicate(word_ar, { excludeId, part_of_speech = "", word_ar_paired = [] } = {}) {
  const incoming = [word_ar, ...(word_ar_paired || []).map((f) => f.word_ar)].filter(Boolean);
  const stems = stemPayload(word_ar, word_ar_paired);
  const finish = (result) => decorateFamily({ ...result, stems }, excludeId);
  if (!incoming.length) return finish({ existing: null, collision: null });

  const exact = findExactFormMatch(incoming, { excludeId });
  if (exact) return finish({ existing: exact, collision: null });

  const treatAsVerb = !part_of_speech || isVerbPos(part_of_speech);
  if (!treatAsVerb) return finish({ existing: null, collision: null });

  const incomingKey = familyKey(word_ar) || incoming.map(familyKey).find((k) => k.length >= 3) || "";
  const incomingForm = classifyEntry(word_ar, word_ar_paired);
  const verbs = verbRows(excludeId);

  if (incomingKey.length !== 3 || incomingForm === "other") {
    const cores = [...new Set(incoming.map(verbCore).filter((c) => c.length >= 3))];
    if (cores.length) {
      for (const row of verbs) {
        const existingCores = entryForms(row).map(verbCore);
        if (existingCores.some((c) => cores.includes(c))) {
          return finish({ existing: rowToEntry(row), collision: null });
        }
      }
    }
    return finish({ existing: null, collision: null });
  }

  const familyHits = verbs.filter((row) => (
    familyKey(row.word_ar) === incomingKey
    || entryForms(row).some((f) => familyKey(f) === incomingKey)
  ));

  for (const row of familyHits) {
    const existingForm = classifyEntry(row.word_ar, entryPaired(row));
    if (sameStem(incomingForm, existingForm)) {
      return finish({ existing: rowToEntry(row), collision: null });
    }
  }

  if (familyHits.length) {
    const row = familyHits[0];
    const existingForm = classifyEntry(row.word_ar, entryPaired(row));
    return finish({
      existing: null,
      collision: {
        existing: rowToEntry(row),
        existingForm,
        incomingForm
      }
    });
  }

  return finish({ existing: null, collision: null });
}

function decorateFamily(result, excludeId) {
  const stems = result.stems;
  if (!stems || stems.family !== "I-II-IV" || !stems.forms) return result;
  const verbs = verbRows(excludeId);
  const key = stems.radicals;
  const familyHits = verbs.filter((row) => (
    familyKey(row.word_ar) === key
    || entryForms(row).some((f) => familyKey(f) === key)
  ));
  const takenEntries = {};
  const taken = [];
  for (const row of familyHits) {
    const form = classifyEntry(row.word_ar, entryPaired(row));
    if (form !== "I" && form !== "II" && form !== "IV") continue;
    if (!takenEntries[form]) takenEntries[form] = rowToEntry(row);
    if (!taken.includes(form)) taken.push(form);
  }
  result.taken = taken;
  result.takenEntries = takenEntries;
  result.otherStems = ["I", "II", "IV"].filter((form) => !taken.includes(form) && stems.forms[form]);
  if (result.existing) {
    result.existingForm = classifyEntry(result.existing.word_ar, result.existing.word_ar_paired);
    if (result.existingForm === "I" || result.existingForm === "II" || result.existingForm === "IV") {
      takenEntries[result.existingForm] = takenEntries[result.existingForm] || result.existing;
      if (!taken.includes(result.existingForm)) taken.push(result.existingForm);
    }
  }
  if (result.collision) result.collision.taken = taken;
  return result;
}

function findDuplicate(word_ar, opts = {}) {
  return checkDuplicate(word_ar, opts).existing;
}

module.exports = {
  db,
  stripHarakat,
  buildSearchBlob,
  rowToEntry,
  findDuplicate,
  checkDuplicate
};
