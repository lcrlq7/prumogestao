/*
 * Prumo — Módulo Financeiro
 *
 * Passagens e despesas recorrentes, com cálculo proporcional por dias elegíveis (férias, feriados,
 * admissão e desligamento), pagamentos com PIX, fechamento semanal, dashboard e relatórios.
 *
 * Regras de dinheiro: tudo em CENTAVOS (inteiros) para não haver erro de arredondamento.
 * Idempotência: cada lançamento tem chave única "recorrência|início do período"; gerar de novo não duplica.
 * Lançamento pago ou fechado nunca é recalculado em silêncio: a diferença vira "ajuste pendente".
 * Acesso: somente gerente do escritório e diretoria (P.PAGES.financeiro).
 */
'use strict';
(function (P) {
  const D = P.date, esc = P.esc, V = P.V, icon = V.icon, C = P.charts;
  const A = P.ext.actions;
  const db = () => P.store.db;
  const S = () => P.state;
  const $ = (s, r = document) => r.querySelector(s);
  const deny = m => { throw new P.AccessError(m); };

  P.PAGES.financeiro = ['admin', 'office'];
  const canFin = u => !!u && P.isGlobal(u) && u.active !== false;
  const must = u => { if (!canFin(u)) deny('Somente a gerência e a diretoria acessam o Financeiro.'); };

  /* ---------- Dinheiro ---------- */
  const toC = v => { const n = typeof v === 'number' ? v : Number(String(v || '').replace(/\./g, '').replace(',', '.')); return Math.round((Number(n) || 0) * 100); };
  const brl = c => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const brlIn = c => (c / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  /* ---------- Coleções ---------- */
  const col = k => (db()[k] = db()[k] || []);
  // regras gravadas nas Configurações gerais (app_settings), que só gerência e diretoria alteram
  const settings = () => (db().settings.fin = Object.assign({ vacStartPaid: false, vacEndPaid: false, weeksBack: 8 }, db().settings.fin || {}));
  const profiles = () => col('finProfiles');
  const recs = () => col('finRecurrences');
  const entries = () => col('finEntries');
  const closings = () => col('finClosings');
  const profileOf = uid => profiles().find(p => p.id === uid);
  const audit = (u, action, target, details) => P.audit(u, 'Financeiro: ' + action, target, details);

  const CATS = { passagem: 'Passagem', aluguel: 'Aluguel', servicos: 'Serviços', material: 'Material', impostos: 'Impostos', beneficios: 'Benefícios', plr: 'PLR', outros: 'Outros' };
  const PERIODS = { semanal: 'Semanal', quinzenal: 'Quinzenal', mensal: 'Mensal' };
  const PIX_TYPES = { cpf: 'CPF', cnpj: 'CNPJ', email: 'E-mail', telefone: 'Telefone', aleatoria: 'Chave aleatória' };
  const WD = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  const ST = {
    previsto: ['Previsto', 'st-sem', 'clock'], pendente: ['Pendente', 'es-pendente', 'clock'], pago: ['Pago', 'es-aprovado', 'check'],
    parcial: ['Parcialmente pago', 'es-pendente', 'check'], ajustado: ['Ajustado', 'es-correcao', 'edit'], atrasado: ['Atrasado', 'es-recusado', 'alert'], cancelado: ['Cancelado', 'st-sem', 'x']
  };
  const stBadge = s => `<span class="badge ${ST[s][1]}">${icon(ST[s][2])}${ST[s][0]}</span>`;

  /* ---------- Valor vigente (histórico de valores) ---------- */
  // cada perfil guarda "values": [{since, weekly}] em ordem; o valor de uma data é o último com since <= data
  const weeklyAt = (p, iso) => { let v = 0; (p.values || []).forEach(x => { if (x.since <= iso) v = x.weekly; }); return v; };

  /* ---------- Cálculo de dias elegíveis ---------- */
  const vacOf = uid => (db().vacations || []).filter(v => v.userId === uid);
  const isVacDay = (uid, iso) => {
    const s = settings();
    return vacOf(uid).some(v => v.status === 'aprovada' && iso >= v.start && iso <= v.end &&
      !(iso === v.start && s.vacStartPaid) && !(iso === v.end && s.vacEndPaid));
  };
  const pendingVacIn = (uid, a, b) => vacOf(uid).filter(v => ['gestor', 'gerente', 'diretoria'].includes(v.status) && v.start <= b && v.end >= a);
  /*
   * Memória do cálculo de uma passagem: para cada dia do período, se é dia de trabalho previsto e por que entra/sai.
   * valor diário = valor semanal ÷ dias de trabalho da semana (ex.: 146,50 ÷ 5 = 29,30)
   */
  function calcPassagem(p, user, a, b) {
    const wd = p.workdays && p.workdays.length ? p.workdays : [1, 2, 3, 4, 5];
    const days = [];
    let scheduled = 0, eligible = 0, vac = 0, hol = 0, out = 0;
    const adm = user && user.createdAt ? user.createdAt : '0000';
    const dm = user && user.active === false && (user.dismissals || [])[0] ? user.dismissals[0].at : '9999';
    for (let d = D.parse(a); D.iso(d) <= b; d = D.add(d, 1)) {
      const iso = D.iso(d);
      if (!wd.includes(d.getDay())) continue;
      scheduled++;
      let why = 'trabalho';
      if (!D.isWorkday(d)) { why = 'feriado'; hol++; }
      else if (iso < adm) { why = 'antes da admissão'; out++; }
      else if (iso > dm) { why = 'após desligamento'; out++; }
      else if (isVacDay(user.id, iso)) { why = 'férias'; vac++; }
      else eligible++;
      days.push({ iso, why });
    }
    const weekly = weeklyAt(p, a);
    const daily = weekly / wd.length; // centavos (pode ter fração; arredondamos só nos totais)
    const original = Math.round(daily * scheduled);
    const final = Math.round(daily * eligible);
    const vacAdj = -Math.round(daily * vac);
    const otherAdj = final - original - vacAdj; // feriados, admissão, desligamento
    return { weekly, daily, perWeek: wd.length, scheduled, eligible, vac, hol, out, days, original, vacAdj, otherAdj, final };
  }

  /* ---------- Períodos de uma recorrência ---------- */
  function periodsOf(r, from, to) {
    const out = [];
    if (r.period === 'mensal') {
      for (let m = D.monthStart(D.parse(from)); D.iso(m) <= to; m = D.addMonths(m, 1)) {
        const a = D.iso(m), b = D.iso(D.monthEnd(m));
        const day = Math.min(Number(r.genDay) || 5, D.monthEnd(m).getDate());
        out.push({ a, b, due: D.iso(new Date(m.getFullYear(), m.getMonth(), day)) });
      }
    } else {
      const step = r.period === 'quinzenal' ? 14 : 7;
      const anchor = D.weekStart(D.parse(r.start));
      for (let w = new Date(anchor); D.iso(w) <= to; w = D.add(w, step)) {
        const end = D.add(w, step - 1);
        if (D.iso(end) < from) continue;
        // pagamento no dia da semana configurado (padrão: segunda da própria semana)
        const gd = Number(r.genDay != null ? r.genDay : 5);
        const due = D.add(w, (gd + 6) % 7);
        out.push({ a: D.iso(w), b: D.iso(end), due: D.iso(due) });
      }
    }
    return out.filter(x => x.b >= r.start && (!r.end || x.a <= r.end));
  }

  /* ---------- Status ---------- */
  const statusOf = e => {
    if (e.canceled) return 'cancelado';
    if (e.paid >= e.final && e.final > 0 && e.paid > 0) return 'pago';
    if (e.final === 0 && e.paidAt) return 'pago';
    if (e.paid > 0) return 'parcial';
    const t = D.iso(P.today());
    if (e.due < t) return 'atrasado';
    if (e.final !== e.original || (e.adjustments || []).length) return 'ajustado';
    return e.a > t ? 'previsto' : 'pendente';
  };

  /* ---------- Geração idempotente ---------- */
  function computeFor(r, per) {
    if (r.kind === 'passagem') {
      const p = profileOf(r.userId), user = P.user(r.userId);
      if (!p || !user) return null;
      const c = calcPassagem(p, user, per.a, per.b);
      return { original: c.original, final: c.final, vacAdj: c.vacAdj, otherAdj: c.otherAdj, calc: c };
    }
    const amount = valueOfRec(r, per.a);
    return { original: amount, final: amount, vacAdj: 0, otherAdj: 0, calc: null };
  }
  const valueOfRec = (r, iso) => { let v = r.amount; (r.versions || []).forEach(x => { if (x.from <= iso) v = x.amount; }); return v; };

  P.finance = {
    generate(opts = {}) {
      const t = P.today(), from = D.iso(D.add(D.weekStart(t), -7 * settings().weeksBack)), to = D.iso(D.add(D.weekStart(t), 13));
      let created = 0, updated = 0, flagged = 0;
      const byKey = new Map(entries().map(e => [e.key, e]));
      recs().forEach(r => {
        if (r.status === 'encerrado' && !r.endedAt) return;
        periodsOf(r, from, to).forEach(per => {
          if (r.status === 'encerrado' && per.a > r.endedAt) return;
          if (r.status === 'pausado' && (r.pausedAt || '') <= per.a) return;
          const key = r.id + '|' + per.a;
          const v = computeFor(r, per); if (!v) return;
          const e = byKey.get(key);
          if (!e) {
            const p = r.userId ? profileOf(r.userId) : null;
            const n = { id: P.uid('fe'), key, recId: r.id, userId: r.userId || null, deptId: r.userId ? (P.user(r.userId) || {}).deptId : r.deptId || null,
              desc: r.desc, category: r.category, a: per.a, b: per.b, due: per.due, original: v.original, vacAdj: v.vacAdj, otherAdj: v.otherAdj,
              final: v.final, calc: v.calc, paid: 0, paidAt: null, closed: false, adjustments: [], history: [{ at: D.stamp(), action: 'Gerado automaticamente', value: v.final }],
              payMethod: r.payMethod, pixType: p ? p.pixType : r.pixType, pixKey: p ? p.pixKey : r.pixKey, holder: p ? p.holder : r.holder };
            entries().push(n); byKey.set(key, n); created++;
            return;
          }
          if (e.canceled) return;
          const locked = e.paid > 0 || e.closed;
          const manual = (e.adjustments || []).reduce((s, x) => s + x.value, 0);
          const newFinal = v.final + manual;
          if (newFinal === e.final && v.original === e.original) return;
          if (locked) {
            // pago ou fechado: não altera; registra a diferença para a gestão decidir
            const diff = newFinal - e.final;
            if (!e.diff || e.diff.value !== diff) { e.diff = diff ? { value: diff, at: D.stamp(), calc: v.calc, reason: 'Recálculo após pagamento/fechamento (ex.: férias alteradas)' } : null; flagged++; }
            return;
          }
          e.history.push({ at: D.stamp(), action: 'Recalculado', from: e.final, value: newFinal });
          Object.assign(e, { original: v.original, vacAdj: v.vacAdj, otherAdj: v.otherAdj, final: newFinal, calc: v.calc });
          e.pixKey = r.userId && profileOf(r.userId) ? profileOf(r.userId).pixKey : e.pixKey;
          updated++;
        });
      });
      // provisão da PLR: um lançamento por pessoa, a pagar em dezembro do ano do ciclo; acompanha o rateio até ser pago/fechado
      if (P.plr && P.plr.summary) {
        const t = P.plr.table(), cs = D.iso(t.cyc.start), due = t.cyc.payYear + '-12-20';
        t.people.forEach(({ x, a }) => {
          const key = 'plr|' + cs + '|' + x.id, val = Math.round(a.total * t.avoProj), e = byKey.get(key);
          const calc = { plr: true, avos: a.total, avo: Math.round(t.avoProj), ciclo: t.cyc.label };
          if (!e) {
            if (!val) return;
            const p = profileOf(x.id), n = { id: P.uid('fe'), key, recId: null, userId: x.id, deptId: x.deptId || null, desc: 'PLR ' + t.cyc.payYear + ' — ' + x.name + ' (' + a.total + '/12 avos)',
              category: 'plr', a: due, b: due, due, original: val, vacAdj: 0, otherAdj: 0, final: val, calc, paid: 0, paidAt: null, closed: false, adjustments: [],
              history: [{ at: D.stamp(), action: 'Provisão da PLR gerada', value: val }], payMethod: 'pix', pixType: p ? p.pixType : '', pixKey: p ? p.pixKey : '', holder: p ? p.holder : '' };
            entries().push(n); byKey.set(key, n); created++; return;
          }
          if (e.canceled || e.paid > 0 || e.closed || e.final === val) return;
          e.history.push({ at: D.stamp(), action: 'Provisão da PLR recalculada', from: e.final, value: val });
          Object.assign(e, { original: val, final: val, calc, desc: 'PLR ' + t.cyc.payYear + ' — ' + x.name + ' (' + a.total + '/12 avos)' }); updated++;
        });
      }
      if ((created || updated || flagged) && !opts.noSave) P.store.save();
      return { created, updated, flagged };
    },
    calcPassagem, periodsOf, statusOf, toC
  };

  /* ---------- Filtros ---------- */
  const st = () => {
    const s = S();
    if (!s.fin) {
      const mon = D.weekStart(P.today());
      s.fin = { tab: 'painel', week: D.iso(mon), rep: 'semanal', f: { q: '', userId: '', deptId: '', cat: '', s: D.iso(D.add(mon, -7 * 7)), e: D.iso(D.add(mon, 6)), status: '', period: '', rec: '', vac: '' } };
    }
    return s.fin;
  };
  const clearF = () => { const mon = D.weekStart(P.today()); Object.assign(st().f, { q: '', userId: '', deptId: '', cat: '', s: D.iso(D.add(mon, -7 * 7)), e: D.iso(D.add(mon, 6)), status: '', period: '', rec: '', vac: '' }); };
  const onVacIn = (uid, a, b) => vacOf(uid).some(v => v.status === 'aprovada' && v.start <= b && v.end >= a);
  function filtered(f = st().f) {
    const q = (f.q || '').toLowerCase();
    const recById = new Map(recs().map(r => [r.id, r]));
    return entries().filter(e => {
      const r = recById.get(e.recId) || {};
      const who = e.userId ? (P.user(e.userId) || {}).name || '' : '';
      if (q && !(who.toLowerCase().includes(q) || (e.desc || '').toLowerCase().includes(q))) return false;
      if (f.userId && e.userId !== f.userId) return false;
      if (f.deptId && e.deptId !== f.deptId) return false;
      if (f.cat && e.category !== f.cat) return false;
      if (f.s && e.b < f.s) return false;
      if (f.e && e.a > f.e) return false;
      if (f.period && r.period !== f.period) return false;
      if (f.rec === 'ativos' && r.status !== 'ativo') return false;
      if (f.rec === 'inativos' && r.status === 'ativo') return false;
      if (f.vac === '1' && !(e.userId && onVacIn(e.userId, e.a, e.b))) return false;
      const s = statusOf(e);
      if (f.status === 'pendentes' && !['pendente', 'previsto', 'ajustado', 'parcial'].includes(s)) return false;
      else if (f.status === 'realizados' && s !== 'pago') return false;
      else if (f.status === 'atrasados' && s !== 'atrasado') return false;
      else if (f.status && !['pendentes', 'realizados', 'atrasados'].includes(f.status) && s !== f.status) return false;
      return true;
    }).sort((x, y) => x.a < y.a ? 1 : x.a > y.a ? -1 : ((P.user(x.userId) || {}).name || x.desc).localeCompare((P.user(y.userId) || {}).name || y.desc));
  }
  const sum = (list, k) => list.reduce((s, e) => s + (typeof k === 'function' ? k(e) : e[k] || 0), 0);
  const pend = e => e.canceled ? 0 : Math.max(0, e.final - e.paid);

  function filtersBar() {
    const f = st().f, depts = (db().departments || []).filter(d => d.active !== false);
    const people = profiles().map(p => P.user(p.id)).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name));
    const sel = (key, opts, label) => `<label class="field"><span>${label}</span><select data-set="fin.f.${key}"><option value="">Todos</option>${opts.map(([v, l]) => `<option value="${esc(v)}" ${f[key] === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
    return `<section class="card"><div class="card-b"><div class="filters">
      <label class="field"><span>Buscar</span><input type="search" value="${esc(f.q)}" data-set="fin.f.q" data-live placeholder="Funcionário ou descrição"></label>
      ${sel('userId', people.map(x => [x.id, x.name]), 'Funcionário')}
      ${sel('deptId', depts.map(d => [d.id, d.name]), 'Departamento')}
      ${sel('cat', Object.entries(CATS), 'Categoria')}
      <label class="field"><span>De</span><input type="date" value="${f.s}" data-set="fin.f.s"></label>
      <label class="field"><span>Até</span><input type="date" value="${f.e}" data-set="fin.f.e"></label>
      ${sel('status', [['pendentes', 'Pendentes'], ['realizados', 'Realizados'], ['atrasados', 'Atrasados'], ['previsto', 'Previstos'], ['ajustado', 'Ajustados'], ['parcial', 'Parcialmente pagos'], ['cancelado', 'Cancelados']], 'Status')}
      ${sel('period', Object.entries(PERIODS), 'Periodicidade')}
      ${sel('rec', [['ativos', 'Recorrências ativas'], ['inativos', 'Pausadas/encerradas']], 'Recorrência')}
      <label class="field check" style="align-self:end"><input type="checkbox" ${f.vac === '1' ? 'checked' : ''} data-act="finToggleVac"><span>Só quem tem férias no período</span></label>
      <div class="field" style="align-self:end">${V.btn('Limpar filtros', { act: 'finClear', cls: 'ghost sm', icon: 'x' })}</div>
    </div></div></section>`;
  }

  /* ---------- Página ---------- */
  V.financeiro = u => {
    must(u);
    const g = P.finance.generate();
    const s = st();
    const alerts = vacAlerts();
    const diffs = entries().filter(e => e.diff && e.diff.value);
    const tabs = [['painel', 'Dashboard'], ['pagamentos', 'Pagamentos', entries().filter(e => ['pendente', 'atrasado', 'ajustado', 'parcial'].includes(statusOf(e))).length], ['cadastro', 'Cadastro financeiro', profiles().length],
      ['recorrencias', 'Recorrências', recs().filter(r => r.status === 'ativo').length], ['fechamento', 'Fechamento semanal'], ['relatorios', 'Relatórios']];
    const body = { painel, pagamentos, cadastro, recorrencias, fechamento, relatorios }[s.tab] || painel;
    // módulo recém-implantado: orienta os primeiros passos
    const vazio = !profiles().length && !recs().length ? `<div class="banner info">${icon('info')}<div><b>Comece por aqui:</b> 1) em <button type="button" class="link" data-act="setState" data-key="fin.tab" data-val="cadastro">Cadastro financeiro</button>, informe o valor da passagem e a chave PIX de cada funcionário (a recorrência semanal é criada sozinha); 2) para outras despesas (aluguel, internet…), use <b>Nova recorrência</b>. Os lançamentos aparecem automaticamente nas semanas seguintes.</div></div>` : '';
    return `${V.pageHead('Financeiro', 'Passagens e despesas recorrentes, com ajuste automático por férias, controle de pagamentos PIX, fechamento semanal e relatórios.',
      V.btn('Nova recorrência', { act: 'finEditRec', icon: 'plus', cls: 'primary' }))}
      ${alerts.length ? `<div class="banner info">${icon('palm')}<div><b>${alerts.length} alerta${alerts.length > 1 ? 's' : ''} de férias afetando passagens:</b><ul class="fin-alerts">${alerts.slice(0, 6).map(a => `<li>${a}</li>`).join('')}</ul></div></div>` : ''}
      ${diffs.length ? `<div class="banner crit">${icon('alert')}<div><b>${diffs.length} lançamento${diffs.length > 1 ? 's' : ''} já pago${diffs.length > 1 ? 's' : ''}/fechado${diffs.length > 1 ? 's' : ''} com diferença no recálculo.</b> O valor pago não foi alterado. Revise e registre um ajuste separado, com justificativa: ${diffs.slice(0, 4).map(e => `<button type="button" class="link" data-act="finDetail" data-id="${e.id}">${esc(whoOf(e))} (${D.short(e.a)}: ${e.diff.value > 0 ? '+' : ''}${brl(e.diff.value)})</button>`).join(', ')}</div></div>` : ''}
      ${vazio}
      <div class="toolbar">${V.tabs(tabs, s.tab, 'fin.tab')}</div>
      ${body(u)}
      ${g.created ? `<p class="fine">${g.created} lançamento(s) gerado(s) agora pelas recorrências.</p>` : ''}`;
  };
  const whoOf = e => e.userId ? (P.user(e.userId) || {}).name || '—' : (e.holder || e.desc);

  // alertas de férias (aprovadas e em aprovação) nas semanas de passagem
  function vacAlerts() {
    const t = D.iso(D.add(D.weekStart(P.today()), -7)), out = [];
    (db().vacations || []).filter(v => v.end >= t && !['recusada', 'cancelada'].includes(v.status) && profileOf(v.userId)).forEach(v => {
      const x = P.user(v.userId); if (!x) return;
      const es = entries().filter(e => e.userId === v.userId && e.category === 'passagem' && e.a <= v.end && e.b >= v.start);
      const orig = sum(es, 'original'), fin = sum(es, 'final');
      out.push(`<b>${esc(x.name)}</b> · férias ${D.fmt(v.start)} a ${D.fmt(v.end)} ${v.status === 'aprovada' ? '' : '<em>(em aprovação: ainda sem ajuste)</em>'} · ${es.length} semana(s) afetada(s) · original ${brl(orig)} → ajuste <b>${brl(fin - orig)}</b> → previsto <b>${brl(fin)}</b>`);
    });
    return out;
  }

  /* ----- Dashboard ----- */
  function painel() {
    const f = st().f, list = filtered().filter(e => !e.canceled);
    const pas = list.filter(e => e.category === 'passagem');
    const t = D.iso(P.today());
    const late = list.filter(e => statusOf(e) === 'atrasado');
    const people = new Set(list.filter(e => e.userId && e.final > 0).map(e => e.userId));
    const onVac = new Set(profiles().filter(p => onVacIn(p.id, f.s || t, f.e || t)).map(p => p.id));
    const k = (l, v, o = {}) => V.kpi(l, v, o);
    // séries por semana
    const weeks = [...new Set(list.map(e => D.iso(D.weekStart(D.parse(e.a)))))].sort().slice(-10);
    const wk = w => list.filter(e => D.iso(D.weekStart(D.parse(e.a))) === w);
    const byDept = {}; list.forEach(e => { const k2 = e.deptId ? (P.dept(e.deptId) || {}).name || '—' : 'Escritório (geral)'; byDept[k2] = (byDept[k2] || 0) + e.final; });
    const byCat = {}; list.forEach(e => { byCat[CATS[e.category] || e.category] = (byCat[CATS[e.category] || e.category] || 0) + e.final; });
    const months = [...new Set(list.map(e => e.a.slice(0, 7)))].sort().slice(-6);
    const hb = obj => { const rows = Object.entries(obj).sort((a, b) => b[1] - a[1]); return rows.length ? C.hbars(rows.map(([l, v]) => ({ label: l, value: v / 100, valueLabel: brl(v) }))) : V.empty('Sem dados no período.'); };
    return `${filtersBar()}
      <div class="kpis k5 fin-kpis">
        ${k('Despesas previstas', brl(sum(list, 'final')), { icon: 'file', sub: list.length + ' lançamentos' })}
        ${k('Passagens (antes dos ajustes)', brl(sum(pas, 'original')), { icon: 'briefcase' })}
        ${k('Ajustes por férias', brl(sum(pas, 'vacAdj')), { icon: 'palm', tone: sum(pas, 'vacAdj') < 0 ? 'bad' : '' })}
        ${k('Passagens a pagar (final)', brl(sum(pas, 'final')), { icon: 'check' })}
        ${k('Total pago', brl(sum(list, 'paid')), { icon: 'check', sub: 'registro manual' })}
        ${k('Total pendente', brl(sum(list, pend)), { icon: 'clock' })}
        ${k('Atrasados', brl(sum(late, pend)), { icon: 'alert', sub: late.length + ' lançamento(s)', tone: late.length ? 'bad' : '' })}
        ${k('Funcionários com pagamento', people.size, { icon: 'users' })}
        ${k('De férias no período', onVac.size, { icon: 'palm' })}
        ${k('Recorrências ativas', recs().filter(r => r.status === 'ativo').length, { icon: 'refresh' })}
      </div>
      <div class="grid g-1-1">
        ${V.card('Evolução semanal: previsto × pago', weeks.length ? C.slot({ type: 'line', labels: weeks.map(w => D.short(w)), series: [{ name: 'Previsto', cls: 's1', values: weeks.map(w => sum(wk(w), 'final') / 100) }, { name: 'Pago', cls: 's2', values: weeks.map(w => sum(wk(w), 'paid') / 100) }], fmt: v => 'R$ ' + P.fmt.n(v, 2), height: 230, aria: 'Previsto e pago por semana' }) : V.empty('Sem dados.'), { sub: 'Valores finais e pagos por semana de referência' })}
        ${V.card('Ajustes por férias por semana', weeks.length ? C.slot({ type: 'bars', data: weeks.map(w => ({ label: D.short(w), value: Math.abs(sum(wk(w).filter(e => e.category === 'passagem'), 'vacAdj')) / 100, tip: 'Semana de ' + D.fmt(w) + ': ' + brl(sum(wk(w), 'vacAdj')) })), height: 230, aria: 'Ajustes por férias' }) : V.empty('Sem dados.'), { sub: 'Quanto deixou de ser pago por causa de férias' })}
      </div>
      <div class="grid g-1-1">
        ${V.card('Despesas por departamento', hb(byDept))}
        ${V.card('Despesas por categoria', hb(byCat))}
      </div>
      ${V.card('Evolução mensal', months.length ? C.slot({ type: 'bars', data: months.map(m => ({ label: D.monthLabel(D.parse(m + '-01')), value: sum(list.filter(e => e.a.slice(0, 7) === m), 'final') / 100, tip: D.monthLabel(D.parse(m + '-01'), true) + ': ' + brl(sum(list.filter(e => e.a.slice(0, 7) === m), 'final')) })), height: 200, aria: 'Gasto mensal' }) : V.empty('Sem dados.'), { sub: 'Pelo mês de início do período de referência' })}`;
  }

  /* ----- Pagamentos ----- */
  function pagamentos() {
    const list = filtered();
    const tot = { o: sum(list, 'original'), a: sum(list, e => e.final - e.original), f: sum(list, 'final'), p: sum(list, 'paid') };
    return `${filtersBar()}
      ${V.card('', list.length ? `<div class="table-wrap"><table class="tbl fin-tbl"><thead><tr><th>Favorecido</th><th>Descrição</th><th>Referência</th><th class="num">Original</th><th class="num">Ajustes</th><th class="num">A pagar</th><th>PIX</th><th>Previsto</th><th>Pago em</th><th>Status</th><th class="actions-col"></th></tr></thead><tbody>
        ${list.slice(0, 300).map(e => { const s = statusOf(e), d = P.dept(e.deptId); return `<tr class="${s === 'cancelado' ? 'inactive' : ''}">
          <td><b>${esc(whoOf(e))}</b><small class="obs">${esc(d ? d.name : 'Escritório')}</small></td>
          <td>${esc(e.desc)}<small class="obs">${esc(CATS[e.category] || e.category)}</small></td>
          <td class="nowrap">${D.short(e.a)} a ${D.short(e.b)}</td>
          <td class="num">${brl(e.original)}</td><td class="num ${e.final - e.original < 0 ? 'neg' : ''}">${e.final !== e.original ? brl(e.final - e.original) : '—'}</td><td class="num strong">${brl(e.final)}</td>
          <td>${e.pixKey ? `<span class="mono">${esc(e.pixKey)}</span><small class="obs">${esc(e.holder || '')}</small>` : `<small class="muted">${esc(e.payMethod || '—')}</small>`}</td>
          <td class="nowrap">${D.fmt(e.due)}</td><td class="nowrap">${e.paidAt ? D.fmt(e.paidAt) : '—'}</td><td>${stBadge(s)}${e.diff && e.diff.value ? ' <span class="badge es-recusado" title="Diferença no recálculo">!</span>' : ''}</td>
          <td class="actions-col"><div class="row-actions">
            ${e.pixKey ? V.ibtn('copy', 'Copiar chave PIX', { act: 'finCopyPix', attrs: `data-id="${e.id}"` }) : ''}
            ${V.ibtn('info', 'Detalhes do cálculo e histórico', { act: 'finDetail', attrs: `data-id="${e.id}"` })}
            ${s !== 'pago' && s !== 'cancelado' ? V.ibtn('check', 'Marcar como pago', { act: 'finPay', attrs: `data-id="${e.id}"` }) : ''}
            ${s !== 'cancelado' ? V.ibtn('edit', 'Registrar ajuste', { act: 'finAdjust', attrs: `data-id="${e.id}"` }) : ''}
          </div></td></tr>`; }).join('')}
        </tbody><tfoot><tr><th colspan="3">Total (${list.length})</th><th class="num">${brl(tot.o)}</th><th class="num">${brl(tot.a)}</th><th class="num">${brl(tot.f)}</th><th colspan="5">Pago: ${brl(tot.p)} · Pendente: ${brl(sum(list, pend))}</th></tr></tfoot></table></div>` : V.empty('Nenhum lançamento com esses filtros.'), { cls: 'flush', sub: 'A marcação "pago" é um registro manual da gestão, não uma confirmação bancária.' })}`;
  }

  /* ----- Cadastro financeiro (vinculado aos funcionários existentes) ----- */
  function cadastro() {
    const people = db().users.filter(x => (x.role === 'employee' || x.role === 'manager') && x.deptId).sort((a, b) => a.name.localeCompare(b.name));
    const t = D.iso(P.today());
    return V.card('Cadastro financeiro dos funcionários', `<div class="table-wrap"><table class="tbl"><thead><tr><th>Funcionário</th><th>Departamento</th><th class="num">Passagem</th><th>Periodicidade</th><th>Dias</th><th>PIX</th><th>Titular</th><th>Vigência</th><th>Status</th><th class="actions-col"></th></tr></thead><tbody>
      ${people.map(x => { const p = profileOf(x.id), d = P.dept(x.deptId); return `<tr class="${x.active === false ? 'inactive' : ''}"><td>${V.person(x, false)}</td><td>${esc(d ? d.name : '—')}</td>
        ${p ? `<td class="num strong">${brl(weeklyAt(p, t))}</td><td>${PERIODS[p.period]}</td><td>${(p.workdays || []).map(w => WD[w]).join(', ')}</td><td><small class="muted">${esc(PIX_TYPES[p.pixType] || '')}</small><br><span class="mono">${esc(p.pixKey)}</span></td><td>${esc(p.holder)}</td><td class="nowrap">${D.fmt((p.values || []).slice(-1)[0].since)}</td><td>${p.status === 'ativo' ? '<span class="badge es-aprovado">Ativo</span>' : '<span class="badge st-sem">Inativo</span>'}</td>`
          : '<td colspan="7" class="muted">Sem cadastro financeiro</td>'}
        <td class="actions-col"><div class="row-actions">${V.ibtn(p ? 'edit' : 'plus', p ? 'Editar' : 'Cadastrar', { act: 'finEditProfile', attrs: `data-id="${x.id}"` })}${p ? V.ibtn('history', 'Histórico de alterações', { act: 'finProfileHist', attrs: `data-id="${x.id}"` }) : ''}</div></td></tr>`; }).join('')}
      </tbody></table></div>`, { cls: 'flush', sub: 'Nome e departamento vêm do cadastro de funcionários do site. Aqui ficam só os dados financeiros.' })
      + V.card('Regras do cálculo das passagens', `<div class="form">
        <label class="field check"><input type="checkbox" data-act="finSetting" data-k="vacStartPaid" ${settings().vacStartPaid ? 'checked' : ''}><span>Pagar a passagem do <b>primeiro dia</b> de férias</span></label>
        <label class="field check"><input type="checkbox" data-act="finSetting" data-k="vacEndPaid" ${settings().vacEndPaid ? 'checked' : ''}><span>Pagar a passagem do <b>último dia</b> de férias</span></label>
        <p class="fine">Valor diário = valor semanal ÷ dias de trabalho. Não são pagos: dias de férias aprovadas, feriados, dias antes da admissão e depois do desligamento. Mudanças nas regras recalculam só lançamentos ainda não pagos nem fechados.</p></div>`);
  }

  /* ----- Recorrências ----- */
  function recorrencias() {
    const t = D.iso(P.today());
    const list = recs().slice().sort((a, b) => (a.status === 'ativo' ? 0 : 1) - (b.status === 'ativo' ? 0 : 1) || a.desc.localeCompare(b.desc));
    const next = r => entries().filter(e => e.recId === r.id && e.b >= t && !e.canceled).sort((a, b) => a.a < b.a ? -1 : 1)[0];
    return V.card('Lançamentos recorrentes', `<div class="table-wrap"><table class="tbl"><thead><tr><th>Descrição</th><th>Categoria</th><th class="num">Valor</th><th>Periodicidade</th><th>Início / término</th><th>Próximo</th><th>Pagamento</th><th>Status</th><th class="actions-col"></th></tr></thead><tbody>
      ${list.map(r => { const n = next(r); return `<tr class="${r.status !== 'ativo' ? 'inactive' : ''}"><td><b>${esc(r.desc)}</b>${r.userId ? `<small class="obs">${esc((P.dept((P.user(r.userId) || {}).deptId) || {}).name || '')}</small>` : ''}</td><td>${esc(CATS[r.category])}</td>
        <td class="num">${r.kind === 'passagem' ? '<small class="muted">do cadastro</small>' : brl(valueOfRec(r, t))}</td><td>${PERIODS[r.period]} <small class="muted">· ${r.period === 'mensal' ? 'dia ' + r.genDay : WD[Number(r.genDay)]}</small></td>
        <td class="nowrap">${D.fmt(r.start)}${r.end ? ' → ' + D.fmt(r.end) : ''}</td><td class="nowrap">${n ? D.fmt(n.due) + ' · ' + brl(n.final) : '—'}</td><td>${esc(r.payMethod || '')}</td>
        <td>${{ ativo: '<span class="badge es-aprovado">Ativo</span>', pausado: '<span class="badge es-pendente">Pausado</span>', encerrado: '<span class="badge st-sem">Encerrado</span>' }[r.status]}</td>
        <td class="actions-col"><div class="row-actions">${V.ibtn('edit', 'Editar', { act: 'finEditRec', attrs: `data-id="${r.id}"` })}
          ${r.status === 'ativo' ? V.ibtn('clock', 'Pausar', { act: 'finRecStatus', attrs: `data-id="${r.id}" data-to="pausado"` }) : r.status === 'pausado' ? V.ibtn('refresh', 'Reativar', { act: 'finRecStatus', attrs: `data-id="${r.id}" data-to="ativo"` }) : ''}
          ${r.status !== 'encerrado' ? V.ibtn('x', 'Encerrar', { act: 'finRecStatus', attrs: `data-id="${r.id}" data-to="encerrado"` }) : ''}
          ${V.ibtn('history', 'Lançamentos e histórico', { act: 'finRecHist', attrs: `data-id="${r.id}"` })}</div></td></tr>`; }).join('')}
      </tbody></table></div>`, { cls: 'flush', sub: 'Alterações valem para os próximos lançamentos; os anteriores ficam como estavam (histórico preservado).', actions: V.btn('Nova recorrência', { act: 'finEditRec', icon: 'plus', cls: 'sm' }) });
  }

  /* ----- Fechamento semanal ----- */
  function fechamento() {
    const s = st(), wa = s.week, wb = D.iso(D.add(D.parse(wa), 6));
    const list = entries().filter(e => !e.canceled && e.a <= wb && e.b >= wa && (e.a >= wa || e.category === 'passagem')).filter(e => e.a >= wa && e.a <= wb);
    const done = closings().find(c => c.week === wa);
    const rows = list.map(e => ({ e, c: e.calc }));
    const weeks = []; for (let i = -6; i <= 1; i++) weeks.push(D.iso(D.add(D.weekStart(P.today()), 7 * i)));
    return `<div class="toolbar"><label class="field"><span>Semana</span><select data-set="fin.week">${weeks.map(w => `<option value="${w}" ${w === wa ? 'selected' : ''}>${D.fmt(w)} a ${D.fmt(D.add(D.parse(w), 6))}${closings().some(c => c.week === w) ? ' · fechada' : ''}</option>`).join('')}</select></label></div>
      ${done ? `<div class="banner info">${icon('lock')}<div><b>Semana fechada em ${esc(done.at)}</b> por ${esc((P.user(done.by) || {}).name || '—')}. Os valores abaixo são os consolidados e não mudam com recálculos; correções viram ajustes registrados.</div></div>` : ''}
      ${V.card('Fechamento da semana ' + D.fmt(wa) + ' a ' + D.fmt(wb), rows.length ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>Favorecido</th><th>Departamento</th><th class="num">Original</th><th class="num">Dias elegíveis</th><th class="num">Ajuste férias</th><th class="num">Final</th><th class="num">Pago</th><th class="num">Saldo</th><th>PIX</th><th>Status</th></tr></thead><tbody>
        ${rows.map(({ e, c }) => `<tr><td><b>${esc(whoOf(e))}</b><small class="obs">${esc(e.desc)}</small></td><td>${esc((P.dept(e.deptId) || {}).name || 'Escritório')}</td><td class="num">${brl(e.original)}</td><td class="num">${c ? c.eligible + ' de ' + c.scheduled : '—'}</td><td class="num">${e.vacAdj ? brl(e.vacAdj) : '—'}</td><td class="num strong">${brl(e.final)}</td><td class="num">${brl(e.paid)}</td><td class="num">${brl(pend(e))}</td><td class="mono">${esc(e.pixKey || '—')}</td><td>${stBadge(statusOf(e))}</td></tr>`).join('')}
        </tbody><tfoot><tr><th colspan="2">Total (${rows.length})</th><th class="num">${brl(sum(list, 'original'))}</th><th></th><th class="num">${brl(sum(list, 'vacAdj'))}</th><th class="num">${brl(sum(list, 'final'))}</th><th class="num">${brl(sum(list, 'paid'))}</th><th class="num">${brl(sum(list, pend))}</th><th colspan="2"></th></tr></tfoot></table></div>` : V.empty('Nenhum lançamento nesta semana.'),
        { cls: 'flush', sub: 'Revise os valores antes de concluir. Depois de fechada, a semana fica preservada.', actions: !done && rows.length ? V.btn('Concluir fechamento', { act: 'finClose', icon: 'lock', cls: 'primary sm' }) : '' })}
      ${closings().length ? V.card('Fechamentos anteriores', `<ul class="day-list">${closings().slice().reverse().map(c => `<li><span>Semana de ${D.fmt(c.week)} · ${c.count} lançamentos<small>fechada em ${esc(c.at)} por ${esc((P.user(c.by) || {}).name || '—')}</small></span><b>${brl(c.total)}</b></li>`).join('')}</ul>`) : ''}`;
  }

  /* ----- Relatórios ----- */
  const REPORTS = {
    semanal: 'Passagens por semana', mensal: 'Despesas por mês', funcionario: 'Pagamentos por funcionário', departamento: 'Por departamento',
    recorrencias: 'Lançamentos recorrentes', pendentes: 'Pendentes e atrasados', ferias: 'Ajustes por férias', pagos: 'Pagamentos realizados', valores: 'Histórico de alterações de valores'
  };
  function reportRows(kind) {
    const list = filtered().filter(e => !e.canceled);
    const group = (keyFn, labelFn) => { const m = new Map(); list.forEach(e => { const k = keyFn(e); const g = m.get(k) || { label: labelFn(e), o: 0, a: 0, f: 0, p: 0, n: 0 }; g.o += e.original; g.a += e.final - e.original; g.f += e.final; g.p += e.paid; g.n++; m.set(k, g); }); return [...m.entries()].sort((x, y) => x[0] < y[0] ? -1 : 1).map(([, g]) => ({ 'Grupo': g.label, 'Lançamentos': g.n, 'Original (R$)': g.o / 100, 'Ajustes (R$)': g.a / 100, 'Final (R$)': g.f / 100, 'Pago (R$)': g.p / 100, 'Pendente (R$)': (g.f - g.p) / 100 })); };
    const line = e => ({ 'Favorecido': whoOf(e), 'Departamento': (P.dept(e.deptId) || {}).name || 'Escritório', 'Descrição': e.desc, 'Categoria': CATS[e.category], 'Início': D.fmt(e.a), 'Fim': D.fmt(e.b), 'Dias elegíveis': e.calc ? e.calc.eligible + '/' + e.calc.scheduled : '', 'Original (R$)': e.original / 100, 'Ajuste férias (R$)': (e.vacAdj || 0) / 100, 'Outros ajustes (R$)': (e.final - e.original - (e.vacAdj || 0)) / 100, 'Final (R$)': e.final / 100, 'Pago (R$)': e.paid / 100, 'Pendente (R$)': pend(e) / 100, 'Chave PIX': e.pixKey || '', 'Titular': e.holder || '', 'Previsto': D.fmt(e.due), 'Pago em': e.paidAt ? D.fmt(e.paidAt) : '', 'Status': ST[statusOf(e)][0] });
    switch (kind) {
      case 'semanal': return list.filter(e => e.category === 'passagem').map(line);
      case 'mensal': return group(e => e.a.slice(0, 7), e => D.monthLabel(D.parse(e.a), true));
      case 'funcionario': return group(e => whoOf(e), e => whoOf(e));
      case 'departamento': return group(e => e.deptId || '-', e => (P.dept(e.deptId) || {}).name || 'Escritório (geral)');
      case 'recorrencias': return recs().map(r => ({ 'Descrição': r.desc, 'Categoria': CATS[r.category], 'Periodicidade': PERIODS[r.period], 'Valor (R$)': r.kind === 'passagem' ? weeklyAt(profileOf(r.userId) || {}, D.iso(P.today())) / 100 : valueOfRec(r, D.iso(P.today())) / 100, 'Início': D.fmt(r.start), 'Término': r.end ? D.fmt(r.end) : '', 'Pagamento': r.payMethod, 'Status': r.status, 'Gerados': entries().filter(e => e.recId === r.id).length }));
      case 'pendentes': return list.filter(e => ['pendente', 'atrasado', 'ajustado', 'parcial', 'previsto'].includes(statusOf(e))).map(line);
      case 'ferias': return list.filter(e => e.vacAdj).map(line);
      case 'pagos': return list.filter(e => e.paid > 0).map(line);
      case 'valores': return profiles().flatMap(p => (p.history || []).map(h => ({ 'Funcionário': (P.user(p.id) || {}).name || p.id, 'Data': h.at, 'Alteração': h.action, 'De': h.from != null ? (typeof h.from === 'number' ? h.from / 100 : h.from) : '', 'Para': h.value != null ? (typeof h.value === 'number' ? h.value / 100 : h.value) : (h.to || ''), 'Por': (P.user(h.by) || {}).name || '' })));
    }
    return [];
  }
  function relatorios() {
    const s = st(), rows = reportRows(s.rep), cols = rows.length ? Object.keys(rows[0]) : [];
    const money = c => / \(R\$\)$/.test(c);
    const totals = cols.map(c => money(c) ? rows.reduce((a, r) => a + (Number(r[c]) || 0), 0) : null);
    return `${filtersBar()}
      <div class="toolbar">${V.tabs(Object.entries(REPORTS), s.rep, 'fin.rep')}</div>
      ${V.card(REPORTS[s.rep], rows.length ? `<div class="table-wrap"><table class="tbl compact"><thead><tr>${cols.map(c => `<th class="${money(c) ? 'num' : ''}">${esc(c)}</th>`).join('')}</tr></thead><tbody>
        ${rows.slice(0, 400).map(r => `<tr>${cols.map(c => `<td class="${money(c) ? 'num' : ''}">${money(c) ? brl(Math.round(r[c] * 100)) : esc(r[c])}</td>`).join('')}</tr>`).join('')}
        </tbody>${totals.some(x => x != null) ? `<tfoot><tr>${cols.map((c, i) => `<th class="${money(c) ? 'num' : ''}">${i === 0 ? 'Total' : totals[i] != null ? brl(Math.round(totals[i] * 100)) : ''}</th>`).join('')}</tr></tfoot>` : ''}</table></div>` : V.empty('Sem dados para este relatório com os filtros atuais.'),
        { cls: 'flush', sub: rows.length + ' linha(s) · respeita os filtros acima', actions: rows.length ? V.btn('Excel', { act: 'finExport', icon: 'download', cls: 'sm', attrs: 'data-f="xlsx"' }) + V.btn('CSV', { act: 'finExport', icon: 'download', cls: 'sm ghost', attrs: 'data-f="csv"' }) : '' })}`;
  }

  /* ---------- Ações ---------- */
  const U = () => S().user;
  const g = fn => P.ui.guard(fn);
  const ent = id => entries().find(e => e.id === id);
  A.finClear = () => { clearF(); P.render(); };
  A.finSetting = el => {
    must(U()); const s = settings(); s[el.dataset.k] = el.checked;
    audit(U(), 'regra de cálculo alterada', el.dataset.k, el.checked ? 'pago' : 'não pago');
    P.finance.generate(); P.store.save(); P.toast('Regra atualizada. Lançamentos ainda não pagos foram recalculados.'); P.render();
  };
  A.finToggleVac = el => { st().f.vac = el.checked ? '1' : ''; P.render(); };
  A.finCopyPix = el => {
    const e = ent(el.dataset.id); if (!e || !e.pixKey) return;
    (navigator.clipboard ? navigator.clipboard.writeText(e.pixKey) : Promise.reject()).then(() => P.toast('Chave PIX copiada: ' + e.pixKey), () => P.toast('Copie manualmente: ' + e.pixKey, 'err'));
  };
  A.finDetail = el => {
    const e = ent(el.dataset.id); if (!e) return; const c = e.calc;
    const why = { trabalho: ['Elegível', 'es-aprovado'], 'férias': ['Férias', 'es-correcao'], feriado: ['Feriado', 'st-sem'], 'antes da admissão': ['Antes da admissão', 'st-sem'], 'após desligamento': ['Após desligamento', 'st-sem'] };
    P.ui.modal({
      title: 'Lançamento · ' + esc(whoOf(e)), wide: true, cancel: 'Fechar',
      body: `<p class="prose"><b>${esc(e.desc)}</b> · referência ${D.fmt(e.a)} a ${D.fmt(e.b)} · previsto para ${D.fmt(e.due)} · ${stBadge(statusOf(e))}</p>
        ${c ? `<h4 class="sub-h">Memória do cálculo</h4><p class="prose">Valor semanal vigente <b>${brl(c.weekly)}</b> ÷ ${c.perWeek} dias de trabalho = <b>${brlIn(c.daily)}</b> por dia.</p>
          <div class="table-wrap"><table class="tbl compact"><thead><tr><th>Dia</th><th>Situação</th><th class="num">Valor</th></tr></thead><tbody>${c.days.map(d => `<tr><td>${WD[D.parse(d.iso).getDay()]} ${D.short(d.iso)}</td><td><span class="badge ${why[d.why][1]}">${why[d.why][0]}</span></td><td class="num">${d.why === 'trabalho' ? brl(Math.round(c.daily)) : '—'}</td></tr>`).join('')}</tbody></table></div>
          <p class="prose">${c.eligible} dia(s) elegível(is) de ${c.scheduled} · original ${brl(c.original)} · ajuste férias ${brl(c.vacAdj)}${c.otherAdj ? ' · outros (feriado/admissão/desligamento) ' + brl(c.otherAdj) : ''} · <b>final ${brl(c.final)}</b></p>` : `<p class="prose">Valor fixo da recorrência: <b>${brl(e.original)}</b>.</p>`}
        ${(e.adjustments || []).length ? `<h4 class="sub-h">Ajustes manuais</h4><ul class="day-list">${e.adjustments.map(a => `<li><span>${esc(a.reason)}<small>${esc(a.at)} · ${esc((P.user(a.by) || {}).name || '')}</small></span><b>${brl(a.value)}</b></li>`).join('')}</ul>` : ''}
        ${e.diff && e.diff.value ? `<div class="banner crit sm">${icon('alert')}<div>Recálculo indica diferença de <b>${brl(e.diff.value)}</b> (${esc(e.diff.reason)}). O valor pago/fechado não foi alterado. Use "Registrar ajuste" para lançar a diferença com justificativa.</div></div>` : ''}
        <h4 class="sub-h">Histórico</h4><ul class="day-list">${(e.history || []).slice().reverse().map(h => `<li><span>${esc(h.action)}<small>${esc(h.at)}${h.by ? ' · ' + esc((P.user(h.by) || {}).name || '') : ''}${h.note ? ' · ' + esc(h.note) : ''}</small></span><b>${h.value != null ? brl(h.value) : ''}</b></li>`).join('')}</ul>`
    });
  };
  A.finPay = el => {
    const e = ent(el.dataset.id); if (!e) return;
    P.ui.modal({
      title: 'Registrar pagamento', submit: 'Confirmar registro',
      body: `<p class="prose"><b>${esc(whoOf(e))}</b> · ${esc(e.desc)} · ${D.fmt(e.a)} a ${D.fmt(e.b)}<br>Valor a pagar: <b>${brl(e.final)}</b> · já registrado: ${brl(e.paid)}${e.pixKey ? `<br>PIX: <span class="mono">${esc(e.pixKey)}</span> (${esc(e.holder || '')})` : ''}</p>
        <div class="fgrid"><label class="field"><span>Valor pago (R$)</span><input id="fp-v" value="${brlIn(pend(e))}" inputmode="decimal"></label><label class="field"><span>Data do pagamento</span><input type="date" id="fp-d" value="${D.iso(P.today())}"></label>
        <label class="field span3"><span>Observação</span><input id="fp-o" placeholder="Ex.: PIX feito pelo app do banco"></label></div>
        <label class="field check"><input type="checkbox" id="fp-ok"><span>Confirmo que o pagamento foi feito. <small class="muted">Este é um registro manual, não uma confirmação bancária.</small></span></label>`,
      onSubmit: m => {
        if (!$('#fp-ok', m).checked) throw new Error('Marque a confirmação.');
        const v = toC($('#fp-v', m).value); if (!(v > 0)) throw new Error('Informe um valor maior que zero.');
        if (v > pend(e)) throw new Error('O valor passa do saldo a pagar (' + brl(pend(e)) + '). Para pagar a mais, registre um ajuste antes.');
        e.paid += v; e.paidAt = $('#fp-d', m).value; e.paidBy = U().id;
        e.history.push({ at: D.stamp(), by: U().id, action: e.paid >= e.final ? 'Pagamento registrado (manual)' : 'Pagamento parcial registrado (manual)', value: v, note: $('#fp-o', m).value });
        audit(U(), 'pagamento registrado', e.id, whoOf(e) + ' · ' + brl(v)); P.store.save(); P.toast('Pagamento registrado.'); P.render();
      }
    });
  };
  A.finAdjust = el => {
    const e = ent(el.dataset.id); if (!e) return;
    const sug = e.diff && e.diff.value ? brlIn(e.diff.value) : '';
    P.ui.modal({
      title: 'Registrar ajuste', submit: 'Registrar ajuste',
      body: `<p class="prose"><b>${esc(whoOf(e))}</b> · ${esc(e.desc)} · valor atual ${brl(e.final)}${e.paid ? ' · <b>já pago ' + brl(e.paid) + '</b>' : ''}</p>
        <div class="fgrid"><label class="field"><span>Ajuste (R$, negativo para desconto)</span><input id="fa-v" value="${sug}" placeholder="Ex.: -29,30"></label>
        <label class="field span2"><span>Justificativa (obrigatória)</span><input id="fa-r" value="${e.diff ? 'Diferença de recálculo após pagamento' : ''}" placeholder="Ex.: férias alteradas após o pagamento"></label></div>
        <p class="fine">O ajuste fica registrado separadamente no histórico. ${e.paid ? 'Como já houve pagamento, o saldo passa a mostrar quanto falta pagar ou quanto foi pago a mais.' : ''}</p>`,
      onSubmit: m => {
        const v = toC($('#fa-v', m).value), r = $('#fa-r', m).value.trim();
        if (!v) throw new Error('Informe o valor do ajuste.'); if (r.length < 5) throw new Error('Escreva a justificativa.');
        if (e.final + v < 0) throw new Error('O valor final não pode ficar negativo.');
        e.adjustments.push({ at: D.stamp(), by: U().id, value: v, reason: r });
        e.history.push({ at: D.stamp(), by: U().id, action: 'Ajuste manual: ' + r, from: e.final, value: e.final + v });
        e.final += v; if (e.diff) e.diff = null;
        audit(U(), 'ajuste', e.id, whoOf(e) + ' · ' + brl(v) + ' · ' + r); P.store.save(); P.toast('Ajuste registrado.'); P.render();
      }
    });
  };
  A.finEditProfile = el => {
    const x = P.user(el.dataset.id); if (!x) return; must(U());
    const p = profileOf(x.id), t = D.iso(P.today());
    P.ui.modal({
      title: (p ? 'Editar' : 'Cadastrar') + ' dados financeiros · ' + esc(x.name), submit: 'Salvar', wide: true,
      body: `<p class="prose">${V.person(x, (P.dept(x.deptId) || {}).name)}</p><div class="fgrid">
        <label class="field"><span>Valor semanal da passagem (R$)</span><input id="fp-w" value="${p ? brlIn(weeklyAt(p, t)) : ''}" inputmode="decimal" placeholder="146,50"></label>
        <label class="field"><span>Vigência do valor a partir de</span><input type="date" id="fp-s" value="${D.iso(D.weekStart(P.today()))}"></label>
        <label class="field"><span>Periodicidade do pagamento</span><select id="fp-p">${Object.entries(PERIODS).map(([k, l]) => `<option value="${k}" ${(p ? p.period : 'semanal') === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <div class="field span3"><span>Dias de trabalho</span><div class="chips">${[1, 2, 3, 4, 5, 6].map(w => `<label class="check"><input type="checkbox" class="fp-wd" value="${w}" ${(p ? p.workdays : [1, 2, 3, 4, 5]).includes(w) ? 'checked' : ''}> ${WD[w]}</label>`).join(' ')}</div></div>
        <label class="field"><span>Tipo de chave PIX</span><select id="fp-pt">${Object.entries(PIX_TYPES).map(([k, l]) => `<option value="${k}" ${p && p.pixType === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="field"><span>Chave PIX</span><input id="fp-pk" value="${esc(p ? p.pixKey : '')}"></label>
        <label class="field"><span>Titular da chave</span><input id="fp-h" value="${esc(p ? p.holder : x.name)}"></label>
        <label class="field"><span>Status</span><select id="fp-st"><option value="ativo">Ativo</option><option value="inativo" ${p && p.status === 'inativo' ? 'selected' : ''}>Inativo</option></select></label>
        <label class="field span2"><span>Observações</span><input id="fp-o" value="${esc(p ? p.obs : '')}"></label></div>
        <p class="fine">Mudar o valor cria uma nova vigência: semanas anteriores mantêm o valor antigo; lançamentos já pagos ou fechados não mudam.</p>`,
      onSubmit: m => {
        const weekly = toC($('#fp-w', m).value), since = $('#fp-s', m).value, wd = [...m.querySelectorAll('.fp-wd:checked')].map(i => Number(i.value));
        if (!(weekly > 0)) throw new Error('Informe o valor semanal da passagem.');
        if (!wd.length) throw new Error('Escolha os dias de trabalho.');
        const pixKey = $('#fp-pk', m).value.trim(); if (!pixKey) throw new Error('Informe a chave PIX.');
        const holder = $('#fp-h', m).value.trim(); if (holder.length < 3) throw new Error('Informe o titular da chave.');
        const now = D.stamp(), by = U().id;
        let q = p;
        if (!q) { q = { id: x.id, values: [], history: [] }; profiles().push(q); q.history.push({ at: now, by, action: 'Cadastro criado' }); }
        const cur = weeklyAt(q, since);
        if (cur !== weekly) { q.values = (q.values || []).filter(v => v.since !== since).concat([{ since, weekly }]).sort((a, b) => a.since < b.since ? -1 : 1); q.history.push({ at: now, by, action: 'Valor semanal alterado (vigência ' + D.fmt(since) + ')', from: cur, value: weekly }); }
        if (q.pixKey && q.pixKey !== pixKey) q.history.push({ at: now, by, action: 'Chave PIX alterada', from: q.pixKey, to: pixKey });
        Object.assign(q, { period: $('#fp-p', m).value, workdays: wd, pixType: $('#fp-pt', m).value, pixKey, holder, status: $('#fp-st', m).value, obs: $('#fp-o', m).value.trim() });
        // recorrência de passagem vinculada
        let r = recs().find(r2 => r2.kind === 'passagem' && r2.userId === x.id);
        if (!r) recs().push(r = { id: P.uid('fr'), kind: 'passagem', desc: 'Passagem — ' + x.name, userId: x.id, deptId: x.deptId, category: 'passagem', genDay: 5, start: since, end: '', payMethod: 'pix', status: 'ativo', obs: '', amount: 0, versions: [], history: [{ at: now, by, action: 'Recorrência criada' }] });
        r.period = q.period; r.status = q.status === 'ativo' ? (r.status === 'encerrado' ? 'encerrado' : 'ativo') : 'pausado';
        // chave PIX nova vale para lançamentos ainda não pagos
        entries().filter(e => e.userId === x.id && !e.paid && !e.closed).forEach(e => { e.pixKey = pixKey; e.pixType = q.pixType; e.holder = holder; });
        audit(U(), 'cadastro financeiro salvo', x.id, x.name); P.finance.generate(); P.store.save(); P.toast('Dados financeiros salvos.'); P.render();
      }
    });
  };
  A.finProfileHist = el => {
    const p = profileOf(el.dataset.id), x = P.user(el.dataset.id); if (!p) return;
    const fv = v => typeof v === 'number' ? brl(v) : esc(v || '');
    P.ui.modal({ title: 'Histórico financeiro · ' + esc(x ? x.name : ''), cancel: 'Fechar', body: `<h4 class="sub-h">Valores por vigência</h4><ul class="day-list">${(p.values || []).map(v => `<li><span>A partir de ${D.fmt(v.since)}</span><b>${brl(v.weekly)}</b></li>`).join('')}</ul>
      <h4 class="sub-h">Alterações</h4><ul class="day-list">${(p.history || []).slice().reverse().map(h => `<li><span>${esc(h.action)}<small>${esc(h.at)} · ${esc((P.user(h.by) || {}).name || '')}${h.from != null ? ' · de ' + fv(h.from) : ''}${h.value != null || h.to ? ' para ' + fv(h.value != null ? h.value : h.to) : ''}</small></span></li>`).join('')}</ul>` });
  };
  A.finEditRec = el => {
    must(U());
    const r = el.dataset.id ? recs().find(x => x.id === el.dataset.id) : null;
    if (r && r.kind === 'passagem') return A.finEditProfile({ dataset: { id: r.userId } });
    const t = D.iso(P.today()), depts = (db().departments || []).filter(d => d.active !== false);
    P.ui.modal({
      title: r ? 'Editar recorrência' : 'Nova recorrência', submit: 'Salvar', wide: true,
      body: `<div class="fgrid">
        <label class="field span2"><span>Descrição</span><input id="fr-d" value="${esc(r ? r.desc : '')}" placeholder="Ex.: Aluguel da sala"></label>
        <label class="field"><span>Categoria</span><select id="fr-c">${Object.entries(CATS).filter(([k]) => k !== 'passagem').map(([k, l]) => `<option value="${k}" ${r && r.category === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="field"><span>Departamento</span><select id="fr-dp"><option value="">Escritório (geral)</option>${depts.map(d => `<option value="${d.id}" ${r && r.deptId === d.id ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</select></label>
        <label class="field"><span>Valor (R$)</span><input id="fr-v" value="${r ? brlIn(valueOfRec(r, t)) : ''}" inputmode="decimal"></label>
        <label class="field"><span>Periodicidade</span><select id="fr-p">${Object.entries(PERIODS).map(([k, l]) => `<option value="${k}" ${r && r.period === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="field"><span>Dia de geração <small>(1-31 no mensal; 1=seg…5=sex)</small></span><input id="fr-g" type="number" min="0" max="31" value="${r ? r.genDay : 1}"></label>
        <label class="field"><span>Início</span><input type="date" id="fr-s" value="${r ? r.start : D.iso(D.weekStart(P.today()))}" ${r ? 'disabled' : ''}></label>
        <label class="field"><span>Término (opcional)</span><input type="date" id="fr-e" value="${r ? r.end || '' : ''}"></label>
        <label class="field"><span>Forma de pagamento</span><select id="fr-m">${['pix', 'boleto', 'transferência', 'cartão', 'dinheiro'].map(k => `<option ${r && r.payMethod === k ? 'selected' : ''}>${k}</option>`).join('')}</select></label>
        <label class="field"><span>Chave PIX (se PIX)</span><input id="fr-k" value="${esc(r ? r.pixKey || '' : '')}"></label>
        <label class="field"><span>Titular / favorecido</span><input id="fr-h" value="${esc(r ? r.holder || '' : '')}"></label>
        <label class="field span3"><span>Observações</span><input id="fr-o" value="${esc(r ? r.obs || '' : '')}"></label></div>
        ${r ? '<p class="fine">Valor alterado vale a partir da próxima semana/mês; lançamentos anteriores ficam como estão.</p>' : ''}`,
      onSubmit: m => {
        const desc = $('#fr-d', m).value.trim(), v = toC($('#fr-v', m).value);
        if (desc.length < 3) throw new Error('Informe a descrição.'); if (!(v > 0)) throw new Error('Informe o valor.');
        const data = { desc, category: $('#fr-c', m).value, deptId: $('#fr-dp', m).value || null, period: $('#fr-p', m).value, genDay: Number($('#fr-g', m).value) || 1, end: $('#fr-e', m).value, payMethod: $('#fr-m', m).value, pixKey: $('#fr-k', m).value.trim(), holder: $('#fr-h', m).value.trim(), obs: $('#fr-o', m).value.trim() };
        const now = D.stamp(), by = U().id;
        if (!r) { recs().push(Object.assign({ id: P.uid('fr'), kind: 'fixo', userId: null, start: $('#fr-s', m).value, status: 'ativo', amount: v, versions: [], history: [{ at: now, by, action: 'Recorrência criada', value: v }] }, data)); }
        else {
          const cur = valueOfRec(r, t);
          if (cur !== v) { const from = D.iso(D.add(D.weekStart(P.today()), 7)); r.versions = (r.versions || []).filter(x => x.from !== from).concat([{ from, amount: v }]); r.history.push({ at: now, by, action: 'Valor alterado a partir de ' + D.fmt(from), from: cur, value: v }); }
          Object.assign(r, data); r.history.push({ at: now, by, action: 'Recorrência editada' });
        }
        audit(U(), r ? 'recorrência editada' : 'recorrência criada', desc, brl(v)); P.finance.generate(); P.store.save(); P.toast('Recorrência salva.'); P.render();
      }
    });
  };
  A.finRecStatus = el => {
    const r = recs().find(x => x.id === el.dataset.id), to = el.dataset.to; if (!r) return;
    const lbl = { pausado: 'Pausar', ativo: 'Reativar', encerrado: 'Encerrar' }[to];
    P.ui.modal({ title: lbl + ' recorrência', submit: lbl, danger: to === 'encerrado',
      body: `<p class="prose"><b>${esc(r.desc)}</b><br>${to === 'pausado' ? 'Os próximos lançamentos deixam de ser gerados até reativar. Os já gerados e não pagos continuam na lista (cancele-os se quiser).' : to === 'encerrado' ? 'Nenhum lançamento novo será gerado. O histórico fica preservado.' : 'Volta a gerar os lançamentos a partir de agora.'}</p>`,
      onSubmit: () => {
        const t = D.iso(P.today());
        r.status = to; if (to === 'pausado') r.pausedAt = D.iso(D.add(D.weekStart(P.today()), 7)); if (to === 'ativo') r.pausedAt = null; if (to === 'encerrado') r.endedAt = t;
        if (to !== 'ativo') entries().filter(e => e.recId === r.id && e.a > t && !e.paid && !e.closed).forEach(e => { e.canceled = true; e.history.push({ at: D.stamp(), by: U().id, action: 'Cancelado (' + to + ')' }); });
        r.history.push({ at: D.stamp(), by: U().id, action: lbl }); audit(U(), 'recorrência ' + to, r.id, r.desc); P.finance.generate(); P.store.save(); P.render();
      } });
  };
  A.finRecHist = el => {
    const r = recs().find(x => x.id === el.dataset.id); if (!r) return;
    const es = entries().filter(e => e.recId === r.id).sort((a, b) => a.a < b.a ? 1 : -1);
    P.ui.modal({ title: esc(r.desc), wide: true, cancel: 'Fechar', body: `<h4 class="sub-h">Lançamentos (${es.length})</h4><div class="table-wrap" style="max-height:300px;overflow:auto"><table class="tbl compact"><thead><tr><th>Referência</th><th class="num">Final</th><th class="num">Pago</th><th>Status</th></tr></thead><tbody>${es.map(e => `<tr><td>${D.fmt(e.a)} a ${D.fmt(e.b)}</td><td class="num">${brl(e.final)}</td><td class="num">${brl(e.paid)}</td><td>${stBadge(statusOf(e))}</td></tr>`).join('')}</tbody></table></div>
      <h4 class="sub-h">Histórico da recorrência</h4><ul class="day-list">${(r.history || []).slice().reverse().map(h => `<li><span>${esc(h.action)}<small>${esc(h.at)}</small></span><b>${h.value != null ? brl(h.value) : ''}</b></li>`).join('')}</ul>` });
  };
  A.finClose = () => {
    const s = st(), wa = s.week, wb = D.iso(D.add(D.parse(wa), 6));
    if (closings().some(c => c.week === wa)) return P.toast('Esta semana já foi fechada.', 'err');
    const list = entries().filter(e => !e.canceled && e.a >= wa && e.a <= wb);
    P.ui.modal({ title: 'Concluir fechamento', submit: 'Fechar semana',
      body: `<p class="prose">Semana de <b>${D.fmt(wa)} a ${D.fmt(wb)}</b> · ${list.length} lançamentos · total <b>${brl(sum(list, 'final'))}</b> · pago ${brl(sum(list, 'paid'))} · pendente ${brl(sum(list, pend))}.</p><p class="fine">Depois de fechar, recálculos (ex.: férias alteradas) não mudam esses valores: a diferença aparece como alerta para você lançar um ajuste.</p>`,
      onSubmit: () => {
        list.forEach(e => { e.closed = true; e.history.push({ at: D.stamp(), by: U().id, action: 'Incluído no fechamento semanal', value: e.final }); });
        closings().push({ id: P.uid('fc'), week: wa, at: D.stamp(), by: U().id, count: list.length, total: sum(list, 'final'), snapshot: list.map(e => ({ id: e.id, final: e.final, paid: e.paid })) });
        audit(U(), 'fechamento semanal', wa, brl(sum(list, 'final'))); P.store.save(); P.toast('Semana fechada.'); P.render();
      } });
  };
  A.finExport = el => {
    const s = st(), rows = reportRows(s.rep); if (!rows.length) return;
    const name = 'financeiro-' + s.rep + '-' + D.iso(P.today());
    if (el.dataset.f === 'csv') {
      const cols = Object.keys(rows[0]), q = v => { const t = typeof v === 'number' ? v.toFixed(2).replace('.', ',') : String(v == null ? '' : v); return /[;"\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
      const csv = '﻿' + [cols.join(';')].concat(rows.map(r => cols.map(c => q(r[c])).join(';'))).join('\r\n');
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); a.download = name + '.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    } else P.ui.xlsx([[REPORTS[s.rep].slice(0, 31), rows]], name);
  };
})(window.P);
