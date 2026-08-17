/* BAUGMENT — charts
   Hand-rolled SVG. No charting dependency, so the app renders identically
   offline, in print, and inside a sandboxed preview. Every function returns an
   SVG string; call BAUGMENT.charts.bind(container) once afterwards to wire the
   hover tooltips. */

BAUGMENT.charts = (function () {
  const U = BAUGMENT.util;
  const esc = U.esc;

  /* The brand's accent set, in the order the guidelines list it: Royal Blue
     leads, then Sky, Indigo, Emerald, Amber. Rose is deliberately absent:
     it means "decline" everywhere else in the app, so it can't also be a
     neutral category colour. */
  const PALETTE = ['var(--accent)', 'var(--sky)', 'var(--violet)', 'var(--green)', 'var(--gold)'];

  function niceMax(v) {
    if (v <= 0) return 10;
    const mag = Math.pow(10, Math.floor(Math.log10(v)));
    const n = v / mag;
    const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
    return step * mag;
  }

  function ticks(max, count) {
    const out = [];
    for (let i = 0; i <= count; i++) out.push((max / count) * i);
    return out;
  }

  function dataAttr(label, value) {
    return ' data-tip="' + esc('<b>' + label + '</b> · ' + value) + '"';
  }

  /* --- Line / area ------------------------------------------------------- */
  /* series: [{ name, color, values: number[] }]  labels: string[] */
  function line(labels, series, opts) {
    opts = opts || {};
    const W = opts.width || 760, H = opts.height || 260;
    const m = { t: 14, r: 16, b: 28, l: 46 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const area = !!opts.area;
    const fmtV = opts.format || U.fmt.compact;

    if (!labels.length) return placeholder(W, H, 'No data in this range');

    let peak = 0;
    series.forEach((s) => s.values.forEach((v) => { if (v > peak) peak = v; }));
    const max = niceMax(peak || 1);
    const stepX = labels.length > 1 ? iw / (labels.length - 1) : 0;
    const X = (i) => m.l + i * stepX;
    const Y = (v) => m.t + ih - (v / max) * ih;

    let g = '';
    ticks(max, 4).forEach((t) => {
      const y = Y(t);
      g += '<line class="grid-line" x1="' + m.l + '" y1="' + y.toFixed(1) + '" x2="' + (W - m.r) + '" y2="' + y.toFixed(1) + '"/>' +
        '<text class="axis-label" x="' + (m.l - 8) + '" y="' + (y + 3.5).toFixed(1) + '" text-anchor="end">' + fmtV(t) + '</text>';
    });

    const every = Math.max(1, Math.ceil(labels.length / (opts.maxTicks || 8)));
    labels.forEach((lb, i) => {
      if (i % every && i !== labels.length - 1) return;
      g += '<text class="axis-label" x="' + X(i).toFixed(1) + '" y="' + (H - 8) + '" text-anchor="middle">' + esc(lb) + '</text>';
    });

    let body = '';
    series.forEach((s, si) => {
      const color = s.color || PALETTE[si % PALETTE.length];
      const pts = s.values.map((v, i) => X(i).toFixed(1) + ',' + Y(v).toFixed(1));
      if (area) {
        const gid = 'ga' + si + '_' + Math.random().toString(36).slice(2, 6);
        body += '<defs><linearGradient id="' + gid + '" x1="0" y1="0" x2="0" y2="1">' +
          '<stop offset="0%" stop-color="' + color + '" stop-opacity="0.28"/>' +
          '<stop offset="100%" stop-color="' + color + '" stop-opacity="0"/></linearGradient></defs>' +
          '<polygon fill="url(#' + gid + ')" points="' + X(0).toFixed(1) + ',' + (m.t + ih) + ' ' + pts.join(' ') + ' ' + X(labels.length - 1).toFixed(1) + ',' + (m.t + ih) + '"/>';
      }
      body += '<polyline class="series-line" stroke="' + color + '" points="' + pts.join(' ') + '"/>';
      s.values.forEach((v, i) => {
        body += '<circle class="series-dot" cx="' + X(i).toFixed(1) + '" cy="' + Y(v).toFixed(1) + '" r="3.2" fill="' + color + '"' +
          dataAttr(labels[i] + ' · ' + s.name, fmtV(v)) + '/>';
      });
    });

    return svg(W, H, g + body) + legend(series);
  }

  /* --- Bars — vertical, grouped or stacked -------------------------------- */
  function bars(labels, series, opts) {
    opts = opts || {};
    const W = opts.width || 760, H = opts.height || 260;
    const m = { t: 14, r: 16, b: 30, l: 46 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const stacked = !!opts.stacked;
    const fmtV = opts.format || U.fmt.compact;

    if (!labels.length) return placeholder(W, H, 'No data in this range');

    let peak = 0;
    if (stacked) {
      labels.forEach((_, i) => { peak = Math.max(peak, series.reduce((a, s) => a + (s.values[i] || 0), 0)); });
    } else {
      series.forEach((s) => s.values.forEach((v) => { if (v > peak) peak = v; }));
    }
    const max = niceMax(peak || 1);
    const slot = iw / labels.length;
    const bw = stacked ? Math.min(38, slot * 0.6) : Math.min(24, (slot * 0.68) / series.length);
    const Y = (v) => m.t + ih - (v / max) * ih;

    let g = '';
    ticks(max, 4).forEach((t) => {
      const y = Y(t);
      g += '<line class="grid-line" x1="' + m.l + '" y1="' + y.toFixed(1) + '" x2="' + (W - m.r) + '" y2="' + y.toFixed(1) + '"/>' +
        '<text class="axis-label" x="' + (m.l - 8) + '" y="' + (y + 3.5).toFixed(1) + '" text-anchor="end">' + fmtV(t) + '</text>';
    });

    let body = '';
    labels.forEach((lb, i) => {
      const cx = m.l + slot * i + slot / 2;
      let acc = 0;
      series.forEach((s, si) => {
        const color = s.color || PALETTE[si % PALETTE.length];
        const v = s.values[i] || 0;
        const h = Math.max(v > 0 ? 2 : 0, (v / max) * ih);
        const x = stacked ? cx - bw / 2 : cx - (bw * series.length) / 2 + si * bw + 1;
        const y = stacked ? Y(acc + v) : Y(v);
        acc += v;
        body += '<rect class="bar-rect" x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + (bw - 2).toFixed(1) +
          '" height="' + h.toFixed(1) + '" rx="3" fill="' + color + '"' + dataAttr(lb + ' · ' + s.name, fmtV(v)) + '/>';
      });
      const every = Math.max(1, Math.ceil(labels.length / (opts.maxTicks || 12)));
      if (i % every === 0 || i === labels.length - 1) {
        g += '<text class="axis-label" x="' + cx.toFixed(1) + '" y="' + (H - 9) + '" text-anchor="middle">' + esc(lb) + '</text>';
      }
    });

    return svg(W, H, g + body) + legend(series);
  }

  /* --- Horizontal bars — for ranked lists --------------------------------- */
  function hbars(rows, opts) {
    opts = opts || {};
    const fmtV = opts.format || U.fmt.compact;
    const max = Math.max(1, ...rows.map((r) => r.value));
    let out = '<div style="display:flex;flex-direction:column;gap:10px">';
    rows.forEach((r) => {
      const pct = (r.value / max) * 100;
      out += '<div>' +
        '<div style="display:flex;gap:8px;align-items:baseline;margin-bottom:4px">' +
          '<span style="font-size:var(--step--1);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + (r.html || esc(r.label)) + '</span>' +
          '<span class="spacer"></span>' +
          '<span class="mono num" style="color:var(--text-dim)">' + fmtV(r.value) + '</span>' +
        '</div>' +
        '<div style="height:7px;border-radius:99px;background:var(--surface-3);overflow:hidden">' +
          '<div style="height:100%;width:' + pct.toFixed(1) + '%;border-radius:99px;background:' + (r.color || 'var(--accent)') + '"></div>' +
        '</div></div>';
    });
    return out + '</div>';
  }

  /* --- Donut / pie -------------------------------------------------------- */
  function donut(slices, opts) {
    opts = opts || {};
    const size = opts.size || 200;
    const R = size / 2 - 4;
    const inner = opts.pie ? 0 : R * 0.62;
    const cx = size / 2, cy = size / 2;
    const total = slices.reduce((a, s) => a + s.value, 0);
    const fmtV = opts.format || U.fmt.compact;

    if (!total) return placeholder(size, size, 'No data');

    let a0 = -Math.PI / 2, body = '';
    slices.forEach((s, i) => {
      const frac = s.value / total;
      const a1 = a0 + frac * Math.PI * 2;
      const large = frac > 0.5 ? 1 : 0;
      const p = (r, a) => [(cx + r * Math.cos(a)).toFixed(2), (cy + r * Math.sin(a)).toFixed(2)];
      const [x0, y0] = p(R, a0), [x1, y1] = p(R, a1);
      const [ix1, iy1] = p(inner, a1), [ix0, iy0] = p(inner, a0);
      const d = frac >= 0.9999
        ? 'M ' + cx + ' ' + (cy - R) + ' A ' + R + ' ' + R + ' 0 1 1 ' + (cx - 0.01) + ' ' + (cy - R) + ' Z'
        : 'M ' + x0 + ' ' + y0 + ' A ' + R + ' ' + R + ' 0 ' + large + ' 1 ' + x1 + ' ' + y1 +
          (inner ? ' L ' + ix1 + ' ' + iy1 + ' A ' + inner + ' ' + inner + ' 0 ' + large + ' 0 ' + ix0 + ' ' + iy0 : ' L ' + cx + ' ' + cy) + ' Z';
      body += '<path class="bar-rect" d="' + d + '" fill="' + (s.color || PALETTE[i % PALETTE.length]) + '"' +
        dataAttr(s.label, fmtV(s.value) + ' (' + (frac * 100).toFixed(1) + '%)') + '/>';
      a0 = a1;
    });

    if (inner && opts.centerLabel) {
      body += '<text x="' + cx + '" y="' + (cy - 2) + '" text-anchor="middle" fill="var(--text)" ' +
        'style="font-size:19px;font-weight:650;font-variant-numeric:tabular-nums">' + esc(opts.centerValue || '') + '</text>' +
        '<text x="' + cx + '" y="' + (cy + 15) + '" text-anchor="middle" fill="var(--text-mute)" ' +
        'style="font-family:var(--ff-mono);font-size:9.5px;letter-spacing:.1em;text-transform:uppercase">' + esc(opts.centerLabel) + '</text>';
    }

    return svg(size, size, body) + legend(slices.map((s, i) => ({ name: s.label, color: s.color || PALETTE[i % PALETTE.length] })));
  }

  /* --- Heatmap — day of week × hour --------------------------------------- */
  function heatmap(matrix, rowLabels, colLabels, opts) {
    opts = opts || {};
    const cell = opts.cell || 22, gap = 3;
    const padL = 34, padT = 18;
    const W = padL + colLabels.length * (cell + gap), H = padT + rowLabels.length * (cell + gap) + 4;
    const fmtV = opts.format || U.fmt.compact;
    let peak = 0;
    matrix.forEach((row) => row.forEach((v) => { if (v > peak) peak = v; }));

    let body = '';
    colLabels.forEach((c, ci) => {
      if (ci % (opts.colEvery || 2)) return;
      body += '<text class="axis-label" x="' + (padL + ci * (cell + gap) + cell / 2) + '" y="11" text-anchor="middle">' + esc(c) + '</text>';
    });
    rowLabels.forEach((r, ri) => {
      body += '<text class="axis-label" x="' + (padL - 8) + '" y="' + (padT + ri * (cell + gap) + cell / 2 + 3.5) + '" text-anchor="end">' + esc(r) + '</text>';
      colLabels.forEach((c, ci) => {
        const v = matrix[ri][ci] || 0;
        const t = peak ? v / peak : 0;
        const fill = t === 0 ? 'var(--surface-2)' : 'color-mix(in srgb, var(--accent) ' + Math.round(12 + t * 88) + '%, var(--surface-2))';
        body += '<rect class="hot-cell bar-rect" x="' + (padL + ci * (cell + gap)) + '" y="' + (padT + ri * (cell + gap)) +
          '" width="' + cell + '" height="' + cell + '" fill="' + fill + '"' + dataAttr(r + ' ' + c, fmtV(v)) + '/>';
      });
    });

    return svg(W, H, body, true);
  }

  /* --- Radar -------------------------------------------------------------- */
  function radar(axes, series, opts) {
    opts = opts || {};
    const size = opts.size || 280;
    const cx = size / 2, cy = size / 2, R = size / 2 - 34;
    const n = axes.length;
    if (!n) return placeholder(size, size, 'No data');

    const pt = (i, frac) => {
      const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
      return [(cx + Math.cos(a) * R * frac).toFixed(1), (cy + Math.sin(a) * R * frac).toFixed(1)];
    };

    let body = '';
    [0.25, 0.5, 0.75, 1].forEach((f) => {
      const pts = axes.map((_, i) => pt(i, f).join(',')).join(' ');
      body += '<polygon class="radar-web" points="' + pts + '"/>';
    });
    axes.forEach((a, i) => {
      const [x, y] = pt(i, 1);
      body += '<line class="radar-web" x1="' + cx + '" y1="' + cy + '" x2="' + x + '" y2="' + y + '"/>';
      const [lx, ly] = pt(i, 1.18);
      body += '<text class="axis-label" x="' + lx + '" y="' + ly + '" text-anchor="middle" dominant-baseline="middle">' + esc(a) + '</text>';
    });

    series.forEach((s, si) => {
      const color = s.color || PALETTE[si % PALETTE.length];
      const pts = s.values.map((v, i) => pt(i, U.clamp(v, 0, 1)).join(',')).join(' ');
      body += '<polygon points="' + pts + '" fill="' + color + '" fill-opacity="0.16" stroke="' + color + '" stroke-width="2" stroke-linejoin="round"/>';
      s.values.forEach((v, i) => {
        const [x, y] = pt(i, U.clamp(v, 0, 1));
        body += '<circle class="series-dot" cx="' + x + '" cy="' + y + '" r="3" fill="' + color + '"' +
          dataAttr(s.name + ' · ' + axes[i], (v * 100).toFixed(0) + '% of best') + '/>';
      });
    });

    return svg(size, size, body) + legend(series);
  }

  /* --- Sparkline ---------------------------------------------------------- */
  function spark(values, color, w, h) {
    w = w || 120; h = h || 28;
    if (!values.length) return '';
    const max = Math.max(...values), min = Math.min(...values);
    const span = max - min || 1;
    const pts = values.map((v, i) =>
      ((i / Math.max(1, values.length - 1)) * (w - 2) + 1).toFixed(1) + ',' + (h - 2 - ((v - min) / span) * (h - 4)).toFixed(1));
    return '<svg class="chart" viewBox="0 0 ' + w + ' ' + h + '" width="100%" height="' + h + '" preserveAspectRatio="none" aria-hidden="true">' +
      '<polyline class="series-line" stroke="' + (color || 'var(--accent)') + '" stroke-width="1.6" points="' + pts.join(' ') + '"/></svg>';
  }

  /* --- Helpers ------------------------------------------------------------ */
  function svg(w, h, inner, fixed) {
    return '<svg class="chart" viewBox="0 0 ' + w + ' ' + h + '" ' +
      (fixed ? 'width="' + w + '" height="' + h + '"' : 'width="100%" height="' + h + '" preserveAspectRatio="xMidYMid meet"') +
      ' role="img">' + inner + '</svg>';
  }

  function placeholder(w, h, text) {
    return '<svg class="chart" viewBox="0 0 ' + w + ' ' + h + '" width="100%" height="' + h + '" role="img">' +
      '<text x="' + w / 2 + '" y="' + h / 2 + '" text-anchor="middle" fill="var(--text-mute)" style="font-size:12px">' + esc(text) + '</text></svg>';
  }

  function legend(series) {
    const items = series.filter((s) => s.name);
    if (items.length < 2) return '';
    return '<div class="legend">' + items.map((s, i) =>
      '<span class="legend__item"><span class="legend__swatch" style="background:' + (s.color || PALETTE[i % PALETTE.length]) + '"></span>' +
      esc(s.name) + '</span>').join('') + '</div>';
  }

  /* One delegated listener per container handles every tooltip inside it. */
  function bind(container) {
    if (!container || container.__tipBound) return;
    container.__tipBound = true;
    container.addEventListener('mousemove', function (e) {
      const t = e.target.closest && e.target.closest('[data-tip]');
      if (t) {
        const r = t.getBoundingClientRect();
        BAUGMENT.ui.tip(t.getAttribute('data-tip'), r.left + r.width / 2, r.top);
      } else {
        BAUGMENT.ui.tip(null);
      }
    });
    container.addEventListener('mouseleave', () => BAUGMENT.ui.tip(null));
  }

  return { line, bars, hbars, donut, heatmap, radar, spark, bind, PALETTE };
})();
