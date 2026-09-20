/* DeepseekBrain — cloud live mode (?brain=deepseek): the AgentLoop with
 * DeepSeek as the model, called through the /api/chat serverless proxy so
 * the key never touches the browser. Retrieval falls back to keyword search
 * (no local embeddings online). Falls back to Brain (static) on failure.
 *
 *   DeepseekBrain.enabled
 *   await DeepseekBrain.answer(query) → { text, docId? }
 */
const DeepseekBrain = (() => {
  // B13: on a production hostname (not localhost/127.0.0.1) with no explicit
  // ?brain= param, default to deepseek — locally the static brain stays default
  const isLocal = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  const hasBrainParam = /(?:\?|&)brain=/.test(location.search);
  const enabled = /(?:\?|&)brain=deepseek\b/.test(location.search)
               || (!isLocal && !hasBrainParam);

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
    if (disabled) throw new Error('deepseek disabled for session');
    try { return await AgentLoop.answer(q, chat); }
    catch (e) {
      if (/proxy http (404|405)/.test(e.message)) disabled = true;
      throw e;
    }
  }

  return { enabled, answer };
})();
