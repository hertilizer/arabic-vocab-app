require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const { db, buildSearchBlob, stripHarakat, rowToEntry } = require("./db");
const { autofillEntry, autofillField, hasApiKey } = require("./autofill");
const POS_LIST = require("./pos-list");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const PORT = process.env.PORT || 3737;

// --- Config ---
app.get("/api/config", (req, res) => {
  res.json({ hasApiKey: hasApiKey(), posList: POS_LIST });
});

// --- Autofill (does NOT save anything - preview only) ---
app.post("/api/autofill", async (req, res) => {
  try {
    const { word_ar, note, existing } = req.body;
    if (!word_ar) return res.status(400).json({ error: "word_ar is required" });
    const result = await autofillEntry({ word_ar, note, existing });
    res.json(result);
  } catch (err) {
    if (err.code === "NO_API_KEY") {
      return res.status(412).json({ error: "NO_API_KEY", message: "Add ANTHROPIC_API_KEY to your .env file to use AI autofill." });
    }
    console.error(err);
    res.status(500).json({ error: "Autofill failed", detail: String(err.message || err) });
  }
});

app.post("/api/autofill/field", async (req, res) => {
  try {
    const { field, word_ar, note, existing } = req.body;
    if (!word_ar || !field) return res.status(400).json({ error: "word_ar and field are required" });
    const result = await autofillField({ field, word_ar, note, existing });
    res.json(result);
  } catch (err) {
    if (err.code === "NO_API_KEY") {
      return res.status(412).json({ error: "NO_API_KEY", message: "Add ANTHROPIC_API_KEY to your .env file to use AI autofill." });
    }
    console.error(err);
    res.status(500).json({ error: "Autofill failed", detail: String(err.message || err) });
  }
});

// --- Create (commit) a word ---
app.post("/api/words", (req, res) => {
  const { word_ar, word_ar_paired = [], root = "", part_of_speech = "", meaning = "", notes = "" } = req.body;
  if (!word_ar) return res.status(400).json({ error: "word_ar is required" });
  const search_blob = buildSearchBlob(word_ar, word_ar_paired);
  const stmt = db.prepare(`
    INSERT INTO words (word_ar, word_ar_paired, root, part_of_speech, meaning, notes, search_blob)
    VALUES (@word_ar, @word_ar_paired, @root, @part_of_speech, @meaning, @notes, @search_blob)
  `);
  const info = stmt.run({
    word_ar,
    word_ar_paired: JSON.stringify(word_ar_paired),
    root,
    part_of_speech,
    meaning,
    notes,
    search_blob
  });
  const row = db.prepare("SELECT * FROM words WHERE id = ?").get(info.lastInsertRowid);
  res.status(201).json(rowToEntry(row));
});

// --- Update (edit) a word ---
app.put("/api/words/:id", (req, res) => {
  const { id } = req.params;
  const existing = db.prepare("SELECT * FROM words WHERE id = ?").get(id);
  if (!existing) return res.status(404).json({ error: "Not found" });

  const merged = {
    word_ar: req.body.word_ar ?? existing.word_ar,
    word_ar_paired: req.body.word_ar_paired ?? JSON.parse(existing.word_ar_paired),
    root: req.body.root ?? existing.root,
    part_of_speech: req.body.part_of_speech ?? existing.part_of_speech,
    meaning: req.body.meaning ?? existing.meaning,
    notes: req.body.notes ?? existing.notes
  };
  const search_blob = buildSearchBlob(merged.word_ar, merged.word_ar_paired);

  db.prepare(`
    UPDATE words SET word_ar=@word_ar, word_ar_paired=@word_ar_paired, root=@root,
      part_of_speech=@part_of_speech, meaning=@meaning, notes=@notes, search_blob=@search_blob
    WHERE id=@id
  `).run({
    ...merged,
    word_ar_paired: JSON.stringify(merged.word_ar_paired),
    search_blob,
    id
  });

  const row = db.prepare("SELECT * FROM words WHERE id = ?").get(id);
  res.json(rowToEntry(row));
});

// --- Delete a word ---
app.delete("/api/words/:id", (req, res) => {
  db.prepare("DELETE FROM words WHERE id = ?").run(req.params.id);
  res.status(204).end();
});

// --- Get a single word ---
app.get("/api/words/:id", (req, res) => {
  const row = db.prepare("SELECT * FROM words WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "Not found" });
  res.json(rowToEntry(row));
});

// --- Recent words ---
app.get("/api/words", (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 24, 200);
  const rows = db.prepare("SELECT * FROM words ORDER BY id DESC LIMIT ?").all(limit);
  res.json(rows.map(rowToEntry));
});

// --- Random words ---
app.get("/api/random", (req, res) => {
  const count = Math.min(parseInt(req.query.count) || 3, 20);
  const rows = db.prepare("SELECT * FROM words ORDER BY RANDOM() LIMIT ?").all(count);
  res.json(rows.map(rowToEntry));
});

// --- Search ---
app.get("/api/search", (req, res) => {
  const q = stripHarakat((req.query.q || "").trim());
  if (!q) return res.json([]);
  const rows = db.prepare(`
    SELECT * FROM words
    WHERE search_blob LIKE @pat OR meaning LIKE @pat OR notes LIKE @pat OR root LIKE @rootPat
    ORDER BY id DESC LIMIT 100
  `).all({ pat: `%${q}%`, rootPat: `%${req.query.q}%` });
  res.json(rows.map(rowToEntry));
});

// --- Words sharing a root ---
app.get("/api/root/:root", (req, res) => {
  const rows = db.prepare("SELECT * FROM words WHERE root = ? ORDER BY id ASC").all(req.params.root);
  res.json(rows.map(rowToEntry));
});

// --- CSV export ---
app.get("/api/export/csv", (req, res) => {
  const rows = db.prepare("SELECT * FROM words ORDER BY id ASC").all();
  const header = ["id", "word_ar", "word_ar_paired", "root", "part_of_speech", "meaning", "notes", "date_added"];
  const escape = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push(header.map((h) => escape(r[h])).join(","));
  }
  const csv = "\uFEFF" + lines.join("\n"); // BOM for Excel/Arabic compatibility
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="vocab-export-${Date.now()}.csv"`);
  res.send(csv);
});

app.listen(PORT, () => {
  console.log(`Arabic vocab app running at http://localhost:${PORT}`);
  if (!hasApiKey()) {
    console.log("⚠️  No ANTHROPIC_API_KEY set in .env - AI autofill will be unavailable until you add one.");
  }
});
