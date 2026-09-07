/* ══════════════════════════════════════════════════════════════════
   Motion.

   Every animated value here is a spring, parameterised the way Apple
   frames it — response (seconds to target) and damping (1.0 = no
   overshoot) — and every one starts from the current on-screen value,
   so anything moving can be grabbed and reversed mid-flight.
   ══════════════════════════════════════════════════════════════════ */

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

class Spring {
  constructor({ response = 0.4, damping = 1.0, from = 0 } = {}) {
    this.w = (2 * Math.PI) / response;
    this.z = damping;
    this.value = from;
    this.target = from;
    this.velocity = 0;
  }
  /* Re-targeting keeps the current value and velocity, so a reversal
     blends through instead of hitting a brick wall. */
  to(target, velocity) {
    this.target = target;
    if (velocity !== undefined) this.velocity = velocity;
  }
  step(dt) {
    dt = Math.min(dt, 1 / 30);
    const d = this.value - this.target;
    const a = -this.w * this.w * d - 2 * this.z * this.w * this.velocity;
    this.velocity += a * dt;
    this.value += this.velocity * dt;
    return this.value;
  }
  get settled() {
    return Math.abs(this.value - this.target) < 0.3 && Math.abs(this.velocity) < 0.3;
  }
}

/* Apple's momentum projection — where a flick would come to rest.
   Exponential decay, not the v²/2a textbook form. */
const project = (v, decel = 0.998) => (v / 1000) * decel / (1 - decel);

/* Progressive resistance past a boundary: the further out, the less
   the element follows. Real things slow before they stop. */
const rubberband = (over, dim, c = 0.55) =>
  (over * dim * c) / (dim + c * Math.abs(over));

/* One display-synced loop drives every spring on the page. */
const running = new Set();
let last = 0, ticking = false;

function tick(now) {
  const dt = last ? (now - last) / 1000 : 1 / 60;
  last = now;
  for (const job of running) {
    job.spring.step(dt);
    job.draw(job.spring.value);
    if (job.spring.settled) {
      job.spring.value = job.spring.target;
      job.spring.velocity = 0;
      job.draw(job.spring.value);
      job.done?.();
      running.delete(job);
    }
  }
  if (running.size) requestAnimationFrame(tick);
  else { ticking = false; last = 0; }
}
function drive(job) {
  running.add(job);
  if (!ticking) { ticking = true; last = 0; requestAnimationFrame(tick); }
}
function halt(spring) {
  for (const job of running) if (job.spring === spring) running.delete(job);
}

/* ══ Press feedback — on pointer-DOWN, never on release ══════════ */
for (const el of document.querySelectorAll('[data-press]')) {
  const off = () => el.classList.remove('is-pressed');
  el.addEventListener('pointerdown', () => el.classList.add('is-pressed'));
  el.addEventListener('pointerup', off);
  el.addEventListener('pointercancel', off);
  el.addEventListener('pointerleave', off);
  el.addEventListener('blur', off);
}

/* ══ Expanding cards ═════════════════════════════════════════════ */
for (const card of document.querySelectorAll('[data-paper]')) {
  const head = card.querySelector('.card-head');
  const body = card.querySelector('.card-body');
  const inner = card.querySelector('.card-body-inner');
  const disc = card.querySelector('.disc');

  const h = new Spring({ response: 0.4, damping: 1.0 });
  const r = new Spring({ response: 0.4, damping: 1.0 });
  let open = false;

  // Give the panel a numeric height up front. Without it the first open
  // measures the natural height as its *starting* value and the spring
  // is born already settled — it snaps instead of animating.
  body.hidden = true;
  body.style.height = '0px';
  body.style.opacity = '0';

  const drawH = v => {
    body.style.height = Math.max(0, v) + 'px';
    body.style.opacity = Math.min(1, Math.max(0, v / Math.max(1, inner.offsetHeight * 0.45)));
  };
  const drawR = v => { disc.style.transform = `rotate(${v}deg)`; };

  head.addEventListener('click', () => {
    open = !open;
    head.setAttribute('aria-expanded', String(open));

    if (reduced.matches) {
      body.hidden = !open;
      body.style.height = open ? 'auto' : '0px';
      body.style.opacity = open ? '1' : '0';
      drawR(open ? 180 : 0);
      return;
    }

    body.hidden = false;
    if (body.style.height === 'auto') body.style.height = inner.offsetHeight + 'px';
    h.value = parseFloat(body.style.height) || 0;
    h.to(open ? inner.offsetHeight : 0);
    r.to(open ? 180 : 0);

    drive({ spring: h, draw: drawH, done: () => {
      if (open) body.style.height = 'auto';
      else body.hidden = true;
    }});
    drive({ spring: r, draw: drawR });
  });
}

/* ══ Drag strip ═══════════════════════════════════════════════════
   1:1 tracking that respects where you grabbed, rubber-banded edges,
   and on release: project the flick forward, snap to the card nearest
   that projection, then hand the finger's velocity to the spring so
   there is no seam between dragging and animating. */
for (const strip of document.querySelectorAll('[data-strip]')) {
  const track = strip.querySelector('.strip-track');
  const cards = [...track.children];

  const s = new Spring({ response: 0.45, damping: 0.85 });  // flick → slight bounce
  let offset = 0, min = 0;
  let grabX = 0, grabOffset = 0, dragging = false, committed = false, id = null;
  let history = [];

  const wrap = strip.closest('.strip-wrap');
  const measure = () => {
    min = Math.min(0, strip.clientWidth - track.scrollWidth);
    // Hide the "drag" affordance when there is nothing worth dragging.
    wrap?.classList.toggle('no-drag', min > -24);
  };
  measure();
  addEventListener('resize', () => { measure(); offset = Math.max(min, Math.min(0, offset)); draw(offset); });

  function draw(v) { offset = v; track.style.transform = `translate3d(${v}px,0,0)`; }

  strip.addEventListener('pointerdown', e => {
    if (e.button != null && e.button !== 0) return;
    halt(s);                       // interrupt any settling animation
    dragging = true; committed = false;
    id = e.pointerId;
    grabX = e.clientX;
    grabOffset = offset;           // respect the offset from where they grabbed
    history = [{ x: e.clientX, t: performance.now() }];
  });

  strip.addEventListener('pointermove', e => {
    if (!dragging || e.pointerId !== id) return;
    const dx = e.clientX - grabX;

    // ~10px hysteresis before committing to a horizontal drag
    if (!committed) {
      if (Math.abs(dx) < 10) return;
      committed = true;
      strip.classList.add('is-dragging');
      // Capture keeps tracking alive when the pointer leaves the strip.
      try { strip.setPointerCapture(id); } catch {}
    }

    let next = grabOffset + dx;
    const dim = strip.clientWidth;
    if (next > 0)      next = rubberband(next, dim);
    else if (next < min) next = min + rubberband(next - min, dim);
    draw(next);

    history.push({ x: e.clientX, t: performance.now() });
    if (history.length > 6) history.shift();
  });

  function release() {
    if (!dragging) return;
    dragging = false;
    strip.classList.remove('is-dragging');
    try { if (id != null && strip.hasPointerCapture?.(id)) strip.releasePointerCapture(id); } catch {}
    if (!committed) return;

    // Velocity from the recent history, not just the last event.
    // The floor on dt matters: a high-refresh pointer can deliver two
    // moves under a millisecond apart, and a raw Δx/Δt then reports
    // tens of thousands of px/s, which throws the spring off-screen.
    const now = performance.now();
    const recent = history.filter(p => now - p.t < 140);
    const old = (recent.length > 1 ? recent[0] : history[0]);
    const dt = Math.max(8, now - old.t);
    const raw = ((history[history.length - 1].x - old.x) / dt) * 1000;  // px/s
    const v = Math.max(-5000, Math.min(5000, raw));   // beyond this is noise

    // Animate to where the gesture is going, not where it stopped
    let end = offset + project(v);
    end = Math.max(min, Math.min(0, end));

    // Snap to whichever card sits nearest that projected point
    let best = end, bestD = Infinity;
    for (const c of cards) {
      const cand = Math.max(min, Math.min(0, -c.offsetLeft));
      const d = Math.abs(cand - end);
      if (d < bestD) { bestD = d; best = cand; }
    }

    if (reduced.matches) { draw(best); return; }
    s.value = offset;
    s.to(best, v);                 // hand off the release velocity
    drive({ spring: s, draw });
  }

  strip.addEventListener('pointerup', release);
  strip.addEventListener('pointercancel', release);
  // Clicking a link inside shouldn't fire after a real drag
  strip.addEventListener('click', e => { if (committed) { e.preventDefault(); e.stopPropagation(); } }, true);
  strip.addEventListener('dragstart', e => e.preventDefault());
}

/* ══ Scrubbed headers ═════════════════════════════════════════════
   Scroll-linked rather than triggered: a header scales up as it rises
   into view, then keeps scaling and fades as it leaves the top — so
   the motion tracks the scroll position continuously in both
   directions instead of firing once and finishing on its own clock.

   Positions are measured with the transform cleared and then cached.
   Reading getBoundingClientRect() while a scale is applied would feed
   the element's own transform back into its progress and oscillate. */
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const scrubs = [...document.querySelectorAll('[data-scrub]')];
let metrics = [];

function measureScrubs() {
  metrics = scrubs.map(el => {
    const prev = el.style.transform;
    el.style.transform = 'none';
    const r = el.getBoundingClientRect();
    el.style.transform = prev;
    return { el, top: r.top + window.scrollY, h: r.height };
  });
}

function scrub() {
  const vh = window.innerHeight, sy = window.scrollY;
  for (const m of metrics) {
    const top = m.top - sy;
    const bottom = top + m.h;

    // Rises into view over the last 35% of its approach…
    const enter = clamp((vh - top) / (vh * 0.35), 0, 1);
    // …and only begins leaving once its bottom crosses the top 18% of
    // the viewport, then fades over its own height plus that margin —
    // a fixed window makes tall headers vanish far too eagerly.
    const start = vh * 0.18;
    const leave = clamp((start - bottom) / (start + m.h * 0.8), 0, 1);

    const scale = 0.94 + 0.06 * enter + 0.10 * leave;
    const y = 22 * (1 - enter) - 40 * leave;

    m.el.style.transform = `translate3d(0,${y.toFixed(2)}px,0) scale(${scale.toFixed(4)})`;
    m.el.style.opacity = (enter * (1 - leave)).toFixed(3);
  }
}

if (!reduced.matches) {
  measureScrubs();
  scrub();
  document.fonts?.ready.then(() => { measureScrubs(); scrub(); });
}

/* ══ Nav: scroll-spy with a spring-driven indicator ══════════════ */
const chrome = document.getElementById('chrome');
const links = [...document.querySelectorAll('.nav a')];
const pill = document.querySelector('.nav-pill');
const sections = links.map(a => document.querySelector(a.getAttribute('href'))).filter(Boolean);

const px = new Spring({ response: 0.4, damping: 1.0 });
const pw = new Spring({ response: 0.4, damping: 1.0 });
let pillShown = false;

function movePill(link) {
  if (!link || !pill) return;
  const x = link.offsetLeft, w = link.offsetWidth;
  const draw = () => {
    pill.style.transform = `translateX(${px.value}px)`;
    pill.style.width = pw.value + 'px';
  };
  if (!pillShown) {                     // first placement shouldn't travel from 0
    px.value = px.target = x; pw.value = pw.target = w;
    pill.style.opacity = '1'; pillShown = true; draw();
  }
  px.to(x); pw.to(w);
  if (reduced.matches) { px.value = x; pw.value = w; draw(); return; }
  drive({ spring: px, draw });
  drive({ spring: pw, draw });
}

let current = null;
function spy() {
  chrome.classList.toggle('is-scrolled', window.scrollY > 8);
  const line = window.scrollY + window.innerHeight * 0.35;
  let active = null;
  for (const s of sections) if (s.offsetTop <= line) active = s;
  if (active === current) return;
  current = active;
  links.forEach(a => a.classList.toggle('is-current', active && a.getAttribute('href') === '#' + active.id));
  const link = links.find(a => active && a.getAttribute('href') === '#' + active.id);
  if (link) movePill(link);
  else if (pill) { pill.style.opacity = '0'; pillShown = false; }
}

let queued = false;
addEventListener('scroll', () => {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    spy();
    if (!reduced.matches) scrub();   // every frame — spy() can early-return, this can't
    queued = false;
  });
}, { passive: true });

addEventListener('resize', () => {
  pillShown = false; current = null;
  spy();
  if (!reduced.matches) { measureScrubs(); scrub(); }
});

/* ══ Reveal ══════════════════════════════════════════════════════ */
const items = document.querySelectorAll('.reveal');
if (reduced.matches || !('IntersectionObserver' in window)) {
  items.forEach(el => el.classList.add('is-in'));
} else {
  const io = new IntersectionObserver((entries, obs) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      e.target.style.transitionDelay = Number(e.target.dataset.delay || 0) * 80 + 'ms';
      e.target.classList.add('is-in');
      obs.unobserve(e.target);
    }
  }, { rootMargin: '0px 0px -10% 0px', threshold: 0.06 });
  items.forEach(el => io.observe(el));
}

document.getElementById('year').textContent = new Date().getFullYear();
spy();
