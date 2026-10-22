/**
 * Resolve when `target` is truthy.
 *   target: CSS selector string, or a function returning a truthy value (sync or async).
 * Rejects after `timeout` ms. Uses a MutationObserver plus a slow interval as a safety net,
 * so it also works for conditions that are not DOM-mutation driven.
 */
export function waitFor(target, { timeout = 10000, root = document, interval = 250 } = {}) {
  const probe = typeof target === 'function' ? target : () => root.querySelector(target);
  return new Promise((resolve, reject) => {
    let done = false, mo, iv, to;
    const finish = (fn, v) => { if (done) return; done = true; mo && mo.disconnect(); clearInterval(iv); clearTimeout(to); fn(v); };
    const check = async () => { try { const v = await probe(); if (v) finish(resolve, v); } catch (e) { /* keep waiting */ } };
    check();
    if (done) return;
    mo = new MutationObserver(check);
    mo.observe(root.documentElement || root, { childList: true, subtree: true, attributes: true });
    iv = setInterval(check, interval);
    to = setTimeout(() => finish(reject, new Error('waitFor timed out: ' + (typeof target === 'string' ? target : 'custom condition'))), timeout);
  });
}
