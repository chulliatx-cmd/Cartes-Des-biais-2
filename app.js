(() => {
"use strict";
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const NS = "http://www.w3.org/2000/svg";
const esc = s => String(s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const norm = s => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const slug = s => norm(s).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const store = {
  get(k, d){ try { const v = localStorage.getItem("atlas:" + k); return v ? JSON.parse(v) : d; } catch(e){ return d; } },
  set(k, v){ try { localStorage.setItem("atlas:" + k, JSON.stringify(v)); } catch(e){} }
};

/* ---------- Modèle ---------- */
const BIASES = [], BY_ID = {}, BY_NAME = {}, GROUPS = [];
CATS.forEach(c => {
  c.groups.forEach((g, gi) => {
    g.id = c.id + "-" + gi; g.cat = c; g.biases = [];
    GROUPS.push(g);
    g.b.forEach(raw => {
      let name = raw.split("::")[0];
      let verify = false;
      if (name.endsWith("|?")) { verify = true; name = name.slice(0, -2); }
      const b = { id: slug(name), name, verify, group: g, cat: c, n: norm(name) };
      // la définition vient de biases.json (via content.js), avec les modifications locales
      Object.defineProperty(b, "def", { get(){ return window.AtlasContent.get(b.id).def || ""; } });
      g.biases.push(b); BIASES.push(b); BY_ID[b.id] = b; BY_NAME[name] = b;
    });
  });
});
const EXPS = EXP_META.map(e => ({ ...e, b: BY_NAME[e.bias] }));
const EXP_BY_BIAS = Object.fromEntries(EXPS.map(e => [e.bias, e]));

/* ---------- État ---------- */
const S = {
  s: 1, tx: 0, ty: 0, W: 0, H: 0,
  hover: null, hoverGroup: null, hoverCat: null,
  sel: null, cat: null, mode: "explore", view: "map",
  seen: new Set(store.get("seen", [])),
  favs: new Set(store.get("favs", [])),
  expsDone: new Set(store.get("exps", [])),
  reduce: store.get("reduce", null),
  tourStep: 0
};
const mqReduce = matchMedia("(prefers-reduced-motion: reduce)");
const mqMobile = matchMedia("(max-width: 860px)");
const reduced = () => S.reduce === null ? mqReduce.matches : S.reduce;

/* ---------- Géométrie ---------- */
const R_RING = 150, R_HUB = 262, R_LEAF = 440, R_LBL = 451, R_CAT = 700, FIT_R = 760;
const GAP_G = 2.2, GAP_C = 5;
const P = (r, a) => { const t = a * Math.PI / 180; return [r * Math.sin(t), -r * Math.cos(t)]; };
(function layout(){
  const units = BIASES.length + GROUPS.length * GAP_G + CATS.length * GAP_C - CATS.length * GAP_G;
  const step = 360 / units;
  let u = GAP_C / 2;
  CATS.forEach(c => {
    c.a0 = u * step;
    c.groups.forEach((g, gi) => {
      if (gi) u += GAP_G;
      g.a0 = u * step;
      g.biases.forEach(b => { b.a = (u + .5) * step; u += 1; });
      g.a1 = u * step; g.am = (g.a0 + g.a1) / 2;
    });
    c.a1 = u * step; c.am = (c.a0 + c.a1) / 2;
    u += GAP_C;
  });
})();

/* ---------- Construction SVG ---------- */
const svg = $("#map");
const mk = (tag, attrs = {}, parent) => {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
};
const world = mk("g", { id: "world" }, svg);
const layers = {};
["guides","arcs","trunks","edges","brain","leaves","labels","mlabels","hlabels","clabels","halo","hits"].forEach(n => layers[n] = mk("g", {}, world));
const EL = { bias: {}, group: {}, cat: {} };
const fmt = n => n.toFixed(1);

function build(){
  // repères
  mk("circle", { r: R_LEAF, class: "guide dash" }, layers.guides);
  mk("circle", { r: R_HUB, class: "guide dash" }, layers.guides);
  mk("circle", { r: R_RING + 18, class: "guide" }, layers.guides);
  for (let a = 0; a < 360; a += 5) {
    const [x1, y1] = P(R_RING + 18, a), [x2, y2] = P(R_RING + (a % 45 ? 22 : 28), a);
    mk("line", { x1, y1, x2, y2, class: "guide" }, layers.guides);
  }

  CATS.forEach(c => {
    EL.cat[c.id] = [];
    const style = `--c:${c.color}`;
    // arc de la famille autour du cerveau
    const [ax, ay] = P(R_RING, c.a0 + .6), [bx, by] = P(R_RING, c.a1 - .6);
    const arc = mk("path", { d: `M${fmt(ax)},${fmt(ay)} A${R_RING},${R_RING} 0 ${c.a1 - c.a0 > 180 ? 1 : 0} 1 ${fmt(bx)},${fmt(by)}`, class: "arc el", style }, layers.arcs);
    EL.cat[c.id].push(arc);
    // libellé de famille
    const [cx, cy] = P(R_CAT, c.am);
    const t = mk("text", { x: fmt(cx), y: fmt(cy), class: "clabel el", style, "text-anchor": cx > 0 ? "start" : "end", "data-cat": c.id }, layers.clabels);
    c.lines.forEach((l, i) => { const ts = mk("tspan", { x: fmt(cx), dy: i ? "1.05em" : (cy < 0 ? "-0.3em" : "0.6em") }, t); ts.textContent = l; });
    EL.cat[c.id].push(t);

    c.groups.forEach(g => {
      const els = EL.group[g.id] = [];
      const [sx, sy] = P(R_RING, g.am * .7 + c.am * .3);
      const [c1x, c1y] = P(R_RING + 50, g.am * .85 + c.am * .15);
      const [c2x, c2y] = P(R_HUB - 50, g.am);
      const [hx, hy] = P(R_HUB, g.am);
      els.push(mk("path", { d: `M${fmt(sx)},${fmt(sy)} C${fmt(c1x)},${fmt(c1y)} ${fmt(c2x)},${fmt(c2y)} ${fmt(hx)},${fmt(hy)}`, class: "trunk el", style }, layers.trunks));
      els.push(mk("circle", { cx: fmt(hx), cy: fmt(hy), r: 3.6, class: "hub el", style }, layers.leaves));
      // libellé radial (vue d'ensemble)
      const flip = g.am > 180;
      const [mx, my] = P(R_LBL + 4, g.am);
      const ml = mk("text", { class: "mlabel el", style, transform: `translate(${fmt(mx)},${fmt(my)}) rotate(${fmt(flip ? g.am + 90 : g.am - 90)})`, "text-anchor": flip ? "end" : "start", dy: ".35em", "data-group": g.id }, layers.mlabels);
      ml.textContent = g.short;
      els.push(ml);
      // libellé au point de ramification (vue rapprochée)
      const [lx, ly] = P(R_HUB + 26, g.am);
      const hl = mk("text", { x: fmt(lx), y: fmt(ly), class: "hlabel el", style, "text-anchor": Math.abs(lx) < 60 ? "middle" : (lx > 0 ? "start" : "end"), dy: ".35em", "data-group": g.id }, layers.hlabels);
      hl.textContent = g.short;
      els.push(hl);
      EL.cat[c.id].push(...els);

      g.biases.forEach(b => {
        const [x, y] = P(R_LEAF, b.a);
        const [e1x, e1y] = P(R_HUB + 70, g.am);
        const [e2x, e2y] = P(R_LEAF - 70, b.a);
        const edge = mk("path", { d: `M${fmt(hx)},${fmt(hy)} C${fmt(e1x)},${fmt(e1y)} ${fmt(e2x)},${fmt(e2y)} ${fmt(x)},${fmt(y)}`, class: "edge el", style }, layers.edges);
        const leaf = mk("circle", { cx: fmt(x), cy: fmt(y), r: 3.3, class: "leaf el" + (S.seen.has(b.id) ? " seen" : ""), style }, layers.leaves);
        const fl = b.a > 180;
        const [tx, ty] = P(R_LBL, b.a);
        const lbl = mk("text", { class: "blabel el", style, transform: `translate(${fmt(tx)},${fmt(ty)}) rotate(${fmt(fl ? b.a + 90 : b.a - 90)})`, "text-anchor": fl ? "end" : "start", dy: ".35em", "data-bias": b.id }, layers.labels);
        lbl.textContent = b.name;
        if (b.verify) { const a = mk("tspan", { class: "ast" }, lbl); a.textContent = " *"; }
        const hit = mk("circle", { cx: fmt(x), cy: fmt(y), r: 9, class: "hit", "data-bias": b.id, role: "button", "aria-label": b.name }, layers.hits);
        b.x = x; b.y = y;
        EL.bias[b.id] = { leaf, lbl, edge, hit, all: [edge, leaf, lbl] };
        EL.cat[c.id].push(edge, leaf, lbl);
      });
    });
  });

  // cerveau : gravure scientifique générée (lignes de flux continues à l'intérieur de la silhouette)
  drawBrain(layers.brain);
  const hint = mk("text", { x: 0, y: R_RING + 40, class: "brain-hint", "text-anchor": "middle" }, layers.brain);
  hint.textContent = BIASES.length + " biais · 20 mécanismes";

  // halo sélection
  S.haloEl = mk("circle", { r: 7, class: "halo", style: "--c:var(--fg);opacity:0" }, layers.halo);
}

/* ---------- Cerveau ----------
   Un amas de neurones qui dessine la silhouette d'un cerveau (vue latérale) :
   points répartis régulièrement dans la forme, reliés à leurs voisins, quelques
   corps cellulaires avec dendrites, et des influx qui circulent. Chaque neurone
   prend la couleur de la famille de biais située dans sa direction sur la carte.
   Généré une fois, de façon déterministe. */
const BRAIN = { groups: {} };
function drawBrain(parent){
  const SHELL = "M-114,6 C-120,-30 -102,-66 -68,-86 C-38,-104 6,-110 42,-101 C76,-92 104,-68 114,-36 C121,-12 118,12 106,30 C96,44 80,50 63,48 C51,47 41,46 31,52 C15,62 -10,66 -31,62 C-52,58 -64,48 -70,38 C-80,42 -92,40 -102,32 C-110,26 -114,16 -114,6 Z";
  const CEREB = "M42,54 C56,45 92,41 105,51 C114,59 108,76 91,82 C72,88 52,84 44,74 C39,67 39,59 42,54 Z";
  const STEM = "M26,58 C31,76 32,96 29,116 L46,116 C43,100 43,86 47,72 Z";
  const GAPS = ["M-68,33 C-44,16 -10,9 22,5 C44,2 60,-6 76,-16", "M10,-107 C3,-84 17,-63 8,-43 C1,-28 11,-15 4,1"];
  const OX = -2, OY = -16;

  let seed = 11;
  const rnd = () => { seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const ctx = document.createElement("canvas").getContext("2d");
  const shapes = [SHELL, CEREB, STEM].map(d => new Path2D(d));
  const inside = (x, y) => shapes.some(s => ctx.isPointInPath(s, x, y));
  const sampler = document.createElementNS(NS, "path");
  const along = (d, step, fn) => { sampler.setAttribute("d", d); const L = sampler.getTotalLength(); for (let t = 0; t < L; t += step) { const q = sampler.getPointAtLength(t); fn(q.x, q.y); } };
  const gapPts = []; GAPS.forEach(d => along(d, 2, (x, y) => gapPts.push([x, y])));
  const nearGap = (x, y) => gapPts.some(([a, b]) => (a - x) ** 2 + (b - y) ** 2 < 16);

  // répartition régulière (échantillonnage de Poisson simplifié)
  const P = [], CELL = 4, grid = new Map();
  const gk = (x, y) => ((x / CELL) | 0) + "," + ((y / CELL) | 0);
  const free = (x, y, d) => {
    const cx = (x / CELL) | 0, cy = (y / CELL) | 0, n = Math.ceil(d / CELL);
    for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) for (const q of grid.get((cx + i) + "," + (cy + j)) || []) if ((q.x - x) ** 2 + (q.y - y) ** 2 < d * d) return false;
    return true;
  };
  const put = (x, y, edge) => { const q = { x, y, edge }; P.push(q); const k = gk(x, y); (grid.get(k) || grid.set(k, []).get(k)).push(q); };
  [SHELL, CEREB].forEach(d => along(d, 6.5, (x, y) => free(x, y, 5) && put(x + (rnd() - .5) * 1.2, y + (rnd() - .5) * 1.2, true)));
  GAPS.forEach(d => along(d, 9, (x, y) => free(x, y, 6) && put(x, y, true)));
  for (let n = 0; n < 9000; n++) {
    const x = -118 + rnd() * 236, y = -112 + rnd() * 232;
    if (inside(x, y) && !nearGap(x, y) && free(x, y, 7.4)) put(x, y, false);
  }

  // couleur : la famille dont le secteur de la carte contient la direction du neurone
  const catAt = (x, y) => {
    let a = Math.atan2(x + OX, -(y + OY)) * 180 / Math.PI; if (a < 0) a += 360;
    return CATS.find(c => a >= c.a0 - 3 && a <= c.a1 + 3) || CATS.reduce((m, c) => Math.min(Math.abs(c.am - a), 360 - Math.abs(c.am - a)) < Math.min(Math.abs(m.am - a), 360 - Math.abs(m.am - a)) ? c : m);
  };
  P.forEach(q => q.cat = catAt(q.x, q.y));

  // connexions : chaque neurone vers ses 3 plus proches voisins
  const edges = new Set(), E = [];
  P.forEach((q, i) => {
    const near = [];
    const cx = (q.x / CELL) | 0, cy = (q.y / CELL) | 0;
    for (let a = -5; a <= 5; a++) for (let b = -5; b <= 5; b++) for (const r of grid.get((cx + a) + "," + (cy + b)) || []) if (r !== q) near.push([(r.x - q.x) ** 2 + (r.y - q.y) ** 2, r]);
    near.sort((u, v) => u[0] - v[0]);
    near.slice(0, 3).forEach(([d2, r]) => {
      if (d2 > 260) return;
      const j = P.indexOf(r), key = i < j ? i + "-" + j : j + "-" + i;
      if (edges.has(key)) return;
      edges.add(key); E.push([q, r]);
    });
  });

  const g = mk("g", { class: "brain3", transform: `translate(${OX},${OY})` }, parent);
  const D = svg.querySelector("defs") || mk("defs", {}, svg);
  const glow = mk("radialGradient", { id: "brainGlow", cx: "50%", cy: "50%", r: "50%" }, D);
  [["0", ".13"], [".55", ".04"], ["1", "0"]].forEach(([o, a]) => mk("stop", { offset: o, "stop-color": "#74A9E8", "stop-opacity": a }, glow));
  mk("ellipse", { cx: 0, cy: 0, rx: 150, ry: 130, style: "fill:url(#brainGlow)" }, g);

  CATS.forEach(c => {
    const cg = mk("g", { style: `--c:${c.color};transition:opacity .35s` }, g);
    BRAIN.groups[c.id] = cg;
    // axones / connexions
    const d = E.filter(([a]) => a.cat === c).map(([a, b]) => `M${a.x.toFixed(1)},${a.y.toFixed(1)} L${b.x.toFixed(1)},${b.y.toFixed(1)}`).join("");
    mk("path", { d, style: "fill:none;stroke:var(--c);stroke-opacity:.28;stroke-width:.8;vector-effect:non-scaling-stroke" }, cg);
    // corps cellulaires
    P.filter(q => q.cat === c).forEach(q => {
      const big = !q.edge && rnd() < .09;
      const r = big ? 2.4 + rnd() * 1.1 : q.edge ? 1.25 : .8 + rnd() * .85;
      if (big) {
        let dd = "";
        const n = 3 + (rnd() * 3 | 0);
        for (let k = 0; k < n; k++) {
          const a = rnd() * Math.PI * 2, L = 6 + rnd() * 7, bend = (rnd() - .5) * 1.2;
          const x2 = q.x + Math.cos(a) * L, y2 = q.y + Math.sin(a) * L;
          const mx = q.x + Math.cos(a + bend) * L * .55, my = q.y + Math.sin(a + bend) * L * .55;
          dd += `M${q.x.toFixed(1)},${q.y.toFixed(1)} Q${mx.toFixed(1)},${my.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}`;
          if (rnd() < .6) { const b2 = a + (rnd() < .5 ? .7 : -.7); dd += ` M${mx.toFixed(1)},${my.toFixed(1)} l${(Math.cos(b2) * L * .45).toFixed(1)},${(Math.sin(b2) * L * .45).toFixed(1)}`; }
        }
        mk("path", { d: dd, style: "fill:none;stroke:var(--c);stroke-opacity:.55;stroke-width:.9;stroke-linecap:round;vector-effect:non-scaling-stroke" }, cg);
        mk("circle", { cx: q.x.toFixed(1), cy: q.y.toFixed(1), r: (r * 2.4).toFixed(1), style: "fill:var(--c);opacity:.12" }, cg);
      }
      mk("circle", { cx: q.x.toFixed(1), cy: q.y.toFixed(1), r: r.toFixed(2), style: `fill:var(--c);opacity:${big ? .95 : q.edge ? .8 : (.45 + rnd() * .4).toFixed(2)}` }, cg);
    });
  });

  // influx : quelques impulsions qui parcourent des chaînes de connexions
  const adj = new Map(); E.forEach(([a, b]) => { (adj.get(a) || adj.set(a, []).get(a)).push(b); (adj.get(b) || adj.set(b, []).get(b)).push(a); });
  const pulses = mk("g", { class: "brain-pulses" }, g);
  BRAIN.pulses = pulses;
  const inner = P.filter(q => !q.edge);
  for (let n = 0; n < 16; n++) {
    let cur = inner[(rnd() * inner.length) | 0], prev = null;
    const pts = [cur];
    for (let k = 0; k < 9; k++) {
      const opts = (adj.get(cur) || []).filter(o => o !== prev && !pts.includes(o));
      if (!opts.length) break;
      prev = cur; cur = opts[(rnd() * opts.length) | 0]; pts.push(cur);
    }
    if (pts.length < 4) continue;
    const path = "M" + pts.map(q => q.x.toFixed(1) + "," + q.y.toFixed(1)).join(" L");
    const dot = mk("circle", { r: 1.7, style: `fill:${pts[0].cat.hex};opacity:0` }, pulses);
    const dur = (2.2 + rnd() * 2).toFixed(2), delay = (rnd() * 6).toFixed(2);
    mk("animateMotion", { path, dur: dur + "s", begin: delay + "s", repeatCount: "indefinite" }, dot);
    mk("animate", { attributeName: "opacity", values: "0;1;1;0", keyTimes: "0;.15;.8;1", dur: dur + "s", begin: delay + "s", repeatCount: "indefinite" }, dot);
  }
}
function syncBrain(){
  if (BRAIN.pulses) BRAIN.pulses.style.display = reduced() ? "none" : "";
  const f = S.hover ? S.hover.cat : S.hoverGroup ? S.hoverGroup.cat : S.hoverCat || (S.sel ? S.sel.cat : S.cat);
  for (const id in BRAIN.groups) BRAIN.groups[id].style.opacity = !f || f.id === id ? "1" : ".22";
}

/* ---------- Transformations ---------- */
function measure(){ const r = svg.getBoundingClientRect(); S.W = r.width; S.H = r.height; }
function viewRect(){
  let x0 = 0, y0 = 0, x1 = S.W, y1 = S.H;
  const panelOpen = $("#panel").classList.contains("open");
  if (mqMobile.matches) {
    if (panelOpen) y1 = S.H * .14 + 40;
    else if (S.mode === "learn" && $("#tour")) y1 = S.H - Math.min($("#tour").offsetHeight + 12, S.H * .55);
  } else {
    if (panelOpen) x1 = S.W - $("#panel").offsetWidth;
    if (S.mode === "learn" && $("#tour")) x0 = 400;
  }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
}
function fitScale(){ const v = viewRect(); return Math.max(.12, Math.min(v.w, v.h) / (2 * FIT_R)); }
const minS = () => fitScale() * .7, maxS = 4;
function apply(){
  world.setAttribute("transform", `translate(${S.tx.toFixed(2)},${S.ty.toFixed(2)}) scale(${S.s.toFixed(4)})`);
  world.style.setProperty("--k", (1 / S.s).toFixed(4));
  svg.classList.toggle("lod1", S.s >= 1.05);
}
let anim = null;
function animateTo(tx, ty, s, dur = 650){
  cancelAnimationFrame(anim);
  if (reduced() || dur === 0) { S.tx = tx; S.ty = ty; S.s = s; apply(); return; }
  const a = { tx: S.tx, ty: S.ty, s: S.s }, t0 = performance.now();
  const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  // interpolation en espace monde pour un zoom fluide
  const v = viewRect();
  const wa = [(v.cx - a.tx) / a.s, (v.cy - a.ty) / a.s], wb = [(v.cx - tx) / s, (v.cy - ty) / s];
  const step = now => {
    const t = Math.min(1, (now - t0) / dur), e = ease(t);
    const sc = a.s * Math.pow(s / a.s, e);
    const wx = wa[0] + (wb[0] - wa[0]) * e, wy = wa[1] + (wb[1] - wa[1]) * e;
    S.s = sc; S.tx = v.cx - wx * sc; S.ty = v.cy - wy * sc; apply();
    if (t < 1) anim = requestAnimationFrame(step);
  };
  anim = requestAnimationFrame(step);
}
function focusPoint(x, y, s, dur){ const v = viewRect(); s = Math.max(minS(), Math.min(maxS, s)); animateTo(v.cx - x * s, v.cy - y * s, s, dur); }
function fit(dur){ focusPoint(0, 0, fitScale(), dur); }
function zoomBy(f, cx, cy){
  const v = viewRect(); cx = cx ?? v.cx; cy = cy ?? v.cy;
  const ns = Math.max(minS(), Math.min(maxS, S.s * f));
  const wx = (cx - S.tx) / S.s, wy = (cy - S.ty) / S.s;
  S.s = ns; S.tx = cx - wx * ns; S.ty = cy - wy * ns; apply();
}
function zoomGroup(g){
  const span = Math.max(g.a1 - g.a0, 8) * Math.PI / 180;
  const chord = 2 * R_LEAF * Math.sin(span / 2);
  const v = viewRect();
  const s = Math.min(2.2, Math.max(1.05, Math.min(v.w, v.h) * .75 / (chord + 300)));
  const [x, y] = P(R_LEAF + 40, g.am);
  focusPoint(x, y, s);
}
function zoomCat(c){
  const v = viewRect();
  const s = Math.max(fitScale() * 1.15, Math.min(1, Math.min(v.w, v.h) / 980));
  const [x, y] = P(300, c.am);
  focusPoint(x, y, s);
}
function zoomBias(b){
  const [x, y] = P(R_LEAF + 70, b.a);
  focusPoint(x, y, Math.max(S.s, 1.5));
}

/* ---------- Focalisation ---------- */
function applyFocus(){
  $$(".el.on, .el.near", svg).forEach(e => e.classList.remove("on", "near"));
  $$(".leaf.hot", svg).forEach(e => e.classList.remove("hot"));
  let on = [], near = [];
  const biasFocus = b => {
    on.push(...EL.bias[b.id].all, ...EL.group[b.group.id], EL.cat[b.cat.id][0], EL.cat[b.cat.id][1]);
    b.group.biases.forEach(o => { if (o !== b) near.push(...EL.bias[o.id].all); });
  };
  if (S.hover) { biasFocus(S.hover); EL.bias[S.hover.id].leaf.classList.add("hot"); }
  else if (S.hoverGroup) { const g = S.hoverGroup; on.push(...EL.group[g.id], EL.cat[g.cat.id][0], EL.cat[g.cat.id][1]); g.biases.forEach(o => on.push(...EL.bias[o.id].all)); }
  else if (S.hoverCat) on.push(...EL.cat[S.hoverCat.id]);
  else if (S.sel) biasFocus(S.sel);
  else if (S.cat) on.push(...EL.cat[S.cat.id]);
  svg.classList.toggle("focusing", on.length > 0);
  syncBrain();
  near.forEach(e => e.classList.add("near"));
  on.forEach(e => { e.classList.remove("near"); e.classList.add("on"); });
  // halo
  const h = S.haloEl;
  if (S.sel) { h.setAttribute("cx", S.sel.x); h.setAttribute("cy", S.sel.y); h.style.setProperty("--c", S.sel.cat.color); h.style.opacity = ""; h.classList.toggle("go", !reduced()); }
  else { h.style.opacity = "0"; h.classList.remove("go"); }
  $$(".leaf.sel", svg).forEach(e => e.classList.remove("sel"));
  if (S.sel) EL.bias[S.sel.id].leaf.classList.add("sel");
}

/* ---------- Infobulle ---------- */
const tip = $("#tip");
function showTip(b, ev){
  tip.style.setProperty("--c", b.cat.color);
  tip.innerHTML = `<div class="tg">${esc(b.group.short)}</div><div class="tn">${esc(b.name)}</div><div class="td">${b.def ? esc(b.def) : "Définition à rédiger."}</div>${b.verify ? '<div class="tv">* Libellé à vérifier sur la source</div>' : ""}`;
  tip.classList.add("show"); moveTip(ev);
}
function showGroupTip(g, ev){
  tip.style.setProperty("--c", g.cat.color);
  tip.innerHTML = `<div class="tg">${esc(g.cat.name)}</div><div class="tn">${esc(g.name)}</div><div class="td">${g.biases.length} biais · cliquer pour zoomer</div>`;
  tip.classList.add("show"); moveTip(ev);
}
function moveTip(ev){
  const w = tip.offsetWidth, h = tip.offsetHeight;
  let x = ev.clientX + 16, y = ev.clientY + 16;
  if (x + w > innerWidth - 12) x = ev.clientX - w - 16;
  if (y + h > innerHeight - 12) y = ev.clientY - h - 16;
  tip.style.left = Math.max(8, x) + "px"; tip.style.top = Math.max(8, y) + "px";
}
const hideTip = () => tip.classList.remove("show");

/* ---------- Interactions carte ---------- */
const pointers = new Map();
let drag = null, moved = false, pinch = null;
svg.addEventListener("pointerdown", e => {
  svg.setPointerCapture?.(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  moved = false;
  if (pointers.size === 1) drag = { x: e.clientX, y: e.clientY, tx: S.tx, ty: S.ty };
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), s: S.s };
    drag = null;
  }
  cancelAnimationFrame(anim);
});
svg.addEventListener("pointermove", e => {
  if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pinch && pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    const r = svg.getBoundingClientRect();
    zoomBy((pinch.s * d / pinch.d) / S.s, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
    moved = true; return;
  }
  if (drag) {
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!moved && Math.hypot(dx, dy) > 4) { moved = true; svg.classList.add("dragging"); hideTip(); }
    if (moved) { S.tx = drag.tx + dx; S.ty = drag.ty + dy; apply(); }
    return;
  }
  if (e.pointerType !== "mouse") return;
  const t = e.target;
  const tt = t.closest ? t.closest("[data-bias],[data-group],[data-cat]") : null;
  const bid = tt?.dataset.bias, gid = tt?.dataset.group, cid = tt?.dataset.cat;
  if (bid) { const b = BY_ID[bid]; if (S.hover !== b) { S.hover = b; S.hoverGroup = null; S.hoverCat = null; applyFocus(); } showTip(b, e); }
  else if (gid) { const g = GROUPS.find(x => x.id === gid); if (S.hoverGroup !== g) { S.hover = null; S.hoverGroup = g; S.hoverCat = null; applyFocus(); } showGroupTip(g, e); }
  else if (cid) { const c = CATS.find(x => x.id === cid); if (S.hoverCat !== c) { S.hover = null; S.hoverGroup = null; S.hoverCat = c; applyFocus(); } hideTip(); }
  else if (S.hover || S.hoverGroup || S.hoverCat) { S.hover = S.hoverGroup = S.hoverCat = null; applyFocus(); hideTip(); }
});
const endPtr = e => {
  pointers.delete(e.pointerId);
  if (pointers.size < 2) pinch = null;
  if (pointers.size === 0) { drag = null; svg.classList.remove("dragging"); }
};
svg.addEventListener("pointerup", e => {
  const wasMoved = moved; endPtr(e);
  if (wasMoved) return;
  const t0 = document.elementFromPoint(e.clientX, e.clientY) || e.target;
  const t = t0.closest ? (t0.closest("[data-bias],[data-group],[data-cat]") || t0) : t0;
  const bid = t.dataset?.bias, gid = t.dataset?.group, cid = t.dataset?.cat;
  if (bid) openBias(BY_ID[bid]);
  else if (gid) zoomGroup(GROUPS.find(x => x.id === gid));
  else if (cid) toggleCat(CATS.find(x => x.id === cid), true);
});
svg.addEventListener("pointercancel", endPtr);
svg.addEventListener("pointerleave", e => { if (e.pointerType === "mouse" && !drag) { S.hover = S.hoverGroup = S.hoverCat = null; applyFocus(); hideTip(); } });
svg.addEventListener("wheel", e => {
  e.preventDefault();
  const r = svg.getBoundingClientRect();
  const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
  zoomBy(Math.exp(-dy * .0016), e.clientX - r.left, e.clientY - r.top);
  hideHint();
}, { passive: false });
let hintHidden = false;
function hideHint(){ if (hintHidden) return; hintHidden = true; $("#hint").style.opacity = 0; }
svg.addEventListener("pointerdown", hideHint, { once: true });

$("#zin").onclick = () => { const v = viewRect(); animateTo(...(() => { const ns = Math.min(maxS, S.s * 1.5); const wx = (v.cx - S.tx) / S.s, wy = (v.cy - S.ty) / S.s; return [v.cx - wx * ns, v.cy - wy * ns, ns]; })(), 350); };
$("#zout").onclick = () => { const v = viewRect(); animateTo(...(() => { const ns = Math.max(minS(), S.s / 1.5); const wx = (v.cx - S.tx) / S.s, wy = (v.cy - S.ty) / S.s; return [v.cx - wx * ns, v.cy - wy * ns, ns]; })(), 350); };
$("#zfit").onclick = () => { S.cat = null; syncChips(); applyFocus(); fit(); };
$("#zfs").onclick = async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch (e) { toast("Le plein écran n'est pas disponible dans cette fenêtre"); }
};

/* ---------- Légende / familles ---------- */
const chips = $("#chips");
CATS.forEach(c => {
  const b = document.createElement("button");
  b.className = "chip"; b.style.setProperty("--c", c.color); b.dataset.cat = c.id; b.setAttribute("aria-pressed", "false");
  b.innerHTML = `<i class="dot"></i>${esc(c.name)}`;
  b.onclick = () => toggleCat(c, true);
  b.onmouseenter = () => { S.hoverCat = c; applyFocus(); };
  b.onmouseleave = () => { S.hoverCat = null; applyFocus(); };
  chips.appendChild(b);
});
function syncChips(){ $$(".chip", chips).forEach(b => b.setAttribute("aria-pressed", String(S.cat && S.cat.id === b.dataset.cat))); }
function toggleCat(c, zoom){
  S.cat = S.cat === c ? null : c;
  if (S.cat && S.sel) closePanel(true);
  syncChips(); applyFocus();
  if (zoom) S.cat ? zoomCat(c) : fit();
}

/* ---------- Progression / favoris ---------- */
function syncProgress(){
  $("#pcount").textContent = `${S.seen.size} / ${BIASES.length}`;
  $("#pbar").style.width = (100 * S.seen.size / BIASES.length) + "%";
  const fc = $("#favCount"); fc.hidden = S.favs.size === 0; fc.textContent = S.favs.size;
}
function markSeen(b){
  if (S.seen.has(b.id)) return;
  S.seen.add(b.id); store.set("seen", [...S.seen]);
  EL.bias[b.id].leaf.classList.add("seen");
  syncProgress();
  if (S.view === "list") renderList();
}
function toggleFav(b){
  if (S.favs.has(b.id)) { S.favs.delete(b.id); toast("Retiré des favoris"); } else { S.favs.add(b.id); toast("Ajouté aux favoris"); }
  store.set("favs", [...S.favs]); syncProgress(); renderFavPop();
}
const favBtn = $("#favBtn"), favPop = $("#favPop");
function renderFavPop(){
  const list = [...S.favs].map(id => BY_ID[id]).filter(Boolean);
  favPop.innerHTML = `<h4>Favoris · ${list.length}</h4>` + (list.length
    ? `<div class="fl">${list.map(b => `<button data-open="${b.id}" style="--c:${b.cat.color}"><i class="dot"></i>${esc(b.name)}</button>`).join("")}</div>`
    : `<p>Ajoutez un biais à vos favoris depuis sa fiche. Ils sont enregistrés dans ce navigateur.</p>`);
}
favBtn.onclick = e => { e.stopPropagation(); const open = favPop.hidden; favPop.hidden = !open; favBtn.setAttribute("aria-expanded", String(open)); if (open) renderFavPop(); };
favPop.addEventListener("click", e => { const b = e.target.closest("[data-open]"); if (b) { favPop.hidden = true; favBtn.setAttribute("aria-expanded", "false"); goBias(BY_ID[b.dataset.open]); } });
document.addEventListener("click", e => { if (!favPop.hidden && !favPop.contains(e.target) && e.target !== favBtn) { favPop.hidden = true; favBtn.setAttribute("aria-expanded", "false"); } });

let toastT;
function toast(msg){ const t = $("#toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("show"), 1800); }

/* ---------- Animations réduites ---------- */
const motionBtn = $("#motionBtn");
function syncMotion(){
  document.documentElement.classList.toggle("reduce", reduced());
  document.documentElement.classList.toggle("anim", !reduced());
  motionBtn.setAttribute("aria-pressed", String(reduced()));
  motionBtn.title = reduced() ? "Animations réduites (activé)" : "Réduire les animations";
  syncBrain();
}
motionBtn.onclick = () => { S.reduce = !reduced(); store.set("reduce", S.reduce); syncMotion(); applyFocus(); toast(reduced() ? "Animations réduites" : "Animations activées"); };
mqReduce.addEventListener?.("change", syncMotion);

/* ---------- Panneau d'étude ---------- */
const panel = $("#panel"), pb = $("#panelBody");
const ICON = {
  close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  star: '<svg viewBox="0 0 24 24"><path d="m12 3.5 2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.8l-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z"/></svg>',
  flask: '<svg viewBox="0 0 24 24"><path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3l-5-9V3"/><path d="M7.5 15h9"/></svg>'
};
function relatedOf(b){
  const rel = window.AtlasContent.get(b.id).related || [];
  const list = rel.length ? rel.map(id => BY_ID[id]) : b.group.biases.filter(o => o !== b).slice(0, 4);
  return list.filter(Boolean);
}
const linkify = t => esc(t).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
const paras = t => t.split(/\n{2,}/).map(p => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`).join("");
function openBias(b, opts = {}){
  if (!b) return;
  S.sel = b; S.cat = null; syncChips();
  markSeen(b);
  const C = window.AtlasContent, f = C.get(b.id), st = C.status(b.id), exp = EXP_BY_BIAS[b.name];
  const editing = document.documentElement.classList.contains("editing");
  const idx = b.group.biases.indexOf(b);
  const prev = b.group.biases[idx - 1], next = b.group.biases[idx + 1];
  const ph = '<p class="placeholder">Contenu à rédiger.</p>';
  const sec = (title, body, show = true) => show ? `<div class="sec"><h4>${title}</h4>${body}</div>` : "";
  const list = v => v && v.length ? `<ul>${v.map(c => `<li>${esc(c)}</li>`).join("")}</ul>` : ph;
  pb.style.setProperty("--c", b.cat.color);
  pb.innerHTML = `
    <div class="p-head"><div class="crumb">${esc(b.cat.name)} <span>/</span> ${esc(b.group.short)}</div>
      <button class="icon-btn" id="pClose" aria-label="Fermer la fiche">${ICON.close}</button></div>
    <h2 class="p-name">${esc(b.name)}</h2>
    <div class="badges"><span class="badge st st-${st}">${C.STATUS[st].label}</span>${editing && C.isModified(b.id) ? '<span class="badge local">Modifiée localement</span>' : ""}${b.verify ? '<span class="badge warn">Libellé à vérifier</span>' : ""}</div>
    <p class="p-def">${f.def ? esc(f.def) : '<span class="placeholder">Définition à rédiger.</span>'}</p>
    <div class="p-actions">
      ${exp ? `<button class="btn primary" id="pTest">${ICON.flask}Tester ce biais</button>` : `<button class="btn ghost" disabled title="Pas encore d'expérience pour ce biais">${ICON.flask}Expérience à venir</button>`}
      <button class="btn ghost" id="pFav" aria-pressed="${S.favs.has(b.id)}">${ICON.star}${S.favs.has(b.id) ? "Dans vos favoris" : "Favori"}</button>
    </div>
    ${sec("Famille et mécanisme", `<p>${esc(b.group.name)}.</p>`)}
    ${sec("Explication détaillée", f.explanation ? paras(f.explanation) : ph, !!f.explanation || editing)}
    ${sec("Mécanisme psychologique", f.mechanism ? paras(f.mechanism) : `<p>${esc(b.group.mech)}</p><p class="placeholder" style="margin-top:6px">Texte commun aux biais de ce mécanisme.</p>`)}
    ${sec("Dans la vie quotidienne", f.daily ? paras(f.daily) : ph)}
    ${sec("En contexte professionnel", f.professional ? paras(f.professional) : ph)}
    ${sec("Conséquences possibles", list(f.consequences))}
    ${sec("Comment limiter son influence", f.mitigation ? paras(f.mitigation) : ph, !!f.mitigation || editing)}
    <div class="sec q"><h4>Pour prendre du recul</h4><p>${esc(f.question || b.group.q)}</p></div>
    ${sec("Biais associés", `<div class="related">${relatedOf(b).map(o => `<button data-go="${o.id}" style="--c2:${o.cat.color}"><i class="dot" style="--c:${o.cat.color}"></i>${esc(o.name)}</button>`).join("")}</div>`)}
    ${sec("Sources et références", f.sources && f.sources.length ? `<ol class="refs">${f.sources.map(r => `<li>${linkify(r)}</li>`).join("")}</ol>` : ph, !!(f.sources && f.sources.length) || editing)}
    <div class="p-nav">${prev ? `<button data-go="${prev.id}">← ${esc(prev.name)}</button>` : "<span></span>"}${next ? `<button data-go="${next.id}">${esc(next.name)} →</button>` : "<span></span>"}</div>`;
  pb.scrollTop = 0;
  const wasOpen = panel.classList.contains("open");
  panel.classList.add("open"); panel.setAttribute("aria-hidden", "false");
  document.documentElement.style.setProperty("--shift", mqMobile.matches ? "0px" : panel.offsetWidth + "px");
  $("#pClose").onclick = () => closePanel();
  $("#pFav").onclick = e => { toggleFav(b); const on = S.favs.has(b.id); e.currentTarget.setAttribute("aria-pressed", on); e.currentTarget.innerHTML = ICON.star + (on ? "Dans vos favoris" : "Favori"); };
  if (exp) $("#pTest").onclick = () => runExp(exp);
  window.AtlasEditor?.decoratePanel?.(b, pb);
  applyFocus();
  if (S.view === "map" && opts.zoom !== false) zoomBias(b);
  if (!wasOpen && !opts.keepFocus) setTimeout(() => $("#pClose")?.focus({ preventScroll: true }), 50);
}
pb.addEventListener("click", e => { const g = e.target.closest("[data-go]"); if (g) goBias(BY_ID[g.dataset.go]); });
function closePanel(silent){
  panel.classList.remove("open"); panel.setAttribute("aria-hidden", "true");
  document.documentElement.style.setProperty("--shift", "0px");
  S.sel = null; applyFocus();
  if (!silent && S.view === "map") { const v = viewRect(); /* re-centre sur l'espace libéré */ }
}
function goBias(b){
  if (S.mode === "lab") setMode("explore");
  openBias(b);
}

/* ---------- Recherche ---------- */
const q = $("#q"), res = $("#results");
let hits = [], hi = 0;
function renderResults(){
  const v = norm(q.value.trim());
  if (!v) { res.hidden = true; return; }
  hits = BIASES.filter(b => b.n.includes(v)).sort((a, b) => a.n.indexOf(v) - b.n.indexOf(v)).slice(0, 8);
  if (!hits.length) {
    const gs = GROUPS.filter(g => norm(g.short + " " + g.name).includes(v)).slice(0, 3);
    res.innerHTML = gs.length ? gs.map((g, i) => `<button role="option" data-g="${g.id}" style="--c:${g.cat.color}"><i class="dot"></i><span class="rn">${esc(g.short)}</span><span class="rg">Mécanisme</span></button>`).join("") : `<div class="empty">Aucun biais ne correspond à « ${esc(q.value)} ».</div>`;
    hits = []; res.hidden = false; return;
  }
  hi = Math.min(hi, hits.length - 1);
  res.innerHTML = hits.map((b, i) => `<button role="option" aria-selected="${i === hi}" data-id="${b.id}" style="--c:${b.cat.color}"><i class="dot"></i><span class="rn">${esc(b.name)}</span><span class="rg">${esc(b.group.short)}</span></button>`).join("");
  res.hidden = false;
}
q.addEventListener("input", () => { hi = 0; renderResults(); });
q.addEventListener("focus", renderResults);
q.addEventListener("keydown", e => {
  if (e.key === "ArrowDown") { hi = Math.min(hi + 1, hits.length - 1); renderResults(); e.preventDefault(); }
  else if (e.key === "ArrowUp") { hi = Math.max(hi - 1, 0); renderResults(); e.preventDefault(); }
  else if (e.key === "Enter" && hits[hi]) { pick(hits[hi]); }
  else if (e.key === "Escape") { q.value = ""; res.hidden = true; q.blur(); }
});
res.addEventListener("pointerdown", e => e.preventDefault());
res.addEventListener("click", e => {
  const b = e.target.closest("[data-id]"), g = e.target.closest("[data-g]");
  if (b) pick(BY_ID[b.dataset.id]);
  else if (g) { const gr = GROUPS.find(x => x.id === g.dataset.g); res.hidden = true; q.blur(); if (S.mode === "lab") setMode("explore"); setView("map"); zoomGroup(gr); }
});
q.addEventListener("blur", () => setTimeout(() => res.hidden = true, 120));
function pick(b){ res.hidden = true; q.value = ""; q.blur(); goBias(b); }
document.addEventListener("keydown", e => {
  if (e.key === "/" && document.activeElement !== q && !/input|textarea/i.test(document.activeElement.tagName)) { e.preventDefault(); q.focus(); }
  if (e.key === "Escape") {
    if ($("#modalRoot").firstChild) closeModal();
    else if (panel.classList.contains("open")) closePanel();
  }
});

/* ---------- Vue liste ---------- */
const listEl = $("#list");
const openCats = new Set([CATS[0].id]);
let listFavOnly = false, listStatus = null;
const editingNow = () => document.documentElement.classList.contains("editing");
const statCount = k => BIASES.filter(b => window.AtlasContent.status(b.id) === k).length;
function renderList(){
  const fav = listFavOnly;
  listEl.innerHTML = `<div class="list-inner">
    <div class="list-tools">
      <button class="chip" data-lf="all" aria-pressed="${!fav}">Tous les biais</button>
      <button class="chip" data-lf="fav" aria-pressed="${fav}">Favoris (${S.favs.size})</button>
      <span class="list-prog">Explorés ${S.seen.size} / ${BIASES.length}</span>
      ${editingNow() ? Object.entries(window.AtlasContent.STATUS).map(([k, v]) => `<button class="chip st-chip" data-ls="${k}" aria-pressed="${listStatus === k}"><i class="stm st-${k}"></i>${v.short} (${statCount(k)})</button>`).join("") : ""}
    </div>
    ${CATS.map(c => {
      const ls = editingNow() ? listStatus : null;
      const gs = c.groups.map(g => ({ g, bs: g.biases.filter(b => (!fav || S.favs.has(b.id)) && (!ls || window.AtlasContent.status(b.id) === ls)) })).filter(x => x.bs.length);
      if ((fav || ls) && !gs.length) return "";
      const n = c.groups.reduce((s, g) => s + g.biases.length, 0);
      const seen = c.groups.reduce((s, g) => s + g.biases.filter(b => S.seen.has(b.id)).length, 0);
      const open = fav || ls || openCats.has(c.id);
      return `<section class="lcat${open ? " open" : ""}" style="--c:${c.color}">
        <button data-lc="${c.id}" aria-expanded="${open}"><h3>${esc(c.name)}</h3><span class="n">${seen}/${n}</span><svg class="chev" viewBox="0 0 24 24"><path d="m9 6 6 6-6 6"/></svg></button>
        <div class="lbody">${gs.map(({ g, bs }) => `<div class="lgrp"><h5>${esc(g.short)}</h5><p>${esc(g.name)}</p><div class="lb">${bs.map(b => `<button data-id="${b.id}" class="${S.seen.has(b.id) ? "seen" : ""}"><i class="o"></i>${esc(b.name)}${editingNow() ? `<i class="stm st-${window.AtlasContent.status(b.id)}" title="${window.AtlasContent.STATUS[window.AtlasContent.status(b.id)].label}"></i>` : ""}${b.verify ? ' <span class="st">*</span>' : ""}${S.favs.has(b.id) ? ' <span class="st">★</span>' : ""}</button>`).join("")}</div></div>`).join("")}</div>
      </section>`;
    }).join("")}
    ${fav && !S.favs.size ? '<p style="color:var(--muted)">Aucun favori pour l\'instant. Ouvrez une fiche et touchez « Favori ».</p>' : ""}
    <p class="demo-note">Taxonomie transcrite du Codex des biais cognitifs, 2016 (concept Buster Benson, mise en page JM3). Définitions et fiches : contenus en cours de rédaction. * Libellé à vérifier sur la source.</p>
  </div>`;
}
listEl.addEventListener("click", e => {
  const lc = e.target.closest("[data-lc]"), id = e.target.closest("[data-id]"), lf = e.target.closest("[data-lf]");
  if (lc) { const c = lc.dataset.lc; openCats.has(c) ? openCats.delete(c) : openCats.add(c); renderList(); }
  else if (id) openBias(BY_ID[id.dataset.id], { zoom: false });
  else if (lf) { listFavOnly = lf.dataset.lf === "fav"; renderList(); }
  else if (e.target.closest("[data-ls]")) { const k = e.target.closest("[data-ls]").dataset.ls; listStatus = listStatus === k ? null : k; renderList(); }
});
function setView(v){
  S.view = v;
  listEl.hidden = v !== "list";
  $$("#viewToggle button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.view === v)));
  $("#zoomCtl").hidden = v === "list";
  $("#legend").style.visibility = v === "list" ? "hidden" : "";
  $("#hint").hidden = v === "list";
  if (v === "list") renderList();
}
$$("#viewToggle button").forEach(b => b.onclick = () => setView(b.dataset.view));

/* ---------- Modes ---------- */
function setMode(m){
  S.mode = m;
  $$("[data-mode]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.mode === m)));
  $("#tour")?.remove(); $("#lab")?.remove();
  if (m === "learn") { closePanel(true); setView("map"); S.tourStep = 0; renderTour(); }
  else if (m === "lab") { closePanel(true); renderLab(); }
  else { S.cat = null; syncChips(); applyFocus(); fit(); }
}
$$("[data-mode]").forEach(b => b.onclick = () => setMode(b.dataset.mode));

/* Parcours guidé */
function renderTour(){
  const i = S.tourStep, n = CATS.length + 2;
  let el = $("#tour");
  if (!el) { el = document.createElement("section"); el.id = "tour"; el.className = "tour"; el.setAttribute("aria-live", "polite"); $("#stage").insertBefore(el, $("#zoomCtl")); }
  const pips = Array.from({ length: n }, (_, k) => `<i class="${k <= i ? "on" : ""}"></i>`).join("");
  let html;
  if (i === 0) {
    el.style.removeProperty("--c");
    html = `<div class="step">Comprendre · Introduction<span class="pips">${pips}</span></div>
      <h2>Quatre problèmes, une même économie</h2>
      <p>Buster Benson a regroupé près de ${BIASES.length} biais autour de quatre problèmes que notre cerveau doit résoudre en permanence. Chaque biais est un raccourci : utile la plupart du temps, trompeur dans certaines situations.</p>
      <div class="four">${CATS.map(c => `<div style="--c:${c.color}"><b>${esc(c.name)}</b>${esc(c.problem)}</div>`).join("")}</div>
      <div class="nav"><button class="btn ghost" data-t="quit">Quitter</button><button class="btn primary" data-t="next" style="--c:var(--fg)">Commencer</button></div>`;
    S.cat = null; syncChips(); applyFocus();
  } else if (i <= CATS.length) {
    const c = CATS[i - 1];
    el.style.setProperty("--c", c.color);
    html = `<div class="step">Famille ${i} sur ${CATS.length}<span class="pips">${pips}</span></div>
      <h2>${esc(c.name)}</h2>
      <dl><div><dt>Le problème</dt><dd>${esc(c.problem)}</dd></div>
      <div><dt>La stratégie du cerveau</dt><dd>${esc(c.strategy)}</dd></div>
      <div><dt>Le revers</dt><dd>${esc(c.cost)}</dd></div></dl>
      <dt style="font-size:11px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:var(--faint)">${c.groups.length} mécanismes</dt>
      <div class="mechs">${c.groups.map(g => `<button data-tg="${g.id}">${esc(g.short)}</button>`).join("")}</div>
      <div class="nav"><button class="btn ghost" data-t="prev">Précédent</button>
        <button class="btn ghost" data-t="emblem">Voir : ${esc(c.emblem)}</button>
        <button class="btn primary" data-t="next">Suivant</button></div>`;
    S.cat = c; syncChips(); applyFocus();
  } else {
    el.style.removeProperty("--c");
    html = `<div class="step">Synthèse<span class="pips">${pips}</span></div>
      <h2>Une boucle, pas quatre cases</h2>
      <p>Ce que nous retenons oriente ce que nous remarquons. Ce que nous remarquons nourrit le sens que nous donnons, qui guide nos actions, qui deviennent à leur tour des souvenirs.</p>
      <p>Connaître ces mécanismes ne les supprime pas. Cela aide surtout à repérer les moments où il vaut la peine de ralentir : décisions importantes, irréversibles, ou prises sous pression.</p>
      <div class="nav"><button class="btn ghost" data-t="prev">Précédent</button><button class="btn ghost" data-t="quit">Explorer librement</button><button class="btn primary" data-t="lab" style="--c:var(--fg)">Essayer une expérience</button></div>`;
    S.cat = null; syncChips(); applyFocus();
  }
  el.innerHTML = html;
  el.scrollTop = 0;
  requestAnimationFrame(() => { if (i >= 1 && i <= CATS.length) zoomCat(CATS[i - 1]); else fit(); });
}
document.addEventListener("click", e => {
  const t = e.target.closest("#tour [data-t]"), tg = e.target.closest("#tour [data-tg]");
  if (tg) { zoomGroup(GROUPS.find(g => g.id === tg.dataset.tg)); return; }
  if (!t) return;
  const a = t.dataset.t;
  if (a === "next") { S.tourStep++; renderTour(); }
  else if (a === "prev") { S.tourStep = Math.max(0, S.tourStep - 1); renderTour(); }
  else if (a === "quit") setMode("explore");
  else if (a === "lab") setMode("lab");
  else if (a === "emblem") { const c = CATS[S.tourStep - 1]; openBias(BY_NAME[c.emblem]); }
});

/* Laboratoire */
function renderLab(){
  const el = document.createElement("section");
  el.id = "lab"; el.className = "lab";
  el.innerHTML = `<div class="lab-inner">
    <h2>Expérimenter</h2>
    <p class="lead">De courtes situations inspirées d'expériences classiques en psychologie. Vous faites un choix, puis vous découvrez ce qui a pu l'influencer. Un choix isolé ne dit rien de définitif sur vous : ces mécanismes se mesurent sur des groupes, pas sur une personne.</p>
    <div class="cards">${EXPS.map(x => `<button class="card" data-x="${x.bias}" style="--c:${x.b.cat.color}">
      <span class="cb">${esc(x.bias)}</span><h3>${esc(x.title)}</h3><p>${esc(x.pitch)}</p>
      <span class="meta"><span>≈ ${x.dur}</span><span class="${S.expsDone.has(x.bias) ? "done" : ""}">${S.expsDone.has(x.bias) ? "Réalisée" : "À faire"}</span></span></button>`).join("")}</div>
  </div>`;
  $("#stage").insertBefore(el, $("#zoomCtl"));
  el.addEventListener("click", e => { const c = e.target.closest("[data-x]"); if (c) runExp(EXP_BY_BIAS[c.dataset.x]); });
}

/* ---------- Expériences ---------- */
const modalRoot = $("#modalRoot");
let lastFocus = null;
function closeModal(){ modalRoot.innerHTML = ""; lastFocus?.focus?.({ preventScroll: true }); if (S.mode === "lab") { $("#lab")?.remove(); renderLab(); } }
function runExp(x){
  lastFocus = document.activeElement;
  modalRoot.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="${esc(x.title)}"><div class="dialog" style="--c:${x.b.cat.color}">
    <div class="dh"><span class="crumb">Expérience · ${esc(x.bias)}</span><button class="icon-btn" data-close aria-label="Fermer">${ICON.close}</button></div>
    <h2>${esc(x.title)}</h2><div id="xBody"></div></div></div>`;
  const m = modalRoot.firstChild;
  m.addEventListener("click", e => { if (e.target === m || e.target.closest("[data-close]")) closeModal(); });
  setTimeout(() => m.querySelector("[data-close]").focus(), 30);
  const body = $("#xBody");
  const done = (verdict, d) => {
    S.expsDone.add(x.bias); store.set("exps", [...S.expsDone]);
    body.innerHTML = `<div class="debrief">
      <div class="verdict">${verdict}</div>
      <div class="sec"><h4>Ce qui peut influencer le jugement</h4><p>${d.influence}</p></div>
      <div class="sec"><h4>Pourquoi le biais intervient</h4><p>${d.why}</p></div>
      <div class="sec"><h4>Comment repérer ce mécanisme</h4><p>${d.identify}</p></div>
      <div class="sec q"><h4>Pour décider de façon plus réfléchie</h4><p>${d.better}</p></div>
      <p class="caveat">Un choix unique ne prouve pas que vous « avez » ce biais. Les effets décrits sont observés en moyenne sur des groupes, et votre réponse peut s'expliquer par d'autres raisons tout aussi valables.</p>
      <div class="row" style="margin-top:16px;justify-content:space-between"><button class="btn ghost" data-again>Recommencer</button><button class="btn primary" data-fiche>Voir la fiche du biais</button></div>
    </div>`;
    body.querySelector("[data-again]").onclick = () => runExp(x);
    body.querySelector("[data-fiche]").onclick = () => { closeModal(); goBias(x.b); };
    body.closest(".dialog").scrollTop = 0;
  };
  EXP_RUN[x.bias](body, done);
}
const choiceBtns = (opts) => `<div class="choices">${opts.map((o, i) => `<button class="choice" data-c="${i}">${o}</button>`).join("")}</div>`;
const onChoice = (el, fn) => el.querySelectorAll("[data-c]").forEach(b => b.onclick = () => fn(+b.dataset.c));

const EXP_RUN = {
"Ancrage"(el, done){
  const anchors = [45, 320], k = Math.random() < .5 ? 0 : 1, A = anchors[k], O = anchors[1 - k];
  el.innerHTML = `<p class="scenario">Étape 1 sur 2. Le nombre d'États membres de l'Organisation des Nations unies est-il <b>supérieur ou inférieur à ${A}</b> ?</p>${choiceBtns(["Supérieur à " + A, "Inférieur à " + A])}`;
  onChoice(el, () => {
    el.innerHTML = `<p class="scenario">Étape 2 sur 2. Quelle est votre estimation du nombre d'États membres ?</p>
      <div class="row" style="justify-content:center;margin:8px 0 6px"><span class="big" id="av">150</span></div>
      <input class="slider" id="as" type="range" min="1" max="400" value="150" aria-label="Estimation">
      <div class="row" style="justify-content:space-between;font-size:12px;color:var(--faint);font-family:var(--f-mono)"><span>1</span><span>400</span></div>
      <div class="row" style="justify-content:flex-end;margin-top:14px"><button class="btn primary" id="ago">Valider mon estimation</button></div>`;
    const s = $("#as", el), v = $("#av", el);
    s.oninput = () => v.textContent = s.value;
    $("#ago", el).onclick = () => done(
      `Le chiffre de départ affiché pour vous était <b>${A}</b>. Votre estimation : <b>${s.value}</b>. La réponse : <b>193 États membres</b>, depuis l'admission du Soudan du Sud en 2011. D'autres visiteurs voient le chiffre ${O}.`,
      { influence: "Le chiffre de la première question était tiré au hasard. Il n'apportait aucune information, mais il a servi de point de départ disponible au moment d'estimer.",
        why: "Quand nous ne connaissons pas une valeur, nous partons d'un repère puis nous ajustons. L'ajustement s'arrête dès que la valeur paraît plausible, donc souvent trop près du repère. Dans les études, le groupe qui voit un chiffre élevé donne en moyenne des estimations nettement plus élevées que le groupe qui voit un chiffre bas.",
        identify: "Repérez le premier chiffre qui a été posé dans une discussion : prix affiché, budget de l'an passé, proposition d'ouverture. Demandez-vous s'il vient d'une donnée ou simplement de l'ordre de la conversation.",
        better: "Formulez votre propre estimation avant de regarder celle des autres, à partir de données indépendantes, puis comparez." });
  });
},
"Effet de cadrage"(el, done){
  const gain = Math.random() < .5;
  const A = gain ? "<b>Plan A</b> : 200 emplois seront sauvés." : "<b>Plan A</b> : 400 emplois seront supprimés.";
  const B = gain ? "<b>Plan B</b> : une chance sur trois de sauver les 600 emplois, deux chances sur trois de n'en sauver aucun." : "<b>Plan B</b> : une chance sur trois qu'aucun emploi ne soit supprimé, deux chances sur trois que les 600 le soient.";
  el.innerHTML = `<p class="scenario">Une usine de 600 salariés est menacée de fermeture. Deux plans de reprise sont sur la table et vous devez en recommander un.</p>${choiceBtns([A, B])}`;
  onChoice(el, c => {
    const other = gain ? "« 400 emplois seront supprimés » contre « une chance sur trois qu'aucun emploi ne soit supprimé »" : "« 200 emplois seront sauvés » contre « une chance sur trois de sauver les 600 emplois »";
    done(`Vous avez choisi le <b>plan ${c ? "B (risqué)" : "A (sûr)"}</b>, présenté en termes de <b>${gain ? "gains" : "pertes"}</b>. D'autres visiteurs lisent la version inverse : ${other}. Les deux versions décrivent exactement les mêmes résultats.`,
      { influence: "Seule la formulation change : emplois « sauvés » ou emplois « supprimés ». Les probabilités et les effectifs sont identiques.",
        why: "Une formulation en gains rend l'option sûre attirante, car nous voulons garantir ce gain. Une formulation en pertes rend l'option risquée attirante, car nous voulons éviter une perte certaine. Dans l'étude originale de Tversky et Kahneman (1981), 72 % des participants choisissent l'option sûre dans la version gains, et 78 % l'option risquée dans la version pertes.",
        identify: "Méfiez-vous des chiffres présentés sous un seul angle : taux de réussite sans taux d'échec, emplois sauvés sans emplois perdus.",
        better: "Reformulez systématiquement l'information dans l'autre sens avant de décider. Si votre préférence change, c'est la présentation qui décide, pas les faits." });
  });
},
"Coûts irrécupérables"(el, done){
  el.innerHTML = `<p class="scenario">Votre équipe développe depuis 18 mois un outil interne de gestion des formations. <b>180 000 €</b> sur un budget de 200 000 € ont été dépensés. Un éditeur vient de sortir un outil équivalent, plus complet et moins cher à l'usage. Terminer votre outil coûterait encore 20 000 €.</p>
    <p class="scenario" style="font-size:15px;color:var(--muted)">Que recommandez-vous au comité ?</p>${choiceBtns(["Terminer le projet<small>Nous sommes presque au bout.</small>", "Arrêter et évaluer l'outil du marché<small>Décider sur les coûts et bénéfices à venir.</small>", "Je manque d'éléments pour trancher<small>Demander une analyse complémentaire.</small>"])}`;
  onChoice(el, c => done(
    ["Vous recommandez de <b>terminer le projet</b>.", "Vous recommandez d'<b>arrêter et d'évaluer l'outil du marché</b>.", "Vous demandez <b>des éléments complémentaires</b>, ce qui est souvent sage."][c] + " Posez-vous une seconde question : si le projet n'avait pas encore commencé, financeriez-vous 20 000 € pour développer un outil moins bon que celui qui existe déjà ?",
    { influence: "Les 180 000 € déjà dépensés sont perdus quelle que soit la décision. Ils pèsent pourtant dans le scénario, à travers l'idée qu'on est « presque au bout ».",
      why: "Arrêter rend la perte visible et définitive, et peut donner le sentiment d'avoir eu tort. Poursuivre permet de différer ce constat. Arkes et Blumer (1985) ont montré que des participants acceptent davantage de terminer un projet lorsque l'essentiel du budget est déjà engagé.",
      identify: "Écoutez les arguments tournés vers le passé : « avec tout ce qu'on a investi », « on ne va pas jeter deux ans de travail ».",
      better: "Comparez uniquement les options à partir d'aujourd'hui : coûts restants, bénéfices attendus, alternatives. Ce qui est dépensé ne doit plus entrer dans le calcul, même si l'expérience acquise, elle, compte." }));
},
"Biais de confirmation"(el, done){
  const rule = (a, b, c) => a < b && b < c;
  const hist = [{ t: [2, 4, 6], ok: true }];
  const draw = () => {
    el.innerHTML = `<p class="scenario">Une règle simple génère des suites de trois nombres. La suite <b>2 · 4 · 6</b> la respecte. Proposez vos propres suites pour découvrir la règle : on vous dira seulement si elles la respectent.</p>
      <div class="row"><input class="num" id="n1" type="number" inputmode="numeric" aria-label="Premier nombre"><input class="num" id="n2" type="number" inputmode="numeric" aria-label="Deuxième nombre"><input class="num" id="n3" type="number" inputmode="numeric" aria-label="Troisième nombre"><button class="btn ghost" id="ntest">Tester</button></div>
      <div class="hist" id="hist">${hist.slice().reverse().map(h => `<div><span>${h.t.join(" · ")}</span><span class="${h.ok ? "yes" : "no"}">${h.ok ? "Respecte la règle" : "Ne respecte pas"}</span></div>`).join("")}</div>
      <div class="row" style="justify-content:space-between"><span style="font-size:13px;color:var(--faint)">${hist.length - 1} essai${hist.length > 2 ? "s" : ""}</span><button class="btn primary" id="nguess" ${hist.length < 2 ? "disabled" : ""}>Je pense connaître la règle</button></div>`;
    $("#ntest", el).onclick = () => {
      const v = ["#n1", "#n2", "#n3"].map(s => parseFloat($(s, el).value));
      if (v.some(isNaN)) { toast("Saisissez trois nombres"); return; }
      hist.push({ t: v, ok: rule(...v) }); draw(); $("#n1", el).focus();
    };
    $("#nguess", el).onclick = guess;
  };
  const guess = () => {
    el.innerHTML = `<p class="scenario">Quelle est la règle ?</p>${choiceBtns(["Des nombres pairs qui augmentent de 2", "Des nombres qui augmentent de 2", "N'importe quels nombres croissants", "Des nombres pairs"])}`;
    onChoice(el, c => {
      const tests = hist.slice(1);
      const falsify = tests.some(h => !h.ok || h.t[1] - h.t[0] !== 2 || h.t[2] - h.t[1] !== 2);
      done(`${c === 2 ? "Bonne réponse." : "La règle était plus large."} La règle était : <b>n'importe quelle suite de nombres croissants</b>. Vous avez fait ${tests.length} essai${tests.length > 1 ? "s" : ""}. ${falsify ? "Vous avez testé au moins une suite qui sortait du modèle « +2 » : c'est la démarche qui permet de trouver." : "Toutes vos suites suivaient le modèle « +2 ». Elles ne pouvaient que confirmer votre idée, sans la mettre à l'épreuve."}`,
        { influence: "L'exemple 2 · 4 · 6 suggère une hypothèse précise. Une fois formée, il est naturel de proposer des suites qui la respectent.",
          why: "Chercher des confirmations est plus confortable que chercher des réfutations. Pourtant, une suite comme 8 · 10 · 12 confirme aussi bien la règle « +2 » que la règle « croissante » : elle n'apprend rien. Dans l'expérience originale de Wason (1960), environ un participant sur cinq trouvait la règle dès sa première proposition.",
          identify: "Observez vos tests : sont-ils conçus pour vous donner raison, ou pour vérifier si vous avez tort ?",
          better: "Avant de valider une hypothèse, cherchez le test qui pourrait la contredire. En entreprise, demandez quelles données invalideraient le plan, et allez les chercher." });
    });
  };
  draw();
},
"Erreur du parieur"(el, done){
  el.innerHTML = `<p class="scenario">Une pièce parfaitement équilibrée vient de tomber <b>cinq fois de suite sur pile</b>.</p>
    <div class="coins">${Array(5).fill('<span class="coin">PILE</span>').join("")}</div>
    <p class="scenario" style="font-size:15px;color:var(--muted)">Pour le sixième lancer :</p>${choiceBtns(["Face est plus probable", "Pile est plus probable", "Les deux sont aussi probables"])}`;
  onChoice(el, c => {
    done(`Vous avez répondu : <b>${["face est plus probable", "pile est plus probable", "les deux sont aussi probables"][c]}</b>. Pour une pièce équilibrée, chaque lancer est indépendant : <b>une chance sur deux</b>, quelle que soit la série. <div id="sim" style="margin-top:12px"><button class="btn ghost" id="simgo">Simuler 200 000 lancers</button></div>`,
      { influence: "Une série de cinq piles paraît « anormale ». L'intuition attend que le hasard se rééquilibre rapidement.",
        why: "Nous croyons que le hasard doit ressembler au hasard même sur de courtes séries. Or la loi des grands nombres ne vaut que sur un très grand nombre de lancers : la pièce n'a aucune mémoire des précédents.",
        identify: "Méfiez-vous des raisonnements du type « ça ne peut pas continuer », « c'est son tour », « ça va forcément tourner » lorsque les événements sont indépendants.",
        better: "Demandez-vous si les événements sont réellement liés. S'ils ne le sont pas, raisonnez sur la probabilité de chaque événement, pas sur la série." });
    const go = $("#simgo");
    go && (go.onclick = () => {
      let run = 0, after = 0, heads = 0;
      for (let i = 0; i < 200000; i++) {
        const pile = Math.random() < .5;
        if (run >= 5) { after++; if (!pile) heads++; }
        run = pile ? run + 1 : 0;
      }
      $("#sim").innerHTML = `<span style="font-family:var(--f-mono);font-size:13px">Après une série d'au moins cinq piles (${after.toLocaleString("fr-FR")} cas), le lancer suivant a donné face dans <b>${(100 * heads / after).toFixed(1).replace(".", ",")} %</b> des cas.</span>`;
    });
  });
},
"Erreur de conjonction"(el, done){
  el.innerHTML = `<p class="scenario"><b>Camille</b> a 31 ans. Elle s'exprime avec aisance et défend volontiers ses idées. Pendant ses études d'économie, elle s'est beaucoup engagée dans des associations de protection de l'environnement et a participé à plusieurs marches pour le climat.</p>
    <p class="scenario" style="font-size:15px;color:var(--muted)">Laquelle de ces affirmations est la plus probable ?</p>${choiceBtns(["Camille est conseillère bancaire.", "Camille est conseillère bancaire et militante écologiste."])}`;
  onChoice(el, c => done(
    `Vous avez choisi l'affirmation <b>${c ? "B" : "A"}</b>. ${c ? "C'est la réponse la plus fréquente," : "C'est la réponse logiquement correcte,"} mais l'affirmation B ne peut pas être plus probable que l'affirmation A : toutes les conseillères bancaires militantes sont aussi des conseillères bancaires.
     <svg class="venn" width="300" height="130" viewBox="0 0 300 130" aria-label="Le groupe des conseillères militantes est inclus dans celui des conseillères bancaires"><circle cx="150" cy="65" r="60" fill="none" stroke="#9BA6B1" stroke-width="1.2"/><circle cx="170" cy="78" r="26" fill="rgba(116,169,232,.18)" stroke="#74A9E8" stroke-width="1.2"/><text x="82" y="28" fill="#9BA6B1" font-size="11" font-family="Hanken Grotesk, sans-serif">Conseillères bancaires</text><text x="170" y="82" fill="#F1F3F4" font-size="10" text-anchor="middle" font-family="Hanken Grotesk, sans-serif">+ militantes</text></svg>`,
    { influence: "Le portrait de Camille ressemble davantage à celui d'une militante écologiste. L'affirmation B « colle » au récit, donc elle paraît plus probable.",
      why: "Nous jugeons la probabilité à la ressemblance avec un modèle mental, plutôt qu'en comparant des ensembles. Chaque détail ajouté rend pourtant le scénario moins probable. Cette situation reprend le célèbre « problème de Linda » de Tversky et Kahneman (1983).",
      identify: "Un scénario très détaillé et cohérent qui vous paraît plus crédible qu'un scénario simple : c'est le signal.",
      better: "Pour chaque détail ajouté à une prévision, demandez-vous s'il doit lui aussi être vrai. Plus un plan dépend d'hypothèses, plus sa probabilité globale baisse." }));
},
"Aversion à la perte"(el, done){
  el.innerHTML = `<p class="scenario">On vous propose un pari à pile ou face, une seule fois. <b>Pile : vous perdez 100 €.</b> Face : vous gagnez une somme X.</p>
    <p class="scenario" style="font-size:15px;color:var(--muted)">À partir de quel gain X accepteriez-vous de jouer ?</p>${choiceBtns(["110 €", "150 €", "200 €", "300 € ou plus", "Je ne jouerais à aucun prix"])}`;
  onChoice(el, c => done(
    `Votre seuil : <b>${["110 €", "150 €", "200 €", "300 € ou plus", "aucun montant"][c]}</b>. En moyenne, ce pari devient favorable dès que le gain dépasse 100 €. Pourtant, beaucoup de personnes demandent un gain d'environ <b>deux fois</b> la perte possible avant d'accepter.`,
    { influence: "La perte de 100 € est ressentie plus fortement que la perspective d'un gain du même montant. Le contexte compte aussi : 100 € n'a pas le même poids pour tout le monde.",
      why: "Selon la théorie des perspectives de Kahneman et Tversky, la douleur d'une perte est environ deux fois plus intense que le plaisir d'un gain équivalent. Refuser un tel pari n'est pas forcément irrationnel : si la perte vous mettait en difficulté, la prudence est raisonnable.",
      identify: "Repérez quand une option est jugée surtout à travers ce qu'elle pourrait faire perdre, sans regarder ce qu'elle apporte.",
      better: "Pour des décisions répétées, raisonnez sur l'ensemble des paris plutôt qu'un par un. Pour un changement d'organisation, nommez explicitement ce que chacun perd, et ce qu'il gagne." }));
}
};

/* ---------- Redimensionnement ---------- */
let lastFit = 0;
function onResize(){
  const oldW = S.W, oldH = S.H; measure();
  if (!oldW) return;
  const k = Math.min(S.W, S.H) / Math.min(oldW, oldH);
  S.tx = S.tx * (S.W / oldW); S.ty = S.ty * (S.H / oldH); S.s *= k; apply();
}
addEventListener("resize", onResize);

/* ---------- Interface publique pour l'éditeur (editor.js) ---------- */
window.Atlas = {
  BIASES, BY_ID, CATS, toast, goBias, closePanel, setView,
  get selected(){ return S.sel; },
  get view(){ return S.view; },
  refreshPanel(){ if (S.sel && panel.classList.contains("open")) { const top = pb.scrollTop; openBias(S.sel, { zoom: false, keepFocus: true }); pb.scrollTop = top; } },
  refreshList(){ if (S.view === "list") renderList(); }
};

/* ---------- Démarrage ---------- */
build(); measure(); syncProgress(); syncMotion();
S.s = fitScale(); { const v = viewRect(); S.tx = v.cx; S.ty = v.cy; } apply();
applyFocus();
const known = Object.fromEntries(BIASES.map(b => [b.id, b.name]));
window.AtlasContent.load(known).then(() => {
  window.AtlasContent.onChange(() => { window.Atlas.refreshList(); });
  window.AtlasEditor?.init?.();
  if (mqMobile.matches) setView("list"); else setView("map");
  const startScale = S.s;
  if (!reduced()) { const v = viewRect(); S.s = startScale * .82; S.tx = v.cx; S.ty = v.cy; apply(); animateTo(v.cx, v.cy, startScale, 1100); }
  setTimeout(() => { $("#loader").classList.add("out"); setTimeout(() => $("#loader").remove(), 800); }, reduced() ? 50 : 450);
}).catch(err => {
  console.error(err);
  const box = $("#loader div");
  box.innerHTML = `<span style="color:var(--fg)">Contenus indisponibles</span><span style="text-transform:none;letter-spacing:0;font-family:var(--f-body);font-size:13px;max-width:44ch;text-align:center;line-height:1.5">${esc(err.message)} Ouvrez le site via un serveur web (GitHub Pages ou serveur local), ou utilisez la version autonome cognitive-atlas.html.</span>`;
});
})();
