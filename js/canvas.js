/* Canvas — pannable, auto-fitting workspace.
 * Drag empty space to pan, wheel to pan (deltaY → y, deltaX / shift+wheel → x),
 * double-click empty space to ease back to a fitted view. Whenever the graph
 * is about to overflow the viewport, the whole canvas smoothly zooms out
 * instead — transform: translate(x, y) scale(s), transform-origin: 0 0,
 * never above 1, floored at 0.45; whatever still overflows at the floor is
 * handled by pan/reveal. Disabled under 700px (mobile: native scroll).
 *
 *   Canvas.init()
 *   Canvas.pan(dx, dy)
 *   Canvas.fit(animate)        — recompute the auto-fit scale and re-clamp
 *   Canvas.reveal(el)          — minimal pan that brings el into view
 *   Canvas.setOffset(x, y, animate)
 *   Canvas.get() → { x, y, scale }
 */
const Canvas = (() => {
  const FLOOR = 0.45;    // never zoom out beyond this
  const MARGIN = 0.04;   // comfortable viewport margin for auto-fit (4vw/4vh)
  let el = null;
  let graph = null;
  let ox = 0;
  let oy = 0;
  let scale = 1;
  let dragging = false;
  let startX = 0;
  let startY = 0;
  let baseX = 0;
  let baseY = 0;
  let zoomTimer = null;

  const enabled = () => window.innerWidth >= 700;

  function init() {
    el = document.getElementById('canvas');
    graph = document.getElementById('graph');

    el.addEventListener('pointerdown', ev => {
      if (!enabled() || ev.target.closest('.node')) return; // pan starts on empty space only
      dragging = true;
      startX = ev.clientX;
      startY = ev.clientY;
      baseX = ox;
      baseY = oy;
      el.classList.add('panning');
      el.setPointerCapture(ev.pointerId);
    });
    el.addEventListener('pointermove', ev => {
      if (!dragging) return;
      set(baseX + ev.clientX - startX, baseY + ev.clientY - startY, scale, false);
    });
    const endDrag = () => { dragging = false; el.classList.remove('panning'); };
    el.addEventListener('pointerup', endDrag);
    el.addEventListener('pointercancel', endDrag);

    el.addEventListener('wheel', ev => {
      if (!enabled()) return;
      if (ev.target.closest('.child__doc') || ev.target.closest('#query')) return; // let these scroll internally
      ev.preventDefault();
      const dx = ev.deltaX || (ev.shiftKey ? ev.deltaY : 0);
      const dy = ev.shiftKey ? 0 : ev.deltaY;
      set(ox - dx, oy - dy, scale, false);
    }, { passive: false });

    el.addEventListener('dblclick', ev => {
      if (!enabled() || ev.target.closest('.node')) return;
      set(0, 0, fitScale(), true); // ease offset AND zoom back to the fitted view
    });

    window.addEventListener('resize', () => set(ox, oy, scale, false)); // re-clamp
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

  function set(x, y, s, animate) {
    if (animate) {
      el.classList.add('zooming'); // CSS: transition transform .45s ease
      if (zoomTimer) clearTimeout(zoomTimer);
      zoomTimer = setTimeout(() => el.classList.remove('zooming'), 500);
    } else {
      el.classList.remove('zooming'); // drags/wheel stay immediate, no lag
    }
    scale = s;
    [ox, oy] = clampXY(x, y, s);
    el.style.transform = `translate(${ox}px, ${oy}px) scale(${s})`;
  }

  function fit(animate) {
    if (!enabled()) return;
    set(ox, oy, fitScale(), animate);
  }

  function pan(dx, dy) { set(ox + dx, oy + dy, scale, false); }
  function setOffset(x, y, animate) { set(x, y, scale, !!animate); }
  function get() { return { x: ox, y: oy, scale }; }

  // layout (canvas-space) rect of a descendant via offset* — exact even
  // mid-zoom, unlike getBoundingClientRect which reports the moving frame
  function layoutRect(target) {
    let l = 0;
    let t = 0;
    let n = target;
    while (n && n !== el) { l += n.offsetLeft; t += n.offsetTop; n = n.offsetParent; }
    return { l, t, w: target.offsetWidth, h: target.offsetHeight };
  }

  // if any part of el sits outside the viewport once the current zoom
  // settles, pan the minimum that brings it back in (6vw right margin)
  function reveal(target) {
    if (!enabled() || !target) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const r = layoutRect(target);
    const margin = vw * 0.06;
    const left = ox + r.l * scale;
    const right = ox + (r.l + r.w) * scale;
    const top = oy + r.t * scale;
    const bottom = oy + (r.t + r.h) * scale;
    let dx = 0;
    let dy = 0;
    if (right > vw - margin) dx = (vw - margin) - right;
    else if (left < 0) dx = -left;
    if (bottom > vh) dy = vh - bottom;
    else if (top < 0) dy = -top;
    if (dx || dy) set(ox + dx, oy + dy, scale, true);
  }

  return { init, pan, fit, reveal, setOffset, get };
})();
