const HARAKAT_REGEX = /[\u0610-\u061A\u064B-\u0650\u0652\u0656-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E8\u06EA-\u06ED]/g;
const SHADDA = "\u0651";
const FATHA = "\u064E";
const DAMMA = "\u064F";
const KASRA = "\u0650";
const SUKUN = "\u0652";
const ARABIC_LETTER = /[\u0621-\u063A\u0641-\u064A]/;

const PREFIXES = ["عم", "رح", "بي", "بت", "بن", "ب", "ي", "ت", "ن", "أ", "ا", "ح"];
const SUFFIXES = ["تما", "تمو", "تون", "تم", "تن", "تي", "وا", "ون", "ين", "ان", "نا", "ت", "ن", "ا", "و"]
  .slice()
  .sort((a, b) => b.length - a.length);

function stripHarakat(str) {
  return String(str || "").normalize("NFC").replace(HARAKAT_REGEX, "");
}

function stripShadda(str) {
  return stripHarakat(str).replaceAll(SHADDA, "");
}

function verbCore(word) {
  let s = stripHarakat(word).trim();
  if (!s) return "";
  for (const p of PREFIXES) {
    if (s.startsWith(p) && s.length - p.length >= 3) {
      s = s.slice(p.length);
      break;
    }
  }
  for (const suf of SUFFIXES) {
    if (s.endsWith(suf) && s.length - suf.length >= 3) {
      s = s.slice(0, -suf.length);
      break;
    }
  }
  return s;
}

function familyKey(word) {
  return stripShadda(verbCore(word));
}

function firstLetterMarks(word) {
  const s = String(word || "").normalize("NFC");
  let i = 0;
  while (i < s.length && !ARABIC_LETTER.test(s[i])) i += 1;
  if (i >= s.length) return { letter: "", marks: "" };
  const letter = s[i];
  let marks = "";
  i += 1;
  while (i < s.length && !ARABIC_LETTER.test(s[i])) {
    marks += s[i];
    i += 1;
  }
  return { letter, marks };
}

function hasStemShadda(word) {
  return verbCore(word).includes(SHADDA);
}

function classifyOne(word) {
  const raw = String(word || "").trim();
  if (!raw) return "unknown";
  const key = familyKey(raw);
  if (key.length !== 3) return "other";
  if (hasStemShadda(raw)) return "II";

  const { letter, marks } = firstLetterMarks(raw);
  const damma = marks.includes(DAMMA);
  const fatha = marks.includes(FATHA);
  const kasra = marks.includes(KASRA);

  if ("يتن".includes(letter) && damma) return "IV";
  if (letter === "أ" && damma) return "I";
  if (letter === "أ" && fatha) {
    const letters = stripShadda(raw).replace(/[^\u0621-\u063A\u0641-\u064A]/g, "");
    if (letters.length >= 4 && letters.startsWith("أ")) {
      const thirdVowel = thirdLetterMarks(raw);
      if (thirdVowel.includes(DAMMA)) return "I";
      if (thirdVowel.includes(FATHA) || thirdVowel.includes(KASRA)) return "IV";
      return "unknown";
    }
  }
  if (letter === "أ" && !damma && !fatha && !kasra) return "unknown";
  if ("يتن".includes(letter) && fatha) return "I";
  return "I";
}

function thirdLetterMarks(word) {
  const s = String(word || "").normalize("NFC");
  let seen = 0;
  let marks = "";
  for (let i = 0; i < s.length; i += 1) {
    if (!ARABIC_LETTER.test(s[i])) {
      if (seen === 3) marks += s[i];
      continue;
    }
    seen += 1;
    if (seen > 3) break;
    marks = "";
  }
  return marks;
}

function classifyEntry(word_ar, paired = []) {
  const forms = [word_ar, ...(paired || []).map((p) => p.word_ar)].filter(Boolean);
  const classes = forms.map(classifyOne);
  if (classes.includes("other")) return "other";
  if (classes.includes("II")) return "II";
  if (classes.includes("IV")) return "IV";
  if (classes.includes("I")) return "I";
  return "unknown";
}

function sameStem(incomingForm, existingForm) {
  if (incomingForm === "other" || existingForm === "other") return false;
  if (incomingForm === existingForm) return true;
  if (
    (incomingForm === "unknown" && existingForm === "I")
    || (incomingForm === "I" && existingForm === "unknown")
  ) return true;
  return false;
}

function hyphenRoot(key) {
  return [...key].join("-");
}

function buildStemSet(c1, c2, c3, presentAyn = DAMMA) {
  if (![c1, c2, c3].every((c) => c && ARABIC_LETTER.test(c))) return null;
  return {
    I: {
      present: `يَ${c1}ْ${c2}${presentAyn}${c3}ُ`,
      past: `${c1}َ${c2}َ${c3}َ`,
      imperative: `اُ${c1}ْ${c2}${presentAyn}${c3}ْ`
    },
    II: {
      present: `يُ${c1}َ${c2}${SHADDA}${KASRA}${c3}ُ`,
      past: `${c1}َ${c2}${SHADDA}${FATHA}${c3}َ`,
      imperative: `${c1}َ${c2}${SHADDA}${KASRA}${c3}ْ`
    },
    IV: {
      present: `يُ${c1}ْ${c2}ِ${c3}ُ`,
      past: `أَ${c1}ْ${c2}َ${c3}َ`,
      imperative: `أَ${c1}ْ${c2}ِ${c3}ْ`
    }
  };
}

function presentAynFromWord(word) {
  const s = String(word || "").normalize("NFC");
  const letters = [];
  const marksAfter = [];
  for (let i = 0; i < s.length; i += 1) {
    if (ARABIC_LETTER.test(s[i])) {
      letters.push(s[i]);
      marksAfter.push("");
    } else if (letters.length) {
      marksAfter[letters.length - 1] += s[i];
    }
  }
  if (letters[0] === "ي" || letters[0] === "ت" || letters[0] === "ن" || letters[0] === "أ") {
    const aynMarks = marksAfter[2] || "";
    if (aynMarks.includes(DAMMA)) return DAMMA;
    if (aynMarks.includes(KASRA)) return KASRA;
    if (aynMarks.includes(FATHA)) return FATHA;
  }
  return DAMMA;
}

function stemPayload(word_ar, paired = []) {
  const key = familyKey(word_ar) || familyKey((paired[0] || {}).word_ar || "");
  if (key.length !== 3) {
    return { family: "other", form: classifyEntry(word_ar, paired), radicals: key, ambiguous: false, forms: null, root: "" };
  }
  const form = classifyEntry(word_ar, paired);
  const [c1, c2, c3] = [...key];
  const forms = buildStemSet(c1, c2, c3, presentAynFromWord(word_ar));
  const ambiguous = form === "unknown" || form === "I";
  return {
    family: "I-II-IV",
    form,
    radicals: key,
    root: hyphenRoot(key),
    ambiguous,
    forms
  };
}

function applyStem(payload, form) {
  const spec = payload?.forms?.[form];
  if (!spec) return null;
  return {
    word_ar: spec.present,
    root: payload.root,
    part_of_speech: "فعل",
    word_ar_paired: [
      { label: "ماضٍ", word_ar: spec.past },
      { label: "أمر", word_ar: spec.imperative }
    ],
    stemForm: form,
    form
  };
}

module.exports = {
  SHADDA,
  stripHarakat,
  stripShadda,
  verbCore,
  familyKey,
  classifyOne,
  classifyEntry,
  sameStem,
  stemPayload,
  applyStem,
  buildStemSet
};
