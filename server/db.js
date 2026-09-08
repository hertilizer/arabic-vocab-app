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

// Arabic diacritics (harakat, sukoon, shadda, tanween) Unicode range for stripping.
const HARAKAT_REGEX = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E8\u06EA-\u06ED]/g;

function stripHarakat(str) {
  if (!str) return "";
  return str.replace(HARAKAT_REGEX, "");
}

// Builds the space-separated blob of every unvoweled form (primary + paired)
// used for simple, harakat-insensitive LIKE search.
function buildSearchBlob(word_ar, word_ar_paired) {
  const forms = [word_ar, ...(word_ar_paired || []).map((f) => f.word_ar)];
  return forms.map(stripHarakat).filter(Boolean).join(" ");
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
    date_added: row.date_added
  };
}

module.exports = { db, stripHarakat, buildSearchBlob, rowToEntry };
