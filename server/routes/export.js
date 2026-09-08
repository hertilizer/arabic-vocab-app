const { writeExportFile } = require("../lib/export-csv");

function mountExportRoutes(app) {
  app.post("/api/export", (req, res) => {
    try {
      const result = writeExportFile();
      res.json({ ok: true, ...result });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Export failed", detail: String(err.message || err) });
    }
  });
}

module.exports = { mountExportRoutes };
