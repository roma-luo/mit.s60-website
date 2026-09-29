/* AgentLoop — the shared hand-written tool-calling agent loop.
 * Used by ApiBrain (cloud live mode): the brain only supplies its own
 * chat(messages) → assistant message transport. The harness carries ONLY
 * the persona; all course content lives in memory and the agent retrieves
 * it itself — via /api/recall (hybrid vector + BM25 search) when the API is
 * reachable, keyword search over the manifest when it is not.
 *
 * Tools use the model's native function calling (the schema is fixed
 * server-side in api/chat.js): calls arrive as message.tool_calls and each
 * result goes back as a role:"tool" message. The text channel only ever
 * carries the answer, so tool syntax can never leak to the visitor.
 *
 *   await AgentLoop.answer(query, chat) → { text, docIds: string[] }
 */
const AgentLoop = (() => {
  const MAX_STEPS = 5;
  const MAX_SHOWN = 3;
  // the OUTPUT well holds ~128 words (~650 chars) as one paragraph, fewer
  // once split, and its bottom lines sit under the fade: answers aim for
  // 60 words and are held to 450 chars
  const MAX_WORDS = 60;
  const MAX_CHARS = 450;

  function systemPrompt() {
    return [
      "You are Roma Luo. Not a copy, not a digital twin: you are him, on the web.",
      "The long-term memory you can recall is the ONLY thing you know about this course and your work. Answer course/work questions only from it. If something is not in memory, say you do not remember; do not improvise.",
      "Style: cold, terse, minimal. Short sentences. No warmth, no filler, no exclamation marks. Plain text only, no markdown.",
      "Never use em dashes (the characters — or –) in your replies. Use commas, periods, or parentheses instead.",
      "",
      "Tools: recall(query) searches your memory; show(ids) pulls memories out for the visitor.",
      "Recall at least once before answering questions about the course.",
      "If your answer is about specific memories (a week, a project idea), call show with all their ids BEFORE answering.",
      "Each memory you show appears to the visitor as its own card next to your answer. Do not describe the documents in full; summarise, the cards carry the detail.",
      `Length: at most ${MAX_WORDS} words, at most two short paragraphs. Your answer sits in a small window; anything longer is cut off.`
    ].join('\n');
  }

  // a model that slips back into its own tool-call markup instead of the
  // tools API must never have that markup shown or spoken
  const LEAK = /<｜|\|DSML\||<\/?(tool_call|function_call|invoke)\b/i;

  async function runRecall(q) {
    try {
      const r = await fetch(ApiBrain.base + '/api/recall', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q, k: 6 })
      });
      const { hits } = r.ok ? await r.json() : { hits: [] };
      if (hits && hits.length) {
        return hits.map(h => {
          const e = Memory.byId(h.docId);
          return `[id: ${h.docId} | ${e ? e.title : h.docId} > ${h.heading}]\n${h.text}`;
        }).join('\n---\n');
      }
    } catch (e) { /* API unreachable → keyword fallback below */ }
    return keywordRecall(q);
  }

  // offline / API-down path: literal keyword search over the manifest
  async function keywordRecall(q) {
    const hits = Memory.search(q).slice(0, 3);
    if (!hits.length) return '(nothing found in memory)';
    const parts = [];
    for (const h of hits) {
      const e = h.entry;
      const body = await Memory.fetchDoc(e);
      parts.push(`[id: ${e.id}] ${e.title}\n${e.answer}\n${body.slice(0, 600)}`);
    }
    return parts.join('\n---\n');
  }

  // show takes {"ids": [..]} (or a lone {"id"}); ids collect into a set,
  // capped at MAX_SHOWN per answer. The result echoes each shown memory's
  // title + summary, so the agent knows what the visitor is looking at even
  // when recall never surfaced that document's text.
  function runShow(args, docIds) {
    const ids = (Array.isArray(args.ids) ? args.ids : [args.id]).filter(Boolean);
    const added = [], unknown = [], skipped = [];
    for (const id of ids) {
      if (!Memory.byId(id)) { unknown.push(id); continue; }
      if (!docIds.has(id) && docIds.size >= MAX_SHOWN) { skipped.push(id); continue; }
      if (!docIds.has(id)) { docIds.add(id); added.push(id); }
    }
    const lines = added.length
      ? ['Now displayed to the visitor:', ...added.map(id => {
          const e = Memory.byId(id);
          return `- [id: ${id}] ${e.title}: ${e.answer}`;
        })]
      : ['Nothing new displayed.'];
    if (unknown.length) lines.push('No memory with id ' + unknown.join(', ') + '. Pick ids from recall results.');
    if (skipped.length) lines.push('Skipped ' + skipped.join(', ') + ': at most ' + MAX_SHOWN + ' documents per answer.');
    return lines.join('\n');
  }

  async function runTool(call, query, docIds) {
    let args = {};
    try { args = JSON.parse(call.function.arguments || '{}'); } catch (e) { /* bad args → defaults */ }
    if (call.function.name === 'recall') return 'TOOL RESULT (recall):\n' + await runRecall(args.query || query);
    if (call.function.name === 'show') return runShow(args, docIds);
    return 'Unknown tool ' + call.function.name + '. Use recall or show.';
  }

  // the answer must fit the OUTPUT well: one rewrite request if it runs
  // long, then a hard trim at the last whole sentence (never mid-sentence)
  async function fit(text, messages, chat) {
    if (text.length <= MAX_CHARS) return text;
    try {
      const msg = await chat([...messages, { role: 'assistant', content: text },
        { role: 'user', content: `Too long for the window. Rewrite it in under ${MAX_WORDS} words, same facts, same voice, plain text, no tools.` }]);
      const shorter = (msg.content || '').trim();
      if (shorter && !LEAK.test(shorter) && shorter.length < text.length) text = shorter;
    } catch (e) { /* keep the long one and trim it below */ }
    if (text.length <= MAX_CHARS) return text;
    const cut = text.slice(0, MAX_CHARS);
    const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('.\n'), cut.lastIndexOf('? '), cut.lastIndexOf('! '));
    return end > MAX_CHARS * 0.4 ? cut.slice(0, end + 1).trim() : cut.replace(/\s+\S*$/, '') + '…';
  }

  async function answer(query, chat) {
    const messages = [
      { role: 'system', content: systemPrompt() },
      { role: 'user', content: query }
    ];
    const docIds = new Set();

    for (let step = 0; step < MAX_STEPS; step++) {
      const msg = await chat(messages);
      const calls = msg.tool_calls || [];
      const text = (msg.content || '').trim();
      if (!calls.length) {
        if (text && !LEAK.test(text)) return { text: await fit(text, messages, chat), docIds: [...docIds] };
        // leaked tool markup (or nothing): don't show it, ask again
        messages.push({ role: 'assistant', content: text || '(empty)' });
        messages.push({ role: 'user', content: 'Use the tools API for tool calls, never text markup. If you are done, answer the visitor in plain text.' });
        continue;
      }
      messages.push({ role: 'assistant', content: msg.content || '', tool_calls: calls });
      for (const call of calls) {
        messages.push({ role: 'tool', tool_call_id: call.id, content: await runTool(call, query, docIds) });
      }
    }

    // out of steps: force a plain answer
    messages.push({ role: 'user', content: 'Answer the visitor directly now, in plain text, no tools.' });
    const msg = await chat(messages);
    const text = (msg.content || '').trim();
    return {
      text: text && !LEAK.test(text) ? text
          : docIds.size ? 'The cards carry it. Look to the right.' : 'I lost the thread. Ask again.',
      docIds: [...docIds]
    };
  }

  return { answer };
})();
