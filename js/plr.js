/*
 * Prumo — PLR (rateio de 5% dos honorários)
 *
 * Regime de caixa: competências de novembro a outubro (recebidas de dezembro a novembro), pago em dezembro.
 * Montante = 5% do honorário de cada empresa marcada "Entra no rateio", somado a cada mês PAGO
 * (mês com título em aberto na inadimplência não entra até ser quitado). Calculado no banco (plr_summary),
 * que devolve só totais: o honorário de cada empresa fica só com a diretoria (tabela company_fees).
 * Participam: funcionários, gestores e o gerente do escritório ativos. Diretores não entram; desligados perdem o direito.
 * Avos: meses do ciclo em que a pessoa trabalhou 15 dias ou mais (regra do 13º), a partir da data de contratação.
 * Valor de 1 avo = montante ÷ total de avos de todos (100% distribuído). Cada pessoa: avos × valor do avo.
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

  P.PAGES.plr = ['admin', 'office', 'manager'];
  const brl = c => ((c || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const toC = v => Math.round((Number(String(v || '').replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.')) || 0) * 100);
  const fees = () => (db().companyFees = db().companyFees || []);
  const ym = d => D.iso(d).slice(0, 7);

  /* ---------- Ciclo e avos ---------- */
  const cycle = (ref = P.today()) => {
    const y = ref.getMonth() === 11 ? ref.getFullYear() : ref.getFullYear() - 1;
    // regime de caixa: competências nov a out, recebidas de dez a nov; PLR paga em dezembro
    const months = []; for (let i = 0; i < 12; i++) months.push(new Date(y, 10 + i, 1));
    return { start: months[0], end: D.monthEnd(months[11]), months, label: 'nov/' + String(y).slice(2) + ' a out/' + String(y + 1).slice(2) + ' (recebidos dez a nov)', payYear: y + 1 };
  };
  const eligible = x => !!x && x.active !== false && ['employee', 'manager', 'office'].includes(x.role);
  const hireOf = x => x.hiredAt || x.createdAt || null;
  // regra do 13º: o mês conta se a pessoa trabalhou 15 dias ou mais nele
  function avosOf(x, cyc = cycle(), upTo) {
    if (!eligible(x)) return { total: 0, sofar: 0, months: [] };
    const hire = hireOf(x); if (!hire) return { total: 0, sofar: 0, months: [], noDate: true };
    const h = D.parse(hire), cur = P.today(); let total = 0, sofar = 0; const months = [];
    cyc.months.forEach(ms => {
      const me = D.monthEnd(ms); if (h > me) { months.push(0); return; }
      const start = h > ms ? h : ms, days = Math.round((me - start) / 864e5) + 1;
      const ok = days >= 15 ? 1 : 0; months.push(ok); total += ok; if (ms <= (upTo || cur)) sofar += ok;
    });
    return { total, sofar, months };
  }

  /* ---------- Montante (banco em produção; cálculo local na demonstração) ---------- */
  let summary = null, asked = 0, loading = false;
  function localSummary() {
    const cyc = cycle(), cur = ym(P.today()), dq = db().delinquency || [];
    let montante = 0, emAberto = 0, previsto = 0; const porMes = {};
    fees().filter(f => f.inRateio && f.fee > 0).forEach(f => {
      const part = Math.round(f.fee * 0.05), since = f.since || ym(cyc.start);
      const r = dq.find(x => x.id === f.id), open = new Set(((r && r.manual !== 'quitado' && r.items) || []).map(i => String(i.due || '').slice(0, 7)));
      cyc.months.forEach(ms => {
        const k = ym(ms); if (k < since) return;
        const st = (f.manual || {})[k] || (k >= cur ? 'a_vencer' : open.has(k) ? 'aberto' : 'pago');
        if (st === 'pago') { montante += part; porMes[k] = (porMes[k] || 0) + part; } else if (st === 'aberto') emAberto += part; else previsto += part;
      });
    });
    return { start: ym(cyc.start), end: ym(cyc.months[11]), montante, emAberto, previsto, empresas: fees().filter(f => f.inRateio && f.fee > 0).length, porMes, calculadoEm: D.stamp() };
  }
  P.plr = {
    cycle, avosOf, eligible,
    refresh(force) {
      if (!P.isLive || !P.backend || !P.backend.client) { summary = localSummary(); return; }
      if (loading || (!force && Date.now() - asked < 20000)) return;
      loading = true; asked = Date.now();
      P.backend.client.rpc('plr_summary', { p_start: D.iso(cycle().start) }).then(({ data, error }) => {
        loading = false; if (error || !data) return;
        const changed = JSON.stringify(data) !== JSON.stringify(summary); summary = data;
        if (changed && S().user && ['dashboard', 'plr', 'financeiro'].includes(S().route.page) && (!$('#modal-root') || $('#modal-root').hidden)) P.render();
      }, () => { loading = false; });
    },
    get summary() { if (!summary || !P.isLive) P.plr.refresh(); return summary; },
    // rateio de todos: valor do avo = montante ÷ total de avos (100% distribuído)
    table() {
      const cyc = cycle(), sm = P.plr.summary || { montante: 0, previsto: 0 };
      const people = db().users.filter(eligible).map(x => ({ x, a: avosOf(x, cyc) })).sort((p, q) => p.x.name.localeCompare(q.x.name));
      const totalAvos = people.reduce((t, p) => t + p.a.total, 0);
      const avo = totalAvos ? sm.montante / totalAvos : 0, avoProj = totalAvos ? (sm.montante + (sm.previsto || 0)) / totalAvos : 0;
      return { cyc, sm, people, totalAvos, avo, avoProj };
    }
  };
  // qualquer alteração (empresa, honorário, inadimplência, pessoa) atualiza o rateio
  window.addEventListener('prumo:remote', () => P.plr.refresh(true));

  /* ---------- Cartão no dashboard (valor individual) ---------- */
  const myCard = u => {
    if (!eligible(u)) return '';
    const t = P.plr.table(), a = avosOf(u, t.cyc), mine = Math.round(a.total * t.avo), proj = Math.round(a.total * t.avoProj);
    const hire = hireOf(u);
    return V.card(`${icon('wallet')} Minha PLR · ciclo ${t.cyc.label}`, `<div class="plr-me">
        <div><div class="plr-val">${brl(mine)}</div><small class="muted">${a.total}/12 avos${hire ? ' · contratação em ' + D.fmt(hire) : ''} · pagamento em dez/${t.cyc.payYear}</small></div>
        <div class="plr-bar" aria-label="${a.total} de 12 avos">${a.months.map((m, i) => `<i class="${m ? 'on' : ''}" title="${D.monthLabel(t.cyc.months[i])}"></i>`).join('')}</div>
        <div class="plr-mini"><span>Montante do ciclo<b>${brl(t.sm ? t.sm.montante : 0)}</b></span><span>Valor de 1 avo<b>${brl(Math.round(t.avo))}</b></span><span>Previsão até novembro<b>${brl(proj)}</b></span></div>
        <p class="fine">${icon('refresh')} Valor parcial: cresce a cada mês pago pelas empresas do rateio${t.sm && t.sm.calculadoEm ? ' · atualizado em ' + esc(t.sm.calculadoEm) : ''}.${!u.hiredAt ? ' <b>Data de contratação ainda não informada pela gestão</b>: usando a data de cadastro.' : ''}</p></div>`, { cls: 'plr-card' });
  };
  const origDash = V.dashboard;
  V.dashboard = u => {
    const html = origDash(u), card = myCard(u);
    if (!card) return html;
    const box = document.createElement('div'); box.innerHTML = html;
    // logo abaixo do resumo da semana (ou do título, se não houver resumo)
    const head = box.querySelector('.wsum') || box.querySelector('.page-head');
    if (head) head.insertAdjacentHTML('afterend', card); else box.insertAdjacentHTML('afterbegin', card);
    return box.innerHTML;
  };

  /* ---------- Aba PLR (diretoria, gerência e gestores) ---------- */
  V.plr = u => {
    if (!P.PAGES.plr.includes(u.role)) deny('A aba PLR é da diretoria, da gerência e dos gestores.');
    const t = P.plr.table(), sm = t.sm || {}, dir = u.role === 'admin';
    const months = t.cyc.months.map(ym);
    const missing = t.people.filter(p => !p.x.hiredAt);
    return `${V.pageHead('PLR · rateio de honorários', `Ciclo ${t.cyc.label} · pagamento em dezembro/${t.cyc.payYear}. 5% dos honorários pagos pelas empresas do rateio, divididos pelo total de avos.`,
      V.btn('Exportar Excel', { act: 'plrExport', icon: 'download' }) + (dir ? V.btn('Empresa no rateio', { act: 'plrCompany', icon: 'plus', cls: 'primary' }) : ''))}
      ${!sm.calculadoEm ? `<div class="banner info">${icon('clock')}<div>Calculando o montante…</div></div>` : ''}
      ${missing.length ? `<div class="banner warn">${icon('alert')}<div><b>${missing.length} pessoa${missing.length > 1 ? 's' : ''} sem data de contratação</b> (usando a data de cadastro): ${missing.slice(0, 6).map(p => esc(p.x.name)).join(', ')}${missing.length > 6 ? '…' : ''}. Informe em Funcionários → Editar.</div></div>` : ''}
      <div class="kpis k4">
        ${V.kpi('Montante (5% recebidos)', brl(sm.montante), { icon: 'wallet', sub: (sm.empresas || 0) + ' empresa(s) no rateio' })}
        ${V.kpi('Valor de 1 avo', brl(Math.round(t.avo)), { icon: 'scale', sub: t.totalAvos + ' avos no total · 12/12 = ' + brl(Math.round(t.avo * 12)) })}
        ${V.kpi('Pessoas no rateio', t.people.length, { icon: 'users', sub: 'funcionários, gestores e gerência' })}
        ${V.kpi('Não entrou (inadimplência)', brl(sm.emAberto), { icon: 'alert', sub: 'entra quando for quitado', tone: sm.emAberto ? 'bad' : '' })}
      </div>
      <div class="grid g-1-1">
        ${V.card('Montante por mês (pago)', C.slot({ type: 'bars', data: months.map((m, i) => ({ label: D.monthLabel(t.cyc.months[i]), value: ((sm.porMes || {})[m] || 0) / 100, tip: D.monthLabel(t.cyc.months[i], true) + ': ' + brl((sm.porMes || {})[m] || 0) })), height: 210, aria: 'Montante por mês' }), { sub: 'Previsão até novembro, se tudo for pago: ' + brl((sm.montante || 0) + (sm.previsto || 0)) })}
        ${V.card('Como é calculado', `<div class="prose"><p><b>Montante:</b> 5% do honorário de cada empresa do rateio, a cada mês pago. Mês com pendência na Inadimplência só entra quando for quitado.</p>
          <p><b>Avos:</b> meses do ciclo em que a pessoa trabalhou 15 dias ou mais (regra do 13º), contados da data de contratação.</p>
          <p><b>Valor:</b> montante ÷ total de avos = valor de 1 avo; cada pessoa recebe avos × valor do avo. Diretores não entram; desligados perdem o direito.</p></div>`)}
      </div>
      ${V.card('Rateio por pessoa', `<div class="table-wrap"><table class="tbl"><thead><tr><th>Colaborador</th><th>Função</th><th>Departamento</th><th>Contratação</th><th class="num">Avos</th><th class="num">A receber hoje</th><th class="num">Previsão (nov)</th></tr></thead><tbody>
        ${t.people.map(p => `<tr><td>${V.person(p.x, false)}</td><td>${esc(P.ROLES[p.x.role])}</td><td>${esc((P.dept(p.x.deptId) || {}).name || '—')}</td>
          <td class="nowrap">${p.x.hiredAt ? D.fmt(p.x.hiredAt) : `<span class="muted" title="Data de contratação não informada">${hireOf(p.x) ? D.fmt(hireOf(p.x)) + ' *' : '—'}</span>`}</td>
          <td class="num">${p.a.total}/12</td><td class="num strong">${brl(Math.round(p.a.total * t.avo))}</td><td class="num">${brl(Math.round(p.a.total * t.avoProj))}</td></tr>`).join('')}
        </tbody><tfoot><tr><th colspan="4">Total (${t.people.length} pessoas)</th><th class="num">${t.totalAvos}</th><th class="num">${brl(t.people.reduce((s, p) => s + Math.round(p.a.total * t.avo), 0))}</th><th class="num">${brl(t.people.reduce((s, p) => s + Math.round(p.a.total * t.avoProj), 0))}</th></tr></tfoot></table></div>`,
        { cls: 'flush', sub: '* data de cadastro usada enquanto a data de contratação não for informada' })}
      ${dir ? V.card('Empresas no rateio · honorários (só diretoria)', fees().filter(f => f.inRateio).length ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>Empresa</th><th>No rateio desde</th><th class="num">Honorário mensal</th><th class="num">5% / mês</th><th class="actions-col"></th></tr></thead><tbody>
        ${fees().filter(f => f.inRateio).map(f => { const c = (db().companies || []).find(x => x.id === f.id) || { name: f.name || '—' }; return `<tr><td><b>${esc(c.name)}</b>${P.delinq && P.delinq.chip ? P.delinq.chip(c.name) : ''}</td><td>${f.since ? D.monthLabel(D.parse(f.since + '-01'), true) : '—'}</td><td class="num">${brl(f.fee)}</td><td class="num">${brl(Math.round(f.fee * 0.05))}</td><td class="actions-col">${V.ibtn('edit', 'Editar', { act: 'plrCompany', attrs: `data-id="${esc(f.id)}"` })}</td></tr>`; }).join('')}
        </tbody></table></div>` : V.empty('Nenhuma empresa no rateio. Use "Empresa no rateio" ou edite a empresa na aba Empresas.', 'briefcase'), { cls: 'flush' }) : ''}`;
  };

  /* ---------- Empresa no rateio (diretoria) ---------- */
  A.plrCompany = el => {
    if (!U() || U().role !== 'admin') return P.toast('Somente a diretoria cadastra honorários e o rateio.', 'err');
    const id = el.dataset.id || null, f = id ? fees().find(x => x.id === id) : null, comp = id ? (db().companies || []).find(c => c.id === id) : null;
    const comps = (db().companies || []).filter(c => c.active !== false).sort((a, b) => a.name.localeCompare(b.name));
    P.ui.modal({
      title: comp ? 'Rateio · ' + esc(comp.name) : 'Empresa no rateio (PLR)', submit: 'Salvar', wide: true,
      body: `<div class="fgrid">
        ${comp ? `<p class="prose span3"><b>${esc(comp.name)}</b></p>` : `<div class="field span3"><span>Empresa</span>${P.companyPickerHtml('plr-co')}</div>`}
        <label class="field check span3"><input type="checkbox" id="plr-in" ${!f || f.inRateio ? 'checked' : ''}><span><b>Entra no rateio</b> (5% dos honorários pagos vão para a PLR)</span></label>
        <label class="field"><span>Honorário mensal (R$)</span><input id="plr-fee" inputmode="decimal" value="${f && f.fee ? (f.fee / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : ''}"></label>
        <label class="field"><span>Entrou na carteira em</span><input type="month" id="plr-since" value="${f && f.since ? f.since : ym(P.today())}"></label>
        <div class="field"><span>Contribuição</span><b id="plr-5">${f && f.fee ? brl(Math.round(f.fee * 0.05)) + '/mês' : '—'}</b></div></div>
        <p class="fine">${icon('lock')} O honorário fica visível só para a diretoria. Os demais veem apenas o montante total.</p>`,
      onSubmit: m => {
        const name = comp ? comp.name : $('#plr-co', m).value.trim(), c = comp || comps.find(x => x.name === name);
        if (!c) throw new Error('Escolha uma empresa do cadastro.');
        const fee = toC($('#plr-fee', m).value), since = $('#plr-since', m).value, inR = $('#plr-in', m).checked;
        if (inR && !(fee > 0)) throw new Error('Informe o honorário mensal.');
        if (!since) throw new Error('Informe o mês em que a empresa entrou na carteira.');
        let r = fees().find(x => x.id === c.id);
        if (!r) { r = { id: c.id, history: [] }; fees().push(r); }
        (r.history = r.history || []).push({ at: D.stamp(), by: U().id, from: r.fee || 0, to: fee, inRateio: inR, since });
        Object.assign(r, { name: c.name, fee, since, inRateio: inR, updatedAt: D.stamp() });
        P.audit(U(), 'PLR: empresa ' + (inR ? 'no rateio' : 'fora do rateio'), c.id, c.name);
        P.store.save(); setTimeout(() => P.plr.refresh(true), 1500); summary = P.isLive ? summary : localSummary();
        P.toast('Rateio atualizado.'); P.render();
      }
    });
    if (!comp) P.companyPicker(comps, 'plr-co');
    const fee = $('#plr-fee'); if (fee) fee.addEventListener('input', () => { const v = toC(fee.value); $('#plr-5').textContent = v ? brl(Math.round(v * 0.05)) + '/mês' : '—'; });
  };
  A.plrExport = () => {
    const t = P.plr.table();
    P.ui.xlsx([['Rateio ' + t.cyc.label.replace(/\//g, '-'), t.people.map(p => ({ 'Colaborador': p.x.name, 'Função': P.ROLES[p.x.role], 'Departamento': (P.dept(p.x.deptId) || {}).name || '', 'Contratação': hireOf(p.x) ? D.fmt(hireOf(p.x)) : '', 'Avos': p.a.total, 'A receber hoje (R$)': Math.round(p.a.total * t.avo) / 100, 'Previsão nov (R$)': Math.round(p.a.total * t.avoProj) / 100 }))],
      ['Resumo', [{ 'Ciclo': t.cyc.label, 'Montante (R$)': (t.sm ? t.sm.montante : 0) / 100, 'Total de avos': t.totalAvos, 'Valor de 1 avo (R$)': Math.round(t.avo) / 100, 'Em aberto - inadimplência (R$)': (t.sm ? t.sm.emAberto : 0) / 100 }]]], 'plr-' + t.cyc.label.replace(/\W+/g, '-'));
  };
})(window.P);
