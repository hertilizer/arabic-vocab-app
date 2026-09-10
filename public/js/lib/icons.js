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
    </svg>`,
  export: `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
        d="M12 4v11M8.2 11.2 12 15l3.8-3.8M5.5 20h13"/>
    </svg>`,
  check: `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
        d="M5.5 12.5 10 17l8.5-9"/>
    </svg>`,
  notebook: `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
        d="M20 19.5v-15A2.5 2.5 0 0 0 17.5 2H4v20h13.5a2.5 2.5 0 0 0 0-5H4"/>
    </svg>`,
  calendar: `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="4" y="5.5" width="16" height="14.5" rx="2" fill="none" stroke="currentColor" stroke-width="2"/>
      <path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M8 3.8v4M16 3.8v4M4 10h16"/>
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
