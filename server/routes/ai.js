const { autofillEntry, autofillField } = require("../ai/autofill");
const { exampleSentence } = require("../ai/example");
const { sendAiError } = require("../lib/ai-errors");

function mountAiRoutes(app) {
  app.post("/api/autofill", async (req, res) => {
    try {
      const { word_ar, note, existing } = req.body;
      if (!word_ar) return res.status(400).json({ error: "word_ar is required" });
      const result = await autofillEntry({ word_ar, note, existing });
      res.json(result);
    } catch (err) {
      sendAiError(res, err, "Autofill failed");
    }
  });

  app.post("/api/autofill/field", async (req, res) => {
    try {
      const { field, word_ar, note, existing } = req.body;
      if (!word_ar || !field) return res.status(400).json({ error: "word_ar and field are required" });
      const result = await autofillField({ field, word_ar, note, existing });
      res.json(result);
    } catch (err) {
      sendAiError(res, err, "Autofill failed");
    }
  });

  app.post("/api/example", async (req, res) => {
    try {
      const { forms, meaning, part_of_speech } = req.body;
      if (!Array.isArray(forms) || !forms.length) {
        return res.status(400).json({ error: "forms array is required" });
      }
      const result = await exampleSentence({ forms, meaning, part_of_speech });
      res.json(result);
    } catch (err) {
      sendAiError(res, err, "Example failed");
    }
  });
}

module.exports = { mountAiRoutes };
