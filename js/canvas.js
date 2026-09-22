/* Canvas — pannable, zoomable, auto-fitting workspace with inertial motion.
 *
 * Same public API as before:
 *   Canvas.init()
 *   Canvas.pan(dx, dy)
 *   Canvas.fit(animate)        — shrink-only auto-fit (animate=false snaps)
 *   Canvas.reveal(el)          — minimal glide that brings el into view
 *   Canvas.setOffset(x, y, animate)
 *   Canvas.get() → { x, y, scale, tx, ty, tScale }
 *   Canvas.zoomBy(factor, cx, cy)   NEW — for buttons / keyboard
 *
 * What changed vs. the previous version (all "feel" fixes):
 *  1. Easing is time-based (exp decay, TAU ms), not per-frame — identical
 *     speed on 60 / 120 / 144 Hz displays.
 *  2. Scale eases in LOG space, so zoom in and zoom out feel symmetric.
 *  3. Wheel anchoring is computed against the TARGET state, not the mid-glide
 *     current state — rapid notches compound exactly like an instant zoom,
 *     with no drift.
 *  4. Trackpad two-finger scroll = pan, pinch / ctrl+wheel = zoom, mouse
 *     wheel = zoom. Shift+wheel pans horizontally.
 *  5. When the graph is smaller than the viewport it is no longer slammed to
 *     the top-left (old clamp returned 0) — the anchor point is honoured and
 *     the graph just can't leave the viewport. Double-click centres it.
 *  6. Two-finger touch pinch/pan for tablets ≥ 700px.
 *  7. Wheel over an expanded doc only stays "internal" if the doc actually
 *     scrolls; otherwise it zooms/pans like everywhere else (no dead zone).
 */
const Canvas = (() => {
  const FLOOR = 0.45;      // auto-fit never zooms out beyond this
  const MARGIN = 0.04;     // viewport margin for auto-fit
  const ZOOM_MIN = 0.3;
  const ZOOM_MAX = 2.5;
  const TAU = 90;          // ms — time constant of the glide (lower = snappier)
  const SNAP = 1e-3;
  const FLING_T = 0.22;    // s — fling distance = velocity × this
  const FLING_MIN = 60;    // px/s
  const VEL_WINDOW = 100;  // ms of pointer history for fling velocity
  const WHEEL_ZOOM = 1.12; // per 100px of mouse-wheel delta
  const PINCH_ZOOM = 1.01; // per 1px of ctrl-wheel (trackpad pinch) delta

  let el = null;
  let graph = null;
  // current (rendered)
  let ox = 0, oy = 0, scale = 1;
  // target
  let tOx = 0, tOy = 0, tScale = 1;
  let rafId = null;
  let lastT = 0;

  // drag / pinch state
  const pointers = new Map(); // pointerId → {x, y}
  let dragging = false;
  let startX = 0, startY = 0, baseX = 0, baseY = 0;
  let pinch = null;          // { dist, cx, cy, scale, ox, oy }
  const moves = [];

  const enabled = () => window.innerWidth >= 700;
  const clampScale = s => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, s));

  /* ------------------------------------------------------------ init */
  function init() {
    el = document.getElementById('canvas');
    graph = document.getElementById('graph');

    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', onPointerUp);
    el.addEventListener('pointercancel', onPointerUp);
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('dblclick', ev => {
      if (!enabled() || ev.target.closest('.node')) return;
      home(true);
    });
    window.addEventListener('resize', () => {
      [tOx, tOy] = clampXY(tOx, tOy, tScale);
      [ox, oy] = clampXY(ox, oy, scale);
      apply();
      poke();
    });
  }

  /* ------------------------------------------------------- pointers */
  function onPointerDown(ev) {
    if (!enabled()) return;
    if (ev.pointerType === 'mouse' && ev.button !== 0) return;
    // pan starts on empty space only; touch may start anywhere so pinch works
    if (ev.pointerType !== 'touch' && ev.target.closest('.node')) return;

    pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    el.setPointerCapture(ev.pointerId);

    if (pointers.size === 2) {           // second finger → pinch
      dragging = false;
      el.classList.remove('panning');
      const [a, b] = [...pointers.values()];
      pinch = {
        dist: Math.hypot(b.x - a.x, b.y - a.y),
        cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2,
        scale: tScale, ox: tOx, oy: tOy
      };
      settleNow();
      return;
    }
    if (pointers.size > 2) return;

    // single pointer → pan (touch on a node only pans if it's not a scrollable)
    if (ev.pointerType === 'touch' && ev.target.closest('.node')) return;
    dragging = true;
    moves.length = 0;
    track(ev);
    settleNow();                          // kill in-flight fling
    startX = ev.clientX; startY = ev.clientY;
    baseX = ox; baseY = oy;
    el.classList.add('panning');
  }

  function onPointerMove(ev) {
    if (!pointers.has(ev.pointerId)) return;
    pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });

    if (pinch && pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      const dist = Math.hypot(b.x - a.x, b.y - a.y);
      const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
      const s = clampScale(pinch.scale * (dist / Math.max(1, pinch.dist)));
      // keep the layout point under the initial midpoint pinned, then pan by
      // the midpoint's travel
      const px = (pinch.cx - pinch.ox) / pinch.scale;
      const py = (pinch.cy - pinch.oy) / pinch.scale;
      set(cx - px * s, cy - py * s, s);
      return;
    }
    if (!dragging) return;
    track(ev);
    set(baseX + ev.clientX - startX, baseY + ev.clientY - startY, scale); // 1:1
  }

  function onPointerUp(ev) {
    pointers.delete(ev.pointerId);
    if (pinch) {
      if (pointers.size < 2) pinch = null;
      return;
    }
    if (!dragging) return;
    dragging = false;
    el.classList.remove('panning');
    if (moves.length >= 2) {
      const first = moves[0], last = moves[moves.length - 1];
      const dt = (last.t - first.t) / 1000;
      if (dt > 0.01) {
        const vx = (last.x - first.x) / dt;
        const vy = (last.y - first.y) / dt;
        if (Math.hypot(vx, vy) > FLING_MIN) {
          [tOx, tOy] = clampXY(ox + vx * FLING_T, oy + vy * FLING_T, scale);
          poke();
          return;
        }
      }
    }
    tOx = ox; tOy = oy;
  }

  function track(ev) {
    const now = performance.now();
    moves.push({ t: now, x: ev.clientX, y: ev.clientY });
    while (moves.length && now - moves[0].t > VEL_WINDOW) moves.shift();
  }

  /* ---------------------------------------------------------- wheel */
  function onWheel(ev) {
    if (!enabled()) return;
    // let genuinely scrollable inner content scroll itself
    const scroller = ev.target.closest('.child__doc, #query');
    if (scroller && scroller.scrollHeight > scroller.clientHeight + 1) return;
    ev.preventDefault();

    // Firefox line mode → approx pixels
    const dx = ev.deltaMode === 1 ? ev.deltaX * 16 : ev.deltaX;
    const dy = ev.deltaMode === 1 ? ev.deltaY * 16 : ev.deltaY;

    // pinch (browsers report trackpad pinch as ctrl+wheel) → zoom, fine grain
    if (ev.ctrlKey || ev.metaKey) {
      zoomBy(Math.pow(PINCH_ZOOM, -dy), ev.clientX, ev.clientY);
      return;
    }
    // trackpad two-finger scroll: small / fractional deltas or any deltaX
    const trackpad = dx !== 0 || (Math.abs(dy) < 50 && !Number.isInteger(dy)) || Math.abs(dy) < 20;
    if (trackpad) {
      settleNow();
      set(ox - dx, oy - dy, scale);
      return;
    }
    if (ev.shiftKey) {                    // mouse wheel + shift → horizontal pan
      retarget(tOx - dy, tOy, tScale, false);
      return;
    }
    // mouse wheel → zoom around cursor
    zoomBy(Math.pow(WHEEL_ZOOM, -dy / 100), ev.clientX, ev.clientY);
  }

  // zoom the TARGET by factor, keeping the layout point under (cx, cy) fixed.
  // Anchoring against the target (not the mid-glide current) means rapid
  // notches compound exactly like instant zooms — no drift.
  function zoomBy(factor, cx, cy) {
    if (cx === undefined) { cx = window.innerWidth / 2; cy = window.innerHeight / 2; }
    const next = clampScale(tScale * factor);
    if (next === tScale) return;
    const px = (cx - tOx) / tScale;
    const py = (cy - tOy) / tScale;
    tScale = next;
    [tOx, tOy] = clampXY(cx - px * next, cy - py * next, next);
    poke();
  }

  /* ------------------------------------------------------- rAF loop */
  function tick(now) {
    const dt = Math.min(64, now - (lastT || now)); // cap after tab switch
    lastT = now;
    const k = 1 - Math.exp(-dt / TAU);            // frame-rate independent

    // ease scale in log space, position linearly
    const ls = Math.log(scale), lt = Math.log(tScale);
    scale = Math.exp(ls + (lt - ls) * k);
    ox += (tOx - ox) * k;
    oy += (tOy - oy) * k;

    if (Math.abs(tScale - scale) < SNAP && Math.abs(tOx - ox) < SNAP && Math.abs(tOy - oy) < SNAP) {
      scale = tScale; ox = tOx; oy = tOy;
      apply();
      rafId = null;
      return;
    }
    apply();
    rafId = requestAnimationFrame(tick);
  }

  function poke() {
    if (!rafId) { lastT = 0; rafId = requestAnimationFrame(tick); }
  }

  function apply() {
    el.style.transform = `translate3d(${ox}px, ${oy}px, 0) scale(${scale})`;
  }

  // current and target jump together (drag tracking, snaps)
  function set(x, y, s) {
    scale = s;
    [ox, oy] = clampXY(x, y, s);
    tScale = scale; tOx = ox; tOy = oy;
    apply();
  }

  // targets collapse onto the current state (stops any glide)
  function settleNow() { tScale = scale; tOx = ox; tOy = oy; }

  function retarget(x, y, s, snap) {
    tScale = clampScale(s);
    [tOx, tOy] = clampXY(x, y, tScale);
    if (snap) set(tOx, tOy, tScale);
    else poke();
  }

  /* ------------------------------------------------------- geometry */
  function contentSize() {
    let w = 0, h = 0;
    for (const child of graph.children) {
      w = Math.max(w, child.offsetLeft + child.offsetWidth);
      h = Math.max(h, child.offsetTop + child.offsetHeight);
    }
    const cs = getComputedStyle(graph);
    return {
      w: w + (parseFloat(cs.paddingRight) || 0),
      h: h + (parseFloat(cs.paddingBottom) || 0)
    };
  }

  function fitScale() {
    if (!enabled()) return 1;
    const availW = window.innerWidth * (1 - MARGIN);
    const availH = window.innerHeight * (1 - MARGIN);
    const cs = contentSize();
    return Math.max(FLOOR, Math.min(1, availW / cs.w, availH / cs.h));
  }

  // The graph may never leave the viewport. Larger than viewport: edges can't
  // reveal empty space. Smaller than viewport: it may sit anywhere inside —
  // this is what keeps zoom-out anchored under the cursor instead of jumping
  // to the top-left corner.
  function clampXY(x, y, s) {
    const vw = window.innerWidth, vh = window.innerHeight;
    const GW = graph.offsetWidth * s, GH = graph.offsetHeight * s;
    const gl = graph.offsetLeft * s, gt = graph.offsetTop * s;
    const ax = -gl, bx = vw - gl - GW;
    const ay = -gt, by = vh - gt - GH;
    return [
      Math.min(Math.max(ax, bx), Math.max(Math.min(ax, bx), x)),
      Math.min(Math.max(ay, by), Math.max(Math.min(ay, by), y))
    ];
  }

  // glide to the fitted view, centred in the viewport
  function home(animate) {
    const s = fitScale();
    const GW = graph.offsetWidth * s, GH = graph.offsetHeight * s;
    const x = (window.innerWidth - GW) / 2 - graph.offsetLeft * s;
    const y = (window.innerHeight - GH) / 2 - graph.offsetTop * s;
    retarget(x, y, s, animate === false);
  }

  function fit(animate) {
    if (!enabled()) return;
    const target = fitScale();
    // shrink-only: never force the scale back up after a manual zoom-out
    if (target < tScale) retarget(tOx, tOy, target, animate === false);
    else retarget(tOx, tOy, tScale, animate === false); // just re-clamp
  }

  function pan(dx, dy) { set(ox + dx, oy + dy, scale); }
  function setOffset(x, y, animate) { retarget(x, y, scale, !animate); }
  function get() { return { x: ox, y: oy, scale, tx: tOx, ty: tOy, tScale }; }

  function layoutRect(target) {
    let l = 0, t = 0, n = target;
    while (n && n !== el) { l += n.offsetLeft; t += n.offsetTop; n = n.offsetParent; }
    return { l, t, w: target.offsetWidth, h: target.offsetHeight };
  }

  function reveal(target) {
    if (!enabled() || !target) return;
    const vw = window.innerWidth, vh = window.innerHeight;
    const r = layoutRect(target);
    const margin = vw * 0.06;
    const left = tOx + r.l * tScale, right = tOx + (r.l + r.w) * tScale;
    const top = tOy + r.t * tScale, bottom = tOy + (r.t + r.h) * tScale;
    let dx = 0, dy = 0;
    if (right > vw - margin) dx = (vw - margin) - right;
    else if (left < 0) dx = -left;
    if (bottom > vh) dy = vh - bottom;
    else if (top < 0) dy = -top;
    if (dx || dy) retarget(tOx + dx, tOy + dy, tScale, false);
  }

  return { init, pan, fit, reveal, setOffset, get, zoomBy, home };
})();
