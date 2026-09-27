/* ApiBrain — cloud live mode: the AgentLoop with DeepSeek as the model
 * (via /api/chat) and /api/recall (hybrid vector + BM25 search over the
 * build-time index) for retrieval. Falls back to Brain (static) on failure.
 *
 *   ApiBrain.enabled
 *   await ApiBrain.answer(query) → { text, docIds: string[] }
 */
const ApiBrain = (() => {
  // enabled wherever /api exists (Vercel, localhost via scripts/dev-server.mjs).
  // GitHub Pages is static-only, so it starts on the static brain instead of
  // spending the first question on a failed POST; ?brain=live overrides that,
  // ?brain=static forces the static, no-network brain anywhere.
  const brainParam = (location.search.match(/(?:\?|&)brain=([\w-]*)/) || [])[1] || null;
  const staticHost = /\.github\.io$/i.test(location.hostname);
  const enabled = brainParam === 'static' ? false : brainParam ? true : !staticHost;

  // a 404/405 from the proxy means this host has no backend at all (e.g.
  // GitHub Pages) — after one such failure, disable for the rest of the
  // session instead of eating a 404 round-trip per question
  let disabled = false;

  // → the assistant message: { content, tool_calls? }
  async function chat(messages) {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages })
    });
    if (!res.ok) throw new Error('proxy http ' + res.status);
    const data = await res.json();
    if (data.error) throw new Error(typeof data.error === 'string' ? data.error : JSON.stringify(data.error));
    const msg = data.choices && data.choices[0] && data.choices[0].message;
    if (!msg || (!(msg.content || '').trim() && !(msg.tool_calls || []).length)) {
      throw new Error('empty deepseek response');
    }
    return msg;
  }

  async function answer(q) {
    if (disabled) throw new Error('api brain disabled for session');
    try { return await AgentLoop.answer(q, chat); }
    catch (e) {
      if (/proxy http (404|405)/.test(e.message)) disabled = true;
      throw e;
    }
  }

  return { enabled, answer };
})();
