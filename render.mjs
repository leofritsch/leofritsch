// Renders the GitHub profile: animated SVGs (light + dark) + README.md, from profile.json.
// Usage: node render.mjs            -> writes ./out/*.svg and ./README.md
// All text is converted to vector paths (Host Grotesk), so nothing depends on fonts loading on GitHub.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as fontkit from 'fontkit';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(ROOT, 'out');
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'profile.json'), 'utf8'));

// ---------- brand (experimentempire.com) ----------
const PALETTES = {
  light: { ink: '#2a2520', muted: '#6e665d', faint: '#a39a8e', rule: '#d6cec1', red: '#cf3a2b',
           chip: '#f6f3ee', board: '#2a2520', boardInk: '#ede8df', block: '#2a2520' },
  dark:  { ink: '#ede8df', muted: '#a39a8e', faint: '#6e665d', rule: '#3a342d', red: '#e0574a',
           chip: '#171411', board: '#1d1915', boardInk: '#ede8df', block: '#ede8df' },
};

// ---------- text -> paths ----------
const FONT_DIR = path.join(ROOT, 'node_modules/@fontsource/host-grotesk/files');
const fonts = {};
for (const w of [400, 500, 600]) fonts[w] = fontkit.create(fs.readFileSync(path.join(FONT_DIR, `host-grotesk-latin-${w}-normal.woff`)));
function layout(str, size, weight = 400, tracking = 0) {
  const f = fonts[weight], s = size / f.unitsPerEm;
  const run = f.layout(str);
  const pos = []; let x = 0;
  run.glyphs.forEach((g, i) => {
    if (g.id === 0 && str[i] && str[i].trim()) console.warn(`missing glyph in "${str}"`);
    const p = run.positions[i];
    pos.push([x + p.xOffset * s, -p.yOffset * s]);
    x += p.xAdvance * s + (i < run.glyphs.length - 1 ? tracking * size : 0);
  });
  return { glyphs: run.glyphs, pos, width: x, s };
}
const measure = (str, size, weight, tracking) => layout(str, size, weight, tracking).width;
const r2 = (n) => Math.round(n * 100) / 100;
function text(str, { x = 0, y = 0, size = 16, weight = 400, tracking = 0, anchor = 'start', fill, cls, attrs = '' } = {}) {
  const L = layout(str, size, weight, tracking);
  const x0 = anchor === 'end' ? x - L.width : anchor === 'middle' ? x - L.width / 2 : x;
  let d = '';
  L.glyphs.forEach((g, i) => {
    const ox = x0 + L.pos[i][0], oy = y + L.pos[i][1];
    for (const c of g.path.commands) {
      const a = c.args.map((v, k) => r2(k % 2 === 0 ? ox + v * L.s : oy - v * L.s));
      d += { moveTo: 'M', lineTo: 'L', quadraticCurveTo: 'Q', bezierCurveTo: 'C', closePath: 'Z' }[c.command] + a.join(' ');
    }
  });
  return `<path d="${d}"${fill ? ` fill="${fill}"` : ''}${cls ? ` class="${cls}"` : ''} ${attrs}/>`;
}
function wrap(str, size, weight, maxW, maxLines = 2) {
  const words = str.split(' '); const lines = []; let cur = '';
  for (const w of words) {
    const t = cur ? `${cur} ${w}` : w;
    if (measure(t, size, weight) > maxW && cur) { lines.push(cur); cur = w; } else cur = t;
  }
  if (cur) lines.push(cur);
  return lines.slice(0, maxLines);
}
// glyphs the latin subset lacks, drawn by hand
const arrowRight = (x, y, len, color, w = 1.6) =>
  `<path d="M${x} ${y}H${x + len}M${x + len - 5} ${y - 4.5}L${x + len} ${y}L${x + len - 5} ${y + 4.5}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;

const svg = (w, h, body, css, title) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${title}"><title>${title}</title><style>${css}
@media (prefers-reduced-motion: reduce){*{animation:none!important}}</style>${body}</svg>`;

const EASE = 'cubic-bezier(0.23,1,0.32,1)';

// ---------- live data ----------
async function registerData() {
  const r = cfg.register;
  try {
    const ctrl = AbortSignal.timeout(10000);
    const d = await fetch(r.dataUrl, { signal: ctrl }).then((res) => { if (!res.ok) throw new Error(res.status); return res.json(); });
    const inc = [...d.incidents].sort((a, b) => String(a.occurred_on || a.reported_on).localeCompare(String(b.occurred_on || b.reported_on)));
    return { count: d.incidents.length, severities: inc.map((i) => i.severity || 1), live: true };
  } catch (e) {
    console.warn(`register data unavailable (${e.message}), using fallback`);
    return { count: r.fallbackCount, severities: [...r.fallbackSeverities].reverse(), live: false };
  }
}

// ---------- banner ----------
function banner(P) {
  // The site's loop (experimentempire.com, "We find what works"): a run of ink walks the top
  // edge slowly through the three words, then streaks back along the return. The site does
  // this in JS; here the motion is precomputed into CSS keyframes so it runs inside an <img>.
  const W = 1200, H = 160, i = 7.5, r = 40, inset = i + r;
  const words = cfg.banner.words, LS = 31;
  const top = W - 2 * inset, right = H - 2 * inset, arc = Math.PI * r / 2;
  const segs = [['h', top], ['a', arc], ['v', right], ['a', arc], ['h', top], ['a', arc], ['v', right], ['a', arc]];
  const L = segs.reduce((t, x) => t + x[1], 0);
  const pt = (s) => { // point at length s, clockwise from top-left after the corner
    s = ((s % L) + L) % L;
    const corners = [[W - inset, inset, -90], [W - inset, H - inset, 0], [inset, H - inset, 90], [inset, inset, 180]];
    const lines = [[inset, i, 1, 0], [W - i, inset, 0, 1], [W - inset, H - i, -1, 0], [i, H - inset, 0, -1]];
    for (let k = 0; k < 4; k++) {
      const len = k % 2 ? right : top;
      if (s <= len) { const [x, y, dx, dy] = lines[k]; return [x + dx * s, y + dy * s]; }
      s -= len;
      if (s <= arc) { const [cx, cy, a0] = corners[k]; const t = (a0 + (s / arc) * 90) * Math.PI / 180; return [cx + r * Math.cos(t), cy + r * Math.sin(t)]; }
      s -= arc;
    }
    return [inset, i];
  };
  const d = `M${inset} ${i}H${W - inset}A${r} ${r} 0 0 1 ${W - i} ${inset}V${H - inset}A${r} ${r} 0 0 1 ${W - inset} ${H - i}H${inset}A${r} ${r} 0 0 1 ${i} ${H - inset}V${inset}A${r} ${r} 0 0 1 ${inset} ${i}Z`;
  // same dynamics as the site
  const SLOW_TIME = 5.2, FAST = 5.5, SEG = top * 0.11, vSlow = top / SLOW_TIME;
  const a0 = top * 0.9, a1 = a0 + L * 0.2, d0 = L * 0.72, d1 = L + top * 0.06;
  const smoother = (t) => t * t * t * (t * (t * 6 - 15) + 10), clamp = (v) => Math.min(1, Math.max(0, v));
  const fast = (s) => { const t = s < a0 ? s + L : s; return Math.min(smoother(clamp((t - a0) / (a1 - a0))), 1 - smoother(clamp((t - d0) / (d1 - d0)))); };
  const xs = [0.2, 0.5, 0.8].map((f) => f * W);
  const spans = words.map((w, k) => { const lw = measure(w, LS, 500, -0.015); return [xs[k] - lw / 2 - inset, xs[k] + lw / 2 - inset]; });
  // integrate one lap
  const dt = 1 / 600; let s = 0, T = 0; const tl = [[0, 0]];
  while (s < L) { s += vSlow * (1 + (FAST - 1) * fast(s)) * dt; T += dt; tl.push([T, Math.min(s, L)]); }
  const N = 180, frames = [];
  for (let k = 0; k <= N; k++) {
    const t = (k / N) * T; let j = Math.min(tl.length - 1, Math.round(t / dt));
    frames.push(k === N ? L : tl[j][1]);
  }
  // label colour easing (site: 400ms transition) — simulate two laps, keep the second
  const lit = words.map(() => []); const val = words.map(() => 0); const step = T / N;
  for (let lap = 0; lap < 2; lap++) frames.forEach((sv, k) => words.forEach((_, w) => {
    const on = sv >= spans[w][0] - 6 && sv < spans[w][1] + top * 0.1 ? 1 : 0;
    val[w] += Math.sign(on - val[w]) * Math.min(Math.abs(on - val[w]), step / 0.4);
    if (lap === 1) lit[w][k] = val[w];
  }));
  const pct = (k) => +((k / N) * 100).toFixed(3);
  let kRun = '', kHead = '', kLab = words.map(() => '');
  frames.forEach((sv, k) => {
    const seg = Math.min(L * 0.3, SEG * (1 + fast(sv % L) * 2.2));
    const [x, y] = pt(sv);
    kRun += `${pct(k)}%{stroke-dasharray:${seg.toFixed(1)} ${(L - seg).toFixed(1)};stroke-dashoffset:${(-(sv - seg)).toFixed(1)}}`;
    kHead += `${pct(k)}%{transform:translate(${x.toFixed(1)}px,${y.toFixed(1)}px)}`;
    words.forEach((_, w) => { kLab[w] += `${pct(k)}%{opacity:${lit[w][k].toFixed(2)}}`; });
  });
  const dur = T.toFixed(2);
  let body = `<path d="${d}" fill="none" stroke="${P.rule}" stroke-width="2"/>`;
  body += `<path class="run" d="${d}" fill="none" stroke="${P.ink}" stroke-width="2.6" stroke-linecap="round" stroke-dasharray="${SEG} ${L - SEG}" stroke-dashoffset="0"/>`;
  body += `<circle class="head" r="5.5" fill="${P.ink}" transform="translate(${inset} ${i})"/>`;
  words.forEach((w, k) => {
    body += text(w, { x: xs[k], y: H / 2 + LS * 0.36, size: LS, weight: 500, tracking: -0.015, anchor: 'middle', fill: P.muted, attrs: 'fill-opacity=".75"' });
    body += `<g class="lab lab${k}">${text(w, { x: xs[k], y: H / 2 + LS * 0.36, size: LS, weight: 500, tracking: -0.015, anchor: 'middle', fill: P.ink })}</g>`;
  });
  const css = `.run{animation:run ${dur}s linear infinite}@keyframes run{${kRun}}
.head{animation:head ${dur}s linear infinite}@keyframes head{${kHead}}
.lab{opacity:0}${words.map((_, w) => `.lab${w}{animation:lab${w} ${dur}s linear infinite}@keyframes lab${w}{${kLab[w]}}`).join('\n')}
@media (prefers-reduced-motion: reduce){.run,.head{display:none}.lab{opacity:1}}`;
  return svg(W, H, body, css, words.join(', '));
}

// ---------- featured tiles ----------
const TW = 400, TH = 560, PAD = 24;

function visFreeTabs(P) {
  let s = '', css = '';
  const wx = PAD, wy = 82, ww = TW - 2 * PAD, wh = 128;
  s += `<rect x="${wx + .5}" y="${wy + .5}" width="${ww - 1}" height="${wh - 1}" rx="10" fill="${P.chip}" stroke="${P.rule}"/>`;
  [0, 1, 2].forEach((i) => { s += `<circle cx="${wx + 16 + i * 12}" cy="${wy + 15}" r="3.5" fill="${P.rule}"/>`; });
  const n = 5, tw = 58, tg = 6, tx0 = wx + 14, ty = wy + 28;
  const fx = TW / 2, fy = 278;
  for (let i = 0; i < n; i++) {
    const x = tx0 + i * (tw + tg), cx = x + tw / 2, cy = ty + 11;
    s += `<g class="tab tab${i}"><rect x="${x}" y="${ty}" width="${tw}" height="22" rx="5" fill="${P.ink}" opacity="${i === 0 ? 0.9 : 0.14}"/><rect x="${x + 8}" y="${ty + 9}" width="${tw - 22 - (i % 3) * 6}" height="4" rx="2" fill="${i === 0 ? P.chip : P.muted}"/></g>`;
    const t0 = 12 + i * 6, t1 = t0 + 12;
    css += `.tab${i}{animation:tab${i} 9s ${EASE} infinite}
@keyframes tab${i}{0%,${t0}%{transform:none;opacity:1}${t1}%{transform:translate(${fx - cx}px,${fy - cy}px) scale(.35);opacity:0}88%{transform:translate(${fx - cx}px,${fy - cy}px) scale(.35);opacity:0}89%{transform:translateY(-8px);opacity:0}96%,100%{transform:none;opacity:1}}`;
  }
  // page content lines that fade out, then the slogan
  [0, 1, 2].forEach((i) => { s += `<rect class="busy" x="${wx + 18}" y="${wy + 66 + i * 14}" width="${[260, 210, 240][i]}" height="5" rx="2.5" fill="${P.rule}"/>`; });
  s += `<g class="calm">${text('Free your mind.', { x: TW / 2, y: wy + 94, size: 28, weight: 500, tracking: -0.03, anchor: 'middle', fill: P.ink })}</g>`;
  // folder
  const fw = 112, fh = 66, fxl = fx - fw / 2, fyt = fy - 26;
  s += `<g class="folder"><path d="M${fxl} ${fyt + 8}a6 6 0 0 1 6-6h30l8 8h62a6 6 0 0 1 6 6v${fh - 16}a6 6 0 0 1-6 6h-${fw - 12}a6 6 0 0 1-6-6z" fill="${P.chip}" stroke="${P.ink}" stroke-width="1.6" stroke-linejoin="round"/></g>`;
  s += `<g class="count">${text('5 tabs saved', { x: fx, y: fyt + 45, size: 15, weight: 500, anchor: 'middle', fill: P.muted })}</g>`;
  css += `.busy{animation:busy 9s ${EASE} infinite}@keyframes busy{0%,40%{opacity:1}52%,88%{opacity:0}96%,100%{opacity:1}}
.calm{opacity:0;animation:calm 9s ${EASE} infinite}@keyframes calm{0%,48%{opacity:0;transform:translateY(6px)}58%,84%{opacity:1;transform:none}90%,100%{opacity:0}}
.count{opacity:0;animation:count 9s ${EASE} infinite}@keyframes count{0%,44%{opacity:0}50%,86%{opacity:1}92%,100%{opacity:0}}
.folder{transform-origin:${fx}px ${fy}px;animation:folder 9s ${EASE} infinite}@keyframes folder{0%,22%{transform:none}26%{transform:scale(1.05)}30%,46%{transform:none}49%{transform:scale(1.06)}53%,100%{transform:none}}`;
  return { s, css };
}

function visRegister(P, reg) {
  let s = '', css = '';
  const bx = PAD, by = 74, bw = TW - 2 * PAD, bh = 250;
  s += `<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="8" fill="${P.board}" stroke="${P.rule}" stroke-opacity="${P.board === '#2a2520' ? 0 : 1}"/>`;
  s += text('AI agents going wrong', { x: bx + 18, y: by + 30, size: 15, weight: 400, fill: P.boardInk, attrs: 'fill-opacity=".62"' });
  s += `<circle class="pulse" cx="${bx + bw - 60}" cy="${by + 25}" r="4.5" fill="${P.red}"/>`;
  s += text('LIVE', { x: bx + bw - 18, y: by + 30, size: 13.5, weight: 600, tracking: 0.12, anchor: 'end', fill: P.boardInk });
  s += text(String(reg.count), { x: bx + 15, y: by + 108, size: 76, weight: 500, tracking: -0.05, fill: P.boardInk });
  s += text('incidents, sourced and scored', { x: bx + 18, y: by + 132, size: 15, weight: 400, fill: P.boardInk, attrs: 'fill-opacity=".62"' });
  // one line per incident, height = severity (same idea as the register's own chart)
  const sev = reg.severities, x0 = bx + 18, x1 = bx + bw - 18, base = by + bh - 18, step = (x1 - x0) / Math.max(sev.length - 1, 1);
  const sw = Math.max(1, Math.min(2, step * 0.5));
  sev.forEach((v, i) => {
    const h = 8 + v * 14, x = (x0 + i * step).toFixed(2);
    const col = v >= 4 ? P.red : P.boardInk, op = v >= 4 ? 1 : 0.5;
    s += `<path class="bar" style="animation-delay:${(i * 1.2 / sev.length).toFixed(3)}s" d="M${x} ${base}V${base - h}" stroke="${col}" stroke-opacity="${op}" stroke-width="${sw.toFixed(2)}" stroke-linecap="round"/>`;
  });
  css += `.bar{transform-box:fill-box;transform-origin:50% 100%;animation:bar 9s ${EASE} infinite both}
@keyframes bar{0%{transform:scaleY(0)}12%,86%{transform:scaleY(1)}96%,100%{transform:scaleY(0)}}
.pulse{transform-box:fill-box;transform-origin:center;animation:pulse 1.8s ease-in-out infinite}@keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.35;transform:scale(.7)}}`;
  return { s, css };
}

function visDaybar(P) {
  let s = '', css = '';
  const sx = PAD, sy = 74, sw = TW - 2 * PAD, sh = 250;
  s += `<rect x="${sx + .5}" y="${sy + .5}" width="${sw - 1}" height="${sh - 1}" rx="8" fill="${P.chip}" stroke="${P.rule}"/>`;
  // someone deep in work on the left
  [190, 150, 210, 120, 175, 200, 140, 90, 160].forEach((w, i) => {
    s += `<rect x="${sx + 20 + (i % 4 === 1 ? 14 : 0)}" y="${sy + 24 + i * 22}" width="${w}" height="5" rx="2.5" fill="${P.rule}"/>`;
  });
  // the bar at the screen edge: 9:00 -> 18:00
  const bx = sx + sw - 50, bw = 32, top = sy + 14, bot = sy + sh - 14, hours = 9, ph = (bot - top) / hours;
  const yAt = (h) => top + (h - 9) * ph;
  s += `<rect x="${bx}" y="${top}" width="${bw}" height="${bot - top}" rx="6" fill="${P.block}" fill-opacity=".06" stroke="${P.rule}"/>`;
  for (let h = 9; h <= 18; h += 1) {
    if (h % 3 === 0) s += text(String(h), { x: bx - 8, y: yAt(h) + 4.5, size: 13, weight: 500, anchor: 'end', fill: P.faint });
  }
  const blocks = [[9, 10.5, .85], [11, 11.5, .35], [12.75, 13.5, .18], [14, 15, .85], [15.25, 15.75, .35], [16.5, 17.75, .6]];
  blocks.forEach(([a, b, o]) => { s += `<rect x="${bx + 4}" y="${yAt(a) + 1}" width="${bw - 8}" height="${(b - a) * ph - 2}" rx="3" fill="${P.block}" fill-opacity="${o}"/>`; });
  // now-line sweeps the day; a nudge appears just before the 14:00 block
  const yStart = yAt(9.4), yEnd = yAt(17.9);
  s += `<g class="now"><path d="M${bx - 4} ${yStart}H${bx + bw + 4}" stroke="${P.red}" stroke-width="2" stroke-linecap="round"/><path d="M${bx - 9} ${yStart - 4}L${bx - 3} ${yStart}L${bx - 9} ${yStart + 4}z" fill="${P.red}"/></g>`;
  const frac = (yAt(13.7) - yStart) / (yEnd - yStart), p = Math.round(frac * 100);
  const cy = yAt(14) - 36, cw = 178, cx = bx - 16 - cw;
  s += `<g class="nudge"><rect x="${cx}" y="${cy}" width="${cw}" height="54" rx="8" fill="${P.board === '#2a2520' ? '#ffffff' : P.board}" stroke="${P.rule}"/>`;
  s += `<circle cx="${cx + 14}" cy="${cy + 19}" r="4" fill="${P.red}"/>`;
  s += text('Design review', { x: cx + 26, y: cy + 24, size: 15.5, weight: 600, fill: P.ink });
  s += text('starts in 5 min', { x: cx + 14, y: cy + 43, size: 14, weight: 400, fill: P.muted }) + '</g>';
  css += `.now{animation:now 12s linear infinite}@keyframes now{0%{transform:translateY(0)}100%{transform:translateY(${(yEnd - yStart).toFixed(1)}px)}}
.nudge{opacity:0;animation:nudge 12s ${EASE} infinite}@keyframes nudge{0%,${p - 2}%{opacity:0;transform:translateX(8px)}${p + 1}%,${p + 9}%{opacity:1;transform:none}${p + 12}%,100%{opacity:0;transform:none}}`;
  return { s, css };
}

function tile(f, i, n, P, reg) {
  const fill = (v) => String(v).replace('{{register.count}}', reg.count);
  let body = '';
  body += `<path d="M0 .5H${TW}M0 ${TH - .5}H${TW}" stroke="${P.rule}"/>`;
  if (i < n - 1) body += `<path d="M${TW - .5} 18V${TH - 18}" stroke="${P.rule}"/>`;
  body += text(f.platform.toUpperCase(), { x: PAD, y: 42, size: 13.5, weight: 500, tracking: 0.12, fill: P.muted });
  const st = f.status, stW = measure(st, 13, 600, 0.1);
  const pillW = stW + 34, px = TW - PAD - pillW;
  body += `<rect x="${px}" y="22" width="${pillW}" height="28" rx="14" fill="none" stroke="${P.rule}"/>`;
  body += `<circle class="${st === 'LIVE' ? 'pulse' : ''}" cx="${px + 13}" cy="36" r="4" fill="${st === 'SHIPPED' ? P.ink : P.red}"/>`;
  body += text(st, { x: px + 23, y: 40.6, size: 13, weight: 600, tracking: 0.1, fill: P.ink });
  const v = f.kind === 'freetabs' ? visFreeTabs(P) : f.kind === 'register' ? visRegister(P, reg) : visDaybar(P);
  body += v.s;
  body += text(f.name, { x: PAD, y: 380, size: 40, weight: 500, tracking: -0.035, fill: P.ink });
  wrap(f.desc, 19, 400, TW - 2 * PAD).forEach((l, k) => { body += text(l, { x: PAD, y: 412 + k * 25, size: 19, weight: 400, fill: P.muted }); });
  body += text(fill(f.metricValue), { x: PAD, y: 510, size: 30, weight: 500, tracking: -0.03, fill: P.ink });
  body += text(fill(f.metricLabel), { x: PAD, y: 536, size: 15.5, weight: 400, fill: P.muted });
  body += arrowRight(TW - PAD - 22, 529, 22, P.ink, 1.8);
  const css = v.css + `.pulse{transform-box:fill-box;transform-origin:center;animation:pulse 1.8s ease-in-out infinite}@keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.35;transform:scale(.7)}}`;
  return svg(TW, TH, body, css, `${f.name} — ${fill(f.desc)}`);
}

// ---------- pills ----------
function pill({ label, meta, avatar }, P, variant = 'plain') {
  const feat = variant === 'feature', H = avatar ? 40 : 32, ls = avatar ? 15 : 13.5, R = H / 2 - 4, c = H / 2;
  const tx = avatar ? H + 2 : 30, ty = c + ls * 0.34;
  const lw = measure(label, ls, 600), mw = meta ? measure(meta, ls, 400) : 0;
  const W = Math.ceil(tx + lw + (meta ? 8 + mw : 0) + (feat ? 40 : 14));
  const bg = feat ? P.ink : P.chip, fg = feat ? (P.ink === '#2a2520' ? '#ede8df' : '#2a2520') : P.ink;
  const sub = feat ? fg : P.muted, dc = feat ? P.red : P.faint;
  let b = `<rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="${H / 2 - .5}" fill="${bg}" stroke="${feat ? bg : P.rule}"/>`;
  if (avatar) {
    const img = fs.readFileSync(path.join(ROOT, avatar)).toString('base64');
    b += `<clipPath id="av"><circle cx="${c}" cy="${c}" r="${R}"/></clipPath><image href="data:image/jpeg;base64,${img}" x="4" y="4" width="${2 * R}" height="${2 * R}" clip-path="url(#av)" preserveAspectRatio="xMidYMid slice"/><circle cx="${c}" cy="${c}" r="${R}" fill="none" stroke="${P.rule}"/>`;
  } else b += `<circle cx="16" cy="16" r="7.5" fill="${dc}" fill-opacity="${feat ? .35 : .22}"/><circle class="${feat ? 'pulse' : ''}" cx="16" cy="16" r="3.8" fill="${dc}"/>`;
  b += text(label, { x: tx, y: ty, size: ls, weight: 600, fill: fg });
  if (meta) b += text(meta, { x: tx + 8 + lw, y: ty, size: ls, weight: 400, fill: sub, attrs: feat ? 'fill-opacity=".7"' : '' });
  if (feat) b += arrowRight(W - 30, 16, 13, fg, 1.6);
  return { svg: svg(W, H, b, `.pulse{transform-box:fill-box;transform-origin:center;animation:pulse 1.8s ease-in-out infinite}@keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.4;transform:scale(.7)}}`, meta ? `${label} ${meta}` : label), W };
}

// ---------- README ----------
// UTMs on links to sites we own analytics for (not GitHub, X or other platforms).
const NO_UTM = /(^|\.)(github\.com|x\.com|twitter\.com|chrome\.google\.com|linkedin\.com)$/;
function utm(url, content) {
  const u = new URL(url);
  if (NO_UTM.test(u.hostname)) return url;
  const p = { utm_source: 'github', utm_medium: 'profile', utm_campaign: 'readme', utm_content: content, ...(cfg.utm || {}) };
  for (const [k, v] of Object.entries(p)) if (!u.searchParams.has(k)) u.searchParams.set(k, v);
  return u.toString().replace(/&/g, '&amp;');
}
const utmMd = (md, content) => md.replace(/\]\((https?:[^)]+)\)/g, (_, url) => `](${utm(url, content).replace(/&amp;/g, '&')})`);
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

async function main() {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const reg = await registerData();
  const base = `https://raw.githubusercontent.com/${cfg.github}/${cfg.github}/${cfg.outputBranch}`;
  const write = (name, mode, content) => fs.writeFileSync(path.join(OUT, `${name}-${mode}.svg`), content);
  const pic = (name, alt, attr) =>
    `<picture><source media="(prefers-color-scheme: dark)" srcset="${base}/${name}-dark.svg"><img alt="${esc(alt)}" src="${base}/${name}-light.svg" ${attr}></picture>`;

  for (const mode of ['light', 'dark']) {
    const P = PALETTES[mode];
    write('banner', mode, banner(P));
    cfg.featured.forEach((f, i) => write(`exp-${slug(f.name)}`, mode, tile(f, i, cfg.featured.length, P, reg)));
    cfg.socials.forEach((s) => write(`social-${slug(s.label)}`, mode, pill(s, P).svg));
    cfg.more.forEach((m) => write(`more-${slug(m.label)}`, mode, pill(m, P, m.feature ? 'feature' : 'plain').svg));
  }

  const pct = (100 / cfg.featured.length).toFixed(3).replace(/0+$/, '');
  const L = [];
  L.push('<!-- Generated by render.mjs from profile.json. Edit profile.json, not this file. -->', '');
  L.push(`<p>${pic('banner', cfg.banner.words.join(' → '), 'width="100%"')}</p>`, '');
  L.push(`## ${cfg.intro.title}`, '');
  cfg.intro.lines.forEach((l) => L.push(utmMd(l, 'intro'), ''));
  L.push(`#### ${cfg.sections.featured}`, '');
  // no whitespace between the anchors: the tiles must touch to read as one strip
  L.push(`<p>${cfg.featured.map((f) => `<a href="${utm(f.url, `featured-${slug(f.name)}`)}">${pic(`exp-${slug(f.name)}`, f.name, `width="${pct}%"`)}</a>`).join('')}</p>`, '');
  L.push(`#### ${cfg.sections.more}`, '');
  L.push(`<p>${cfg.more.map((m) => `<a href="${utm(m.url, `pill-${slug(m.label)}`)}">${pic(`more-${slug(m.label)}`, `${m.label}${m.meta ? ' — ' + m.meta : ''}`, 'height="32"')}</a>`).join('\n')}</p>`, '');
  L.push('<br>', '');
  L.push(`<p>${cfg.socials.map((x) => `<a href="${utm(x.url, `social-${slug(x.label)}`)}">${pic(`social-${slug(x.label)}`, `${x.label}${x.meta ? ' ' + x.meta : ''}`, x.avatar ? 'height="40"' : 'height="32"')}</a>`).join('\n')}</p>`);
  fs.writeFileSync(path.join(ROOT, 'README.md'), L.join('\n'));
  console.log(`rendered ${fs.readdirSync(OUT).length} SVGs · register: ${reg.count} incidents (${reg.live ? 'live' : 'fallback'})`);
}
main();
