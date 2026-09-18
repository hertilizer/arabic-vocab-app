let applyFn = () => {};

export function read() {
  return history.state?.nav ? { ...history.state.nav } : { view: "home" };
}

function href(nav) {
  const p = new URLSearchParams();
  if (nav.view === "search" && nav.q) p.set("q", nav.q);
  if (nav.view === "root" && nav.root) p.set("root", nav.root);
  if (nav.card) p.set("w", String(nav.card));
  if (nav.edit) p.set("edit", "1");
  const q = p.toString();
  return q ? `${location.pathname}?${q}` : location.pathname || "/";
}

export function merge(patch) {
  const nav = { ...read(), ...patch };
  for (const key of Object.keys(patch)) {
    if (patch[key] == null) delete nav[key];
  }
  if (!nav.view) nav.view = "home";
  if (nav.view !== "search") delete nav.q;
  if (nav.view !== "root") delete nav.root;
  if (!nav.card) {
    delete nav.card;
    delete nav.edit;
  }
  if (!nav.edit) delete nav.edit;
  if (!nav.review) delete nav.review;
  return nav;
}

export function parseLocation() {
  const p = new URLSearchParams(location.search);
  const nav = { view: "home" };
  if (p.get("q")) {
    nav.view = "search";
    nav.q = p.get("q");
  } else if (p.get("root")) {
    nav.view = "root";
    nav.root = p.get("root");
  }
  const w = p.get("w");
  if (w) nav.card = /^\d+$/.test(w) ? Number(w) : w;
  if (p.get("edit") && nav.card) nav.edit = true;
  return nav;
}

export function navigate(patch, { replace = false, silent = false } = {}) {
  const nav = merge(patch);
  const state = { nav };
  const url = href(nav);
  if (replace) history.replaceState(state, "", url);
  else history.pushState(state, "", url);
  if (!silent) applyFn(nav);
  return nav;
}

export function navBack() {
  history.back();
}

export function initNav(apply) {
  applyFn = apply;
  window.addEventListener("popstate", () => applyFn(read()));
}
