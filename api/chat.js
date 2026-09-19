/* Vercel serverless function: DeepSeek proxy.
 * The key lives ONLY in env vars (local .env for `vercel dev`, Vercel
 * dashboard for production) — never in client JS, never in the repo.
 *
 *   POST /api/chat  { "messages": [...], ... }  → DeepSeek chat completion
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' });
  }
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) {
    return res.status(500).json({ error: 'DEEPSEEK_API_KEY not set on server' });
  }
  try {
    const upstream = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        ...req.body,
        stream: false
      })
    });
    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch (e) {
    res.status(502).json({ error: 'deepseek upstream failed: ' + String(e) });
  }
}
