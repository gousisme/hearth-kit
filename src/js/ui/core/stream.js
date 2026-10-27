import { esc, safeUrl } from '../../shared/util.js';

/**
 * STREAMED TRAILERS. Steam no longer hands out mp4 / webm files: its trailers are DASH streams (.mpd). A media item { type:'video', stream, thumb, page } is drawn as a <video data-dash>
 * and attached to dash.js when the host page has it (`window.dashjs`, a @require of the userscript). When dash.js is missing or the stream errors, the slide gets .is-failed: the poster stays
 * and the note ("can't play here" + a "Watch it on Steam" link to `page`) shows instead of a dead player. Used by the full page's gallery and the popup's viewer.
 */
export function streamHtml(m, muted = true) {
  const note = `<div class="dp-sl-note"><span>This trailer can’t play here.</span>${m.page ? `<a class="dp-ghost ac" href="${esc(safeUrl(m.page))}" target="_blank" rel="noopener noreferrer">Watch it on Steam</a>` : ''}</div>`;
  return `<video controls autoplay${muted ? ' muted' : ''} playsinline poster="${esc(safeUrl(m.thumb))}" data-dash="${esc(safeUrl(m.stream))}"></video>${note}`;
}
export function attachStreams(root) {
  root.querySelectorAll('video[data-dash]:not([data-on])').forEach(v => {
    v.dataset.on = '1'; const slide = v.parentNode, fail = () => { v.controls = false; v.pause(); if (slide) slide.classList.add('is-failed'); };
    const dj = window.dashjs; if (!dj) return fail();
    try { const p = dj.MediaPlayer().create(); v.__dash = p; p.on('error', fail); p.initialize(v, v.dataset.dash, true); } catch (e) { fail(); }
  });
}
export const stopStream = o => { const v = o.querySelector && o.querySelector('video'); try { if (v && v.__dash) { v.__dash.destroy(); v.__dash = null; } } catch (e) { /* already gone */ } };
