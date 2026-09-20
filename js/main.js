/* main — boot and UI wiring for the node-graph layout.
 * Exposes the UI object used by Agent:
 *   UI.setState(st)            — LED + INPUT Status meta
 *   UI.setAnswer(res, entry)   — rebuild the OUTPUT node body
 *   UI.setLastQuery(q)         — INPUT meta third row
 *   UI.openDoc(entry) / UI.closeDoc()
 *   UI.showIndex() / UI.hideIndex()
 */

const LABELS = {
  input: 'S60-IN',
  self: 'S60-SELF',
  output: n => 'S60-OUT-' + String(n).padStart(2, '0'),
  mem: id => 'S60-MEM-' + String(id).toUpperCase()
};

const UI = (() => {
  const $ = id => document.getElementById(id);
  let answerCount = 0;
  let answerEl = null;
  let answerText = '';
  let revealTimer = null;

  function metaRow(key, value) {
    const row = document.createElement('div');
    row.className = 'meta-row';
    const k = document.createElement('span');
    k.textContent = key + ':';
    const v = document.createElement('b');
    v.textContent = value;
    row.appendChild(k);
    row.appendChild(v);
    return row;
  }

  /* URL of a memory document itself — used as Markdown baseUrl so relative
   * images/links inside the doc resolve correctly from any subpath. */
  function docBaseUrl(entry) {
    return new URL(entry.file, document.baseURI).href;
  }

  /* ---- state → UI (§6): SELF LED, INPUT Status meta, wire flow, OUTPUT dim */
  function setState(st) {
    $('self-led').dataset.state = st === 'showing' ? 'idle' : st;
    $('input-status').textContent = st === 'showing' ? 'idle' : st;
    $('wire-in').classList.toggle('flow', st === 'thinking');
    $('wire-out').classList.toggle('flow', st === 'speaking');
    $('output-body').classList.toggle('thinking', st === 'thinking');
  }

  function setMode(mode) {
    $('input-mode').textContent = mode;
  }

  function setLastQuery(q) {
    const meta = $('input-meta');
    let row = $('input-last-row');
    if (!row) {
      row = metaRow('Last', '');
      row.id = 'input-last-row';
      meta.appendChild(row);
    }
    row.querySelector('b').textContent = q.length > 60 ? q.slice(0, 60) + '…' : q;
  }

  function buildSelfMeta() {
    const p = Memory.persona;
    const client = (p.course || '').split(/[,(]/)[0].trim().replace(/\s+at\s+the\s+/i, ' · ')
      || 'MAS.S60 · MIT Media Lab';
    let maxWeek = 0;
    for (const e of Memory.entries) {
      const m = (e.section || '').match(/week\s*(\d+)/i);
      if (m) maxWeek = Math.max(maxWeek, +m[1]);
    }
    const meta = $('self-meta');
    meta.appendChild(metaRow('Project', 'Digital Self'));
    meta.appendChild(metaRow('Client', client));
    meta.appendChild(metaRow('Design phase', maxWeek ? 'Week ' + maxWeek : '—'));
    meta.appendChild(metaRow('Image type', Face === FaceVideo ? 'Video loop' : 'Procedural canvas'));
  }

  /* ---- wires: bezier paths between node edge midpoints (§5.1) */
  function setWire(name, x1, y1, x2, y2, vertical) {
    const d = vertical
      ? `M ${x1} ${y1} C ${x1} ${y1 + (y2 - y1) * 0.5}, ${x2} ${y2 - (y2 - y1) * 0.5}, ${x2} ${y2}`
      : `M ${x1} ${y1} C ${x1 + (x2 - x1) * 0.5} ${y1}, ${x2 - (x2 - x1) * 0.5} ${y2}, ${x2} ${y2}`;
    $(name).setAttribute('d', d);
    const a = $(name + '-a');
    const b = $(name + '-b');
    a.setAttribute('cx', x1); a.setAttribute('cy', y1);
    b.setAttribute('cx', x2); b.setAttribute('cy', y2);
  }

  function updateWires() {
    const svg = $('wires');
    svg.setAttribute('viewBox', `0 0 ${window.innerWidth} ${window.innerHeight}`);
    const ri = $('node-input').getBoundingClientRect();
    const rs = $('node-self').getBoundingClientRect();
    const ro = $('node-output').getBoundingClientRect();
    if (window.innerWidth < 700) {
      // mobile stacks SELF → OUTPUT → INPUT: same bezier, vertical axis (§7)
      setWire('wire-in', rs.left + rs.width / 2, rs.bottom, ro.left + ro.width / 2, ro.top, true);
      setWire('wire-out', ro.left + ro.width / 2, ro.bottom, ri.left + ri.width / 2, ri.top, true);
    } else {
      // INPUT right-edge midpoint → SELF left-edge midpoint; SELF → OUTPUT same
      setWire('wire-in', ri.right, ri.top + ri.height / 2, rs.left, rs.top + rs.height / 2);
      setWire('wire-out', rs.right, rs.top + rs.height / 2, ro.left, ro.top + ro.height / 2);
    }
  }

  /* ---- OUTPUT node */
  async function setAnswer(res, entry, opts = {}) {
    stopReveal();
    answerCount++;
    $('output-label').textContent = LABELS.output(answerCount);
    $('output-led').dataset.state = 'idle'; // has content: white dot
    $('node-output').dataset.label = LABELS.output(answerCount);

    const body = $('output-body');
    body.classList.remove('thinking');
    body.innerHTML = '';
    answerEl = null;
    answerText = res.text || '';

    // §4.3 three forms: text only / image dominant (short text moves to meta)
    // / image + text — picked from whether the doc has a first image
    let imgUrl = null;
    if (entry) {
      try { imgUrl = await Memory.firstImage(entry); } catch (e) { imgUrl = null; }
    }
    const imgOnly = !!imgUrl && answerText.length > 0 && answerText.length < 40;

    if (imgUrl) {
      const img = document.createElement('img');
      img.src = imgUrl;
      img.alt = entry.title;
      img.className = 'answer-img' + (imgOnly ? '' : ' answer-img--with-text');
      body.appendChild(img);
    }
    if (!imgOnly) {
      const p = document.createElement('p');
      p.className = 'answer';
      p.textContent = opts.reveal ? '' : answerText;
      body.appendChild(p);
      answerEl = p;
    }

    const meta = $('output-meta');
    const more = $('output-more');
    meta.innerHTML = '';
    if (entry) {
      if (imgOnly) meta.appendChild(metaRow('Note', answerText));
      meta.appendChild(metaRow('Memory', entry.title));
      meta.appendChild(metaRow('Section', entry.section));
      meta.appendChild(metaRow('Source', entry.file));
      meta.classList.remove('hidden');
      more.classList.remove('hidden');
      more.onclick = ev => { ev.preventDefault(); openDoc(entry); };
    } else {
      meta.classList.add('hidden');
      more.classList.add('hidden');
    }

    // new answer enters with a 120ms opacity fade, no sliding
    body.classList.remove('fade-in');
    void body.offsetWidth;
    body.classList.add('fade-in');
    updateWires();
  }

  /* ---- typewriter reveal (§4.3): speech-boundary driven (charIndex) with a
   * uniform fallback pace; the two merge by taking the furthest position.
   * onEnd → finishReveal shows everything. */
  function startReveal(text, estMs) {
    answerText = text;
    stopReveal();
    if (!answerEl) return;
    const t0 = performance.now();
    revealTimer = setInterval(() => {
      const p = Math.min(1, (performance.now() - t0) / Math.max(1, estMs));
      revealAnswer(Math.floor(p * answerText.length));
      if (p >= 1) stopReveal();
    }, 50);
  }

  function revealAnswer(n) {
    if (!answerEl) return;
    const next = Math.max(answerEl.textContent.length, Math.min(n, answerText.length));
    answerEl.textContent = answerText.slice(0, next);
  }

  function finishReveal() {
    stopReveal();
    if (answerEl) answerEl.textContent = answerText;
  }

  function stopReveal() {
    if (revealTimer) { clearInterval(revealTimer); revealTimer = null; }
  }

  /* ---- doc overlay */
  async function openDoc(entry) {
    $('doc-label').textContent = LABELS.mem(entry.id);
    const body = $('doc-body');
    body.innerHTML = '<p>recalling…</p>';
    const meta = $('doc-meta');
    meta.innerHTML = '';
    meta.appendChild(metaRow('Memory', entry.title));
    meta.appendChild(metaRow('Section', entry.section));
    meta.appendChild(metaRow('Source', entry.file));
    $('doc-mask').classList.remove('hidden');
    $('doc-overlay').classList.remove('hidden');
    try {
      const md = await Memory.fetchDoc(entry);
      body.innerHTML = Markdown.render(md, { baseUrl: docBaseUrl(entry) });
      body.scrollTop = 0;
    } catch (err) {
      body.innerHTML = '<p>(this memory could not be loaded)</p>';
    }
  }

  function closeDoc() {
    $('doc-overlay').classList.add('hidden');
    $('doc-mask').classList.add('hidden');
  }

  /* ---- index overlay */
  function showIndex() {
    buildIndex();
    $('index-overlay').classList.remove('hidden');
  }

  function hideIndex() {
    $('index-overlay').classList.add('hidden');
  }

  function buildIndex() {
    $('index-title').textContent = 'INDEX · ' + Memory.entries.length + ' memories';
    const grid = $('index-grid');
    grid.innerHTML = '';
    for (const e of Memory.entries) {
      const card = document.createElement('section');
      card.className = 'node index-card';

      const head = document.createElement('header');
      head.className = 'node__head';
      const label = document.createElement('span');
      label.className = 'node__label';
      label.textContent = LABELS.mem(e.id);
      head.appendChild(label);

      const body = document.createElement('div');
      body.className = 'node__body';
      body.textContent = e.section; // fallback: section letters as placeholder
      Memory.firstImage(e).then(url => {
        if (!url) return;
        body.textContent = '';
        body.classList.add('has-image');
        const img = document.createElement('img');
        img.src = url;
        img.alt = e.title;
        body.appendChild(img);
      });

      const meta = document.createElement('footer');
      meta.className = 'node__meta';
      meta.appendChild(metaRow('Title', e.title));
      meta.appendChild(metaRow('Section', e.section));

      const more = document.createElement('a');
      more.className = 'node__more';
      more.href = '#';
      more.textContent = 'See more';

      card.appendChild(head);
      card.appendChild(body);
      card.appendChild(meta);
      card.appendChild(more);
      card.addEventListener('click', ev => {
        ev.preventDefault();
        hideIndex();
        Agent.showEntry(e);
      });
      grid.appendChild(card);
    }
  }

  return {
    setState, setMode, setLastQuery, buildSelfMeta,
    setAnswer, startReveal, revealAnswer, finishReveal,
    openDoc, closeDoc, showIndex, hideIndex, updateWires
  };
})();

window.addEventListener('DOMContentLoaded', async () => {
  const portrait = document.getElementById('portrait');
  if (typeof FaceVideo !== 'undefined' && await FaceVideo.available()) {
    Face = FaceVideo; // swap point: video loops replace the procedural face
    console.info('face renderer: video loops');
  } else {
    console.info('face renderer: procedural canvas (video clips not found)');
  }
  Face.init(portrait);

  const outputBody = document.getElementById('output-body');
  try {
    await Memory.load();
  } catch (err) {
    console.error(err);
    outputBody.innerHTML = '<p class="placeholder">my memory failed to load — serve this folder over http (see README)</p>';
    return;
  }

  if (OllamaBrain.enabled) {
    console.info('live brain mode: ollama');
    Rag.init()
      .then(() => console.info('vector memory ready (' + Memory.entries.length + ' memories)'))
      .catch(err => console.warn('vector memory unavailable, agent will use keyword search:', err));
  }
  if (DeepseekBrain.enabled) console.info('live brain mode: deepseek (cloud)');

  UI.setMode(DeepseekBrain.enabled ? 'live·deepseek'
           : OllamaBrain.enabled ? 'live·ollama'
           : 'static');
  UI.buildSelfMeta();

  // wires: recompute on resize, scroll, font load, video metadata (face:ready),
  // and whenever a node's box changes
  window.addEventListener('resize', UI.updateWires);
  window.addEventListener('scroll', UI.updateWires, { passive: true });
  document.addEventListener('face:ready', UI.updateWires);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(UI.updateWires);
  const nodeObserver = new ResizeObserver(UI.updateWires);
  ['node-input', 'node-self', 'node-output'].forEach(id => nodeObserver.observe(document.getElementById(id)));
  UI.updateWires();

  const input = document.getElementById('query');

  // mobile: textarea shrinks to 2 rows (§7)
  const mqMobile = window.matchMedia('(max-width: 699px)');
  const applyRows = () => { input.rows = mqMobile.matches ? 2 : 4; };
  mqMobile.addEventListener('change', applyRows);
  applyRows();

  input.addEventListener('keydown', ev => {
    if (ev.key === 'Enter' && !ev.shiftKey) {
      ev.preventDefault();
      const q = input.value;
      input.value = '';
      Agent.handle(q);
    }
  });

  // global keys: Esc closes overlays & stops speech; "/" focuses the input
  window.addEventListener('keydown', ev => {
    if (ev.key === 'Escape') {
      UI.closeDoc();
      UI.hideIndex();
      Agent.cancel();
      return;
    }
    if (ev.key === '/' && !ev.metaKey && !ev.ctrlKey &&
        !/^(TEXTAREA|INPUT)$/.test(ev.target.tagName)) {
      ev.preventDefault();
      input.focus();
    }
  });

  const micBtn = document.getElementById('mic-btn');
  if (!Voice.sttSupported) {
    micBtn.style.display = 'none';
  } else {
    micBtn.addEventListener('click', () => {
      micBtn.classList.add('listening');
      Agent.setState('listening');
      Voice.listen({
        onResult: text => { input.value = text; },
        onEnd: () => {
          micBtn.classList.remove('listening');
          Agent.setState('idle');
          if (input.value.trim()) {
            const q = input.value;
            input.value = '';
            Agent.handle(q);
          }
        }
      });
    });
  }

  document.getElementById('index-dot').addEventListener('click', () => {
    Agent.cancel();
    UI.showIndex();
  });
  document.getElementById('index-overlay').addEventListener('click', ev => {
    if (!ev.target.closest('.node')) UI.hideIndex();
  });
  document.getElementById('doc-close').addEventListener('click', () => UI.closeDoc());
  document.getElementById('doc-mask').addEventListener('click', () => UI.closeDoc());
});
