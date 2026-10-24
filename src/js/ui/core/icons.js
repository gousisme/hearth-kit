/** Inline SVG icons (stroke = currentColor). Paths only, wrapped by `ic()`. */
export const ICON = {
  download: '<path d="M12 4v11m0 0-5-5m5 5 5-5M5 20h14"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  next: '<path d="m9 5 7 7-7 7"/>',
  prev: '<path d="m15 5-7 7 7 7"/>',
  chev: '<path d="m6 9 6 6 6-6"/>',
  cloud: '<path d="M7 18a4 4 0 0 1-.5-7.97A6 6 0 0 1 18 9.5 4.25 4.25 0 0 1 17.5 18Z"/>',
  drive: '<rect x="3" y="13" width="18" height="7" rx="2"/><path d="m5 13 2.4-7a2 2 0 0 1 1.9-1.4h5.4a2 2 0 0 1 1.9 1.4L19 13M7 16.5h.01M11 16.5h3"/>',
  fix: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.1L3 17.7V21h3.3l6.3-6.3a4 4 0 0 0 5.1-5.4l-2.6 2.6-2.4-.5-.5-2.4Z"/>',
  torrent: '<path d="M6 3v8a6 6 0 0 0 12 0V3h-4v8a2 2 0 0 1-4 0V3Z"/><path d="M6 7h4M14 7h4"/>',
  ext: '<path d="M7 17 17 7M8 7h9v9"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>',
  check: '<path d="m5 12 5 5 9-10"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-6 8-6s8 2 8 6"/>',
  bookmark: '<path d="M6 4h12v16l-6-4-6 4Z"/>',
  play: '<path d="M8 5.5v13l11-6.5Z"/>',
  steam: '<circle cx="15.5" cy="8.5" r="3.5"/><circle cx="8" cy="16" r="2.4"/><path d="m3 14.2 3.6 1.5M10 14.7l3.4-3.2M12.3 18.2A7 7 0 1 0 5 12"/>',
  logout: '<path d="M9 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3M16 8l4 4-4 4M20 12H9"/>',
};

/** Filled brand glyph (the real Steam logo, Simple Icons, CC0). Use with icf(). */
export const LOGO = { steam: '<path d="M11.979 0C5.678 0 .511 4.86.022 11.037l6.432 2.658c.545-.371 1.203-.59 1.912-.59.063 0 .125.004.188.006l2.861-4.142V8.91c0-2.495 2.028-4.524 4.524-4.524 2.494 0 4.524 2.031 4.524 4.527s-2.03 4.525-4.524 4.525h-.105l-4.076 2.911c0 .052.004.105.004.159 0 1.875-1.515 3.396-3.39 3.396-1.635 0-3.016-1.173-3.331-2.727L.436 15.27C1.862 20.307 6.486 24 11.979 24c6.627 0 11.999-5.373 11.999-12S18.605 0 11.979 0zM7.54 18.21l-1.473-.61c.262.543.714.999 1.314 1.25 1.297.539 2.793-.076 3.332-1.375.263-.63.264-1.319.005-1.949s-.75-1.121-1.377-1.383c-.624-.26-1.29-.249-1.878-.03l1.523.63c.956.4 1.409 1.5 1.009 2.455-.397.957-1.497 1.41-2.454 1.012H7.54zm11.415-9.303c0-1.662-1.353-3.015-3.015-3.015-1.665 0-3.015 1.353-3.015 3.015 0 1.665 1.35 3.015 3.015 3.015 1.663 0 3.015-1.35 3.015-3.015zm-5.273-.005c0-1.252 1.013-2.266 2.265-2.266 1.249 0 2.266 1.014 2.266 2.266 0 1.251-1.017 2.265-2.266 2.265-1.253 0-2.265-1.014-2.265-2.265z"/>' };
export function icf(path, size = 18) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${path}</svg>`;
}
export function ic(path, size = 18, stroke = 2.4) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
}
/** The Get button's download glyph: a tray line that stays put + an arrow that can slide down and loop (two copies: one leaves downwards, the next enters from the top).
 *  The arrows live in a nested <svg> so everything below its edge is clipped (the arrow disappears into the line). Looped by core/dl-loop.js. */
export function dlGlyph(size = 18, stroke = 2.4) {
  const arrow = '<path d="M12 4v11m0 0-5-5m5 5 5-5"/>';
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 20h14"/><svg x="0" y="0" width="24" height="18.5" viewBox="0 0 24 18.5" overflow="hidden"><g class="ar a">${arrow}</g><g class="ar b">${arrow}</g></svg></svg>`;
}
