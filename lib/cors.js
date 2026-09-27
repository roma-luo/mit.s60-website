/* cors.js — the static front end on GitHub Pages calls this backend
 * cross-origin. Only the listed origins (plus localhost for dev) get CORS
 * headers, so no other site can spend the DeepSeek key from a browser.
 *
 *   if (cors(req, res)) return;   // at the top of a handler: true = preflight answered
 */
const ALLOWED = new Set([
  'https://mitmedialab.github.io'
]);
const LOCAL = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

export function cors(req, res) {
  const origin = req.headers.origin;
  if (origin && (ALLOWED.has(origin) || LOCAL.test(origin))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Max-Age', '86400');
  }
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true;
  }
  return false;
}
