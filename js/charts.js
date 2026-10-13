/* Prumo — gráficos SVG/HTML leves, desenhados na largura real do contêiner */
'use strict';
(function (P) {
  const F = P.fmt, esc = P.esc;

  function nice(max, ticks = 4) {
    if (!(max > 0)) return { max: ticks, step: 1 };
    const raw = max / ticks, mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= raw);
    return { max: step * Math.ceil(max / step - 1e-9), step };
  }
  const topRounded = (x, y, w, h, r) => {
    if (h <= 0) return '';
    r = Math.min(r, w / 2, h);
    return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
  };

  const C = P.charts = {
    specs: [],
    reset() { this.specs = []; },
    slot(spec) {
      const id = 'chart-' + this.specs.length;
      this.specs.push(Object.assign({ id }, spec));
      return `<div class="chart" id="${id}" style="height:${spec.height || 220}px" role="img" aria-label="${esc(spec.aria || '')}"></div>`;
    },
    hydrate() {
      for (const s of this.specs) {
        const el = document.getElementById(s.id);
        if (!el) continue;
        const w = Math.max(240, el.clientWidth);
        el.innerHTML = C[s.type](s, w, s.height || 220);
      }
    },

    /* Barras verticais com linha de referência (capacidade) */
    bars(s, W, H) {
      const pad = { l: 40, r: 14, t: 16, b: 28 };
      const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
      const vals = s.data.map(d => d.value);
      const refMax = s.ref ? Math.max(...[].concat(s.ref.values || s.ref.value)) : 0;
      const sc = nice(Math.max(...vals, refMax) * 1.08);
      const y = v => pad.t + ih - v / sc.max * ih;
      const n = s.data.length, band = iw / n, bw = Math.min(34, band * 0.64);
      const every = Math.max(1, Math.ceil(n * 46 / iw));
      let g = '';
      for (let v = 0; v <= sc.max + 1e-9; v += sc.step) {
        g += `<line class="gl" x1="${pad.l}" x2="${W - pad.r}" y1="${y(v)}" y2="${y(v)}"/>`;
        g += `<text class="tick" x="${pad.l - 8}" y="${y(v) + 4}" text-anchor="end">${F.n(v)}</text>`;
      }
      let bars = '', hits = '', labels = '';
      s.data.forEach((d, i) => {
        const x = pad.l + band * i + (band - bw) / 2, yy = y(d.value), h = pad.t + ih - yy;
        bars += `<path class="bar ${d.cls || 's1'}${d.partial ? ' partial' : ''}" d="${topRounded(x, yy, bw, h, 4)}"/>`;
        hits += `<rect class="hit" x="${pad.l + band * i}" y="${pad.t}" width="${band}" height="${ih}" data-tip="${esc(d.tip || (d.label + ': ' + F.n(d.value)))}"/>`;
        if (i % every === 0 || i === n - 1) labels += `<text class="tick" x="${pad.l + band * i + band / 2}" y="${H - 8}" text-anchor="middle">${esc(d.label)}</text>`;
      });
      let ref = '';
      if (s.ref) {
        if (s.ref.values) {
          const pts = s.ref.values.map((v, i) => `${pad.l + band * i + band / 2},${y(v)}`).join(' ');
          ref = `<polyline class="refline" points="${pts}"/>`;
        } else ref = `<line class="refline" x1="${pad.l}" x2="${W - pad.r}" y1="${y(s.ref.value)}" y2="${y(s.ref.value)}"/>`;
        const lv = s.ref.values ? s.ref.values[s.ref.values.length - 1] : s.ref.value;
        const fv = s.ref.values ? s.ref.values[0] : s.ref.value; ref += `<text class="reflabel" x="${pad.l + 4}" y="${y(Math.max(fv, lv)) - 7}" text-anchor="start">${esc(s.ref.label)}</text>`;
      }
      return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${g}<line class="axis" x1="${pad.l}" x2="${W - pad.r}" y1="${pad.t + ih}" y2="${pad.t + ih}"/>${bars}${ref}${labels}${hits}</svg>`;
    },

    /* Linhas (uma ou várias séries, eixo único) */
    line(s, W, H) {
      const pad = { l: 42, r: s.series.length <= 4 ? 92 : 16, t: 16, b: 28 };
      if (W < 420) pad.r = 16;
      const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
      const all = s.series.flatMap(x => x.values).filter(v => v != null);
      const sc = nice(Math.max(...all, s.ref ? s.ref.value : 0) * 1.08);
      const n = s.labels.length, step = n > 1 ? iw / (n - 1) : iw;
      const x = i => pad.l + step * i, y = v => pad.t + ih - v / sc.max * ih;
      const fmt = s.fmt || (v => F.n(v));
      let g = '';
      for (let v = 0; v <= sc.max + 1e-9; v += sc.step) {
        g += `<line class="gl" x1="${pad.l}" x2="${pad.l + iw}" y1="${y(v)}" y2="${y(v)}"/>`;
        g += `<text class="tick" x="${pad.l - 8}" y="${y(v) + 4}" text-anchor="end">${s.pct ? Math.round(v) + '%' : F.n(v)}</text>`;
      }
      const every = Math.max(1, Math.ceil(n * 52 / iw));
      let labels = '';
      s.labels.forEach((l, i) => { if (i % every === 0 || i === n - 1) labels += `<text class="tick" x="${x(i)}" y="${H - 8}" text-anchor="middle">${esc(l)}</text>`; });
      let ref = '';
      if (s.ref) ref = `<line class="refline" x1="${pad.l}" x2="${pad.l + iw}" y1="${y(s.ref.value)}" y2="${y(s.ref.value)}"/><text class="reflabel" x="${pad.l + iw}" y="${y(s.ref.value) - 6}" text-anchor="end">${esc(s.ref.label)}</text>`;
      let paths = '', ends = '';
      const lastYs = [];
      s.series.forEach((se, k) => {
        const pts = se.values.map((v, i) => v == null ? null : [x(i), y(v)]).filter(Boolean);
        const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join('');
        if (s.area && s.series.length === 1) paths += `<path class="area ${se.cls}" d="${d}L${pts[pts.length - 1][0]},${pad.t + ih}L${pts[0][0]},${pad.t + ih}Z"/>`;
        paths += `<path class="ln ${se.cls}" pathLength="1" d="${d}"/>`;
        const lp = pts[pts.length - 1];
        ends += `<circle class="dot ${se.cls}" cx="${lp[0]}" cy="${lp[1]}" r="4"/>`;
        if (pad.r > 40) lastYs.push({ y: lp[1], x: lp[0], name: se.name, v: se.values[se.values.length - 1] });
      });
      // rótulos diretos no fim da linha, sem colisão
      lastYs.sort((a, b) => a.y - b.y);
      for (let i = 1; i < lastYs.length; i++) if (lastYs[i].y - lastYs[i - 1].y < 14) lastYs[i].y = lastYs[i - 1].y + 14;
      lastYs.forEach(l => { ends += `<text class="endlabel" x="${l.x + 9}" y="${l.y + 4}">${esc(l.name.length > 13 ? l.name.slice(0, 12) + '…' : l.name)}</text>`; });
      let hits = '';
      s.labels.forEach((l, i) => {
        const tip = `<b>${esc(s.tipLabels ? s.tipLabels[i] : l)}</b>` + s.series.map(se => `<span class="tip-row"><i class="sw ${se.cls}"></i>${esc(se.name)}<em>${se.values[i] == null ? '—' : fmt(se.values[i])}</em></span>`).join('');
        const x0 = i === 0 ? pad.l : x(i) - step / 2, w = (i === 0 || i === n - 1) ? step / 2 : step;
        // ponto que acompanha o valor de cada série ao passar o mouse
        const hd = s.series.map(se => se.values[i] == null ? '' : `<circle class="hdot ${se.cls}" cx="${x(i)}" cy="${y(se.values[i]).toFixed(1)}" r="5"/>`).join('');
        hits += `<g class="band"><line class="guide" x1="${x(i)}" x2="${x(i)}" y1="${pad.t}" y2="${pad.t + ih}"/>${hd}<rect class="hit" x="${x0}" y="${pad.t}" width="${Math.max(w, 6)}" height="${ih}" data-tip="${esc(tip)}" data-html="1"/></g>`;
      });
      return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${g}<line class="axis" x1="${pad.l}" x2="${pad.l + iw}" y1="${pad.t + ih}" y2="${pad.t + ih}"/>${ref}${paths}${ends}${labels}${hits}</svg>`;
    },

    legend(series) {
      return `<div class="legend">${series.map(s => `<span><i class="sw ${s.cls}"></i>${esc(s.name)}</span>`).join('')}</div>`;
    },

    /* Distribuição de carga: barra por pessoa com marcos de 70% e 100% */
    load(rows, opts = {}) {
      const st = P.store.db.settings;
      const max = Math.max(opts.max || 130, ...rows.map(r => (r.util || 0) + 5));
      const pos = v => Math.min(100, v / max * 100);
      return `<div class="load">
        <div class="load-scale" aria-hidden="true"><span style="left:${pos(st.lowThreshold)}%">${st.lowThreshold}%</span><span style="left:${pos(st.highThreshold)}%">${st.highThreshold}%</span></div>
        ${rows.map(r => `
        <div class="load-row${r.go ? ' clickable' : ''}" ${r.go ? `data-go="${esc(r.go)}" tabindex="0" role="link"` : ''} data-tip="${esc(r.name + ' · ' + F.pct(r.util) + ' da capacidade · ' + F.n(r.points) + ' de ' + F.n(r.capacity) + ' pts')}">
          <span class="load-name">${esc(r.name)}</span>
          <span class="load-track">
            <i class="mark" style="left:${pos(st.lowThreshold)}%"></i><i class="mark strong" style="left:${pos(st.highThreshold)}%"></i>
            <b class="fill st-${r.status}" style="width:${pos(r.util || 0)}%"></b>
          </span>
          <span class="load-val">${F.pct0(r.util)}</span>
        </div>`).join('')}
      </div>`;
    },

    /* Barras horizontais simples (parcela de atividade etc.) */
    hbars(rows, opts = {}) {
      const max = opts.max || Math.max(...rows.map(r => r.value), 1);
      return `<div class="hbars">${rows.map(r => `
        <div class="hb-row" data-tip="${esc(r.tip || r.label)}">
          <div class="hb-top"><span class="hb-label">${esc(r.label)}</span><span class="hb-val">${r.valueLabel}</span></div>
          <div class="hb-track"><b class="${r.cls || 's1'}" style="width:${Math.max(1.5, r.value / max * 100)}%"></b></div>
        </div>`).join('')}</div>`;
    },

    spark(values, cls = 's1') {
      const W = 96, H = 28, max = Math.max(...values, 1), min = Math.min(...values, 0);
      const pts = values.map((v, i) => [i / (values.length - 1) * (W - 4) + 2, H - 3 - (v - min) / (max - min || 1) * (H - 6)]);
      const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join('');
      const l = pts[pts.length - 1];
      return `<svg class="spark" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true"><path class="area ${cls}" d="${d}L${l[0]},${H}L2,${H}Z"/><path class="ln ${cls}" d="${d}"/><circle class="dot ${cls}" cx="${l[0]}" cy="${l[1]}" r="2.5"/></svg>`;
    }
  };
})(window.P);
