export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export function addedAgo(dateAdded) {
  if (!dateAdded) return "";
  let then;
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateAdded)) {
    const [y, m, d] = dateAdded.split("-").map(Number);
    then = new Date(y, m - 1, d);
  } else {
    const iso = dateAdded.includes("T") ? dateAdded : dateAdded.replace(" ", "T") + "Z";
    then = new Date(iso);
  }
  if (Number.isNaN(then.getTime())) return "";
  const startOf = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const now = new Date();
  const days = Math.round((startOf(now) - startOf(then)) / 86400000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return then.toLocaleDateString("en-US", { weekday: "long" });
  const twoMonthsAgo = startOf(new Date(now.getFullYear(), now.getMonth() - 2, now.getDate()));
  if (then >= twoMonthsAgo) return then.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return then.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

export function entryDisplayDate(entry) {
  return String(entry?.date_learned || "").trim() || entry?.date_added || "";
}

export function dateInputValue(value) {
  const s = String(value || "").trim();
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : "";
}
