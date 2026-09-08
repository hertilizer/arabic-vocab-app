const fs = require("fs");
const os = require("os");
const path = require("path");
const { db } = require("../db");

const ROOT = path.join(__dirname, "..", "..");

function resolveExportDir() {
  const raw = (process.env.EXPORT_DIR || "").trim();
  let dir = raw || path.join(ROOT, "exports");
  if (dir === "~") dir = os.homedir();
  else if (dir.startsWith("~/")) dir = path.join(os.homedir(), dir.slice(2));
  return path.resolve(dir);
}

function buildCsv() {
  const rows = db.prepare("SELECT * FROM words ORDER BY id ASC").all();
  const header = ["id", "word_ar", "word_ar_paired", "root", "part_of_speech", "meaning", "notes", "date_added", "date_learned"];
  const escape = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push(header.map((h) => escape(r[h])).join(","));
  }
  return "\uFEFF" + lines.join("\n"); // BOM for Excel/Arabic compatibility
}

function writeExportFile() {
  const dir = resolveExportDir();
  fs.mkdirSync(dir, { recursive: true });
  const filename = `vocab-export-${Date.now()}.csv`;
  const filePath = path.join(dir, filename);
  fs.writeFileSync(filePath, buildCsv(), "utf8");
  return { path: filePath, filename };
}

module.exports = { resolveExportDir, writeExportFile };
