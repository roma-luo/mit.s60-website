/* Canvas — pannable, zoomable, auto-fitting workspace with inertial motion.
 * Wheel zooms IN/OUT around the cursor, drag pans, pointerup flings with
 * inertia, double-click glides back to a fitted view. Interaction never
 * mutates the transform directly: events push TARGETS (tScale/tOx/tOy) and
 * a requestAnimationFrame loop eases current → target every frame
 * (factor 0.18, snap below 1e-3) — one transform write per frame, no CSS
 * transitions fighting it. transform: translate(x, y) scale(s), origin 0 0.
 * Auto-fit only ever shrinks (a manual zoom-out is never undone); whatever
 * still overflows at the fit floor is handled by pan/reveal.
 * Disabled under 700px (mobile: native scroll).
 *
 *   Canvas.init()
 *   Canvas.pan(dx, dy)
 *   Canvas.fit(animate)        — shrink-only auto-fit (animate=false snaps)
 *   Canvas.reveal(el)          — minimal glide that brings el into view
 *   Canvas.setOffset(x, y, animate)
 *   Canvas.get() → { x, y, scale, tx, ty, tScale }
 */
const Canvas = (() => {
  const FLOOR = 0.45;    // auto-fit never zooms out beyond this
  const MARGIN = 0.04;   // comfortable viewport margin for auto-fit (4vw/4vh)
  const ZOOM_MIN = 0.3;
  const ZOOM_MAX = 2.5;
  const EASE = 0.18;     // per-frame ease factor of the rAF loop
  const SNAP = 1e-3;     // settle threshold
  const FLING_T = 0.22;  // fling distance = velocity × this, seconds
  const FLING_MIN = 60;  // px/s below which a drag just stops, no fling
  const VEL_WINDOW = 100;// ms of pointer history used for fling velocity

  let el = null;
  let graph = null;
  // current (rendered) state
  let ox = 0;
  let oy = 0;
  let scale = 1;
  // targets the rAF loop eases toward
  let tOx = 0;
  let tOy = 0;
  let tScale = 1;
  let rafId = null;
  // drag state + short velocity window for the fling
  let dragging = false;
  let startX = 0;
  let startY = 0;
  let baseX = 0;
  let baseY = 0;
  const moves = [];

  const enabled = () => window.innerWidth >= 700;

  function init() {
    el = document.getElementById('canvas');
    graph = document.getElementById('graph');

    el.addEventListener('pointerdown', ev => {
      if (!enabled() || ev.target.closest('.node')) return; // pan starts on empty space only
      dragging = true;
      moves.length = 0;
      track(ev);
      // a new drag kills any in-flight fling: targets jump to current
      tScale = scale;
      tOx = ox;
      tOy = oy;
      startX = ev.clientX;
      startY = ev.clientY;
      baseX = ox;
      baseY = oy;
      el.classList.add('panning');
      el.setPointerCapture(ev.pointerId);
    });
    el.addEventListener('pointermove', ev => {
      if (!dragging) return;
      track(ev);
      set(baseX + ev.clientX - startX, baseY + ev.clientY - startY, scale); // direct 1:1
    });
    const endDrag = () => {
      if (!dragging) return;
      dragging = false;
      el.classList.remove('panning');
      // fling: average velocity over the last ~100ms of the drag
      if (moves.length >= 2) {
        const first = moves[0];
        const last = moves[moves.length - 1];
        const dt = (last.t - first.t) / 1000;
        if (dt > 0.01) {
          const vx = (last.x - first.x) / dt;
          const vy = (last.y - first.y) / dt;
          if (Math.hypot(vx, vy) > FLING_MIN) {
            [tOx, tOy] = clampXY(ox + vx * FLING_T, oy + vy * FLING_T, scale);
            poke(); // the loop glides there, landing on bounds if clamped
            return;
          }
        }
      }
      tOx = ox;
      tOy = oy; // below threshold: settle exactly where the drag ended
    };
    el.addEventListener('pointerup', endDrag);
    el.addEventListener('pointercancel', endDrag);

    el.addEventListener('wheel', ev => {
      if (!enabled()) return;
      if (ev.target.closest('.child__doc') || ev.target.closest('#query')) return; // let these scroll internally
      ev.preventDefault();
      // wheel = eased zoom to cursor. Normalize line-mode (Firefox) and pixel
      // deltas (trackpads send fractions): ~1.1× per notch on the TARGET so
      // fast notches compound, clamped.
      const notch = ev.deltaMode === 1 ? ev.deltaY : ev.deltaY / 100;
      const next = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, tScale * Math.pow(1.1, -notch)));
      if (next === tScale) return;
      // anchor invariance holds when the glide settles: at that moment
      // ox=tOx, scale=tScale, so (ax − tOx)/tScale equals the event-time
      // layout point under the pointer
      tScale = next;
      [tOx, tOy] = clampXY(
        ev.clientX - (ev.clientX - ox) * (tScale / scale),
        ev.clientY - (ev.clientY - oy) * (tScale / scale),
        tScale
      );
      poke(); // also kills any in-flight fling by retargeting
    }, { passive: false });

    el.addEventListener('dblclick', ev => {
      if (!enabled() || ev.target.closest('.node')) return;
      retarget(0, 0, fitScale(), false); // glide home to the fitted view
    });

    window.addEventListener('resize', () => { // re-clamp current and target
      [tOx, tOy] = clampXY(tOx, tOy, tScale);
      [ox, oy] = clampXY(ox, oy, scale);
      apply();
      poke();
    });
  }

  function track(ev) {
    const now = performance.now();
    moves.push({ t: now, x: ev.clientX, y: ev.clientY });
    while (moves.length && now - moves[0].t > VEL_WINDOW) moves.shift();
  }

  /* ---- the rAF loop: ease current → target, one transform write per frame */
  function tick() {
    scale += (tScale - scale) * EASE;
    ox += (tOx - ox) * EASE;
    oy += (tOy - oy) * EASE;
    if (Math.abs(tScale - scale) < SNAP && Math.abs(tOx - ox) < SNAP && Math.abs(tOy - oy) < SNAP) {
      scale = tScale;
      ox = tOx;
      oy = tOy;
      apply();
      rafId = null;
      return;
    }
    apply();
    rafId = requestAnimationFrame(tick);
  }

  function poke() {
    if (!rafId) rafId = requestAnimationFrame(tick);
  }

  function apply() {
    el.style.transform = `translate(${ox}px, ${oy}px) scale(${scale})`;
  }

  // direct set (drag tracking, programmatic snaps): current and target
  // jump together so the loop has nothing to ease
  function set(x, y, s) {
    scale = s;
    [ox, oy] = clampXY(x, y, s);
    tScale = scale;
    tOx = ox;
    tOy = oy;
    apply();
  }

  // push a target; the loop glides there (snap = jump instantly)
  function retarget(x, y, s, snap) {
    tScale = s;
    [tOx, tOy] = clampXY(x, y, s);
    if (snap) set(tOx, tOy, tScale);
    else poke();
  }

  // size of the graph's CONTENT (cards + gaps + padding), not the box —
  // the box is at least 100vw/100vh by min-width/min-height, which would
  // force a permanent 0.96 zoom
  function contentSize() {
    let w = 0;
    let h = 0;
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

  // auto-fit target: the largest scale ≤ 1 (floored) at which the content,
  // viewport minus the margin, still fits entirely
  function fitScale() {
    if (!enabled()) return 1;
    const availW = window.innerWidth * (1 - MARGIN);
    const availH = window.innerHeight * (1 - MARGIN);
    const cs = contentSize();
    return Math.max(FLOOR, Math.min(1, availW / cs.w, availH / cs.h));
  }

  // pan clamp, scale-aware: on-screen size = layout size × s. The graph may
  // not be dragged past the viewport; when it fits at the current scale the
  // offset eases back to 0
  function clampXY(x, y, s) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const GW = graph.offsetWidth * s;
    const GH = graph.offsetHeight * s;
    const gl = graph.offsetLeft * s;
    const gt = graph.offsetTop * s;
    return [
      GW <= vw ? 0 : Math.min(-gl, Math.max(vw - gl - GW, x)),
      GH <= vh ? 0 : Math.min(-gt, Math.max(vh - gt - GH, y))
    ];
  }

  function fit(animate) {
    if (!enabled()) return;
    const target = fitScale();
    // shrink-only: zoom out when content would overflow at the user's current
    // trajectory, but NEVER force the scale back up after a manual zoom-out
    if (target < tScale) retarget(tOx, tOy, target, animate === false);
    else retarget(tOx, tOy, tScale, animate === false); // fits: just re-clamp
  }

  function pan(dx, dy) { set(ox + dx, oy + dy, scale); }
  function setOffset(x, y, animate) { retarget(x, y, scale, !animate); }
  function get() { return { x: ox, y: oy, scale, tx: tOx, ty: tOy, tScale }; }

  // layout (canvas-space) rect of a descendant via offset* — exact even
  // mid-zoom, unlike getBoundingClientRect which reports the moving frame
  function layoutRect(target) {
    let l = 0;
    let t = 0;
    let n = target;
    while (n && n !== el) { l += n.offsetLeft; t += n.offsetTop; n = n.offsetParent; }
    return { l, t, w: target.offsetWidth, h: target.offsetHeight };
  }

  // if any part of el sits outside the viewport once the current glide
  // settles, pan the minimum that brings it back in (6vw right margin)
  function reveal(target) {
    if (!enabled() || !target) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const r = layoutRect(target);
    const margin = vw * 0.06;
    const left = tOx + r.l * tScale;
    const right = tOx + (r.l + r.w) * tScale;
    const top = tOy + r.t * tScale;
    const bottom = tOy + (r.t + r.h) * tScale;
    let dx = 0;
    let dy = 0;
    if (right > vw - margin) dx = (vw - margin) - right;
    else if (left < 0) dx = -left;
    if (bottom > vh) dy = vh - bottom;
    else if (top < 0) dy = -top;
    if (dx || dy) retarget(tOx + dx, tOy + dy, tScale, false);
  }

  return { init, pan, fit, reveal, setOffset, get };
})();
