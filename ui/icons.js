/** @type {Record<string, string>} */
const iconPaths = {
  pin: '<path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2.4"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
  sliders:
    '<path d="M3 7h7m4 0h7M3 17h11m4 0h3"/><circle cx="12" cy="7" r="2"/><circle cx="16" cy="17" r="2"/>',
  spark:
    '<path d="M11 3.5c.8 5.1 2.5 7.1 7.2 8.5-4.7 1.1-6.5 3.5-7.2 8.5-.9-5-2.8-7.4-7.2-8.5C8.2 10.6 10 8.6 11 3.5Z"/><path d="M19 2v5m-2.5-2.5h5"/>',
  waves:
    '<path d="M2 7c3 2 5 2 9-.4s6-2.5 11-.4M2 12c3 2 5 2 9-.4s6-2.5 11-.4M2 17c3 2 5 2 9-.4s6-2.5 11-.4"/>',
  chart: '<path d="M3 4v16h18M7 15v-3m4 3V8m4 7v-5m4 5V5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-9v.3"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
  users:
    '<circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2m1-15a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 5"/>',
  edit: '<path d="m4 16-1 5 5-1L20 8l-4-4zm10-10 4 4"/>',
  route:
    '<circle cx="5" cy="18" r="2"/><circle cx="19" cy="6" r="2"/><path d="M7 18h9a3 3 0 0 0 0-6H8a3 3 0 0 1 0-6h9"/>',
  house: '<path d="m2 11 10-8 10 8m-18-1v11h16V10m-11 11v-7h6v7"/>',
  leaf: '<path d="M20 3c1 8-1 15-9 15-5 0-7-4-6-7 1-5 8-5 15-8Zm-16 18 11-11"/>',
  megaphone: '<path d="m3 10 17-6v14L3 14zm1 4 2 6h3l-2-5m14-7 2-1m-2 6 2 1"/>',
  check: '<path d="m5 12 4 4 10-10"/>',
  plus: '<path d="M12 6v12M6 12h12"/>',
  send: '<path d="m3 4 18 8-18 8 3-8zm3 8h15"/>',
  shield: '<path d="m12 2 8 4v5c0 5-3 8-8 11-5-3-8-6-8-11V6z"/><path d="m8 12 3 3 5-6"/>',
  copy: '<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V4a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h4"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v4h16v-4"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
};

/** @param {string} name */
export function icon(name) {
  const template = document.createElement('template');
  const path = Object.hasOwn(iconPaths, name) ? iconPaths[name] : '';
  template.innerHTML =
    '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">' +
    path +
    '</svg>';
  const svg = template.content.firstElementChild;
  if (!svg) throw new Error('Invalid static icon markup');
  return svg;
}

export function populateIcons() {
  document.querySelectorAll('[data-icon]').forEach((placeholder) => {
    const name = placeholder.getAttribute('data-icon');
    if (name) placeholder.replaceWith(icon(name));
  });
}
