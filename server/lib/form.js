const VERB_FORMS = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV", "XV"];
const ROMAN_TOKEN = /\b(XV|XIV|XIII|XII|XI|X|IX|VIII|VII|VI|V|IV|III|II|I)\b/;

function normalizeForm(value, { missing = "" } = {}) {
  if (value == null) return missing;
  const raw = String(value).trim();
  if (!raw || /^(none|other|n\/a|na|-|—|null)$/i.test(raw)) return "";
  const upper = raw.toUpperCase();
  if (VERB_FORMS.includes(upper)) return upper;
  const num = upper.match(/(?:FORM\s*)?(\d{1,2})/);
  if (num) {
    const n = Number(num[1]);
    if (n >= 1 && n <= 15) return VERB_FORMS[n - 1];
  }
  const roman = upper.match(ROMAN_TOKEN);
  if (roman && VERB_FORMS.includes(roman[1])) return roman[1];
  const stripped = upper.replace(/[^IVX]/g, "");
  return VERB_FORMS.includes(stripped) ? stripped : "";
}

module.exports = { VERB_FORMS, normalizeForm };
