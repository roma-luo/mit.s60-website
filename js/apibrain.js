/* ApiBrain — cloud live mode: the AgentLoop with DeepSeek as the model
 * (via /api/chat) and /api/recall (hybrid vector + BM25 search over the
 * build-time index) for retrieval. Falls back to Brain (static) on failure.
 *
 *   ApiBrain.enabled
 *   await ApiBrain.answer(query) → { text, docIds: string[] }
 */
const ApiBrain = (() => {
  // enabled: anything except ?brain=static. No param → production hostnames
  // default live, localhost stays static (the existing B13 logic).
  const isLocal = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  const brainParam = (location.search.match(/(?:\?|&)brain=([\w-]*)/) || [])[1] || null;
  const enabled = brainParam === 'static' ? false
                : brainParam ? true
                : !isLocal;

  // a 404/405 from the proxy means this host has no backend at all (e.g.
  // GitHub Pages) — after one such failure, disable for the rest of the
  // session instead of eating a 404 round-trip per question
  let disabled = false;

  async function chat(messages) {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages })
    });
    if (!res.ok) throw new Error('proxy http ' + res.status);
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    const text = ((data.choices && data.choices[0] && data.choices[0].message.content) || '').trim();
    if (!text) throw new Error('empty deepseek response');
    return text;
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
