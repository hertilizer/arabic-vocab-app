const VERB_FORMS = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV", "XV"];

function normalizeForm(value, { missing = "" } = {}) {
  if (value == null) return missing;
  const raw = String(value).trim();
  if (!raw || /^(none|other|n\/a|-|—)$/i.test(raw)) return "";
  const roman = raw.toUpperCase().replace(/[^IVX]/g, "");
  return VERB_FORMS.includes(roman) ? roman : "";
}

module.exports = { VERB_FORMS, normalizeForm };
