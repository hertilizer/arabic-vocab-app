const { requireClient, parseJsonResponse, cachedSystem } = require("./client");
const { db, rowToEntry } = require("../db");
const { VERB_FORMS, normalizeForm } = require("../lib/form");

const SYSTEM_PROMPT = `You classify Arabic notebook entries into verb stems (أبواب, Forms I–XV).

For EACH entry, decide whether THIS lexeme belongs on a Form I–XV chart cell:
- Verbs, masdars, participles, and other nouns derived on a verb stem (اسم مكان, اسم آلة, etc.): return that stem as a Roman numeral (${VERB_FORMS.join(", ")}).
- Underived/jamid nouns, loanwords, particles, idioms, proper names, or anything where I–XV does not apply to this word: return "".

Classify the lexeme, not the root. Example: خبز "bread" is "". مخبز "bakery" is "I". يكتب "to write" is "I". تعليم is "II".

Respond with ONLY raw JSON, no markdown:
{"forms":[{"id":1,"form":"I"},{"id":2,"form":""}]}`;

function pendingRows() {
  return db.prepare("SELECT * FROM words WHERE form IS NULL").all();
}

function classifyPayload(row) {
  const entry = rowToEntry(row);
  return {
    id: entry.id,
    word_ar: entry.word_ar,
    root: entry.root,
    part_of_speech: entry.part_of_speech,
    meaning: entry.meaning,
    word_ar_paired: entry.word_ar_paired
  };
}

async function classifyForms(entries) {
  if (!entries.length) return [];
  const anthropic = requireClient();
  const resp = await anthropic.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 2500,
    system: cachedSystem(SYSTEM_PROMPT),
    messages: [{
      role: "user",
      content: `Classify these ${entries.length} entries:\n${JSON.stringify(entries)}`
    }]
  });
  const text = resp.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  const parsed = parseJsonResponse(text);
  const list = Array.isArray(parsed) ? parsed : parsed?.forms;
  return Array.isArray(list) ? list : [];
}

async function seedMissingForms() {
  const rows = pendingRows();
  if (!rows.length) return { seeded: 0 };
  const classified = await classifyForms(rows.map(classifyPayload));
  const byId = new Map(classified.map((row) => [Number(row.id), row.form]));
  const update = db.prepare("UPDATE words SET form = ? WHERE id = ? AND form IS NULL");
  const tx = db.transaction(() => {
    let n = 0;
    for (const row of rows) {
      if (!byId.has(row.id)) continue;
      update.run(normalizeForm(byId.get(row.id)), row.id);
      n += 1;
    }
    return n;
  });
  return { seeded: tx() };
}

module.exports = { seedMissingForms, classifyForms };
