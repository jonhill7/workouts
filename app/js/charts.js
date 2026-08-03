// Single-series SVG line chart with crosshair + tooltip hover layer.
// Colors come from CSS custom properties so light/dark swap automatically.

const NS = 'http://www.w3.org/2000/svg';

function svgEl(tag, attrs) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

function niceTicks(min, max, count) {
  if (min === max) { min -= 1; max += 1; }
  const span = max - min;
  let step = Math.pow(10, Math.floor(Math.log10(span / count)));
  const err = span / count / step;
  if (err >= 7.5) step *= 10;
  else if (err >= 3.5) step *= 5;
  else if (err >= 1.5) step *= 2;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  return { lo, hi, ticks };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function fmtDateShort(ms, withYear) {
  const d = new Date(ms);
  return withYear
    ? `${MONTHS[d.getUTCMonth()]} '${String(d.getUTCFullYear()).slice(2)}`
    : `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

function fmtDateLong(ms) {
  const d = new Date(ms);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

// points: [{ date: 'YYYY-MM-DD', value: number }] sorted ascending.
// opts: { formatValue(v) -> string }
export function renderLineChart(container, points, opts = {}) {
  container.textContent = '';
  container.classList.add('chart-box');
  if (!points.length) {
    const empty = document.createElement('div');
    empty.className = 'chart-empty';
    empty.textContent = 'No data in this range';
    container.appendChild(empty);
    return;
  }

  const fmtV = opts.formatValue || (v => String(Math.round(v * 100) / 100));
  const W = Math.max(280, container.clientWidth || 320);
  const H = 230;
  const M = { l: 46, r: 14, t: 14, b: 30 };
  const iw = W - M.l - M.r;
  const ih = H - M.t - M.b;

  const pts = points.map(p => ({ x: Date.parse(p.date + 'T00:00:00Z'), y: p.value }));
  let xMin = pts[0].x, xMax = pts[pts.length - 1].x;
  if (xMin === xMax) { xMin -= 43_200_000; xMax += 43_200_000; }
  const yVals = pts.map(p => p.y);
  const { lo, hi, ticks } = niceTicks(Math.min(...yVals), Math.max(...yVals), 4);

  const X = t => M.l + ((t - xMin) / (xMax - xMin)) * iw;
  const Y = v => M.t + ih - ((v - lo) / (hi - lo || 1)) * ih;

  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, width: '100%', height: H, role: 'img' });

  // horizontal hairline grid + y tick labels
  for (const t of ticks) {
    const y = Y(t);
    svg.appendChild(svgEl('line', { x1: M.l, x2: W - M.r, y1: y, y2: y, class: 'chart-grid' }));
    const lbl = svgEl('text', { x: M.l - 8, y: y + 4, 'text-anchor': 'end', class: 'chart-tick' });
    lbl.textContent = fmtV(t);
    svg.appendChild(lbl);
  }

  // x tick labels (≤5, evenly spread over the point range)
  const withYear = xMax - xMin > 300 * 86_400_000;
  const nx = Math.min(pts.length === 1 ? 1 : 4, pts.length);
  const seen = new Set();
  for (let i = 0; i < nx; i++) {
    const t = nx === 1 ? pts[0].x : xMin + ((xMax - xMin) * i) / (nx - 1);
    const label = fmtDateShort(t, withYear);
    if (seen.has(label)) continue;
    seen.add(label);
    const anchor = i === 0 ? 'start' : i === nx - 1 ? 'end' : 'middle';
    const lbl = svgEl('text', { x: X(t), y: H - 8, 'text-anchor': anchor, class: 'chart-tick' });
    lbl.textContent = label;
    svg.appendChild(lbl);
  }

  const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${X(p.x).toFixed(1)},${Y(p.y).toFixed(1)}`).join('');
  svg.appendChild(svgEl('path', { d, class: 'chart-line-path' }));
  for (const p of pts) {
    svg.appendChild(svgEl('circle', { cx: X(p.x).toFixed(1), cy: Y(p.y).toFixed(1), r: 2.5, class: 'chart-dot' }));
  }

  // hover layer: crosshair + enlarged marker + tooltip on nearest point
  const cross = svgEl('line', { y1: M.t, y2: M.t + ih, class: 'chart-cross', visibility: 'hidden' });
  const hoverDot = svgEl('circle', { r: 5, class: 'chart-dot-hover', visibility: 'hidden' });
  svg.appendChild(cross);
  svg.appendChild(hoverDot);

  const tip = document.createElement('div');
  tip.className = 'chart-tip';
  tip.style.display = 'none';
  container.appendChild(tip);
  container.appendChild(svg);

  function onMove(ev) {
    const rect = svg.getBoundingClientRect();
    const px = ((ev.clientX - rect.left) / rect.width) * W;
    let best = 0, bestDist = Infinity;
    for (let i = 0; i < pts.length; i++) {
      const dx = Math.abs(X(pts[i].x) - px);
      if (dx < bestDist) { bestDist = dx; best = i; }
    }
    const p = pts[best];
    const sx = X(p.x), sy = Y(p.y);
    cross.setAttribute('x1', sx); cross.setAttribute('x2', sx);
    cross.setAttribute('visibility', 'visible');
    hoverDot.setAttribute('cx', sx); hoverDot.setAttribute('cy', sy);
    hoverDot.setAttribute('visibility', 'visible');
    tip.innerHTML = `<span class="chart-tip-date">${fmtDateLong(p.x)}</span><span class="chart-tip-val">${fmtV(p.y)}</span>`;
    tip.style.display = 'flex';
    const tipW = tip.offsetWidth;
    const leftPx = (sx / W) * rect.width;
    tip.style.left = Math.max(0, Math.min(rect.width - tipW, leftPx - tipW / 2)) + 'px';
  }
  function onLeave() {
    cross.setAttribute('visibility', 'hidden');
    hoverDot.setAttribute('visibility', 'hidden');
    tip.style.display = 'none';
  }
  svg.addEventListener('pointermove', onMove);
  svg.addEventListener('pointerdown', onMove);
  svg.addEventListener('pointerleave', onLeave);
}
