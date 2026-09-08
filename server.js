require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const { mountRoutes } = require("./server/routes");
const { hasApiKey } = require("./server/ai/client");
const { resolveExportDir } = require("./server/lib/export-csv");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
mountRoutes(app);

const PORT = process.env.PORT || 3737;
app.listen(PORT, () => {
  console.log(`Arabic vocab app running at http://localhost:${PORT}`);
  console.log(`CSV exports will be saved to ${resolveExportDir()}`);
  if (!hasApiKey()) {
    console.log("⚠️  No ANTHROPIC_API_KEY set in .env - AI autofill will be unavailable until you add one.");
  }
});
