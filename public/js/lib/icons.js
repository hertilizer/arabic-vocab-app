import { escapeHtml } from "./dom.js";
import { state } from "./state.js";

export const ICONS = {
  harakat: `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <g fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" transform="translate(12 12) rotate(-38)">
        <path d="M-6.1 -3.2 H6.1"/>
        <path d="M-6.1 3.2 H6.1"/>
      </g>
    </svg>`,
  edit: `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"
        d="M4.4 19.6 5.3 15.2 16.6 3.9l3.5 3.5-11.3 11.3zM13.8 6.7l3.5 3.5"/>
    </svg>`,
  reroll: `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"
        d="M4.2 12a7.8 7.8 0 0 1 12.9-5.9L20 8.8M19.8 12a7.8 7.8 0 0 1-12.9 5.9L4 15.2M20 3.8v5h-5M4 20.2v-5h5"/>
    </svg>`,
  eye: `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
        d="M2.8 12s3.2-7 9.2-7 9.2 7 9.2 7-3.2 7-9.2 7-9.2-7-9.2-7z"/>
      <circle cx="12" cy="12" r="2.6" fill="none" stroke="currentColor" stroke-width="2"/>
    </svg>`,
  search: `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="10.8" cy="10.8" r="6.2" fill="none" stroke="currentColor" stroke-width="2"/>
      <path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M15.4 15.4 20.2 20.2"/>
    </svg>`,
  close: `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M6.5 6.5 17.5 17.5M17.5 6.5 6.5 17.5"/>
    </svg>`
};

export function iconToggle({ icon, pressed = false, label, title, extra = "", size = "sm" }) {
  const tip = title || label;
  const sizeClass = size === "lg" ? " lg" : "";
  return `<button class="icon-chip${sizeClass}" type="button" aria-pressed="${pressed}" aria-label="${escapeHtml(label)}" title="${escapeHtml(tip)}" ${extra}>${icon}</button>`;
}

export function harakatBtn() {
  return iconToggle({
    icon: ICONS.harakat,
    pressed: state.showHarakat,
    label: state.showHarakat ? "Harakat on" : "Harakat off",
    extra: 'data-harakat-toggle title="Harakat"'
  });
}

export function quietIconBtn({ icon, label, extra = "", id = "" }) {
  const idAttr = id ? ` id="${id}"` : "";
  return `<button class="icon-btn quiet" type="button" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}"${idAttr} ${extra}>${icon}</button>`;
}
