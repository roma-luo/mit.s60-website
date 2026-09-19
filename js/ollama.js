/* OllamaBrain — live mode (?brain=ollama): a hand-written agent loop around a
 * local LLM (qwen2.5:7b). The harness carries ONLY the persona and the tool
 * protocol; all course content lives in memory and the agent retrieves it
 * itself, via tools:
 *
 *   recall(query) — semantic search over long-term memory (Rag, or keyword
 *                   fallback if the vector index is unavailable)
 *   show(id)      — pull a memory document out for the visitor to read
 *
 * The loop: observe (user query) → model picks an action (tool call as JSON)
 * → execute tool, feed result back → repeat, until the model answers in plain
 * text or MAX_STEPS is reached. Falls back to Brain (static) on any failure.
 *
 *   OllamaBrain.enabled
 *   await OllamaBrain.answer(query) → { text, docId? }
 */
const OllamaBrain = (() => {
  const enabled = /(?:\?|&)brain=ollama\b/.test(location.search);
  const HOST = 'http://localhost:11434';
  const MODEL = 'qwen2.5:7b';
  const MAX_STEPS = 4;

  async function chat(messages) {
    const res = await fetch(HOST + '/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODEL, messages, stream: false })
    });
    if (!res.ok) throw new Error('ollama http ' + res.status);
    return ((await res.json()).message.content || '').trim();
  }

  function parseToolCall(text) {
    const m = text.match(/\{[^{}]*"tool"[^{}]*\}/);
    if (!m) return null;
    try {
      const call = JSON.parse(m[0]);
      if (call.tool === 'recall' || call.tool === 'show') return call;
    } catch (e) { /* not valid JSON → treat as final answer */ }
    return null;
  }

  async function runRecall(q) {
    const hits = Rag.ready
      ? await Rag.search(q, 3)
      : Memory.search(q).slice(0, 3);
    if (!hits.length) return '(nothing found in memory)';
    const parts = [];
    for (const h of hits) {
      const e = h.entry;
      const body = await Memory.fetchDoc(e);
      parts.push(`[id: ${e.id}] ${e.title}\n${e.answer}\n${body.slice(0, 600)}`);
    }
    return parts.join('\n---\n');
  }

  function systemPrompt() {
    const p = Memory.persona;
    return [
      "You are the digital self of " + p.name + ", a student at " + p.affiliation + ", cross-registered for " + p.course + ".",
      "His course memories live in your long-term memory; you do NOT carry them in this prompt.",
      "Style: " + p.style + ", 2-4 sentences.",
      "",
      "To act, reply with ONLY one JSON object on a single line:",
      '{"tool": "recall", "query": "<search terms>"} — search your long-term memory',
      '{"tool": "show", "id": "<memory id>"} — pull that document out for the visitor',
      "When you have enough to answer, reply in plain text (no JSON).",
      "Recall at least once before answering questions about the course.",
      "If your answer is about a specific memory (a week, a project idea), call show with its id BEFORE giving the plain-text answer."
    ].join('\n');
  }

  async function answer(query) {
    const messages = [
      { role: 'system', content: systemPrompt() },
      { role: 'user', content: query }
    ];
    let docId = null;
    let lastText = '';

    for (let step = 0; step < MAX_STEPS; step++) {
      const text = await chat(messages);
      const call = parseToolCall(text);
      if (!call) return { text, docId };

      lastText = text;
      messages.push({ role: 'assistant', content: text });

      if (call.tool === 'recall') {
        const result = await runRecall(call.query || query);
        messages.push({ role: 'user', content: 'TOOL RESULT (recall):\n' + result });
      } else if (call.tool === 'show') {
        if (Memory.byId(call.id)) {
          docId = call.id;
          messages.push({ role: 'user', content: 'TOOL RESULT (show): "' + call.id + '" is now displayed to the visitor.' });
        } else {
          messages.push({ role: 'user', content: 'TOOL RESULT (show): no memory with id "' + call.id + '". Pick an id from recall results.' });
        }
      }
    }

    // out of steps: force a plain answer
    messages.push({ role: 'user', content: 'Answer the visitor directly now, in plain text, no tools.' });
    const text = await chat(messages);
    return { text: text || lastText || 'Give me a second…', docId };
  }

  return { enabled, answer };
})();
