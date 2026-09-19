/* Face — procedural 2D canvas face ("Delamain-style" digital self).
 *
 * Public API (swap point for a future 3D / video renderer):
 *   Face.init(canvasElement)
 *   Face.setState(mode)   — 'idle' | 'listening' | 'thinking' | 'speaking' | 'showing'
 *   Face.setMouth(v)      — mouth openness 0..1, driven by Voice while speaking
 *   Face.lookAt(x, y)     — gaze direction, each in -1..1
 */
var Face = (() => {
  let canvas, ctx, W, H, rafId = null;

  const INK = '#7fd8e8';
  const INK_DIM = '#3d6d7a';
  const GLOW = '#4fc3f7';

  const s = {
    mode: 'idle',
    t: 0,
    mouth: 0, mouthT: 0,
    blink: 1, blinkT: 1,
    gazeX: 0, gazeY: 0, gazeXT: 0, gazeYT: 0,
    brow: 0, browT: 0,        // -1 raised … 0 neutral … 1 furrowed
    eyeWide: 0, eyeWideT: 0,  // 0 normal … 1 wide
    tilt: 0, tiltT: 0,        // head tilt, radians
    lean: 1, leanT: 1,        // scale; >1 leans toward viewer
    scratch: 0,               // 0..1 scratch-gesture progress, 0 = hand away
    nextBlink: 2.5,
    nextGaze: 3,
    nextScratch: 18,
    scratching: false,
    scratchT: 0,
  };

  function init(el) {
    canvas = el;
    ctx = canvas.getContext('2d');
    resize();
    window.addEventListener('resize', resize);
    rafId = requestAnimationFrame(loop);
  }

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function setState(mode) {
    s.mode = mode;
    if (mode === 'thinking')      { s.browT = 1;   s.eyeWideT = -0.4; s.tiltT = 0.06;  s.leanT = 1;    }
    else if (mode === 'listening'){ s.browT = -0.5; s.eyeWideT = 0.5;  s.tiltT = 0;     s.leanT = 1.03; }
    else if (mode === 'showing')  { s.browT = -0.3; s.eyeWideT = 0;    s.tiltT = -0.04; s.leanT = 1;    s.gazeXT = 0.8; }
    else                          { s.browT = 0;    s.eyeWideT = 0;    s.tiltT = 0;     s.leanT = 1;    }
    if (mode !== 'showing' && mode !== 'idle') s.gazeXT = 0;
  }

  function setMouth(v) { s.mouthT = Math.max(0, Math.min(1, v)); }
  function lookAt(x, y) { s.gazeXT = x; s.gazeYT = y; }

  const lerp = (a, b, k) => a + (b - a) * k;

  function idle(dt) {
    s.nextBlink -= dt;
    if (s.nextBlink <= 0) {
      s.blinkT = 0;
      setTimeout(() => { s.blinkT = 1; }, 120);
      s.nextBlink = 2 + Math.random() * 4;
    }
    if (s.mode === 'idle') {
      s.nextGaze -= dt;
      if (s.nextGaze <= 0) {
        s.gazeXT = (Math.random() - 0.5) * 0.9;
        s.gazeYT = (Math.random() - 0.5) * 0.4;
        s.nextGaze = 2 + Math.random() * 3.5;
      }
      s.nextScratch -= dt;
      if (s.nextScratch <= 0 && !s.scratching) {
        s.scratching = true;
        s.scratchT = 0;
        s.nextScratch = 20 + Math.random() * 25;
      }
    }
    if (s.scratching) {
      s.scratchT += dt / 1.6;
      s.scratch = s.scratchT < 0.25 ? s.scratchT / 0.25
                : s.scratchT > 0.75 ? Math.max(0, 1 - (s.scratchT - 0.75) / 0.25)
                : 1;
      if (s.scratchT >= 1) { s.scratching = false; s.scratch = 0; }
    }
  }

  function loop(now) {
    const dt = Math.min(0.05, (now - (loop.last || now)) / 1000);
    loop.last = now;
    s.t += dt;
    idle(dt);

    const k = 1 - Math.pow(0.001, dt); // frame-rate independent smoothing
    s.mouth   = lerp(s.mouth,   s.mouthT,   k);
    s.blink   = lerp(s.blink,   s.blinkT,   k * 2);
    s.gazeX   = lerp(s.gazeX,   s.gazeXT,   k);
    s.gazeY   = lerp(s.gazeY,   s.gazeYT,   k);
    s.brow    = lerp(s.brow,    s.browT,    k);
    s.eyeWide = lerp(s.eyeWide, s.eyeWideT, k);
    s.tilt    = lerp(s.tilt,    s.tiltT,    k);
    s.lean    = lerp(s.lean,    s.leanT,    k);

    draw();
    rafId = requestAnimationFrame(loop);
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    const r = Math.min(W, H) * 0.26;
    const cx = W / 2;
    const cy = H / 2 + Math.sin(s.t * 0.6) * r * 0.012; // breathing

    // faint digital ambience: concentric scan rings behind the head
    ctx.save();
    ctx.strokeStyle = 'rgba(79,195,247,0.05)';
    ctx.lineWidth = 1;
    for (let i = 1; i <= 4; i++) {
      ctx.beginPath();
      ctx.arc(cx, cy, r * (1.2 + i * 0.35) + Math.sin(s.t * 0.8 + i) * 3, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(s.tilt);
    ctx.scale(s.lean, s.lean);
    ctx.lineWidth = Math.max(1.5, r * 0.018);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = INK;
    ctx.shadowColor = GLOW;
    ctx.shadowBlur = r * 0.08;

    head(r);
    hair(r);
    eye(-0.36 * r, -0.10 * r, r);
    eye( 0.36 * r, -0.10 * r, r);
    brow(-0.36 * r, -0.30 * r, r);
    brow( 0.36 * r, -0.30 * r, r);
    nose(r);
    mouth(0, 0.46 * r, r);
    if (s.scratch > 0) hand(r);

    ctx.restore();
  }

  function head(r) {
    ctx.beginPath();
    ctx.moveTo(0, -0.95 * r);
    ctx.bezierCurveTo( 0.62 * r, -0.95 * r,  0.60 * r, -0.25 * r,  0.50 * r, 0.10 * r);
    ctx.bezierCurveTo( 0.42 * r,  0.45 * r,  0.28 * r,  0.78 * r,  0, 0.82 * r);
    ctx.bezierCurveTo(-0.28 * r,  0.78 * r, -0.42 * r,  0.45 * r, -0.50 * r, 0.10 * r);
    ctx.bezierCurveTo(-0.60 * r, -0.25 * r, -0.62 * r, -0.95 * r,  0, -0.95 * r);
    ctx.stroke();
  }

  function hair(r) {
    ctx.strokeStyle = INK_DIM;
    ctx.beginPath();
    ctx.moveTo(-0.52 * r, -0.45 * r);
    ctx.bezierCurveTo(-0.72 * r, -1.02 * r, -0.30 * r, -1.12 * r, 0, -1.10 * r);
    ctx.bezierCurveTo(0.30 * r, -1.12 * r, 0.72 * r, -1.02 * r, 0.52 * r, -0.45 * r);
    ctx.bezierCurveTo(0.40 * r, -0.78 * r, 0.10 * r, -0.86 * r, 0, -0.85 * r);
    ctx.bezierCurveTo(-0.10 * r, -0.86 * r, -0.40 * r, -0.78 * r, -0.52 * r, -0.45 * r);
    ctx.stroke();
    ctx.strokeStyle = INK;
  }

  function eye(x, y, r) {
    const open = Math.max(0.04, s.blink) * (1 + s.eyeWide * 0.35);
    const w = 0.16 * r;
    const h = 0.085 * r * open;
    ctx.save();
    ctx.translate(x, y);
    ctx.beginPath();
    ctx.moveTo(-w, 0);
    ctx.quadraticCurveTo(0, -h * 2, w, 0);
    ctx.quadraticCurveTo(0, h * 2, -w, 0);
    ctx.stroke();
    if (s.blink > 0.3) {
      const gx = s.gazeX * w * 0.45;
      const gy = s.gazeY * h * 1.2;
      ctx.beginPath();
      ctx.arc(gx, gy, Math.min(w, Math.max(h, 0.01)) * 0.45, 0, Math.PI * 2);
      ctx.fillStyle = INK;
      ctx.fill();
    }
    ctx.restore();
  }

  function brow(x, y, r) {
    const lift = -s.brow * 0.03 * r; // furrowed: inner end dips
    const raise = s.brow < 0 ? s.brow * 0.04 * r : 0;
    const side = Math.sign(x);
    ctx.save();
    ctx.translate(x, y + raise);
    ctx.beginPath();
    ctx.moveTo(-0.14 * r, -lift * side);
    ctx.quadraticCurveTo(0, -0.045 * r + raise * 0.5, 0.14 * r, lift * side);
    ctx.stroke();
    ctx.restore();
  }

  function nose(r) {
    ctx.strokeStyle = INK_DIM;
    ctx.beginPath();
    ctx.moveTo(0.01 * r, 0.02 * r);
    ctx.quadraticCurveTo(0.05 * r, 0.18 * r, 0.03 * r, 0.26 * r);
    ctx.quadraticCurveTo(0.01 * r, 0.30 * r, -0.04 * r, 0.28 * r);
    ctx.stroke();
    ctx.strokeStyle = INK;
  }

  function mouth(x, y, r) {
    const w = 0.20 * r;
    const open = s.mouth;
    ctx.save();
    ctx.translate(x, y);
    ctx.beginPath();
    ctx.moveTo(-w, 0);
    if (open < 0.05) {
      ctx.quadraticCurveTo(0, 0.02 * r, w, 0);
    } else {
      const h = open * 0.16 * r;
      ctx.quadraticCurveTo(0, -0.02 * r, w, 0);
      ctx.quadraticCurveTo(0, h * 2, -w, 0);
      ctx.fillStyle = 'rgba(79,195,247,0.25)';
      ctx.fill();
    }
    ctx.stroke();
    ctx.restore();
  }

  function hand(r) {
    const p = s.scratch;
    const wob = Math.sin(s.t * 14) * 0.02 * r * (p > 0.9 ? 1 : 0);
    ctx.save();
    ctx.translate(0.62 * r + wob, 0.55 * r - p * 0.55 * r);
    ctx.rotate(-0.4);
    ctx.strokeStyle = INK_DIM;
    ctx.beginPath(); // simplified mitten hand
    ctx.arc(0, 0, 0.14 * r, Math.PI * 0.2, Math.PI * 1.8);
    ctx.moveTo(0.02 * r, -0.14 * r);
    ctx.lineTo(0.02 * r, -0.30 * r);
    ctx.stroke();
    ctx.strokeStyle = INK;
    ctx.restore();
  }

  return { init, setState, setMouth, lookAt };
})();
