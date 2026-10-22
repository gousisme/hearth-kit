/** Steam helpers for scrapers. */

/** Extract an app id from a Steam store/CDN URL or a bare id: 'https://store.steampowered.com/app/1245620/Elden_Ring/' → 1245620 */
export function steamAppId(input) {
  if (input == null) return null;
  const s = String(input);
  const m = s.match(/store\.steampowered\.com\/app\/(\d+)/) || s.match(/steam\/apps\/(\d+)/) || s.match(/steamcommunity\.com\/app\/(\d+)/) || s.match(/^\s*(\d{1,9})\s*$/);
  return m ? parseInt(m[1], 10) : null;
}
