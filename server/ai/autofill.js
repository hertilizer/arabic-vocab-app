const POS_LIST = require("../pos-list");
const { requireClient, parseJsonResponse } = require("./client");

const SYSTEM_PROMPT = `You are an expert in Arabic grammar and Levantine/Jordanian dialect (amiya) vocabulary.
Given a single Arabic word or phrase, produce structured data for a vocabulary notebook.

Rules:
- "word_ar": the input word, fully voweled with harakat if you are confident; otherwise your best voweled guess.
- "root": the triliteral or quadriliteral root, hyphen-separated (e.g. "ك-ت-ب"). Leave "" (empty string) for idioms, phrases, loanwords, or particles with no derivational root. Never guess wildly - leave blank if unsure.
- "part_of_speech": choose EXACTLY one value from this list, matching it as precisely as the word allows: ${JSON.stringify(POS_LIST)}
  - If the word is a verb or noun that has a natural tense pair (present/past) or number pair (singular/plural), use the GENERIC entry ("فعل" or "اسم") rather than a tense/number-specific one, and put the other form(s) in word_ar_paired instead.
  - Use tense/number-SPECIFIC entries (e.g. "فعل أمر") only for standalone forms that won't be paired (e.g. an imperative given alone, not alongside its present tense).
  - If nothing fits confidently, return "".
- "meaning": concise English gloss(es). If multiple distinct senses exist (polysemy), list them separated by "; ". Leave "" if unsure.
- "word_ar_paired": an array of {"label": <Arabic grammatical label such as "ماضٍ", "مضارع", "أمر", "جمع", "مثنى">, "word_ar": <voweled form>}.
  - For a VERB given in present tense (مضارع), include its past tense (ماضٍ) here. If given in past tense, include present tense.
  - For a NOUN, include the plural (جمع) here, using the correct broken or sound plural. Include dual (مثنى) only if natural/common.
  - For idioms, loanwords, and particles: return an empty array.
  - Do NOT duplicate the primary word_ar inside this array.
- If the input is an idiom/multi-word phrase or a loanword, set "root" to "" and "part_of_speech" to "تعبير اصطلاحي" (idiom) or the closest fitting noun-like entry (loanword), and "word_ar_paired" to [].

Respond with ONLY a raw JSON object, no markdown fences, no preamble, matching this exact shape:
{"word_ar": "...", "root": "...", "part_of_speech": "...", "meaning": "...", "word_ar_paired": [{"label": "...", "word_ar": "..."}]}`;

function buildUserPrompt({ word_ar, note, existing }) {
  let prompt = `Word: ${word_ar}`;
  if (existing) {
    prompt += `\n\nExisting guess to refine (only if a note below asks you to fix something):\n${JSON.stringify(existing)}`;
  }
  if (note) {
    prompt += `\n\nUser note/correction: ${note}\nApply this note as guidance and regenerate all fields accordingly.`;
  }
  return prompt;
}

async function autofillEntry({ word_ar, note, existing }) {
  const anthropic = requireClient();
  const resp = await anthropic.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 500,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildUserPrompt({ word_ar, note, existing }) }]
  });
  const text = resp.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  return parseJsonResponse(text);
}

async function autofillField({ field, word_ar, note, existing }) {
  const anthropic = requireClient();
  const fieldPrompt = `Re-guess ONLY the "${field}" field for this word. Return the same JSON shape as always, but only the "${field}" key needs to be meaningfully changed - you may leave other keys as in the existing guess.`;
  const resp = await anthropic.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 500,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `${buildUserPrompt({ word_ar, note, existing })}\n\n${fieldPrompt}`
      }
    ]
  });
  const text = resp.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  return parseJsonResponse(text);
}

module.exports = { autofillEntry, autofillField };
