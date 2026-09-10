const { db, buildSearchBlob, stripHarakat, rowToEntry, findDuplicate } = require("../db");

function normalizeDateLearned(value) {
  const s = String(value ?? "").trim();
  if (!s) return "";
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : "";
}

function shouldApplyLearnedDate(incoming, current) {
  const next = normalizeDateLearned(incoming);
  if (!next) return false;
  const prev = normalizeDateLearned(current);
  return !prev || next < prev;
}

function applyLearnedDateIfEarlier(id, date_learned) {
  const row = db.prepare("SELECT * FROM words WHERE id = ?").get(id);
  if (!row) return null;
  const updated = shouldApplyLearnedDate(date_learned, row.date_learned);
  if (updated) {
    db.prepare("UPDATE words SET date_learned = ? WHERE id = ?").run(
      normalizeDateLearned(date_learned),
      id
    );
  }
  const fresh = db.prepare("SELECT * FROM words WHERE id = ?").get(id);
  return { updated, entry: rowToEntry(fresh) };
}

function mountWordRoutes(app) {
  app.get("/api/duplicate", (req, res) => {
    const word_ar = (req.query.word_ar || "").trim();
    if (!word_ar) return res.status(400).json({ error: "word_ar is required" });
    res.json({ existing: findDuplicate(word_ar) });
  });

  app.post("/api/duplicate", (req, res) => {
    const { word_ar, root, part_of_speech, word_ar_paired } = req.body || {};
    if (!word_ar) return res.status(400).json({ error: "word_ar is required" });
    res.json({ existing: findDuplicate(word_ar, { root, part_of_speech, word_ar_paired }) });
  });

  app.post("/api/words", (req, res) => {
    const { word_ar, word_ar_paired = [], root = "", part_of_speech = "", meaning = "", notes = "", date_learned = "" } = req.body;
    if (!word_ar) return res.status(400).json({ error: "word_ar is required" });
    const existing = findDuplicate(word_ar, { root, part_of_speech, word_ar_paired });
    if (existing) {
      return res.status(409).json({ error: "DUPLICATE", existing });
    }
    const search_blob = buildSearchBlob(word_ar, word_ar_paired);
    const learned = normalizeDateLearned(date_learned);
    const stmt = db.prepare(`
      INSERT INTO words (word_ar, word_ar_paired, root, part_of_speech, meaning, notes, search_blob, date_learned)
      VALUES (@word_ar, @word_ar_paired, @root, @part_of_speech, @meaning, @notes, @search_blob, @date_learned)
    `);
    const info = stmt.run({
      word_ar,
      word_ar_paired: JSON.stringify(word_ar_paired),
      root,
      part_of_speech,
      meaning,
      notes,
      search_blob,
      date_learned: learned
    });
    const row = db.prepare("SELECT * FROM words WHERE id = ?").get(info.lastInsertRowid);
    res.status(201).json(rowToEntry(row));
  });

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
      notes: req.body.notes ?? existing.notes,
      date_learned: req.body.date_learned !== undefined
        ? normalizeDateLearned(req.body.date_learned)
        : (existing.date_learned || "")
    };
    const search_blob = buildSearchBlob(merged.word_ar, merged.word_ar_paired);

    db.prepare(`
      UPDATE words SET word_ar=@word_ar, word_ar_paired=@word_ar_paired, root=@root,
        part_of_speech=@part_of_speech, meaning=@meaning, notes=@notes, search_blob=@search_blob,
        date_learned=@date_learned
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

  app.patch("/api/words/:id/date-learned", (req, res) => {
    const result = applyLearnedDateIfEarlier(req.params.id, req.body?.date_learned);
    if (!result) return res.status(404).json({ error: "Not found" });
    res.json(result);
  });

  app.delete("/api/words/:id", (req, res) => {
    db.prepare("DELETE FROM words WHERE id = ?").run(req.params.id);
    res.status(204).end();
  });

  app.get("/api/stats", (req, res) => {
    const words = db.prepare("SELECT COUNT(*) AS n FROM words").get().n;
    const roots = db.prepare(`
      SELECT COUNT(DISTINCT root) AS n FROM words WHERE TRIM(root) != ''
    `).get().n;
    res.json({ words, roots });
  });

  app.get("/api/words/:id", (req, res) => {
    const row = db.prepare("SELECT * FROM words WHERE id = ?").get(req.params.id);
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json(rowToEntry(row));
  });

  app.get("/api/words", (req, res) => {
    const limit = Math.min(parseInt(req.query.limit) || 100, 200);
    const rows = db.prepare("SELECT * FROM words ORDER BY id DESC LIMIT ?").all(limit);
    res.json(rows.map(rowToEntry));
  });

  app.get("/api/random", (req, res) => {
    const count = Math.min(parseInt(req.query.count) || 3, 20);
    const rows = db.prepare("SELECT * FROM words ORDER BY RANDOM() LIMIT ?").all(count);
    res.json(rows.map(rowToEntry));
  });

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

  app.get("/api/root/:root", (req, res) => {
    const rows = db.prepare("SELECT * FROM words WHERE root = ? ORDER BY id ASC").all(req.params.root);
    res.json(rows.map(rowToEntry));
  });
}

module.exports = { mountWordRoutes };
