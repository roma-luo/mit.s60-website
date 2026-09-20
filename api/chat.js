/* Vercel serverless function: DeepSeek proxy.
 * The key lives ONLY in env vars (local .env for `vercel dev`, Vercel
 * dashboard for production) — never in client JS, never in the repo.
 *
 *   POST /api/chat  { "messages": [...] }  → DeepSeek chat completion
 *   (only messages pass through; model/temperature/max_tokens are fixed here)
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
    // B14: only messages pass through; the client cannot override the model
    const messages = req.body && req.body.messages;
    if (!Array.isArray(messages)) {
      return res.status(400).json({ error: 'messages[] required' });
    }
    const upstream = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages,
        temperature: 0.7,
        max_tokens: 400,
        stream: false
      })
    });
    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch (e) {
    res.status(502).json({ error: 'deepseek upstream failed: ' + String(e) });
  }
}
