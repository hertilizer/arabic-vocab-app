export const VERB_FORMS = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV", "XV"];

export function formOptions(selected) {
  const cur = String(selected || "");
  return [`<option value="">—</option>`]
    .concat(VERB_FORMS.map((f) => `<option value="${f}"${f === cur ? " selected" : ""}>${f}</option>`))
    .join("");
}
