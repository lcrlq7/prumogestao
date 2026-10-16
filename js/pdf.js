/* Prumo — relatório em PDF: painel em A4 paisagem + página de detalhes. Segue o tema (claro/noturno) do site. */
'use strict';
(function (P) {
P.reportPdf = function (rep, opts = {}) {
  const F = P.fmt, D = P.date, V = P.V, logo = opts.logo;
  const safe = s => String(s == null ? '' : s).replace(/−/g, '-').replace(/→/g, '->').replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[^\x00-\xFF—–·×…•]/g, '');
  const doc = new window.jspdf.jsPDF({ unit: 'pt', format: 'a4', orientation: 'landscape' });
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 28;
  const dk = !!opts.dark;
  const navy = dk ? [235, 241, 246] : [15, 34, 49], ink = dk ? [226, 234, 241] : [15, 30, 44], ink2 = dk ? [170, 186, 200] : [70, 88, 104], muted = dk ? [127, 149, 168] : [116, 133, 151], line = dk ? [31, 47, 61] : [225, 231, 238], card = dk ? [17, 28, 38] : [255, 255, 255], bg = dk ? [11, 20, 28] : [242, 245, 248];
  const accent = dk ? [90, 169, 220] : [23, 88, 125], gold = [224, 166, 58], goldSoft = dk ? [74, 60, 30] : [251, 241, 220], track = dk ? [31, 47, 61] : [229, 236, 242], good = [17, 130, 59], warn = [224, 160, 32], crit = [194, 55, 47];
  const st = s => s === 'sobrecarga' ? crit : s === 'baixa' ? warn : s === 'saudavel' ? good : [176, 184, 192];
  const T = (t, x, y, o = {}) => { doc.setFont('helvetica', o.bold ? 'bold' : 'normal'); doc.setFontSize(o.size || 9); doc.setTextColor(...(o.color || ink)); doc.text(safe(t), x, y, o.align ? { align: o.align, maxWidth: o.max } : o.max ? { maxWidth: o.max } : undefined); };
  const box = (x, y, w, h) => { doc.setFillColor(...card); doc.setDrawColor(...line); doc.setLineWidth(0.8); doc.roundedRect(x, y, w, h, 8, 8, 'FD'); };
  const label = (t, x, y) => T(t.toUpperCase(), x, y, { bold: true, size: 8, color: muted });
  const ring = (cx, cy, r, p, col, w = 7) => {
    doc.setLineCap('round'); doc.setLineWidth(w);
    const seg = (f0, f1, c) => { doc.setDrawColor(...c); const n = Math.max(2, Math.ceil((f1 - f0) * 60)); for (let i = 0; i < n; i++) { const a = -Math.PI / 2 + Math.PI * 2 * (f0 + (f1 - f0) * i / n), b = -Math.PI / 2 + Math.PI * 2 * (f0 + (f1 - f0) * (i + 1) / n); doc.line(cx + r * Math.cos(a), cy + r * Math.sin(a), cx + r * Math.cos(b), cy + r * Math.sin(b)); } };
    doc.setDrawColor(...track); doc.circle(cx, cy, r, 'S'); doc.setLineCap('round'); if (p > 0) seg(0, Math.min(1, p), col);
    doc.setLineCap('butt'); doc.setLineWidth(0.8);
  };

  doc.setFillColor(...bg); doc.rect(0, 0, W, H, 'F');
  // cabeçalho: empresa à esquerda, Prumo + logo à direita
  const company = P.store.db.settings.companyName || 'Empresa';
  T(company, M, M + 18, { bold: true, size: 20, color: navy });
  T(rep.title + ' · ' + rep.subject, M, M + 34, { size: 10, color: accent, bold: true });
  if (logo) doc.addImage(logo, 'PNG', W - M - 26, M + 2, 26, 26);
  T('Prumo', W - M - 32, M + 21, { bold: true, size: 16, color: navy, align: 'right' });
  doc.setFillColor(...gold); doc.rect(M, M + 42, 46, 3, 'F');

  const top = M + 58, gap = 12, cw = W - 2 * M;
  // linha 1: resumo + 3 indicadores
  const period = (rep.meta.find(([k]) => k === 'Período') || [])[1] || '';
  const w1 = cw * 0.34, kw = (cw - w1 - gap * 3) / 3, h1 = 66;
  box(M, top, w1, h1);
  const intro = `Resumo de ${rep.subject} em ${period.replace(/^[^(]*\(|\)$/g, '')}. ` + (rep.kind === 'departamento' ? `${rep.team.length} pessoas com produção.` : 'Dados de produção individual.');
  T(intro, M + 12, top + 20, { size: 8.5, color: ink2, max: w1 - 24 });
  T('Gerado em ' + D.fmt(D.iso(P.today())), M + 12, top + h1 - 10, { size: 7.5, color: muted });
  const sum = Object.fromEntries(rep.summary);
  const kpis = rep.kind === 'departamento'
    ? [[sum['Total de pontos'], 'Total de pontos'], [sum['Total de atividades'], 'Atividades'], [sum['Utilização'], 'Utilização da capacidade']]
    : [[sum['Pontos'], 'Pontos'], [sum['Atividades (unidades)'], 'Atividades'], [sum['Utilização'] || sum['Lançamentos'], sum['Utilização'] ? 'Utilização da capacidade' : 'Lançamentos']];
  kpis.forEach(([v, k], i) => { const x = M + w1 + gap + i * (kw + gap); box(x, top, kw, h1); T(String(v == null ? '—' : v), x + 14, top + 34, { bold: true, size: 22, color: accent }); T(k, x + 14, top + 52, { bold: true, size: 9 }); });

  // linha 2
  const y2 = top + h1 + gap, h2 = 236, wA = cw * 0.34, wB = (cw - wA - gap * 2) * 0.58, wC = cw - wA - wB - gap * 2;
  // A: carga por pessoa
  box(M, y2, wA, h2); label(rep.team ? 'Carga por pessoa' : 'Atividades no período', M + 12, y2 + 18);
  const rowsA = rep.team ? rep.team.slice(0, 7).map(r => [r.user.name, r.util || 0, st(r.status), F.pct0(r.util)]) :
    rep.acts.rows.slice().sort((a, b) => b.points - a.points).slice(0, 7).map(r => [r.act.name, r.share || 0, accent, F.pct0(r.share)]);
  const nw = rep.team ? 108 : 150, nx = M + 12, bx = M + nw, bw = wA - nw - 40, mx = rep.team ? Math.max(120, ...rowsA.map(r => r[1])) : Math.max(1, ...rowsA.map(r => r[1]));
  rowsA.forEach(([n, v, c, lbl], i) => {
    const yy = y2 + 40 + i * 27;
    T(n.length > (rep.team ? 18 : 26) ? n.slice(0, rep.team ? 17 : 25) + '…' : n, nx, yy + 7, { size: 8.5, color: ink2 });
    doc.setFillColor(...track); doc.roundedRect(bx, yy, bw, 9, 4.5, 4.5, 'F');
    doc.setFillColor(...c); doc.roundedRect(bx, yy, Math.max(9, v / mx * bw), 9, 4.5, 4.5, 'F');
    T(lbl, bx + bw + 6, yy + 7.5, { bold: true, size: 8.5 });
  });
  if (rep.team) { const x100 = bx + 100 / mx * bw; doc.setDrawColor(...muted); doc.setLineDashPattern([2, 2], 0); doc.line(x100, y2 + 34, x100, y2 + 40 + rowsA.length * 27 - 10); doc.setLineDashPattern([], 0); T('100%', x100, y2 + 32, { size: 6.5, color: muted, align: 'center' }); }

  // B1: capacidade (anéis)
  const hB = (h2 - gap) / 2, xB = M + wA + gap;
  box(xB, y2, wB, hB); label(rep.load ? 'Capacidade' : 'Produção', xB + 12, y2 + 18);
  const rings1 = rep.kind === 'departamento'
    ? [[(rep.util || 0) / 100, F.pct0(rep.util), 'Capacidade usada', accent], [rep.team.length ? rep.team.filter(r => r.status === 'saudavel').length / rep.team.length : 0, F.pct0(rep.team.length ? rep.team.filter(r => r.status === 'saudavel').length / rep.team.length * 100 : 0), 'Pessoas na faixa saudável', good]]
    : [[rep.util != null ? rep.util / 100 : 0, rep.util != null ? F.pct0(rep.util) : '—', 'Capacidade usada', accent], [rep.evo.length > 1 && rep.evo[rep.evo.length - 2].points ? Math.min(1, rep.evo[rep.evo.length - 2].points / Math.max(...rep.evo.map(m => m.points))) : 0, F.n(rep.evo.length > 1 ? rep.evo[rep.evo.length - 2].points : 0), 'Pontos no último mês fechado', gold]];
  rings1.forEach(([p, v, k, c], i) => { const cx = xB + 42 + i * (wB / 2), cy = y2 + 68; ring(cx, cy, 24, p, c); T(v, cx, cy + 3.5, { bold: true, size: 9.5, align: 'center' }); T(k, cx + 34, cy - 4, { size: 8.5, color: ink2, max: wB / 2 - 80 }); });

  // B2: onde foi o tempo (anéis das 2 maiores atividades)
  const yB2 = y2 + hB + gap; box(xB, yB2, wB, hB); label('Onde foi o tempo', xB + 12, yB2 + 18);
  const acts = rep.acts.rows.slice().sort((a, b) => b.points - a.points).slice(0, 2);
  acts.forEach((r, i) => { const cx = xB + 42 + i * (wB / 2), cy = yB2 + 68; ring(cx, cy, 24, (r.share || 0) / 100, i ? gold : accent); T(F.pct0(r.share), cx, cy + 3.5, { bold: true, size: 9.5, align: 'center' }); T(doc.setFontSize(8.5).splitTextToSize(safe(r.act.name).replace(/\//g, '/ '), wB / 2 - 80).slice(0, 3).join('\n'), cx + 34, cy - 4, { size: 8.5, color: ink2 }); });
  if (!acts.length) T('Sem atividades no período.', xB + 12, yB2 + 60, { color: muted });

  // C: evolução (colunas)
  const xC = xB + wB + gap; box(xC, y2, wC, h2); label('Evolução mensal', xC + 12, y2 + 18);
  const last = rep.evo.filter(m => !m.partial).slice(-1)[0] || rep.evo[rep.evo.length - 1] || { points: 0 };
  T(F.n(last.points) + ' pts', xC + 12, y2 + 46, { bold: true, size: 20, color: accent }); T('em ' + D.monthLabel(last.start, true), xC + 12, y2 + 60, { size: 8.5, bold: true });
  const cb = y2 + h2 - 30, ct = y2 + 92, mxE = Math.max(1, ...rep.evo.map(m => m.points)), n = rep.evo.length, colW = (wC - 24) / n;
  rep.evo.forEach((m, i) => {
    const hh = (cb - ct) * m.points / mxE, x = xC + 12 + i * colW + colW * 0.18, w = colW * 0.64;
    doc.setFillColor(...(m === last ? accent : m.partial ? goldSoft : dk ? [42, 74, 98] : [168, 196, 214])); doc.roundedRect(x, cb - hh, w, hh, 2.5, 2.5, 'F');
    T(F.n(m.points), x + w / 2, cb - hh - 4, { size: 6.5, color: ink2, align: 'center' });
    T(D.monthLabel(m.start) + (m.partial ? '*' : ''), x + w / 2, cb + 11, { size: 6.5, color: muted, align: 'center' });
  });
  T('* mês em andamento', xC + wC - 12, y2 + h2 - 6, { size: 6.5, color: muted, align: 'right' });

  // linha 3: pontos de atenção
  const y3 = y2 + h2 + gap, h3 = H - y3 - M - 14;
  box(M, y3, cw, h3); label('Pontos de atenção', M + 12, y3 + 18);
  const ins = rep.insights.slice(0, 6);
  if (!ins.length) T('Nenhum ponto de atenção no período.', M + 12, y3 + 36, { color: muted });
  ins.forEach((it, i) => {
    const col = i % 2, row = Math.floor(i / 2), x = M + 12 + col * (cw / 2), yy = y3 + 36 + row * 30;
    doc.setFillColor(...gold); doc.circle(x + 2, yy - 3, 2, 'F');
    const ln = doc.setFontSize(8).splitTextToSize(safe(it.text), cw / 2 - 40); T(it.title, x + 10, yy, { bold: true, size: 8 }); T(ln.slice(0, 2).join('\n').replace(/(.)$/, ln.length > 2 ? '$1…' : '$1'), x + 10, yy + 10, { size: 7.5, color: ink2 });
  });
  // página 2: detalhes (tabelas completas e todos os pontos de atenção)
  doc.addPage();
  doc.setFillColor(...bg); doc.rect(0, 0, W, H, 'F');
  T(company, M, M + 14, { bold: true, size: 12, color: navy }); T(rep.title + ' · ' + rep.subject + ' · detalhes', M, M + 28, { size: 9, color: accent, bold: true });
  if (logo) doc.addImage(logo, 'PNG', W - M - 20, M, 20, 20);
  let y = M + 44;
  const tbl = (title, hd, body, colStyles, cell) => {
    T(title.toUpperCase(), M, y + 4, { bold: true, size: 8, color: muted });
    doc.autoTable({ head: [hd.map(safe)], body: body.map(r => r.map(safe)), startY: y + 10, margin: { left: M, right: M, top: M, bottom: 34 }, theme: 'plain',
      styles: { fontSize: 8.5, cellPadding: 5, textColor: ink, fillColor: card, lineColor: line, lineWidth: { bottom: 0.6 } },
      headStyles: { fillColor: dk ? [21, 34, 46] : [238, 243, 247], textColor: muted, fontStyle: 'bold', lineWidth: 0 },
      columnStyles: colStyles || {}, didParseCell: cell,
      willDrawPage: d => { if (d.pageNumber > 1) { doc.setFillColor(...bg); doc.rect(0, 0, W, H, 'F'); } } });
    y = doc.lastAutoTable.finalY + 22;
  };
  const R = { halign: 'right' };
  if (rep.team && rep.team.length) tbl('Detalhe por pessoa', ['Pessoa', 'Pontos', 'Capacidade', 'Tarefas', 'Utilização', 'Situação'], rep.team.map(r => [r.user.name, F.n(r.points), F.n(r.capacity), F.n(r.tasks), F.pct(r.util), V.STATUS[r.status].label]),
    { 1: R, 2: R, 3: R, 4: R }, d => { if (d.section === 'body' && d.column.index === 5) d.cell.styles.textColor = st(rep.team[d.row.index].status); });
  const allActs = rep.acts.rows.slice().sort((a, b) => b.points - a.points);
  tbl('Atividades', ['Atividade', 'Qtd.', 'Pontos', '%'], allActs.length ? allActs.map(r => [r.act.name, F.n(r.qty, 2), F.n(r.points), F.pct0(r.share)]) : [['Sem atividades no período.', '', '', '']], { 1: R, 2: R, 3: R });
  tbl('Evolução mensal', rep.load ? ['Mês', 'Pontos', 'Capacidade', 'Utilização'] : ['Mês', 'Pontos'], rep.evo.map(m => [D.monthLabel(m.start, true) + (m.partial ? ' (parcial)' : ''), F.n(m.points)].concat(rep.load ? [F.n(m.capacity), F.pct(m.util)] : [])), { 1: R, 2: R, 3: R });
  if (rep.insights.length > 6) tbl('Todos os pontos de atenção', ['Tipo', 'Detalhe'], rep.insights.map(i => [i.title, i.text]), { 0: { cellWidth: 190, fontStyle: 'bold' } });
  const pages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    T('Métricas para gestão de carga e capacidade, não para avaliação isolada de desempenho.', M, H - 14, { size: 7, color: muted });
    T('Prumo · ' + company + ' · ' + i + '/' + pages, W - M, H - 14, { size: 7, color: muted, align: 'right' });
  }
  return doc;
};
})(window.P);
