/* DeepseekBrain — cloud live mode (?brain=deepseek): the AgentLoop with
 * DeepSeek as the model, called through the /api/chat serverless proxy so
 * the key never touches the browser. Retrieval falls back to keyword search
 * (no local embeddings online). Falls back to Brain (static) on failure.
 *
 *   DeepseekBrain.enabled
 *   await DeepseekBrain.answer(query) → { text, docId? }
 */
const DeepseekBrain = (() => {
  const enabled = /(?:\?|&)brain=deepseek\b/.test(location.search);

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

  return { enabled, answer: q => AgentLoop.answer(q, chat) };
})();
