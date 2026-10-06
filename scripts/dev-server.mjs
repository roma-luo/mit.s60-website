/* dev-server.mjs: local server without `vercel dev`: serves the static
 * site and mounts api/*.js with a minimal Vercel-style req/res shim, so the
 * local site runs the same live brain (DeepSeek via /api/chat) as production.
 * Reads .env from the project root. Zero dependencies.
 *
 *   node scripts/dev-server.mjs [port]     (default 8000)
 */
import http from 'node:http';
import { stat } from 'node:fs/promises';
import { createReadStream, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = parseInt(process.argv[2] || process.env.PORT || '8000', 10);

// .env → process.env (existing env vars win)
const envPath = path.join(ROOT, '.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}
if (!process.env.DEEPSEEK_API_KEY) console.warn('warning: DEEPSEEK_API_KEY not set: /api/chat will return 500');

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.md': 'text/markdown; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.svg': 'image/svg+xml', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mp3': 'audio/mpeg', '.wav': 'audio/wav',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8'
};

function shim(res) {
  res.status = code => { res.statusCode = code; return res; };
  res.json = obj => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(obj));
    return res;
  };
  return res;
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString('utf8');
  try { return raw ? JSON.parse(raw) : {}; } catch { return {}; }
}

async function handleApi(req, res, name) {
  const file = path.join(ROOT, 'api', name + '.js');
  if (!/^[\w-]+$/.test(name) || !existsSync(file)) return shim(res).status(404).json({ error: 'no such api' });
  // ?v=mtime: an edited handler is re-imported without restarting the server
  const { default: handler } = await import(pathToFileURL(file).href + '?v=' + (await stat(file)).mtimeMs);
  req.body = await readBody(req);
  await handler(req, shim(res));
}

// Last-Modified feeds SELF's "Memory Updated" row; Range is what lets
// browsers seek video (Safari will not play an mp4 at all without it)
async function handleStatic(req, res, urlPath) {
  let rel = decodeURIComponent(urlPath);
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.normalize(path.join(ROOT, rel));
  if (!file.startsWith(ROOT + path.sep) || /[\\/]\.(env|git)/.test(file.slice(ROOT.length))) {
    res.statusCode = 403; return res.end('forbidden');
  }
  let st;
  try { st = await stat(file); } catch { st = null; }
  if (!st || !st.isFile()) { res.statusCode = 404; return res.end('not found'); }

  res.setHeader('Content-Type', TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Last-Modified', st.mtime.toUTCString());
  res.setHeader('Accept-Ranges', 'bytes');
  let start = 0, end = st.size - 1;
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
  if (range && (range[1] || range[2])) {
    if (range[1]) { start = +range[1]; if (range[2]) end = Math.min(+range[2], end); }
    else start = Math.max(0, st.size - +range[2]);   // suffix range: last N bytes
    if (start > end) {
      res.statusCode = 416;
      res.setHeader('Content-Range', `bytes */${st.size}`);
      return res.end();
    }
    res.statusCode = 206;
    res.setHeader('Content-Range', `bytes ${start}-${end}/${st.size}`);
  }
  res.setHeader('Content-Length', end - start + 1);
  if (req.method === 'HEAD' || st.size === 0) return res.end();
  await new Promise((resolve, reject) => {
    createReadStream(file, { start, end }).on('error', reject).on('end', resolve).pipe(res);
  });
}

http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');
  try {
    const api = pathname.match(/^\/api\/([^/]+?)\/?$/);
    if (api) await handleApi(req, res, api[1]);
    else await handleStatic(req, res, pathname);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) shim(res).status(500).json({ error: String(e) });
  }
  console.log(`${res.statusCode} ${req.method} ${pathname}`);
}).listen(PORT, '127.0.0.1', () => {
  console.log(`s60-webpage (live brain: DeepSeek) → http://localhost:${PORT}`);
});
