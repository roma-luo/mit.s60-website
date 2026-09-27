/* Vercel serverless function: DeepSeek proxy.
 * The key lives ONLY in env vars (local .env, Vercel dashboard for
 * production) — never in client JS, never in the repo.
 *
 *   POST /api/chat  { "messages": [...] }  → DeepSeek chat completion
 *
 * Only messages pass through; model, sampling and the tool schema are fixed
 * here, so the client cannot turn this into a general-purpose LLM proxy
 * (B14). The agent's tools use DeepSeek's native function calling: calls
 * come back as structured message.tool_calls, never as markup in the text.
 * Naive per-IP rate limit + payload caps keep a leaked URL from burning
 * the key.
 */
const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'recall',
      description: 'Search your long-term memory. Returns matching passages, each tagged [id: …].',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string', description: 'search terms' } },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'show',
      description: 'Pull one or more memories out for the visitor; each appears as its own card next to your answer. Ids come from recall results.',
      parameters: {
        type: 'object',
        properties: { ids: { type: 'array', items: { type: 'string' }, description: 'memory ids' } },
        required: ['ids']
      }
    }
  }
];

const RATE = 40;              // requests per IP per window (one answer ≈ 3–5 calls)
const WINDOW_MS = 60000;
const MAX_MESSAGES = 24;
const MAX_CHARS = 60000;
const ROLES = new Set(['system', 'user', 'assistant', 'tool']);
const buckets = new Map();

function limited(ip) {
  const now = Date.now();
  const b = buckets.get(ip) || { t: now, n: 0 };
  if (now - b.t > WINDOW_MS) { b.t = now; b.n = 0; }
  b.n += 1;
  buckets.set(ip, b);
  return b.n > RATE;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' });
  }
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) {
    return res.status(500).json({ error: 'DEEPSEEK_API_KEY not set on server' });
  }
  const ip = String(req.headers['x-forwarded-for'] || (req.socket && req.socket.remoteAddress) || 'anon')
    .split(',')[0].trim();
  if (limited(ip)) return res.status(429).json({ error: 'rate limited' });

  const messages = req.body && req.body.messages;
  if (!Array.isArray(messages) || !messages.length || messages.length > MAX_MESSAGES ||
      !messages.every(m => m && ROLES.has(m.role)) ||
      JSON.stringify(messages).length > MAX_CHARS) {
    return res.status(400).json({ error: 'messages[] required (≤' + MAX_MESSAGES + ' messages, ≤' + MAX_CHARS + ' chars)' });
  }
  try {
    const upstream = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`
      },
      body: JSON.stringify({
        model: 'deepseek-v4-flash',
        messages,
        tools: TOOLS,
        temperature: 0.7,
        max_tokens: 400,
        stream: false,
        thinking: { type: 'disabled' }   // v4-flash defaults to thinking on; we want plain fast replies
      })
    });
    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch (e) {
    res.status(502).json({ error: 'deepseek upstream failed: ' + String(e) });
  }
}
