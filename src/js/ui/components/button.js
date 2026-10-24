import { esc } from '../../shared/util.js';
import { ic, ICON } from '../core/icons.js';

/**
 * Primary button: a lime pill with an arrow disc. On hover the disc's arrow slides out and a second
 * one slides in, the gap opens up; on press it squashes. No glow, no gradient — motion is the effect.
 * `attrs` is raw HTML attributes (already escaped by the caller).
 */
export function button(label, { icon = ICON.download, attrs = '', cls = '' } = {}) {
  return `<button class="btn ${cls}" ${attrs}><span class="bl">${esc(label)}</span><span class="d"${icon === ICON.download ? ' data-dl' : ''}>${ic(icon)}${ic(icon)}</span></button>`;
}

/** Secondary button: frosted glass pill (only used over imagery). */
export function glassButton(label, attrs = '', cls = '') {
  return `<button class="btn glass ${cls}" ${attrs}>${esc(label)}</button>`;
}
