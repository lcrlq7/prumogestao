/*
 * Prumo — Inadimplência dos clientes
 *
 * Todos os colaboradores veem os totais e a situação de cada empresa (sem valores).
 * Só a diretoria vê valores, títulos e observações, e só ela alimenta os dados:
 * manualmente (empresa por empresa) ou importando o relatório "Contas a receber" exportado do Nibo.
 * Situação: atenção (até 30 dias de atraso), inadimplente (mais de 30), em negociação, acordo firmado, quitado.
 * OS aberta para empresa inadimplente ou em negociação sobe para a diretoria aprovar a continuidade (ver os.js).
 * Banco: tabela delinquency (pública) + delinquency_private (valores; só diretoria).
 */
'use strict';
(function (P) {
  const D = P.date, esc = P.esc, V = P.V, icon = V.icon, C = P.charts;
  const A = P.ext.actions;
  const db = () => P.store.db;
  const S = () => P.state;
  const U = () => S().user;
  const $ = (s, r = document) => r.querySelector(s);
  const deny = m => { throw new P.AccessError(m); };

  P.PAGES.inadimplencia = ['admin', 'office', 'manager', 'employee'];
  const isDir = u => !!u && u.role === 'admin' && u.active !== false;
  const list = () => (db().delinquency = db().delinquency || []);
  const summary = () => (db().settings.delinq = db().settings.delinq || { monthly: {} });
  const brl = c => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const toC = v => typeof v === 'number' ? Math.round(v * 100) : Math.round((Number(String(v || '').replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.')) || 0) * 100);
  const today = () => D.iso(P.today());
  const daysLate = r => r.oldestDue ? Math.max(0, Math.round((P.today() - D.parse(r.oldestDue)) / 864e5)) : 0;
  // situação vigente: manual (negociação, acordo, quitado) ou automática pelos dias de atraso
  const statusOf = r => ['negociacao', 'acordo', 'quitado'].includes(r.manual) ? r.manual : daysLate(r) > 30 ? 'inadimplente' : daysLate(r) > 0 ? 'atencao' : 'quitado';
  const ST = {
    inadimplente: ['Inadimplente', 'es-recusado'], atencao: ['Atenção', 'st-baixa'], negociacao: ['Em negociação', 'es-pendente'],
    acordo: ['Acordo firmado', 'es-correcao'], quitado: ['Quitado', 'es-aprovado']
  };
  const chip = s => `<span class="badge ${ST[s][1]}">${ST[s][0]}</span>`;
  const active = () => list().map(r => Object.assign(r, { status: statusOf(r) })).filter(r => r.status !== 'quitado');
  const byName = name => list().find(r => r.name === name);

  P.delinq = {
    // OS para estas situações precisa da diretoria
    needsApproval: name => { const r = byName(name); return !!r && ['inadimplente', 'negociacao'].includes(statusOf(r)); },
    statusOf: name => { const r = byName(name); return r ? statusOf(r) : null; },
    chip: name => { const r = byName(name); if (!r) return ''; const s = statusOf(r); return s === 'quitado' ? '' : ' ' + chip(s); },
    describe: name => { const r = byName(name); return r ? ST[statusOf(r)][0].toLowerCase() + (daysLate(r) ? ' há ' + daysLate(r) + ' dias' : '') : ''; }
  };

  /* ---------- Página ---------- */
  const st = () => (S().dq = S().dq || { q: '', f: '' });
  V.inadimplencia = u => {
    const s = st(), dir = isDir(u), rows = active();
    const q = (s.q || '').toLowerCase();
    const shown = rows.filter(r => (!s.f || r.status === s.f) && (!q || r.name.toLowerCase().includes(q) || String(r.code || '').toLowerCase().startsWith(q)))
      .sort((a, b) => daysLate(b) - daysLate(a));
    const sm = summary(), totalComp = (db().companies || []).filter(c => c.active !== false).length || 1;
    const inad = rows.filter(r => ['inadimplente', 'negociacao'].includes(r.status));
    const months = Object.keys(sm.monthly || {}).sort().slice(-6);
    const prev = months.length > 1 ? sm.monthly[months[months.length - 2]].total : null;
    const delta = prev ? ((sm.total || 0) - prev) / prev * 100 : null;
    const counts = {}; rows.forEach(r => { counts[r.status] = (counts[r.status] || 0) + 1; });
    return `${V.pageHead('Inadimplência', (sm.updatedAt ? 'Atualizado pela diretoria em ' + esc(sm.updatedAt) + '. ' : '') + 'Situação dos clientes com pagamentos em atraso.' + (dir ? '' : ' Os valores por empresa ficam só com a diretoria.'),
      dir ? V.btn('Adicionar valor', { act: 'dqAdd', icon: 'plus' }) + V.btn('Importar do Nibo', { act: 'dqImport', icon: 'file' }) + V.btn('Registrar empresa', { act: 'dqEdit', icon: 'plus', cls: 'primary' }) : '')}
      <div class="kpis k4">
        ${V.kpi('Total em aberto', brl(sm.total || 0), { icon: 'alert', sub: delta != null ? (delta >= 0 ? '+' : '') + P.fmt.n(delta, 0) + '% vs. mês anterior' : 'valores das parcelas vencidas' })}
        ${V.kpi('Empresas inadimplentes', inad.length, { icon: 'briefcase', sub: 'de ' + totalComp + ' clientes ativos' })}
        ${V.kpi('Taxa de inadimplência', P.fmt.pct(inad.length / totalComp * 100), { icon: 'gauge', sub: 'empresas em atraso há mais de 30 dias ou em negociação' })}
        ${V.kpi('Em negociação / acordo', (counts.negociacao || 0) + ' / ' + (counts.acordo || 0), { icon: 'message' })}
      </div>
      ${months.length ? V.card('Evolução do valor em aberto', C.slot({ type: 'bars', data: months.map(m => ({ label: D.monthLabel(D.parse(m + '-01')), value: sm.monthly[m].total / 100, tip: D.monthLabel(D.parse(m + '-01'), true) + ': ' + brl(sm.monthly[m].total) + ' · ' + sm.monthly[m].count + ' empresas' })), height: 200, aria: 'Evolução da inadimplência' }), { sub: 'Último registro de cada mês' }) : ''}
      <section class="card"><div class="card-b"><div class="filters">
        <label class="field"><span>Buscar</span><input type="search" value="${esc(s.q)}" data-set="dq.q" data-live placeholder="Nome ou código da empresa"></label>
        <label class="field"><span>Situação</span><select data-set="dq.f"><option value="">Todas</option>${['inadimplente', 'atencao', 'negociacao', 'acordo'].map(k => `<option value="${k}" ${s.f === k ? 'selected' : ''}>${ST[k][0]} (${counts[k] || 0})</option>`).join('')}</select></label>
      </div></div></section>
      ${V.card('', shown.length ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>Código</th><th>Empresa</th><th class="num">Atraso</th><th>Vencimento mais antigo</th><th>Situação</th>${dir ? '<th class="num">Em aberto</th><th>Títulos</th><th class="actions-col"></th>' : ''}</tr></thead><tbody>
        ${shown.map(r => `<tr><td class="mono">${esc(r.code || '—')}</td><td><b>${esc(r.name)}</b>${dir && r.obs ? `<small class="obs">${esc(r.obs)}</small>` : ''}</td>
          <td class="num ${daysLate(r) > 30 ? 'neg' : ''}">${daysLate(r)} dia${daysLate(r) === 1 ? '' : 's'}</td><td class="nowrap">${r.oldestDue ? D.fmt(r.oldestDue) : '—'}</td><td>${chip(r.status)}</td>
          ${dir ? `<td class="num strong">${brl(r.total || 0)}</td><td>${(r.items || []).length}</td><td class="actions-col"><div class="row-actions">${V.ibtn('edit', 'Editar situação', { act: 'dqEdit', attrs: `data-id="${esc(r.id)}"` })}${V.ibtn('info', 'Títulos e histórico', { act: 'dqDetail', attrs: `data-id="${esc(r.id)}"` })}</div></td>` : ''}</tr>`).join('')}
        </tbody></table></div>` : V.empty(rows.length ? 'Nenhuma empresa com esses filtros.' : 'Nenhuma empresa com pagamento em atraso registrada.' + (dir ? ' Use "Importar do Nibo" ou "Registrar empresa".' : ''), 'check'), { cls: 'flush', sub: shown.length + ' empresa(s) · OS para empresa inadimplente ou em negociação precisa da aprovação da diretoria' })}`;
  };

  /* ---------- Gravação ---------- */
  const companyOf = name => (db().companies || []).find(c => c.name === name);
  function upsert(company, data, how) {
    let r = list().find(x => x.id === company.id);
    if (!r) { r = { id: company.id, companyId: company.id, history: [] }; list().push(r); }
    const before = r.status;
    Object.assign(r, { name: company.name, code: company.code || '', updatedAt: D.stamp(), updatedBy: U().id }, data);
    r.status = statusOf(r);
    (r.history = r.history || []).push({ at: D.stamp(), by: U().id, action: how, total: r.total || 0, status: r.status });
    if (r.history.length > 60) r.history.splice(0, r.history.length - 60);
    return before !== r.status;
  }
  function refreshSummary() {
    const sm = summary(), rows = active(), total = rows.reduce((t, r) => t + (r.total || 0), 0) + (sm.extra || 0); // extra = valor avulso, sem empresa
    sm.total = total; sm.count = rows.filter(r => ['inadimplente', 'negociacao'].includes(r.status)).length; sm.updatedAt = D.stamp(); sm.by = U().id;
    sm.monthly = sm.monthly || {}; sm.monthly[today().slice(0, 7)] = { total, count: sm.count };
  }

  /* ---------- Valor avulso (soma ao total, sem precisar escolher empresa) ---------- */
  A.dqAdd = () => {
    const u = U(); if (!isDir(u)) return P.toast('Somente a diretoria alimenta a inadimplência.', 'err');
    const sm = summary();
    P.ui.modal({
      title: 'Adicionar valor em aberto', submit: 'Adicionar',
      body: `<p class="prose">Total em aberto hoje: <b>${brl(sm.total || 0)}</b>${sm.extra ? ' (inclui <b>' + brl(sm.extra) + '</b> de valores avulsos)' : ''}.</p>
        <div class="fgrid"><label class="field"><span>Valor a somar (R$)</span><input id="dqa-v" inputmode="decimal" placeholder="0,00"></label>
        <label class="field span2"><span>Observação (opcional)</span><input id="dqa-o" maxlength="120" placeholder="Ex.: parcelas de clientes fora da lista"></label></div>
        <p class="fine">${icon('info')} O valor entra no total e no gráfico do mês, sem vincular a uma empresa. Para diminuir, use sinal de menos (ex.: -150,00). Para o valor de uma empresa, use "Registrar empresa".</p>`,
      onSubmit: m => {
        const c = toC($('#dqa-v', m).value); if (!c) throw new Error('Informe um valor diferente de zero.');
        if ((sm.extra || 0) + c < 0 && (sm.total || 0) + c < 0) throw new Error('O total não pode ficar negativo.');
        sm.extra = (sm.extra || 0) + c; (sm.extraLog = sm.extraLog || []).push({ at: D.stamp(), by: u.id, value: c, obs: $('#dqa-o', m).value.trim() }); if (sm.extraLog.length > 60) sm.extraLog.splice(0, sm.extraLog.length - 60);
        refreshSummary(); P.audit(u, 'Valor avulso de inadimplência', '', brl(c) + ' · total ' + brl(sm.total)); P.store.save(); P.toast('Valor adicionado. Total em aberto: ' + brl(sm.total) + '.'); P.render();
      }
    });
  };

  /* ---------- Registro manual ---------- */
  A.dqEdit = el => {
    if (!isDir(U())) return P.toast('Somente a diretoria alimenta a inadimplência.', 'err');
    const r = el.dataset.id ? list().find(x => x.id === el.dataset.id) : null;
    const comps = (db().companies || []).filter(c => c.active !== false).sort((a, b) => a.name.localeCompare(b.name));
    P.ui.modal({
      title: r ? 'Situação · ' + esc(r.name) : 'Registrar empresa inadimplente', submit: 'Salvar', wide: true,
      body: `<div class="fgrid">
        ${r ? `<p class="prose span3"><b>${esc(r.name)}</b> ${r.code ? '· cód. ' + esc(r.code) : ''}</p>` : `<div class="field span3"><span>Empresa</span>${P.companyPickerHtml('dq-co')}</div>`}
        <label class="field"><span>Valor em aberto (R$)</span><input id="dq-v" inputmode="decimal" value="${r ? ((r.total || 0) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : ''}"></label>
        <label class="field"><span>Vencimento mais antigo</span><input type="date" id="dq-d" max="${today()}" value="${r ? r.oldestDue || '' : ''}"></label>
        <label class="field"><span>Situação</span><select id="dq-s"><option value="">Automática (pelo atraso)</option><option value="negociacao" ${r && r.manual === 'negociacao' ? 'selected' : ''}>Em negociação</option><option value="acordo" ${r && r.manual === 'acordo' ? 'selected' : ''}>Acordo firmado</option><option value="quitado" ${r && r.manual === 'quitado' ? 'selected' : ''}>Quitado</option></select></label>
        <label class="field span3"><span>Competências / títulos em aberto <small>(opcional)</small></span><input id="dq-c" placeholder="Ex.: honorários 07/2026 e 08/2026" value="${r ? esc((r.items || []).map(i => i.desc).filter(Boolean).join('; ')) : ''}"></label>
        <label class="field span3"><span>Observação interna <small>(só diretoria)</small></span><input id="dq-o" value="${r ? esc(r.obs || '') : ''}" placeholder="Ex.: cliente pediu parcelamento em 3x"></label></div>
        <p class="fine">"Automática": até 30 dias de atraso fica como Atenção; acima disso, Inadimplente.</p>`,
      onSubmit: m => {
        const name = r ? r.name : $('#dq-co', m).value.trim(), comp = companyOf(name);
        if (!comp) throw new Error('Escolha uma empresa do cadastro.');
        const total = toC($('#dq-v', m).value), due = $('#dq-d', m).value, manual = $('#dq-s', m).value;
        if (manual !== 'quitado') { if (!(total > 0)) throw new Error('Informe o valor em aberto.'); if (!due) throw new Error('Informe o vencimento mais antigo.'); }
        const desc = $('#dq-c', m).value.trim();
        upsert(comp, { total: manual === 'quitado' ? 0 : total, oldestDue: due || null, manual: manual || null, obs: $('#dq-o', m).value.trim(),
          items: manual === 'quitado' ? [] : [{ due, value: total, desc }] }, r ? 'Atualizado manualmente' : 'Registrado manualmente');
        refreshSummary(); P.audit(U(), 'Inadimplência atualizada', comp.id, comp.name + ' · ' + (manual || 'automática') + ' · ' + brl(total));
        P.store.save(); P.toast('Inadimplência salva.'); P.render();
      }
    });
    if (!r) P.companyPicker(comps, 'dq-co');
  };
  A.dqDetail = el => {
    const r = list().find(x => x.id === el.dataset.id); if (!r || !isDir(U())) return;
    P.ui.modal({ title: esc(r.name), wide: true, cancel: 'Fechar',
      body: `<p class="prose">${chip(statusOf(r))} · ${daysLate(r)} dias de atraso · em aberto <b>${brl(r.total || 0)}</b></p>
        ${r.obs ? `<blockquote class="vac-comment">${icon('message')}<span>${esc(r.obs)}</span></blockquote>` : ''}
        <h4 class="sub-h">Títulos em aberto</h4>${(r.items || []).length ? `<div class="table-wrap"><table class="tbl compact"><thead><tr><th>Vencimento</th><th>Descrição</th><th class="num">Valor</th></tr></thead><tbody>${r.items.map(i => `<tr><td>${i.due ? D.fmt(i.due) : '—'}</td><td>${esc(i.desc || '')}</td><td class="num">${brl(i.value || 0)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">Nenhum título.</p>'}
        <h4 class="sub-h">Histórico</h4><ul class="day-list">${(r.history || []).slice().reverse().map(h => `<li><span>${esc(h.action)}<small>${esc(ST[h.status] ? ST[h.status][0] : h.status || '')}</small></span><b>${brl(h.total || 0)} · ${esc(h.at)}</b></li>`).join('')}</ul>` });
  };

  /* ---------- Importação do Nibo (Contas a receber) ---------- */
  const norm = s => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const coName = s => norm(s).replace(/[.,\-\/()&]/g, ' ').replace(/\b(ltda|limitada|me|epp|eireli|s ?a|ss|mei|cia)\b/g, ' ').replace(/\s+/g, ' ').trim();
  const digits = s => String(s == null ? '' : s).replace(/\D/g, '');
  const parseDate = v => {
    if (v == null || v === '') return null;
    if (typeof v === 'number' && v > 20000) { const d = new Date(Date.UTC(1899, 11, 30) + v * 864e5); return d.toISOString().slice(0, 10); }
    const s = String(v).trim(); let m;
    if ((m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/.exec(s))) { const y = m[3].length === 2 ? '20' + m[3] : m[3]; return y + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0'); }
    if ((m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s))) return m[0];
    return null;
  };
  const COLS = {
    name: [/^cliente/, /contato/, /^nome/, /razao/, /sacado/, /pagador/, /favorecido/],
    doc: [/cnpj/, /cpf/, /documento/],
    due: [/vencimento/, /^venc/, /data prevista/],
    value: [/saldo/, /em aberto/, /a receber/, /valor previsto/, /^valor/],
    status: [/situa/, /^status/],
    paid: [/data (de )?(pagamento|recebimento|baixa)/, /^(pago|recebido) em/],
    desc: [/descri/, /refer/, /compet/, /historico/, /categoria/]
  };
  function detect(table) {
    let best = { row: -1, score: 0, map: {} };
    table.slice(0, 15).forEach((r, i) => {
      const hdr = (r || []).map(norm), map = {}; let score = 0;
      for (const [k, pats] of Object.entries(COLS)) {
        for (const p of pats) { const j = hdr.findIndex(h => h && p.test(h)); if (j >= 0) { map[k] = j; score++; break; } }
      }
      if (score > best.score) best = { row: i, score, map };
    });
    return best;
  }
  function plan(table, map, hdrRow) {
    const comps = (db().companies || []).filter(c => c.active !== false);
    const byDoc = new Map(), byNm = new Map();
    comps.forEach(c => { if (c.cnpj) byDoc.set(digits(c.cnpj), c); byNm.set(coName(c.name), c); if (c.tradeName) byNm.set(coName(c.tradeName), c); });
    const t = today(), groups = new Map(), unmatched = new Map(); let read = 0, open = 0;
    for (let i = hdrRow + 1; i < table.length; i++) {
      const r = table[i] || []; const name = r[map.name], val = toC(r[map.value]), due = parseDate(r[map.due]);
      if (!name && !r[map.doc]) continue; read++;
      const status = norm(r[map.status]), paid = map.paid != null && parseDate(r[map.paid]);
      if (paid || /pago|recebid|quitad|liquidad|baixad|conciliad|cancelad/.test(status)) continue;
      if (!due || due >= t || !(val > 0)) continue; // só o que está vencido e em aberto
      open++;
      const d = digits(r[map.doc]);
      let c = (d.length >= 11 && byDoc.get(d)) || byNm.get(coName(name));
      if (!c) { const n = coName(name); const cand = n.length >= 5 ? comps.filter(x => coName(x.name).includes(n) || n.includes(coName(x.name))) : []; if (cand.length === 1) c = cand[0]; }
      const item = { due, value: val, desc: String(r[map.desc] == null ? '' : r[map.desc]).trim().slice(0, 120) };
      if (!c) { const k = String(name || d); const g = unmatched.get(k) || { name: k, total: 0, n: 0 }; g.total += val; g.n++; unmatched.set(k, g); continue; }
      const g = groups.get(c.id) || { company: c, items: [] }; g.items.push(item); groups.set(c.id, g);
    }
    groups.forEach(g => { g.total = g.items.reduce((s, x) => s + x.value, 0); g.oldestDue = g.items.map(x => x.due).sort()[0]; });
    return { read, open, groups: [...groups.values()].sort((a, b) => b.total - a.total), unmatched: [...unmatched.values()].sort((a, b) => b.total - a.total) };
  }
  A.dqImport = () => {
    if (!isDir(U())) return;
    A._dq = null;
    P.ui.modal({
      title: 'Importar inadimplência do Nibo', submit: 'Importar', wide: true,
      body: `<div class="imp-steps"><ol>
        <li>No Nibo, abra <b>Contas a receber</b> (ou o relatório de recebimentos), filtre os <b>vencidos / em aberto</b> e exporte em <b>Excel</b> ou <b>CSV</b>.</li>
        <li>Escolha o arquivo abaixo. O Prumo reconhece as colunas (cliente, CPF/CNPJ, vencimento, valor, situação) e liga cada linha a uma empresa do cadastro pelo CNPJ ou pelo nome.</li>
        <li>Confira a prévia antes de importar. Só entram títulos <b>vencidos e não pagos</b>.</li></ol></div>
        <label class="drop" for="dq-file">${icon('file')}<span><b>Escolher arquivo do Nibo</b><small>.xlsx, .xls ou .csv</small></span><input type="file" id="dq-file" accept=".xlsx,.xls,.csv" hidden></label>
        <div id="dq-prev"></div>`,
      onSubmit: m => {
        const x = A._dq; if (!x || !x.p.groups.length) throw new Error('Escolha o arquivo e confira a prévia antes de importar.');
        const clear = $('#dq-clear', m) && $('#dq-clear', m).checked;
        const seen = new Set();
        x.p.groups.forEach(g => { seen.add(g.company.id); const old = list().find(r => r.id === g.company.id);
          upsert(g.company, { items: g.items, total: g.total, oldestDue: g.oldestDue, manual: old && ['negociacao', 'acordo'].includes(old.manual) ? old.manual : null }, 'Importado do Nibo (' + x.name + ')'); });
        let quit = 0;
        if (clear) list().forEach(r => { if (!seen.has(r.id) && statusOf(r) !== 'quitado') { const c = (db().companies || []).find(cc => cc.id === r.id) || { id: r.id, name: r.name, code: r.code }; upsert(c, { items: [], total: 0, oldestDue: null, manual: 'quitado' }, 'Quitado (não consta na importação do Nibo)'); quit++; } });
        refreshSummary(); P.audit(U(), 'Inadimplência importada do Nibo', x.name, x.p.groups.length + ' empresas · ' + brl(summary().total) + (quit ? ' · ' + quit + ' quitadas' : ''));
        P.store.save(); P.toast(x.p.groups.length + ' empresa(s) atualizadas' + (quit ? ', ' + quit + ' marcadas como quitadas' : '') + '.'); P.render();
      }
    });
  };
  async function readNibo(file) {
    const box = $('#dq-prev'); if (!box) return;
    box.innerHTML = `<p class="fine">${icon('clock')} Lendo ${esc(file.name)}…</p>`;
    try {
      const table = await P.actions._readSheet(file);
      const det = detect(table);
      if (det.map.name == null || det.map.value == null || det.map.due == null) throw new Error('Não encontrei as colunas de cliente, vencimento e valor. Exporte o relatório de Contas a receber do Nibo em Excel e tente de novo.');
      const p = plan(table, det.map, det.row);
      A._dq = { p, name: file.name };
      const hdr = table[det.row];
      const colNames = Object.entries(det.map).map(([k, j]) => `<span class="chip-s">${{ name: 'Cliente', doc: 'CPF/CNPJ', due: 'Vencimento', value: 'Valor', status: 'Situação', paid: 'Pagamento', desc: 'Descrição' }[k]}: ${esc(hdr[j])}</span>`).join(' ');
      box.innerHTML = `<p class="fine">Colunas reconhecidas: ${colNames}</p>
        <div class="strip" style="margin:10px 0"><div><span>Linhas lidas</span><b>${p.read}</b></div><div><span>Vencidas em aberto</span><b>${p.open}</b></div><div><span>Empresas encontradas</span><b>${p.groups.length}</b></div><div class="${p.unmatched.length ? 't-warn' : ''}"><span>Sem correspondência</span><b>${p.unmatched.length}</b></div></div>
        ${p.groups.length ? `<div class="table-wrap" style="max-height:240px;overflow:auto"><table class="tbl compact"><thead><tr><th>Empresa</th><th class="num">Títulos</th><th>Mais antigo</th><th class="num">Em aberto</th></tr></thead><tbody>${p.groups.map(g => `<tr><td>${esc(g.company.name)}</td><td class="num">${g.items.length}</td><td>${D.fmt(g.oldestDue)}</td><td class="num">${brl(g.total)}</td></tr>`).join('')}</tbody></table></div>` : ''}
        ${p.unmatched.length ? `<div class="banner warn sm">${icon('alert')}<div><b>Não encontrei no cadastro de empresas:</b> ${p.unmatched.slice(0, 8).map(x => esc(x.name) + ' (' + brl(x.total) + ')').join(', ')}${p.unmatched.length > 8 ? '…' : ''}. Confira se o nome ou o CNPJ está igual na aba Empresas; essas linhas não entram.</div></div>` : ''}
        <label class="field check"><input type="checkbox" id="dq-clear" checked><span>Empresas que não aparecem neste arquivo passam a <b>quitadas</b> (o arquivo é a lista completa de vencidos)</span></label>`;
    } catch (e) { A._dq = null; box.innerHTML = `<div class="banner crit sm">${icon('alert')}<div>${esc(e.message)}</div></div>`; }
  }
  document.addEventListener('change', ev => { if (ev.target.id === 'dq-file' && ev.target.files[0]) readNibo(ev.target.files[0]); });
  P.delinq._test = { detect, plan, parseDate, toC };
})(window.P);
