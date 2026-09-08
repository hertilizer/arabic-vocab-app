const { requireClient, parseJsonResponse } = require("./client");

const EXAMPLE_PROMPT = `You are an expert in Levantine/Jordanian dialect (amiya).
Write ONE natural spoken example sentence that uses a specific Arabic word/form.

Rules:
- The sentence MUST include the given form as a whole word (same spelling; harakat may match or be added).
- Prefer everyday amiya, not formal MSA, unless the word is itself MSA-only.
- Fully vowel the sentence with harakat if you are confident.
- Do NOT include English, transliteration, or explanation.
- Respond with ONLY a raw JSON object, no markdown: {"sentence_ar": "..."}`;

function pickRandomForm(forms) {
  const list = [...new Set((forms || []).map((f) => String(f || "").trim()).filter(Boolean))];
  if (!list.length) {
    throw Object.assign(new Error("No forms provided"), { code: "NO_FORMS" });
  }
  return list[Math.floor(Math.random() * list.length)];
}

async function exampleSentence({ forms, meaning, part_of_speech }) {
  const anthropic = requireClient();
  const used_form = pickRandomForm(forms);
  const extra = [
    meaning ? `English meaning (for your understanding only, do not output it): ${meaning}` : "",
    part_of_speech ? `Part of speech: ${part_of_speech}` : "",
    `Other available forms (do NOT use these unless grammar forces it; the sentence must feature "${used_form}"): ${JSON.stringify(forms)}`
  ].filter(Boolean).join("\n");

  const resp = await anthropic.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 250,
    system: EXAMPLE_PROMPT,
    messages: [{
      role: "user",
      content: `Use this exact form in the sentence: ${used_form}\n${extra}`
    }]
  });
  const text = resp.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  const parsed = parseJsonResponse(text);
  return { sentence_ar: parsed.sentence_ar || "", used_form };
}

module.exports = { exampleSentence };
