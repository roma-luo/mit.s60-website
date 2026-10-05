/* Canvas — the node-board engine (ported from reference/slop-instance.html).
 *
 * A fixed full-viewport stage; every window is a free body on the board.
 * Windows drag with a viscous feel, the wheel zooms the board anchored at
 * the cursor, dragging empty space pans the board, and fit-all frames everything. Ports on the meta rows
 * wire windows together; wires follow translate/rotate/scale every frame.
 *
 * Public API (kept compatible with the previous canvas driver):
 *   Canvas.init()
 *   Canvas.register(el, kind)     — add a board window (spawned children)
 *   Canvas.removeWindow(el)       — drop it and its wires/ports
 *   Canvas.addLink(fromId, toId)  — wire from the right edge of from to left of to
 *   Canvas.removeLinksTo(id)
 *   Canvas.setFlow(id, on)        — dash-flow a wire ('wire-in' | 'wire-out')
 *   Canvas.reflow(ms)             — keep wires attached during an expand
 *   Canvas.reveal(el)             — glide the view so a window is on screen
 *   Canvas.fit(animate)           — fit-all until the user first touches the board
 *   Canvas.home(animate)          — fit-all on demand
 *   Canvas.zoomBy(factor, cx, cy) — zoom about a screen point (default centre)
 *   Canvas.pan(dx, dy)
 *   Canvas.setOffset(x, y, animate)
 *   Canvas.get() → { x, y, scale }
 */
const Canvas = (() => {
  let stage, canvas, pct;
  const NS = 'http://www.w3.org/2000/svg';
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---- window feel (per 60fps frame, applied frame-rate independently) */
  const FOLLOW = calm ? 1 : 0.12;
  const BREAK  = calm ? 0 : 5;
  const TILT   = calm ? 0 : 0.10, TILT_MAX = 1.4;
  const LIFT   = calm ? 1 : 1.014;
  const EASE   = 0.2;

  /* ---- view */
  const ZMIN = 0.25, ZMAX = 4, ZSTEP = 1.25;
  const VIEW_EASE = calm ? 1 : 0.2;

  /* port rule — the upper hole always connects to text, the lower hole
     always connects to an image (CLAUDE.md R1) */
  const PORT = { text: 0, image: 1 };

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  let nodes = [];
  let byId = {};
  let z = 0;
  const links = [];
  let dots = [];

  /* ============================ registry ============================ */

  function layer() {
    const l = document.createElementNS(NS, 'svg');
    l.setAttribute('class', 'layer');
    l.setAttribute('aria-hidden', 'true');
    return canvas.appendChild(l);
  }

  function apply(n) {
    n.el.style.transform = `translate(${n.x}px, ${n.y}px) rotate(${n.r}deg) scale(${n.s})`;
  }

  // port position in canvas space, following translate · rotate · scale
  function portPos(id, row, side) {
    const n = byId[id], el = n.el;
    const w = el.offsetWidth, h = el.offsetHeight;
    const rows = el.querySelectorAll('.meta-row');
    // never let a missing row kill the frame loop: clamp to what exists,
    // fall back to the window edge centre when there are no rows yet
    const rowEl = rows[Math.min(row, rows.length - 1)] || null;
    let ly;
    if (rowEl) {
      ly = rowEl.offsetHeight / 2 + el.clientTop;
      let e = rowEl;
      while (e && e !== el) { ly += e.offsetTop; e = e.offsetParent; }
    } else {
      ly = h / 2;
    }
    const lx = side === 'right' ? w : 0;
    const a = n.r * Math.PI / 180, c = Math.cos(a), sn = Math.sin(a);
    const dx = (lx - w / 2) * n.s, dy = (ly - h / 2) * n.s;
    return { x: n.x + w / 2 + dx * c - dy * sn, y: n.y + h / 2 + dx * sn + dy * c };
  }

  function makePorts(n) {
    n.ports = layer();
    n.ports.style.zIndex = 2 * n.z + 1;
    n.el.querySelectorAll('.meta-row').forEach((_, i) => {
      ['left', 'right'].forEach(side => {
        const on = links.some(l =>
          (l.from[0] === n.el.id && l.from[1] === i && l.from[2] === side) ||
          (l.to[0] === n.el.id && l.to[1] === i && l.to[2] === side));
        const c = n.ports.appendChild(document.createElementNS(NS, 'circle'));
        c.setAttribute('r', on ? 2.6 : 2);
        c.setAttribute('class', on ? 'port is-linked' : 'port');
        dots.push({ c, id: n.el.id, i, side });
      });
    });
  }

  function linkPorts(n) {
    // restyle the port dots affected by a link touching this window
    if (!n.ports) return;
    dots.forEach(d => {
      if (d.id !== n.el.id) return;
      const on = links.some(l =>
        (l.from[0] === d.id && l.from[1] === d.i && l.from[2] === d.side) ||
        (l.to[0] === d.id && l.to[1] === d.i && l.to[2] === d.side));
      d.c.setAttribute('r', on ? 2.6 : 2);
      d.c.setAttribute('class', on ? 'port is-linked' : 'port');
    });
  }

  /* stacking — window k at z 2k, its ports at 2k+1; a wire belongs to the
     window it feeds and shares that layer (CLAUDE.md R2) */
  function restack() {
    nodes.forEach(n => {
      n.el.style.zIndex = 2 * n.z;
      if (n.ports) n.ports.style.zIndex = 2 * n.z + 1;
    });
    links.forEach(l => { l.svg.style.zIndex = 2 * byId[l.to[0]].z + 1; });
  }

  function draw() {
    links.forEach(l => {
      const a = portPos(...l.from), b = portPos(...l.to);
      const dx = Math.max(48, Math.abs(b.x - a.x) * 0.55);
      l.path.setAttribute('d',
        `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`);
    });
    dots.forEach(d => {
      const q = portPos(d.id, d.i, d.side);
      d.c.setAttribute('cx', q.x);
      d.c.setAttribute('cy', q.y);
    });
  }

  // opts.enter: the window glides in — it starts a little low and small and
  // eases to its place through the same viscous follow as a drag
  function register(el, kind, opts = {}) {
    if (byId[el.id]) return byId[el.id];
    el.dataset.kind = kind;
    const tx = +el.dataset.x || 0, ty = +el.dataset.y || 0;
    const enter = opts.enter && !calm;
    const n = {
      el,
      x: tx, y: enter ? ty + 26 : ty,
      tx, ty,
      r: 0, s: enter ? 0.94 : 1, ts: 1, lever: 0, z: ++z
    };
    nodes.push(n);
    byId[el.id] = n;
    makePorts(n);
    restack();
    apply(n);
    draw();
    if (enter) kick();
    return n;
  }

  function removeWindow(el) {
    const n = byId[el.id];
    if (!n) return;
    for (let i = links.length - 1; i >= 0; i--) {
      if (links[i].from[0] === el.id || links[i].to[0] === el.id) {
        links[i].svg.remove();
        links.splice(i, 1);
      }
    }
    dots = dots.filter(d => {
      if (d.id !== el.id) return true;
      d.c.remove();
      return false;
    });
    if (n.ports) n.ports.remove();
    nodes = nodes.filter(m => m !== n);
    delete byId[el.id];
    draw();
  }

  // rebuild a window's port layer (meta rows can be replaced after register)
  function refreshPorts(el) {
    const n = byId[el.id];
    if (!n) return;
    dots = dots.filter(d => {
      if (d.id !== el.id) return true;
      d.c.remove();
      return false;
    });
    if (n.ports) n.ports.remove();
    makePorts(n);
    restack();
    draw();
  }

  function addLink(fromId, toId, pathId) {
    const l = { a: fromId, b: toId };
    l.from = [fromId, PORT[byId[toId].el.dataset.kind], 'right'];
    l.to = [toId, PORT[byId[fromId].el.dataset.kind], 'left'];
    l.svg = layer();
    l.path = l.svg.appendChild(document.createElementNS(NS, 'path'));
    l.path.setAttribute('class', 'wire');
    if (pathId) l.path.id = pathId;
    links.push(l);
    linkPorts(byId[fromId]);
    linkPorts(byId[toId]);
    restack();
    draw();
  }

  function removeLinksTo(id) {
    for (let i = links.length - 1; i >= 0; i--) {
      if (links[i].to[0] !== id) continue;
      const from = links[i].from[0];
      links[i].svg.remove();
      links.splice(i, 1);
      linkPorts(byId[from]);
    }
    draw();
  }

  function setFlow(id, on) {
    links.forEach(l => { if (l.path.id === id) l.path.classList.toggle('flow', on); });
  }

  /* ============================ the view ============================ */
  const view = { x: 0, y: 0, s: 1, tx: 0, ty: 0, ts: 1 };

  function applyView() {
    canvas.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.s})`;
    if (pct) pct.textContent = Math.round(view.ts * 100) + '%';
  }
  const snapView = () => { view.x = view.tx; view.y = view.ty; view.s = view.ts; applyView(); };
  const toCanvas = (cx, cy) => {
    const r = stage.getBoundingClientRect();
    return { x: (cx - r.left - view.x) / view.s, y: (cy - r.top - view.y) / view.s };
  };

  // zoom to s keeping the canvas point under screen (sx, sy) where it is;
  // x, y and s ease with the same factor, so the anchor holds all the way
  function zoomTo(s, sx, sy, animate) {
    const r = stage.getBoundingClientRect();
    const px = sx - r.left, py = sy - r.top;
    const cx = (px - view.tx) / view.ts, cy = (py - view.ty) / view.ts;
    viscous = false;
    view.ts = clamp(s, ZMIN, ZMAX);
    view.tx = px - cx * view.ts;
    view.ty = py - cy * view.ts;
    if (animate) kick(); else snapView();
  }
  const zoomBy = (f, cx, cy) => {
    const r = stage.getBoundingClientRect();
    zoomTo(view.ts * f,
      cx === undefined ? r.left + r.width / 2 : cx,
      cy === undefined ? r.top + r.height / 2 : cy, true);
  };

  function panView(dx, dy) {
    view.x += dx; view.y += dy; view.tx += dx; view.ty += dy;
    applyView();
  }

  // frame a set of boxes {x, y, w, h} (canvas px) in the viewport
  function frameRects(rects, animate) {
    const r = stage.getBoundingClientRect();
    const pad = 40;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    rects.forEach(b => {
      x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y);
      x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h);
    });
    if (x0 === Infinity) return;
    const s = clamp(Math.min((r.width - 2 * pad) / (x1 - x0),
                             (r.height - 2 * pad) / (y1 - y0)), ZMIN, 1);
    viscous = false;
    view.ts = s;
    view.tx = (r.width - (x1 - x0) * s) / 2 - x0 * s;
    view.ty = (r.height - (y1 - y0) * s) / 2 - y0 * s;
    if (animate) kick(); else snapView();
  }
  const fitAll = animate => frameRects(nodes.map(n => box(n.el.id)), animate);

  // a window's live target box in canvas px (where it is, or is gliding to)
  function box(id) {
    const n = byId[id];
    return n ? { x: n.tx, y: n.ty, w: n.el.offsetWidth, h: n.el.offsetHeight } : null;
  }

  // glide the view so the window's final footprint is inside the viewport
  function reveal(target) {
    const n = byId[target.id];
    if (!n) return;
    const r = stage.getBoundingClientRect();
    const margin = Math.min(60, r.width * 0.06);
    const w = n.el.offsetWidth * view.ts, h = n.el.offsetHeight * view.ts;
    const left = view.tx + n.tx * view.ts, top = view.ty + n.ty * view.ts;
    let dx = 0, dy = 0;
    if (left + w > r.width - margin) dx = (r.width - margin) - (left + w);
    else if (left < margin) dx = margin - left;
    if (top + h > r.height - margin) dy = (r.height - margin) - (top + h);
    else if (top < margin) dy = margin - top;
    if (dx || dy) {
      view.tx += dx;
      view.ty += dy;
      kick();
    }
  }

  /* ==================== pointers: drag / pan / pinch ==================== */
  let touched = false;
  const pts = new Map();
  let drag = null, pinch = null, pan = null;
  let viscous = false;   // the view is easing with drag viscosity (a pan, or its settle after release)

  function endPan() {
    if (!pan) return;
    pan = null;
    stage.classList.remove('is-panning');
  }

  function endWindowDrag() {
    if (!drag) return;
    drag.n.el.classList.remove('is-dragging');
    drag.n.ts = 1;
    drag = null;                       // no throw: a viscous medium eats momentum
    kick();
  }
  function startPinch() {
    endWindowDrag();
    endPan();
    const [a, b] = [...pts.values()];
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    pinch = { d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, s0: view.s, c0: toCanvas(mid.x, mid.y) };
  }

  function onPointerDown(e) {
    if (e.button !== undefined && e.button !== 0) return;
    if (e.target.closest('.btn, textarea, .node__close, video')) return; // buttons / text / video controls are not drag handles
    touched = true;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { stage.setPointerCapture(e.pointerId); } catch (_) {}
    if (pts.size === 2) { startPinch(); return; }
    if (pts.size > 2) return;

    // a window drags itself; empty space pans the whole board
    const el = e.target.closest('.node');
    if (!el || !byId[el.id]) {
      pan = { id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, stuck: BREAK > 0 };
      stage.classList.add('is-panning');
      return;
    }
    const n = byId[el.id], p = toCanvas(e.clientX, e.clientY);
    drag = { n, id: e.pointerId, ox: p.x - n.tx, oy: p.y - n.ty,
             sx: e.clientX, sy: e.clientY, stuck: BREAK > 0 };
    n.lever = clamp((el.offsetHeight / 2 - drag.oy) / (el.offsetHeight / 2), -1, 1);
    n.z = ++z;
    restack();
    el.classList.add('is-dragging');
    n.ts = LIFT;
    kick();
  }

  function onPointerMove(e) {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pinch && pts.size >= 2) {
      const [a, b] = [...pts.values()];
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const r = stage.getBoundingClientRect();
      const s = clamp(pinch.s0 * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d0, ZMIN, ZMAX);
      view.ts = s;
      view.tx = mid.x - r.left - pinch.c0.x * s;
      view.ty = mid.y - r.top - pinch.c0.y * s;
      snapView();
      return;
    }
    if (pan && e.pointerId === pan.id) {
      // same viscous feel as a window drag: the board holds until the
      // pointer breaks free, then its target moves 1:1 and the view eases
      // after it through FOLLOW (see tick); on release it settles, no throw
      if (pan.stuck) {
        if (Math.hypot(e.clientX - pan.sx, e.clientY - pan.sy) < BREAK) return;
        pan.stuck = false;
      }
      viscous = true;
      view.tx += e.clientX - pan.x;
      view.ty += e.clientY - pan.y;
      pan.x = e.clientX;
      pan.y = e.clientY;
      kick();
      return;
    }
    if (drag && e.pointerId === drag.id) {
      if (drag.stuck) {
        if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < BREAK) return;
        drag.stuck = false;              // breaks free — the lag absorbs the jump
      }
      const p = toCanvas(e.clientX, e.clientY);
      drag.n.tx = p.x - drag.ox;
      drag.n.ty = p.y - drag.oy;
      kick();
    }
  }

  const onPointerUp = e => {
    if (!pts.has(e.pointerId)) return;
    pts.delete(e.pointerId);
    if (pinch && pts.size < 2) pinch = null;
    if (drag && e.pointerId === drag.id) endWindowDrag();
    if (pan && e.pointerId === pan.id) endPan();
  };

  /* ============================ the loop ============================ */
  let raf = 0, last = 0, reflowUntil = 0;
  function kick() { if (!raf) { last = performance.now(); raf = requestAnimationFrame(tick); } }

  function tick(t) {
    const dt = Math.min(0.05, (t - last) / 1000) || 1 / 60;
    last = t;
    const f  = 1 - Math.pow(1 - FOLLOW, dt * 60);
    const fe = 1 - Math.pow(1 - EASE, dt * 60);
    // a pan trails the pointer with the window-drag viscosity, and keeps it
    // through the settle after release; zoom / fit glides ease quicker
    const fv = 1 - Math.pow(1 - (viscous ? FOLLOW : VIEW_EASE), dt * 60);
    let busy = false;

    for (const n of nodes) {
      const px = n.x;
      n.x += (n.tx - n.x) * f;
      n.y += (n.ty - n.y) * f;
      const vx = (n.x - px) / (dt * 60);
      n.r += (clamp(vx * TILT * n.lever, -TILT_MAX, TILT_MAX) - n.r) * fe;
      n.s += (n.ts - n.s) * fe;
      const settled = Math.abs(n.tx - n.x) < 0.05 && Math.abs(n.ty - n.y) < 0.05 &&
                      Math.abs(n.r) < 0.005 && Math.abs(n.ts - n.s) < 0.0004;
      if (settled) { n.x = n.tx; n.y = n.ty; n.r = 0; n.s = n.ts; } else busy = true;
      apply(n);
    }

    if (view.x !== view.tx || view.y !== view.ty || view.s !== view.ts) {
      view.x += (view.tx - view.x) * fv;
      view.y += (view.ty - view.y) * fv;
      view.s += (view.ts - view.s) * fv;
      if (Math.abs(view.tx - view.x) < 0.05 && Math.abs(view.ty - view.y) < 0.05 &&
          Math.abs(view.ts - view.s) < 0.0002) { view.x = view.tx; view.y = view.ty; view.s = view.ts; viscous = false; }
      else busy = true;
      applyView();
    }

    if (t < reflowUntil) busy = true;   // a well is changing height: ports move
    draw();
    raf = (busy || drag) ? requestAnimationFrame(tick) : 0;
  }

  /* ============================ init ============================ */
  function init() {
    stage = document.getElementById('stage');
    canvas = document.getElementById('canvas');
    pct = document.getElementById('pct');
    if (!stage || !canvas) return;

    stage.addEventListener('pointerdown', onPointerDown);
    stage.addEventListener('pointermove', onPointerMove);
    stage.addEventListener('pointerup', onPointerUp);
    stage.addEventListener('pointercancel', onPointerUp);
    stage.addEventListener('dragstart', e => e.preventDefault()); // no native image ghost-drags

    // wheel = zoom, anchored on the cursor; a mouse notch eases, trackpad
    // scroll / ctrl+pinch tracks directly
    stage.addEventListener('wheel', e => {
      e.preventDefault();
      touched = true;
      const dy = e.deltaY * (e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 400 : 1);
      const pinchW = e.ctrlKey || e.metaKey;
      const notch = !pinchW && Math.abs(dy) >= 50;
      const k = pinchW ? 0.01 : 0.0015;   // one notch (deltaY 100): ×1.16 in, ×0.86 out
      zoomTo(view.ts * Math.exp(-dy * k), e.clientX, e.clientY, notch);
    }, { passive: false });

    // Safari desktop pinch fires gesture events instead of ctrl+wheel
    let g0 = null;
    stage.addEventListener('gesturestart', e => { e.preventDefault(); g0 = pts.size ? null : view.ts; });
    stage.addEventListener('gesturechange', e => {
      e.preventDefault();
      if (g0 != null) zoomTo(g0 * e.scale, e.clientX, e.clientY, false);
    });
    stage.addEventListener('gestureend', e => { e.preventDefault(); g0 = null; });

    // Cmd/Ctrl +/-/0: zoom steps and fit-all (wheel zooms, no pan)
    addEventListener('keydown', e => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key === '=' || e.key === '+') { e.preventDefault(); touched = true; zoomBy(ZSTEP); }
      else if (e.key === '-') { e.preventDefault(); touched = true; zoomBy(1 / ZSTEP); }
      else if (e.key === '0') { e.preventDefault(); touched = false; fitAll(true); }
    });

    // keep wires attached whenever a window's box changes (well expand, spawn)
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => draw());
      ro.observe(canvas);
    }

    const settle = () => { draw(); if (!touched) fitAll(false); };
    addEventListener('load', settle);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(settle);
  }

  return {
    init, register, removeWindow, addLink, removeLinksTo, setFlow, refreshPorts,
    reveal, fitAll, zoomBy, frameRects, box,
    get touched() { return touched; },
    fit: animate => { if (!touched) fitAll(animate); },
    home: animate => { touched = false; fitAll(animate); },
    reflow: ms => { reflowUntil = performance.now() + ms; kick(); },
    pan: panView,
    setOffset: (x, y, animate) => { view.tx = x; view.ty = y; if (animate) kick(); else snapView(); },
    get: () => ({ x: view.x, y: view.y, scale: view.s, tx: view.tx, ty: view.ty, tScale: view.ts }),
    kick
  };
})();
