// Maintained list of Arabic grammatical terms for part_of_speech.
// AI autofill must choose ONLY from this list (or leave blank if truly unsure).
// For words that pair tense/plurality forms (see word_ar_paired), use the
// generic entries (فعل / اسم) rather than a tense- or number-specific one.

module.exports = [
  // الأسماء (generic + specific)
  "اسم",
  "اسم علم",
  "ضمير متصل",
  "ضمير منفصل",
  "اسم إشارة",
  "اسم موصول",
  "مصدر",
  "اسم فاعل",
  "اسم مفعول",
  "اسم آلة",
  "اسم مكان",
  "اسم زمان",
  "اسم تفضيل",
  "صفة مشبهة",
  "عدد",

  // الأفعال (generic + specific)
  "فعل",
  "فعل ماضٍ",
  "فعل مضارع",
  "فعل أمر",
  "فعل لازم",
  "فعل متعدٍ",

  // الحروف
  "حرف جر",
  "حرف عطف",
  "حرف نفي",
  "حرف استفهام",
  "حرف شرط",
  "حرف نداء",
  "حرف جواب",
  "حرف تأكيد",

  // أخرى
  "صفة",
  "ظرف زمان",
  "ظرف مكان",
  "اسم فعل",
  "تعبير اصطلاحي" // idiom / multi-word phrase
];
