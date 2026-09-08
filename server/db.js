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

function isVerbPos(pos) {
  return String(pos || "").startsWith("فعل");
}

function entryForms(row) {
  const paired = Array.isArray(row.word_ar_paired)
    ? row.word_ar_paired
    : JSON.parse(row.word_ar_paired || "[]");
  return [row.word_ar, ...paired.map((f) => f.word_ar)].filter(Boolean);
}

// Peel common Levantine/MSA verb prefixes and person suffixes so
// كتبت / يكتب / بكتب collapse to the same core (كتب).
function verbCore(word) {
  let s = stripHarakat(word).trim();
  if (!s) return "";
  const prefixes = ["عم", "رح", "بي", "بت", "بن", "ب", "ي", "ت", "ن", "أ", "ا", "ح"];
  for (const p of prefixes) {
    if (s.startsWith(p) && s.length - p.length >= 3) {
      s = s.slice(p.length);
      break;
    }
  }
  const suffixes = ["تما", "تمو", "تون", "تم", "تن", "تي", "وا", "ون", "ين", "ان", "نا", "ت", "ن", "ا", "و"];
  suffixes.sort((a, b) => b.length - a.length);
  for (const suf of suffixes) {
    if (s.endsWith(suf) && s.length - suf.length >= 3) {
      s = s.slice(0, -suf.length);
      break;
    }
  }
  return s;
}

function findDuplicate(word_ar, { excludeId, root = "", part_of_speech = "", word_ar_paired = [] } = {}) {
  const incoming = [word_ar, ...(word_ar_paired || []).map((f) => f.word_ar)].filter(Boolean);
  if (!incoming.length) return null;

  const skip = (row) => excludeId && Number(row.id) === Number(excludeId);

  for (const form of incoming) {
    const key = stripHarakat(form).trim();
    if (!key) continue;
    const rows = db.prepare("SELECT * FROM words WHERE search_blob LIKE ?").all(`%${key}%`);
    for (const row of rows) {
      if (skip(row)) continue;
      if (entryForms(row).some((f) => stripHarakat(f) === key)) return rowToEntry(row);
    }
  }

  const treatAsVerb = !part_of_speech || isVerbPos(part_of_speech);
  if (treatAsVerb) {
    const cores = [...new Set(incoming.map(verbCore).filter((c) => c.length >= 3))];
    if (cores.length) {
      const verbs = db.prepare("SELECT * FROM words WHERE part_of_speech LIKE 'فعل%'").all();
      for (const row of verbs) {
        if (skip(row)) continue;
        const existingCores = entryForms(row).map(verbCore);
        if (existingCores.some((c) => cores.includes(c))) return rowToEntry(row);
      }
    }
  }

  return null;
}

module.exports = { db, stripHarakat, buildSearchBlob, rowToEntry, findDuplicate };
