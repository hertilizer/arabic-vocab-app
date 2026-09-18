import { $ } from "./lib/dom.js";
import { api } from "./lib/api.js";
import { state } from "./lib/state.js";
import { initHarakat } from "./lib/harakat.js";
import { initHome, applyHomeNav } from "./home.js";
import { initDetail, openCardDetail, applyDetailNav } from "./detail.js";
import { initEdit, applyEditNav } from "./edit.js";
import { initAdd, applyAddNav } from "./add.js";
import { initExport } from "./export.js";
import { initNav, parseLocation, navigate } from "./lib/nav.js";
import { initTheme } from "./lib/theme.js";

function initShemaghParallax() {
  const SHEMAGH_PARALLAX = 0.4;
  const shemaghBg = $(".shemagh-bg");
  let shemaghTick = false;
  function updateShemaghParallax() {
    if (shemaghBg) {
      shemaghBg.style.backgroundPosition = `0 ${-window.scrollY * SHEMAGH_PARALLAX}px`;
    }
    shemaghTick = false;
  }
  window.addEventListener("scroll", () => {
    if (!shemaghTick) {
      shemaghTick = true;
      requestAnimationFrame(updateShemaghParallax);
    }
  }, { passive: true });
  updateShemaghParallax();
}

function applyNav(nav) {
  applyHomeNav(nav);
  applyAddNav(nav);
  applyDetailNav(nav);
  applyEditNav(nav);
}

async function init() {
  state.config = await api("/api/config");
  initHarakat();
  initHome({ openCard: openCardDetail });
  initDetail();
  initEdit();
  initAdd();
  initExport();
  initTheme();
  initShemaghParallax();
  initNav(applyNav);
  const initial = parseLocation();
  navigate(initial, { replace: true });
}

init();
