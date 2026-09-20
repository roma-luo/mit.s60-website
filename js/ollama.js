/* OllamaBrain — local live mode (?brain=ollama): the AgentLoop with a local
 * model (qwen2.5:7b via Ollama). Falls back to Brain (static) on failure.
 *
 *   OllamaBrain.enabled
 *   await OllamaBrain.answer(query) → { text, docId? }
 */
const OllamaBrain = (() => {
  const enabled = /(?:\?|&)brain=ollama\b/.test(location.search);
  const HOST = 'http://localhost:11434';
  const MODEL = 'qwen2.5:7b';

  async function chat(messages) {
    const res = await fetch(HOST + '/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODEL, messages, stream: false })
    });
    if (!res.ok) throw new Error('ollama http ' + res.status);
    return ((await res.json()).message.content || '').trim();
  }

  return { enabled, answer: q => AgentLoop.answer(q, chat) };
})();
