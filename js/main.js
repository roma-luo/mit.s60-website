/* main — boot and UI wiring for the node-graph layout.
 * Exposes the UI object used by Agent:
 *   UI.setState(st)              — LED + INPUT Status meta + wire flow + active card
 *   UI.setAnswer(res, opts)      — rebuild the OUTPUT node body (text only)
 *   UI.spawnChildren(entries, round) / UI.cancelSpawn() / UI.collapseChildren()
 *   UI.setLastQuery(q)           — INPUT meta third row
 *   UI.showIndex() / UI.hideIndex()
 * Answers bring their documents out as CHILD NODES on the canvas — there are
 * no overlays or masks; "See more" expands a child card in place.
 */

// attachment label from the filename: strip extension, split on '-', drop a
// leading "recording" token, uppercase the rest + RECORDING
// ("recording-process.mp4" → "PROCESS RECORDING")
function attachmentLabel(att) {
  const stem = att.split('/').pop().replace(/\.[^.]*$/, '');
  const parts = stem.split('-');
  if (parts[0] && parts[0].toLowerCase() === 'recording') parts.shift();
  return (parts.join(' ').toUpperCase() + ' RECORDING').trim();
}

const LABELS = {
  input: 'S60-IN',
  self: 'S60-SELF',
  out: 'S60-OUT',
  output: n => 'S60-OUT-' + String(n).padStart(2, '0'),
  child: (outLabel, entry) => outLabel + '-' + Memory.label(entry),
  video: (entry, att) => LABELS.out + '-' + Memory.label({ title: entry.section }) + ' · ' + attachmentLabel(att),
  // image attachments: parent doc label + the filename's last hyphen token
  // ("idea-1-diagram.jpg" → "S60-OUT-FINAL IDEA 01 · DIAGRAM")
  attach: (entry, att) => LABELS.child(LABELS.out, entry) + ' · '
    + att.split('/').pop().replace(/\.[^.]*$/, '').split('-').pop().toUpperCase(),
  mem: id => 'S60-MEM-' + String(id).toUpperCase()
};

const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'webp'];

const UI = (() => {
  const $ = id => document.getElementById(id);
  const SVGNS = 'http://www.w3.org/2000/svg';
  let answerCount = 0;
  let answerEl = null;
  let answerText = '';
  let revealTimer = null;
  let spawnGen = 0;
  let spawnRound = null;
  let nodeObserver = null;

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
    // thinking dims last round's children; they are replaced when the new
    // answer lands (not deleted upfront)
    $('children').classList.toggle('dim', st === 'thinking');
    // ComfyUI-style: the running module's card border highlights
    const active = { listening: 'node-input', thinking: 'node-self', speaking: 'node-output' }[st] || null;
    for (const id of ['node-input', 'node-self', 'node-output']) {
      $(id).classList.toggle('active', id === active);
    }
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

  /* ---- wires: bezier paths between node edge midpoints */
  function wireD(x1, y1, x2, y2, vertical) {
    return vertical
      ? `M ${x1} ${y1} C ${x1} ${y1 + (y2 - y1) * 0.5}, ${x2} ${y2 - (y2 - y1) * 0.5}, ${x2} ${y2}`
      : `M ${x1} ${y1} C ${x1 + (x2 - x1) * 0.5} ${y1}, ${x2 - (x2 - x1) * 0.5} ${y2}, ${x2} ${y2}`;
  }

  function setWire(path, dotA, dotB, x1, y1, x2, y2, vertical) {
    path.setAttribute('d', wireD(x1, y1, x2, y2, vertical));
    dotA.setAttribute('cx', x1); dotA.setAttribute('cy', y1);
    dotB.setAttribute('cx', x2); dotB.setAttribute('cy', y2);
  }

  function setNamedWire(name, x1, y1, x2, y2, vertical) {
    setWire($(name), $(name + '-a'), $(name + '-b'), x1, y1, x2, y2, vertical);
  }

  function setWireVisible(name, visible) {
    const d = visible ? '' : 'none';
    $(name).style.display = d;
    $(name + '-a').style.display = d;
    $(name + '-b').style.display = d;
  }

  // A4: keep the three main cards optically centered regardless of the
  // children column — padding-left = max(6vw, (vw − cards − 2 gaps) / 2),
  // computed on load/resize only, so a child appearing or expanding never
  // shifts INPUT/SELF/OUTPUT; the graph only extends to the right
  function centerGraph() {
    const graph = $('graph');
    if (window.innerWidth < 700) { graph.style.paddingLeft = ''; return; }
    const gap = parseFloat(getComputedStyle(graph).columnGap) || 0;
    const cards = ['node-input', 'node-self', 'node-output']
      .reduce((sum, id) => sum + $(id).getBoundingClientRect().width, 0);
    const pad = Math.max(window.innerWidth * 0.06, (window.innerWidth - cards - 2 * gap) / 2);
    graph.style.paddingLeft = pad + 'px';
  }

  // one wire per child, created on demand and keyed by the child's data-id;
  // a freshly spawned wire draws itself on (dashoffset 1 → 0, 300ms)
  function childWireEls(svg, id, animate) {
    let path = svg.querySelector('path.wire-child[data-for="' + id + '"]');
    if (path) {
      return {
        path,
        dotA: svg.querySelector('circle.wire-child-a[data-for="' + id + '"]'),
        dotB: svg.querySelector('circle.wire-child-b[data-for="' + id + '"]')
      };
    }
    path = document.createElementNS(SVGNS, 'path');
    path.setAttribute('class', 'wire wire-child');
    path.dataset.for = id;
    const dotA = document.createElementNS(SVGNS, 'circle');
    dotA.setAttribute('class', 'wire-dot wire-child-a');
    dotA.setAttribute('r', 3);
    dotA.dataset.for = id;
    const dotB = document.createElementNS(SVGNS, 'circle');
    dotB.setAttribute('class', 'wire-dot wire-child-b');
    dotB.setAttribute('r', 3);
    dotB.dataset.for = id;
    svg.appendChild(path);
    svg.appendChild(dotA);
    svg.appendChild(dotB);
    if (animate) {
      path.setAttribute('pathLength', '1');
      path.style.strokeDasharray = '1';
      path.style.strokeDashoffset = '1';
      path.style.transition = 'stroke-dashoffset .3s ease';
      requestAnimationFrame(() => { path.style.strokeDashoffset = '0'; });
      setTimeout(() => {
        path.removeAttribute('pathLength');
        path.style.strokeDasharray = '';
        path.style.strokeDashoffset = '';
        path.style.transition = '';
      }, 320);
    }
    return { path, dotA, dotB };
  }

  // desktop: every child gets one wire from OUTPUT's right-edge midpoint — a
  // fan with a single shared origin. mobile (<700px): chain instead —
  // OUTPUT bottom → child1 top, child1 bottom → child2 top … (a fan would
  // cross itself in the vertical stack). Returns the last child's rect.
  function syncChildWires(rel, ro, animate, mobile) {
    const svg = $('wires');
    const seen = new Set();
    const from = { x: mobile ? ro.l + ro.w / 2 : ro.r, y: mobile ? ro.b : ro.t + ro.h / 2 };
    let lastRect = null;
    for (const card of $('children').children) {
      const id = card.dataset.id;
      seen.add(id);
      const { path, dotA, dotB } = childWireEls(svg, id, animate);
      const rc = rel(card);
      if (mobile) {
        setWire(path, dotA, dotB, from.x, from.y, rc.l + rc.w / 2, rc.t, true);
        from.x = rc.l + rc.w / 2;
        from.y = rc.b;
      } else {
        setWire(path, dotA, dotB, from.x, from.y, rc.l, rc.t + rc.h / 2);
      }
      lastRect = rc;
    }
    for (const el of svg.querySelectorAll('[data-for]')) {
      if (!seen.has(el.dataset.for)) el.remove();
    }
    return lastRect;
  }

  function updateWires(animateNew) {
    const anim = animateNew === true; // ResizeObserver/events pass objects
    const svg = $('wires');
    const graph = $('graph');
    // the svg spans the whole graph; all points are in canvas space
    // (rect(el) − rect(#canvas)), so panning moves wires with the cards
    // without any recompute
    const w = graph.scrollWidth;
    const h = graph.scrollHeight;
    svg.setAttribute('width', w);
    svg.setAttribute('height', h);
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    const c = $('canvas').getBoundingClientRect();
    // divide rect deltas by the live visual zoom (canvas rect vs its layout
    // width) so wires stay in canvas/layout space at any zoom level — glued
    // to the cards even mid-zoom-transition
    const z = c.width / Math.max(1, $('canvas').offsetWidth);
    const rel = el => {
      const r = el.getBoundingClientRect();
      return { l: (r.left - c.left) / z, t: (r.top - c.top) / z, r: (r.right - c.left) / z, b: (r.bottom - c.top) / z, w: r.width / z, h: r.height / z };
    };
    const ri = rel($('node-input'));
    const rs = rel($('node-self'));
    const ro = rel($('node-output'));
    if (window.innerWidth < 700) {
      // mobile stacks SELF → OUTPUT → children → INPUT; INPUT is a control,
      // not a node, and never gets a wire (its sticky rect moves on scroll
      // and there is no scroll listener anymore) — the spine ends at the
      // last child; with no children, wire-out hides
      setNamedWire('wire-in', rs.l + rs.w / 2, rs.b, ro.l + ro.w / 2, ro.t, true);
      const lastChild = syncChildWires(rel, ro, anim, true);
      setWireVisible('wire-out', !!lastChild);
      if (lastChild) {
        setNamedWire('wire-out', ro.l + ro.w / 2, ro.b, lastChild.l + lastChild.w / 2, lastChild.t, true);
      }
    } else {
      // INPUT right-edge midpoint → SELF left-edge midpoint; SELF → OUTPUT same
      setNamedWire('wire-in', ri.r, ri.t + ri.h / 2, rs.l, rs.t + rs.h / 2);
      setNamedWire('wire-out', rs.r, rs.t + rs.h / 2, ro.l, ro.t + ro.h / 2);
      setWireVisible('wire-out', true);
      syncChildWires(rel, ro, anim, false);
    }
  }

  /* ---- OUTPUT node (text only; attached docs live in child nodes) */
  async function setAnswer(res, opts = {}) {
    stopReveal();
    answerCount++;
    $('output-label').textContent = LABELS.output(answerCount);
    $('output-led').dataset.state = 'idle'; // has content: white dot
    $('node-output').dataset.label = LABELS.output(answerCount);

    const body = $('output-body');
    body.classList.remove('thinking');
    body.innerHTML = '';
    answerText = res.text || '';
    const p = document.createElement('p');
    p.className = 'answer';
    p.textContent = opts.reveal ? '' : answerText;
    body.appendChild(p);
    answerEl = p;

    setAttached(0);

    // new answer enters with a 120ms opacity fade, no sliding
    body.classList.remove('fade-in');
    void body.offsetWidth;
    body.classList.add('fade-in');
    updateWires();
  }

  function setAttached(n) {
    const meta = $('output-meta');
    meta.innerHTML = '';
    if (!n) { meta.classList.add('hidden'); return; }
    meta.appendChild(metaRow('Attached', n + (n === 1 ? ' memory' : ' memories')));
    meta.classList.remove('hidden');
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

  /* ---- child nodes: the documents an answer brings out */
  function buildChild(entry) {
    const card = document.createElement('section');
    card.className = 'node child';
    card.dataset.id = entry.id;
    card.dataset.round = answerCount;

    const head = document.createElement('header');
    head.className = 'node__head';
    const label = document.createElement('span');
    label.className = 'node__label';
    label.textContent = LABELS.child(LABELS.out, entry);
    const close = document.createElement('button');
    close.className = 'node__close';
    close.setAttribute('aria-label', 'dismiss');
    close.addEventListener('click', ev => { ev.stopPropagation(); dismissChild(card); });
    head.appendChild(label);
    head.appendChild(close);

    const preview = document.createElement('div');
    preview.className = 'node__body child__preview';
    const p = document.createElement('p');
    p.className = 'child__excerpt';
    p.textContent = 'recalling…';
    preview.appendChild(p);
    Memory.excerpt(entry).then(t => { p.textContent = t || entry.answer; });
    Memory.firstImage(entry).then(url => {
      if (!url) return;
      const img = document.createElement('img');
      img.className = 'child__img';
      img.src = url;
      img.alt = entry.title;
      preview.insertBefore(img, p);
    });

    const doc = document.createElement('div');
    doc.className = 'node__body child__doc hidden';

    const meta = document.createElement('footer');
    meta.className = 'node__meta';
    meta.appendChild(metaRow('Memory', entry.title));
    meta.appendChild(metaRow('Section', entry.section));
    meta.appendChild(metaRow('Source', entry.file));

    const more = document.createElement('a');
    more.className = 'node__more pill';
    more.href = '#';
    more.textContent = 'See more';
    more.addEventListener('click', ev => { ev.preventDefault(); toggleChild(card, entry); });

    card.appendChild(head);
    card.appendChild(preview);
    card.appendChild(doc);
    card.appendChild(meta);
    card.appendChild(more);
    return card;
  }

  // route attachments by extension: images get an image card, everything
  // else keeps the video card
  function buildAttachmentChild(entry, att) {
    const ext = ((att.match(/\.([a-z0-9]+)$/i) || [])[1] || '').toLowerCase();
    if (IMAGE_EXTS.includes(ext)) return buildImageChild(entry, att, ext);
    return buildVideoChild(entry, att);
  }

  // image attachments (jpg/png/webp) spawn a plain image card, no See more
  function buildImageChild(entry, att, ext) {
    const dir = entry.file.split('/').slice(0, -1).join('/');
    const url = new URL(att, new URL(entry.file, document.baseURI)).href;

    const card = document.createElement('section');
    card.className = 'node child child--image';
    card.dataset.id = entry.id + '#' + att;
    card.dataset.round = answerCount;

    const head = document.createElement('header');
    head.className = 'node__head';
    const label = document.createElement('span');
    label.className = 'node__label';
    label.textContent = LABELS.attach(entry, att);
    const close = document.createElement('button');
    close.className = 'node__close';
    close.setAttribute('aria-label', 'dismiss');
    close.addEventListener('click', ev => { ev.stopPropagation(); dismissChild(card); });
    head.appendChild(label);
    head.appendChild(close);

    const body = document.createElement('div');
    body.className = 'node__body';
    const img = document.createElement('img');
    img.className = 'child__attach';
    img.src = url;
    img.alt = entry.title;
    body.appendChild(img);

    const meta = document.createElement('footer');
    meta.className = 'node__meta';
    meta.appendChild(metaRow('Memory', entry.title));
    meta.appendChild(metaRow('Type', 'image/' + (ext === 'jpg' ? 'jpeg' : ext)));
    meta.appendChild(metaRow('Source', dir + '/' + att));

    card.appendChild(head);
    card.appendChild(body);
    card.appendChild(meta);
    return card;
  }

  // one small video card per attachment, spawned right after its parent doc
  // card; the URL resolves against the parent doc's own directory
  function buildVideoChild(entry, att) {
    const dir = entry.file.split('/').slice(0, -1).join('/');
    const url = new URL(att, new URL(entry.file, document.baseURI)).href;
    const ext = (att.match(/\.([a-z0-9]+)$/i) || [])[1] || '';

    const card = document.createElement('section');
    card.className = 'node child child--video';
    card.dataset.id = entry.id + '#' + att;
    card.dataset.round = answerCount;

    const head = document.createElement('header');
    head.className = 'node__head';
    const label = document.createElement('span');
    label.className = 'node__label';
    label.textContent = LABELS.video(entry, att);
    const close = document.createElement('button');
    close.className = 'node__close';
    close.setAttribute('aria-label', 'dismiss');
    close.addEventListener('click', ev => { ev.stopPropagation(); dismissChild(card); });
    head.appendChild(label);
    head.appendChild(close);

    const body = document.createElement('div');
    body.className = 'node__body';
    const video = document.createElement('video');
    video.className = 'child__video';
    video.controls = true;
    video.preload = 'metadata';
    video.playsInline = true;
    video.src = url;
    body.appendChild(video);

    const meta = document.createElement('footer');
    meta.className = 'node__meta';
    meta.appendChild(metaRow('Memory', entry.title));
    meta.appendChild(metaRow('Type', ext ? 'video/' + ext.toLowerCase() : 'video'));
    meta.appendChild(metaRow('Source', dir + '/' + att));

    card.appendChild(head);
    card.appendChild(body);
    card.appendChild(meta);
    return card;
  }

  // See more ↔ See less: the full markdown expands in place, no overlay and
  // no internal scrollbar — the card grows as tall as its content while a
  // height animation reflows the siblings below it gradually
  async function toggleChild(card, entry) {
    const preview = card.querySelector('.child__preview');
    const doc = card.querySelector('.child__doc');
    const more = card.querySelector('.node__more');
    const expanding = !card.classList.contains('expanded');

    if (expanding) {
      if (!doc.dataset.loaded) {
        doc.dataset.loaded = '1';
        doc.innerHTML = '<p>recalling…</p>';
        try {
          const md = await Memory.fetchDoc(entry);
          doc.innerHTML = Markdown.render(md, { baseUrl: docBaseUrl(entry) });
        } catch (err) {
          doc.innerHTML = '<p>(this memory could not be loaded)</p>';
        }
      }
      card.classList.add('expanded');
      preview.classList.add('hidden');
      more.textContent = 'See less';
      animateHeight(doc, true);
    } else {
      card.classList.remove('expanded');
      preview.classList.remove('hidden');
      more.textContent = 'See more';
      animateHeight(doc, false);
    }
  }

  // height 0 ↔ content height over ~400ms (CSS transition on .child__doc);
  // wires track the animation every frame, then height settles to auto
  // (expanded) or the doc hides again (collapsed)
  function animateHeight(doc, expanding) {
    doc.classList.remove('hidden');
    const target = expanding ? doc.scrollHeight : 0;
    doc.style.height = (expanding ? 0 : doc.scrollHeight) + 'px';
    requestAnimationFrame(() => requestAnimationFrame(() => {
      doc.style.height = target + 'px';
      const t0 = performance.now();
      const tick = () => {
        updateWires();
        if (performance.now() - t0 < 450) requestAnimationFrame(tick);
        else {
          if (expanding) doc.style.height = 'auto';
          else { doc.style.height = ''; doc.classList.add('hidden'); }
          updateWires();
          // bring the card into view without touching the user's zoom
          if (typeof Canvas !== 'undefined') Canvas.reveal(doc.closest('.child'));
        }
      };
      requestAnimationFrame(tick);
    }));
  }

  function dismissChild(card) {
    if (nodeObserver) nodeObserver.unobserve(card);
    card.remove();
    setAttached($('children').childElementCount);
    updateWires();
    if (typeof Canvas !== 'undefined') Canvas.fit(true);
  }

  // Esc: cards already out stay, but any expanded one folds back to preview
  function collapseChildren() {
    for (const card of $('children').children) {
      if (!card.classList.contains('expanded')) continue;
      card.classList.remove('expanded');
      card.querySelector('.child__preview').classList.remove('hidden');
      const doc = card.querySelector('.child__doc');
      doc.style.height = '';
      doc.classList.add('hidden');
      card.querySelector('.node__more').textContent = 'See more';
    }
    updateWires();
    if (typeof Canvas !== 'undefined') Canvas.fit(true);
  }

  function cancelSpawn() {
    spawnGen++;
    spawnRound = null;
  }

  const delay = ms => new Promise(r => setTimeout(r, ms));

  // §3.3: previous round's cards fade out together and leave; then the new
  // cards appear one by one (~220ms apart), each sliding in over 120ms while
  // its wire draws itself on; the last card is auto-revealed into view
  async function spawnChildren(entries, round) {
    const myGen = ++spawnGen;
    spawnRound = round;
    const alive = () => myGen === spawnGen && (round === undefined || round === spawnRound);
    const host = $('children');
    host.classList.remove('dim');

    const old = [...host.children];
    if (old.length) {
      for (const card of old) card.classList.add('leaving');
      await delay(120);
      for (const card of old) {
        if (nodeObserver) nodeObserver.unobserve(card);
        card.remove();
      }
      updateWires();
    }
    if (!alive()) return;
    setAttached(entries.length);

    let last = null;
    const spawnOne = card => {
      card.classList.add('entering');
      host.appendChild(card);
      if (nodeObserver) nodeObserver.observe(card);
      requestAnimationFrame(() => card.classList.remove('entering'));
      updateWires(true);
      if (typeof Canvas !== 'undefined') Canvas.fit(true); // zoom out before the column overflows
      last = card;
    };
    for (const entry of entries) {
      // doc card first, then one card per attachment — docs and videos are
      // separate budgets (attachments don't count toward the show-id cap)
      const cards = [buildChild(entry)];
      for (const att of entry.attachments || []) cards.push(buildAttachmentChild(entry, att));
      for (const card of cards) {
        if (!alive()) break;
        if (last) await delay(220);
        if (!alive()) break;
        spawnOne(card);
      }
      if (!alive()) break;
    }
    if (last && alive() && typeof Canvas !== 'undefined') Canvas.reveal(last);
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
      more.className = 'node__more pill';
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

  function setNodeObserver(obs) { nodeObserver = obs; }

  return {
    setState, setMode, setLastQuery, buildSelfMeta,
    setAnswer, startReveal, revealAnswer, finishReveal,
    spawnChildren, cancelSpawn, collapseChildren,
    showIndex, hideIndex, updateWires, centerGraph, setNodeObserver
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

  if (ApiBrain.enabled) console.info('live brain mode: api (deepseek via /api/chat, recall via /api/recall)');

  UI.setMode(ApiBrain.enabled ? 'live' : 'static');
  UI.buildSelfMeta();

  // wires: recompute on resize, font load, video metadata (face:ready), and
  // whenever a node's box changes (panning needs no recompute — canvas space)
  window.addEventListener('resize', () => { UI.centerGraph(); Canvas.fit(true); UI.updateWires(); });
  document.addEventListener('face:ready', UI.updateWires);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(UI.updateWires);
  const nodeObserver = new ResizeObserver(UI.updateWires);
  ['node-input', 'node-self', 'node-output', 'children'].forEach(id => nodeObserver.observe(document.getElementById(id)));
  UI.setNodeObserver(nodeObserver);
  Canvas.init();
  UI.centerGraph();
  Canvas.fit(false);   // initial auto-fit (no animation on load)
  UI.updateWires();

  const input = document.getElementById('query');

  // mobile: textarea shrinks to 2 rows
  const mqMobile = window.matchMedia('(max-width: 699px)');
  const applyRows = () => { input.rows = mqMobile.matches ? 2 : 4; };
  mqMobile.addEventListener('change', applyRows);
  applyRows();

  input.addEventListener('keydown', ev => {
    if (ev.key === 'Enter' && !ev.shiftKey) {
      if (ev.isComposing || ev.keyCode === 229) return; // IME: Enter picks a candidate, don't send
      ev.preventDefault();
      const q = input.value;
      input.value = '';
      Agent.handle(q);
    }
  });

  // global keys: Esc closes overlays & stops speech; "/" focuses the input
  window.addEventListener('keydown', ev => {
    if (ev.key === 'Escape') {
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
});
