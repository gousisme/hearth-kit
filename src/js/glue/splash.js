/**
 * Loading screen, shown at once (document-start) and removed when the redesign has painted, or when the original page was restored / it took too long.
 * It lives in its own shadow root, so neither the site nor the kit's stylesheet touches it. Colours come from the same theme as the UI.
 *   splash({ title: 'Online', accentTitle: '-Fix', letter: 'O', logo: url, accent: '#1ea7e0', ink: '#04141c', bg: '#24262b', timeoutMs: 25000 })
 */
export function showSplash(o = {}) {
  const c = { title: 'Loading', accentTitle: '', letter: '', logo: '', accent: '#c6f432', ink: '#13150a', bg: '#24262b', timeoutMs: 25000, ...o };
  const esc = s => String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const mount = () => {
    if (document.getElementById('hearth-splash')) return;
    const host = document.createElement('div'); host.id = 'hearth-splash';
    host.style.cssText = 'position:fixed;inset:0;z-index:2147483646;transition:opacity .4s ease';
    const sr = host.attachShadow({ mode: 'open' });
    sr.innerHTML = `<style>
      :host{all:initial}.w{position:fixed;inset:0;display:grid;place-items:center;background:${esc(c.bg)};color:#f2f3f5;font:600 15px system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
      .c{display:flex;flex-direction:column;align-items:center;gap:18px;animation:in .5s ease both}
      .lg{position:relative;width:84px;height:84px;border-radius:26px;background:${esc(c.accent)};display:grid;place-items:center;color:${esc(c.ink)};font:800 40px system-ui,sans-serif;box-shadow:0 0 0 0 ${esc(c.accent)};animation:pu 1.8s ease-out infinite;overflow:hidden}
      .lg img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:0;transition:opacity .3s}.lg img.ok{opacity:1}
      .nm{font-size:22px;font-weight:800;letter-spacing:.01em}.nm b{color:${esc(c.accent)}}
      .bar{width:170px;height:4px;border-radius:4px;background:rgba(255,255,255,.1);overflow:hidden}.bar i{display:block;width:40%;height:100%;border-radius:4px;background:${esc(c.accent)};animation:sl 1.15s ease-in-out infinite}
      @keyframes sl{0%{transform:translateX(-110%)}100%{transform:translateX(280%)}}
      @keyframes pu{0%{box-shadow:0 0 0 0 color-mix(in srgb,${esc(c.accent)} 45%,transparent)}70%,100%{box-shadow:0 0 0 26px transparent}}
      @keyframes in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
      @media (prefers-reduced-motion:reduce){.lg,.bar i,.c{animation:none}}
    </style><div class="w"><div class="c"><div class="lg">${esc(c.letter || c.title[0] || '')}${c.logo ? `<img alt="" src="${esc(c.logo)}">` : ''}</div><div class="nm">${esc(c.title)}<b>${esc(c.accentTitle)}</b></div><div class="bar"><i></i></div></div></div>`;
    const img = sr.querySelector('img'); img && img.addEventListener('load', () => img.classList.add('ok'));
    document.documentElement.appendChild(host);
    const t0 = Date.now(); let seenOn = false;
    const done = () => { clearInterval(iv); host.style.opacity = '0'; host.style.pointerEvents = 'none'; setTimeout(() => host.remove(), 450); };
    const iv = setInterval(() => {
      const h = document.getElementById('hearth-host'), painted = h && h.shadowRoot && h.shadowRoot.querySelector('.page > *');
      const on = document.documentElement.classList.contains('hearth-on'); if (on) seenOn = true;
      if (painted) { clearInterval(iv); requestAnimationFrame(() => requestAnimationFrame(done)); }
      else if ((seenOn && !on) || Date.now() - t0 > c.timeoutMs) done();      // fell back to the original page, or took too long
    }, 60);
  };
  if (document.documentElement) mount(); else new MutationObserver((m, mo) => { if (document.documentElement) { mo.disconnect(); mount(); } }).observe(document, { childList: true });
}
