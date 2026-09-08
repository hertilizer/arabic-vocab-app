import { $ } from "./lib/dom.js";
import { api } from "./lib/api.js";
import { state } from "./lib/state.js";
import { initHarakat } from "./lib/harakat.js";
import { initHome, loadHome } from "./home.js";
import { initDetail, openCardDetail } from "./detail.js";
import { initEdit } from "./edit.js";
import { initAdd } from "./add.js";
import { initExport } from "./export.js";

function initShemaghParallax() {
  const SHEMAGH_PARALLAX = 0.4;
  const shemaghBg = $(".shemagh-bg");
  let shemaghTick = false;
  function updateShemaghParallax() {
    if (shemaghBg) {
      shemaghBg.style.transform = `translate3d(0, ${-window.scrollY * SHEMAGH_PARALLAX}px, 0)`;
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

async function init() {
  initHarakat();
  initHome({ openCard: openCardDetail });
  initDetail();
  initEdit();
  initAdd();
  initExport();
  initShemaghParallax();
  state.config = await api("/api/config");
  loadHome();
}

init();
