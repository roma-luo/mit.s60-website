/* main — boot and UI wiring for the node-board layout.
 * Exposes the UI object used by Agent:
 *   UI.setState(st)              — LED states, wire flow, running-module rim
 *   UI.setAnswer(res, opts)      — fill the OUTPUT well (+ typewriter reveal)
 *   UI.spawnChildren(entries, round) / UI.cancelSpawn() / UI.collapseChildren()
 *   UI.setMode(mode)             — INPUT meta Mode row
 *   UI.showIndex() / UI.hideIndex()
 * The three windows (INPUT / SELF / OUTPUT) and every spawned child are free
 * bodies on the board; js/canvas.js owns dragging, zoom, pan and wires.
 */

const LABELS = {
  input: 's60-in',
  self: 's60-self',
  out: 's60-out',
  output: n => 's60-out-' + String(n).padStart(2, '0'),
  child: entry => 's60-out-' + Memory.label(entry).toLowerCase(),
  video: (entry, att) => 's60-out-' + Memory.label({ title: entry.section }).toLowerCase() + ' · ' + attachmentLabel(att).toLowerCase(),
  attach: (entry, att) => LABELS.child(entry) + ' · ' + att.split('/').pop().replace(/\.[^.]*$/, '').split('-').pop(),
  mem: id => 's60-mem-' + String(id).toLowerCase()
};

// attachment label from the filename: strip extension, split on '-', drop a
// leading "recording" token, uppercase the rest + RECORDING
function attachmentLabel(att) {
  const stem = att.split('/').pop().replace(/\.[^.]*$/, '');
  const parts = stem.split('-');
  if (parts[0] && parts[0].toLowerCase() === 'recording') parts.shift();
  return (parts.join(' ').toUpperCase() + ' RECORDING').trim();
}

const UI = (() => {
  const $ = id => document.getElementById(id);
  let answerCount = 0;
  let answerEl = null;
  let answerText = '';
  let revealTimer = null;
  let spawnGen = 0;
  let spawnRound = null;
  let outputExpander = null;
  const expanders = new Map(); // child element → well expander

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

  /* ---- state → UI: SELF LED, INPUT Status, wire flow, running-module rim */
  function setState(st) {
    $('self-led').dataset.state = st === 'showing' ? 'idle' : st;
    $('input-status').textContent = st === 'showing' ? 'idle' : st;
    if (typeof Canvas !== 'undefined') {
      Canvas.setFlow('wire-in', st === 'thinking');
      Canvas.setFlow('wire-out', st === 'speaking');
    }
    // ComfyUI-style: the running module's rim brightens
    const active = { listening: 'node-input', thinking: 'node-self', speaking: 'node-output' }[st] || null;
    for (const id of ['node-input', 'node-self', 'node-output']) {
      $(id).classList.toggle('active', id === active);
    }
  }

  function setMode(mode) {
    $('input-mode').textContent = mode;
  }

  async function lastModified(url) {
    try {
      const r = await fetch(url, { method: 'HEAD', cache: 'no-store' });
      const lm = r.headers.get('Last-Modified');
      if (!lm) return '—';
      const d = new Date(lm);
      const pad = n => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    } catch (e) { return '—'; }
  }

  async function buildSelfMeta() {
    const meta = $('self-meta');
    meta.appendChild(metaRow('Name', 'romaluo.digital'));
    meta.appendChild(metaRow('Memory Updated', await lastModified('content/manifest.json')));
  }

  /* ---- OUTPUT well (long-text window) */
  async function setAnswer(res, opts = {}) {
    stopReveal();
    answerCount++;
    $('output-label').textContent = LABELS.output(answerCount);
    $('node-output').dataset.label = LABELS.output(answerCount);
    $('output-led').dataset.state = 'idle'; // has content: lit

    const wellText = $('output-text');
    wellText.innerHTML = '';
    answerText = res.text || '';
    const p = document.createElement('p');
    p.className = 'answer';
    p.textContent = opts.reveal ? '' : answerText;
    wellText.appendChild(p);
    answerEl = p;

    const meta = $('output-meta');
    meta.innerHTML = '';
    meta.appendChild(metaRow('Artifact', opts.entry ? opts.entry.title : 'answer'));
    meta.appendChild(metaRow('Type', 'text / plain'));

    if (typeof Canvas !== 'undefined') Canvas.refreshPorts($('node-output'));
    if (outputExpander) outputExpander.measure();
  }

  /* ---- typewriter reveal: speech-boundary driven (charIndex) with a uniform
   * fallback pace; the two merge by taking the furthest position.
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

  /* ---- long-text wells: expand / collapse (R5 fit rule, R7 pin-px) */
  function initWellExpand(card, onFirstExpand) {
    const btn = card.querySelector('.node__more');
    const well = card.querySelector('.well');
    const text = card.querySelector('.well__text');
    const label = btn.querySelector('.btn__label');
    let open = false;

    // only offer expand when the text really overruns its 4:3 well
    const measure = () => {
      if (open) return;
      const fits = text.scrollHeight <= well.clientHeight + 1;
      if (card.classList.contains('is-fit') !== fits) {
        card.classList.toggle('is-fit', fits);
      }
    };
    measure();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);

    btn.addEventListener('click', async () => {
      if (!open && onFirstExpand) await onFirstExpand();
      // offsetHeight / clientWidth are layout px — unaffected by zoom or lean
      const from = well.offsetHeight;
      open = !open;
      const to = open ? text.scrollHeight : well.clientWidth * 3 / 4;
      well.style.aspectRatio = 'auto';         // aspect-ratio can't animate: pin px first
      well.style.height = from + 'px';
      void well.offsetHeight;
      well.classList.toggle('is-open', open);
      btn.classList.toggle('is-open', open);
      btn.setAttribute('aria-expanded', String(open));
      label.textContent = open ? 'collapse' : 'expand';
      well.style.height = to + 'px';
      if (typeof Canvas !== 'undefined') Canvas.reflow(480); // 420ms + a frame or two
    });
    well.addEventListener('transitionend', e => {
      if (e.propertyName !== 'height' || open) return;
      well.style.aspectRatio = '4 / 3';        // hand the box back to the ratio
      well.style.height = '';
      measure();
    });
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(measure).observe(text);

    return { measure, isOpen: () => open, collapse: () => { if (open) btn.click(); } };
  }

  /* ---- child windows: the documents an answer brings out */
  function buildChild(entry) {
    const card = document.createElement('section');
    card.className = 'node node--long child';
    card.id = 'c-' + entry.id;
    card.dataset.id = entry.id;

    const head = document.createElement('header');
    head.className = 'node__head';
    const label = document.createElement('span');
    label.className = 'node__label';
    label.textContent = LABELS.child(entry);
    const close = document.createElement('button');
    close.className = 'node__close';
    close.setAttribute('aria-label', 'dismiss');
    close.addEventListener('click', ev => { ev.stopPropagation(); dismissChild(card); });
    head.appendChild(label);
    head.appendChild(close);

    const body = document.createElement('div');
    body.className = 'node__body';
    const well = document.createElement('div');
    well.className = 'well';
    const wellText = document.createElement('div');
    wellText.className = 'well__text';
    const p = document.createElement('p');
    p.textContent = 'recalling…';
    wellText.appendChild(p);
    well.appendChild(wellText);
    body.appendChild(well);
    Memory.excerpt(entry).then(t => { if (!card.dataset.full) p.textContent = t || entry.answer; });

    const meta = document.createElement('footer');
    meta.className = 'node__meta';
    const rows = document.createElement('div');
    rows.className = 'meta-rows';
    rows.appendChild(metaRow('Artifact', entry.title));
    rows.appendChild(metaRow('Type', 'text / markdown'));
    const more = document.createElement('button');
    more.className = 'btn node__more';
    more.type = 'button';
    more.setAttribute('aria-expanded', 'false');
    more.innerHTML = '<span class="btn__dot"></span><span class="btn__label">expand</span>';
    meta.appendChild(rows);
    meta.appendChild(more);

    card.appendChild(head);
    card.appendChild(body);
    card.appendChild(meta);

    expanders.set(card, initWellExpand(card, async () => {
      // first expand: swap the excerpt for the full markdown document
      card.dataset.full = '1';
      try {
        const md = await Memory.fetchDoc(entry);
        wellText.innerHTML = Markdown.render(md, { baseUrl: docBaseUrl(entry) });
      } catch (err) {
        wellText.innerHTML = '<p>(this memory could not be loaded)</p>';
      }
    }));
    return card;
  }

  // proposals are short text: no well, no expand — the one-paragraph answer
  // sits on the face (the INPUT window's design), wired straight to its image
  const SHORT_SECTIONS = new Set(['final project']);
  const isShort = entry => SHORT_SECTIONS.has(entry.section);

  function buildShortChild(entry) {
    const card = document.createElement('section');
    card.className = 'node node--short child';
    card.id = 'c-' + entry.id;
    card.dataset.id = entry.id;

    const head = document.createElement('header');
    head.className = 'node__head';
    const label = document.createElement('span');
    label.className = 'node__label';
    label.textContent = LABELS.child(entry);
    const close = document.createElement('button');
    close.className = 'node__close';
    close.setAttribute('aria-label', 'dismiss');
    close.addEventListener('click', ev => { ev.stopPropagation(); dismissChild(card); });
    head.appendChild(label);
    head.appendChild(close);

    const body = document.createElement('div');
    body.className = 'node__body';
    const p = document.createElement('p');
    p.className = 'short__text';
    p.textContent = entry.answer;
    body.appendChild(p);

    const meta = document.createElement('footer');
    meta.className = 'node__meta';
    const rows = document.createElement('div');
    rows.className = 'meta-rows';
    rows.appendChild(metaRow('Artifact', entry.title));
    rows.appendChild(metaRow('Type', 'text / proposal'));
    meta.appendChild(rows);

    card.appendChild(head);
    card.appendChild(body);
    card.appendChild(meta);
    return card;
  }

  // one small media window per attachment, spawned right after its parent doc
  function buildAttachmentChild(entry, att) {
    const ext = ((att.match(/\.([a-z0-9]+)$/i) || [])[1] || '').toLowerCase();
    const isImage = ['jpg', 'jpeg', 'png', 'webp'].includes(ext);
    const dir = entry.file.split('/').slice(0, -1).join('/');
    const url = new URL(att, new URL(entry.file, document.baseURI)).href;

    const card = document.createElement('section');
    card.className = 'node node--image child';
    card.id = 'c-' + entry.id + '#' + att;
    card.dataset.id = entry.id + '#' + att;

    const head = document.createElement('header');
    head.className = 'node__head';
    const label = document.createElement('span');
    label.className = 'node__label';
    label.textContent = isImage ? LABELS.attach(entry, att) : LABELS.video(entry, att);
    const close = document.createElement('button');
    close.className = 'node__close';
    close.setAttribute('aria-label', 'dismiss');
    close.addEventListener('click', ev => { ev.stopPropagation(); dismissChild(card); });
    head.appendChild(label);
    head.appendChild(close);

    const body = document.createElement('div');
    body.className = 'node__body';
    const frame = document.createElement('div');
    frame.className = 'portrait media';
    // the frame follows the media's natural aspect; mediaReady lets the
    // spawn layout wait for real heights (resolves on error too)
    const fitAspect = (w, h) => { if (w && h) frame.style.setProperty('--media-ar', w + ' / ' + h); };
    if (isImage) {
      const img = document.createElement('img');
      img.alt = entry.title;
      img.draggable = false;
      card.mediaReady = new Promise(resolve => {
        img.onload = () => { fitAspect(img.naturalWidth, img.naturalHeight); resolve(); };
        img.onerror = resolve;
      });
      img.src = url;
      frame.appendChild(img);
    } else {
      const video = document.createElement('video');
      video.controls = true;
      video.preload = 'metadata';
      video.playsInline = true;
      video.draggable = false;
      card.mediaReady = new Promise(resolve => {
        video.onloadedmetadata = () => { fitAspect(video.videoWidth, video.videoHeight); resolve(); };
        video.onerror = resolve;
      });
      video.src = url;
      frame.appendChild(video);
    }
    body.appendChild(frame);

    const meta = document.createElement('footer');
    meta.className = 'node__meta';
    const rows = document.createElement('div');
    rows.className = 'meta-rows';
    rows.appendChild(metaRow('Artifact', entry.title));
    rows.appendChild(metaRow('Type', isImage ? 'image / ' + (ext === 'jpg' ? 'jpeg' : ext || 'image') : 'video / ' + (ext || 'mp4')));
    meta.appendChild(rows);

    card.appendChild(head);
    card.appendChild(body);
    card.appendChild(meta);
    return card;
  }

  function dismissChild(card) {
    if (typeof Canvas !== 'undefined') {
      Canvas.removeLinksTo(card.id);
      Canvas.removeWindow(card);
      // keep the chain whole: whatever hung off this card re-wires to its parent
      const parent = $(card.dataset.parent || '');
      if (!card.classList.contains('leaving') && parent) {
        document.querySelectorAll('.child').forEach(c => {
          if (c.dataset.parent !== card.id || c.classList.contains('leaving')) return;
          c.dataset.parent = parent.id;
          Canvas.addLink(parent.id, c.id);
        });
      }
    }
    expanders.delete(card);
    card.remove();
  }

  const delay = ms => new Promise(r => setTimeout(r, ms));

  // §spawn layout: one chain, never a fan. Cards run left → right in
  // reading order — OUTPUT → doc → its attachments → next doc → … — and each
  // card is wired only from the one before it, so every window has exactly
  // one wire in and one wire out (a proposal leads straight into its image).
  // The chain is loose on purpose: each round draws fresh gaps and heights
  // (mostly alternating above/below OUTPUT's midline, sometimes not), so it
  // reads as cards set down by hand rather than a grid. One card per column,
  // so no window ever sits in another's wire path.
  const rnd = (lo, hi) => lo + Math.random() * (hi - lo);

  // origin = OUTPUT's live box (it may have been dragged anywhere), and no
  // card may land on a window already on the board (INPUT / SELF / OUTPUT,
  // wherever the visitor left them) or on an earlier card of this chain
  const GAP = 28;
  const hits = (a, b) => a.x < b.x + b.w + GAP && b.x < a.x + a.w + GAP &&
                         a.y < b.y + b.h + GAP && b.y < a.y + a.h + GAP;

  function layoutChain(cards) {
    const out = Canvas.box('node-output');
    const taken = ['node-input', 'node-self', 'node-output'].map(Canvas.box).filter(Boolean);
    const midY = out.y + out.h / 2;
    let x = out.x + out.w;   // right edge of the previous card
    let dir = Math.random() < 0.5 ? -1 : 1;
    return cards.map(card => {
      if (Math.random() < 0.7) dir = -dir;
      const w = card.offsetWidth, h = card.offsetHeight;
      const b = { x: x + rnd(45, 170), y: midY + dir * rnd(40, 300) - h * rnd(0.25, 0.75), w, h };
      // nudge off anything it lands on: try growing offsets, both ways
      const y0 = b.y;
      for (let k = 1; k < 40 && taken.some(t => hits(b, t)); k++) {
        b.y = y0 + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 60;
      }
      while (taken.some(t => hits(b, t))) b.x += 60;   // still blocked: step right
      taken.push(b);
      x = b.x + w;
      return { card, x: b.x, y: b.y, w, h };
    });
  }

  // §spawn: previous round's windows fade out and leave; then the new cards
  // appear one by one (~220ms apart) along the chain, each gliding in and
  // wired to the one before. The camera glides first to OUTPUT + the whole
  // chain, so no card ever arrives off-screen.
  async function spawnChildren(entries, round) {
    const myGen = ++spawnGen;
    spawnRound = round;
    const alive = () => myGen === spawnGen && (round === undefined || round === spawnRound);

    // every child on the board — attachment windows have no expander, so
    // collecting from `expanders` alone left them (and their wires) behind
    const old = [...document.querySelectorAll('#canvas > .child')];
    if (old.length) {
      for (const card of old) card.classList.add('leaving');
      await delay(120);
      for (const card of old) dismissChild(card);
    }
    if (!alive()) return;

    const all = entries.flatMap(entry => [
      isShort(entry) ? buildShortChild(entry) : buildChild(entry),
      ...(entry.attachments || []).map(att => buildAttachmentChild(entry, att))
    ]);
    all.forEach((card, i) => { card.dataset.parent = i ? all[i - 1].id : 'node-output'; });

    // mount every card invisibly first: the layout needs real heights
    for (const card of all) {
      card.classList.add('entering');
      $('canvas').appendChild(card);
    }
    // attachment frames size themselves from their media: wait (briefly) so
    // the layout sees final heights and cards can't grow into each other
    const media = all.map(c => c.mediaReady).filter(Boolean);
    if (media.length) await Promise.race([Promise.all(media), delay(2500)]);
    if (!alive()) { all.forEach(c => { expanders.delete(c); c.remove(); }); return; }
    const order = layoutChain(all);
    // glide the camera before the cards arrive: the whole board while the
    // visitor hasn't taken over the view, else OUTPUT + the new chain
    const keep = Canvas.touched ? ['node-output'] : ['node-input', 'node-self', 'node-output'];
    Canvas.frameRects([...keep.map(Canvas.box), ...order], true);

    let last = null;
    const spawnOne = ({ card, x, y }) => {
      card.dataset.x = x;
      card.dataset.y = y;
      Canvas.register(card, card.classList.contains('node--image') ? 'image' : 'text', { enter: true });
      Canvas.addLink(card.dataset.parent, card.id);
      requestAnimationFrame(() => card.classList.remove('entering'));
      last = card;
    };
    // spawn in chain order: a card's parent is always already on the board
    for (const p of order) {
      if (!alive()) break;
      if (last) await delay(220);
      if (!alive()) break;
      spawnOne(p);
    }
    // a cancelled round leaves unregistered, invisible cards behind: drop them
    for (const card of all) {
      if (!card.dataset.kind) { expanders.delete(card); card.remove(); }
    }
  }

  // Esc: cards already out stay; expanded wells fold back, staggered top → bottom
  function collapseChildren() {
    let i = 0;
    for (const [card, expander] of expanders) {
      if (!card.parentNode || !expander.isOpen()) continue;
      setTimeout(() => expander.collapse(), Math.min(i, 3) * 40);
      i++;
    }
    if (outputExpander && outputExpander.isOpen()) outputExpander.collapse();
    if (typeof Canvas !== 'undefined') Canvas.fit(true);
  }

  /* ---- memory bar: the dot opens a column of one-word buttons on the
   * right edge. Groups come from the manifest, so a new week appears on its
   * own: each "week N" section is one button (in week order), other
   * sections one button each, and "meta" splits into its memories (about,
   * ai disclosure, self — labelled by their own short label). */
  function memoryGroups() {
    const bySection = new Map();
    for (const e of Memory.entries) {
      if (!bySection.has(e.section)) bySection.set(e.section, []);
      bySection.get(e.section).push(e);
    }
    const weekNo = s => +((s.match(/^week\s*(\d+)/i) || [])[1] || NaN);
    const sections = [...bySection.keys()].filter(s => s !== 'meta');
    const weeks = sections.filter(s => !isNaN(weekNo(s))).sort((a, b) => weekNo(a) - weekNo(b));
    const rest = sections.filter(s => isNaN(weekNo(s)));
    return [
      ...[...weeks, ...rest].map(s => ({ label: s.toLowerCase(), entries: bySection.get(s) })),
      ...(bySection.get('meta') || []).map(e => ({ label: Memory.label(e).toLowerCase(), entries: [e] }))
    ];
  }

  let barBuilt = false;
  function buildBar() {
    const bar = $('memory-bar');
    bar.innerHTML = '';
    memoryGroups().forEach((g, i) => {
      const b = document.createElement('button');
      b.className = 'btn';
      b.type = 'button';
      b.style.setProperty('--i', i);   // stagger the entrance
      b.innerHTML = '<span class="btn__dot"></span><span class="btn__label"></span>';
      b.querySelector('.btn__label').textContent = g.label;
      b.addEventListener('click', () => {
        bar.querySelectorAll('.btn.is-open').forEach(o => o.classList.remove('is-open'));
        b.classList.add('is-open');
        Agent.showEntries(g.entries, g.label);
      });
      bar.appendChild(b);
    });
    barBuilt = true;
  }

  function toggleBar(open) {
    const bar = $('memory-bar');
    if (!barBuilt) buildBar();
    open = open === undefined ? !bar.classList.contains('is-open') : open;
    bar.classList.toggle('is-open', open);
    bar.setAttribute('aria-hidden', String(!open));
    $('index-dot').classList.toggle('is-open', open);
    // while open, camera framing keeps cards out from under the bar
    const r = bar.getBoundingClientRect();
    Canvas.reserveRight(open ? window.innerWidth - r.left + 16 : 0);
  }

  /* ---- index overlay (the full grid; typed as /index) */
  function showIndex() {
    buildIndex();
    const o = $('index-overlay');
    o.scrollTop = 0;
    o.setAttribute('aria-hidden', 'false');
    o.classList.add('is-open');
  }

  function hideIndex() {
    const o = $('index-overlay');
    o.setAttribute('aria-hidden', 'true');
    o.classList.remove('is-open');
  }

  function buildIndex() {
    $('index-title').textContent = 'index · ' + Memory.entries.length + ' memories';
    const grid = $('index-grid');
    grid.innerHTML = '';
    Memory.entries.forEach((e, i) => {
      const card = document.createElement('section');
      card.className = 'node index-card';
      card.style.setProperty('--i', i);   // stagger the entrance

      const head = document.createElement('header');
      head.className = 'node__head';
      const label = document.createElement('span');
      label.className = 'node__label';
      label.textContent = LABELS.mem(e.id);
      head.appendChild(label);

      const body = document.createElement('div');
      body.className = 'node__body';
      body.textContent = e.section; // fallback: section letters as placeholder
      // thumbnail: the doc's first inline image, else its first image attachment
      const attImg = (e.attachments || []).find(a => /\.(jpe?g|png|webp)$/i.test(a));
      Memory.firstImage(e).then(url => url ||
        (attImg ? new URL(attImg, new URL(e.file, document.baseURI)).href : null)).then(url => {
        if (!url) return;
        body.textContent = '';
        body.classList.add('has-image');
        const img = document.createElement('img');
        img.src = url;
        img.alt = e.title;
        img.draggable = false;
        body.appendChild(img);
      });

      const meta = document.createElement('footer');
      meta.className = 'node__meta';
      const rows = document.createElement('div');
      rows.className = 'meta-rows';
      rows.appendChild(metaRow('Title', e.title));
      rows.appendChild(metaRow('Section', e.section));
      meta.appendChild(rows);

      const more = document.createElement('span');
      more.className = 'index-card__more';
      more.textContent = 'open';

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
    });
  }

  function initOutput() {
    outputExpander = initWellExpand($('node-output'));
  }

  return {
    setState, setMode, buildSelfMeta,
    setAnswer, startReveal, revealAnswer, finishReveal,
    spawnChildren, cancelSpawn: () => { spawnGen++; spawnRound = null; },
    collapseChildren,
    showIndex, hideIndex, initOutput, toggleBar
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

  const outputText = document.getElementById('output-text');
  try {
    await Memory.load();
  } catch (err) {
    console.error(err);
    outputText.innerHTML = '<p class="placeholder">my memory failed to load — serve this folder over http (see README)</p>';
    return;
  }

  if (ApiBrain.enabled) console.info('live brain mode: api (deepseek via /api/chat, recall via /api/recall)');

  UI.setMode(ApiBrain.enabled ? 'live' : 'static');
  await UI.buildSelfMeta();   // both meta rows must exist before ports are made

  // the board: register the three windows and wire them INPUT → SELF → OUTPUT
  Canvas.init();
  Canvas.register(document.getElementById('node-input'), 'text');
  Canvas.register(document.getElementById('node-self'), 'image');
  Canvas.register(document.getElementById('node-output'), 'text');
  Canvas.addLink('node-input', 'node-self', 'wire-in');
  Canvas.addLink('node-self', 'node-output', 'wire-out');
  UI.initOutput();
  Canvas.fitAll(false);

  const input = document.getElementById('query');

  // wheel inside the textarea scrolls it, never zooms the board
  input.addEventListener('wheel', ev => ev.stopPropagation(), { passive: true });

  // small screens: textarea shrinks to 2 rows
  const mqMobile = window.matchMedia('(max-width: 699px)');
  const applyRows = () => { input.rows = mqMobile.matches ? 2 : 4; };
  mqMobile.addEventListener('change', applyRows);
  applyRows();

  const send = () => {
    const q = input.value;
    input.value = '';
    Agent.handle(q);
  };
  input.addEventListener('keydown', ev => {
    if (ev.key === 'Enter' && !ev.shiftKey) {
      if (ev.isComposing || ev.keyCode === 229) return; // IME: Enter picks a candidate, don't send
      ev.preventDefault();
      send();
    }
  });
  document.getElementById('send-btn').addEventListener('click', send);

  // global keys: Esc closes overlays & stops speech; "/" focuses the input;
  // Ctrl/Cmd+A is swallowed outside the textarea so nothing gets selected
  window.addEventListener('keydown', ev => {
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'a' &&
        !/^(TEXTAREA|INPUT)$/.test(ev.target.tagName)) {
      ev.preventDefault();
      return;
    }
    if (ev.key === 'Escape') {
      UI.hideIndex();
      UI.toggleBar(false);
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
          if (input.value.trim()) send();
        }
      });
    });
  }

  // the dot toggles the memory bar (the full grid stays on /index)
  document.getElementById('index-dot').addEventListener('click', () => UI.toggleBar());
  document.getElementById('index-overlay').addEventListener('click', ev => {
    if (!ev.target.closest('.node')) UI.hideIndex();
  });
});
