/* Prumo — alerta de obrigações passíveis de multa
 * - A atividade é reconhecida pelo nome (lista abaixo): não é preciso editar atividade por atividade.
 * - Etiqueta "Multa · alta/média" nas tarefas (a penalidade aparece ao passar o mouse), filtro "Só passíveis de multa",
 *   quadro "Obrigações com risco de multa" no painel inicial e aviso no sino quando faltam 3 dias e quando atrasa. */
'use strict';
(function (P) {
  const D = P.date, esc = P.esc, V = P.V, A = P.actions;
  const db = () => P.store.db, U = () => P.state.user;
  const DAYS = 3;
  // [padrão no nome da atividade, gravidade, penalidade resumida]
  const RULES = [
    [/pgdas|simples nacional \(/i, 'alta', 'DAS em atraso: multa de mora de 0,33% ao dia (até 20%) mais Selic; PGDAS-D fora do prazo gera MAED.'],
    [/dctf|reinf/i, 'alta', 'DCTFWeb / EFD-Reinf: 2% ao mês sobre os tributos declarados, mínimo de R$ 200 a R$ 500.'],
    [/efd.?contribui/i, 'alta', 'EFD-Contribuições: multa por mês de atraso (R$ 500 a R$ 1.500).'],
    [/sped|icms\/ipi|efd.?icms/i, 'alta', 'Escrituração fiscal: multa estadual por atraso ou omissão.'],
    [/\becd\b|\becf\b|obriga[cç][aã]o acess|defis|dirf|gfip|dimob|dmed/i, 'alta', 'Obrigação acessória entregue em atraso: multa de até 0,25% ao mês sobre o lucro ou a receita.'],
    [/esocial/i, 'alta', 'eSocial: multa por evento não enviado ou enviado fora do prazo.'],
    [/fgts/i, 'alta', 'FGTS em atraso: multa e juros, mais risco de autuação trabalhista.'],
    [/rescis/i, 'alta', 'Rescisão paga após 10 dias: multa do art. 477 da CLT (um salário do empregado).'],
    [/parcelamento/i, 'alta', 'Parcela em atraso: multa e risco de exclusão do parcelamento.'],
    [/apura[cç][aã]o|emiss[aã]o de guias|\bguias?\b/i, 'alta', 'Imposto pago em atraso: multa de mora de 0,33% ao dia (até 20%) mais Selic.'],
    [/folha de pagamento/i, 'media', 'Salário pago após o 5º dia útil: multa da CLT ou da convenção coletiva.'],
    [/^f[eé]rias/i, 'media', 'Férias pagas fora do prazo (2 dias antes): pagamento em dobro.'],
    [/admiss/i, 'media', 'Empregado sem registro no eSocial: multa por empregado.'],
    [/pr[oó].?labore/i, 'media', 'INSS do pró-labore em atraso: multa e juros.'],
    [/alvar[aá]|licen[cç]a de funcionamento/i, 'media', 'Alvará vencido: multa municipal e risco de interdição.'],
    [/certid/i, 'media', 'Certidão vencida: bloqueia licitações, crédito e contratos.'],
  ];
  // trabalho interno sobre algo já fechado (ex.: "Lançamento de Folha de Pagamento" no Contábil): não gera multa
  const NO_FINE = /lan[cç]amento|contabiliza/i;
  const cache = new Map();
  const ofName = n => {
    n = String(n || ''); if (!n) return null;
    if (!cache.has(n)) { const r = !NO_FINE.test(n) && RULES.find(([re]) => re.test(n)); cache.set(n, r ? { sev: r[1], text: r[2] } : null); }
    return cache.get(n);
  };
  // tarefa: pelo nome da atividade; sem atividade, pelo título
  const fineOf = t => { const a = t && t.activityId && P.act(t.activityId); return ofName(a ? a.name : t && t.title); };
  P.fine = { of: fineOf, ofName };
  const SEV = { alta: 'alta', media: 'média' };
  const today = () => D.iso(P.today()), soonLimit = () => D.iso(D.add(P.today(), DAYS));
  const stage = t => !t.due ? '' : t.due < today() ? 'late' : t.due <= soonLimit() ? 'soon' : 'ok';

  /* ---------- Etiqueta na tarefa ---------- */
  const origExtra = V.taskExtra;
  V.taskExtra = (u, t) => {
    const base = origExtra ? origExtra(u, t) : '', f = fineOf(t);
    if (!f) return base;
    return `<span class="badge fine-tag ${f.sev === 'alta' ? 'st-sobrecarga' : 'st-baixa'}" title="Passível de multa · gravidade ${SEV[f.sev]}: ${esc(f.text)}">${V.icon('alert')}Multa · ${SEV[f.sev]}</span>` + base;
  };

  /* ---------- Filtro "Só passíveis de multa" ---------- */
  const origFilter = V.taskFilter;
  V.taskFilter = list => { const l = origFilter(list); return (P.state.tf || {}).fine ? l.filter(fineOf) : l; };
  const origBar = V.taskFilterBar;
  V.taskFilterBar = (base, shown) => {
    const html = origBar(base, shown), on = !!(P.state.tf || {}).fine;
    const box = `<label class="check-inline fine-chk"><input type="checkbox" data-set="tf.fine" ${on ? 'checked' : ''}> Só passíveis de multa</label>`;
    const i = html.indexOf('<span class="fine tf-count">');
    return i < 0 ? html : html.slice(0, i) + (on && html.indexOf('tfClear') < 0 ? V.btn('Limpar filtros', { act: 'tfClear', icon: 'x', cls: 'sm ghost' }) : '') + box + html.slice(i);
  };
  A.fineView = () => { P.state.tf = Object.assign({}, P.state.tf, { fine: true, late: false }); P.state.taskTab = 'pendente'; P.state.taskPg = {}; P.go('atividades'); };

  /* ---------- Quadro no painel inicial ---------- */
  // o que cada um enxerga: diretoria/gerência tudo, gestor o departamento, os demais as próprias tarefas
  const visible = u => (db().tasks || []).filter(t => t.status === 'pendente' && t.due && (P.isGlobal(u) || (u.role === 'manager' ? t.deptId === u.deptId : t.userId === u.id)) && fineOf(t));
  const card = u => {
    const all = visible(u); if (!all.length) return '';
    const late = all.filter(t => stage(t) === 'late'), soon = all.filter(t => stage(t) === 'soon');
    const mon = today().slice(0, 7), ok = all.filter(t => stage(t) === 'ok' && t.due.slice(0, 7) === mon).length;
    const list = late.concat(soon).sort((a, b) => a.due.localeCompare(b.due) || (fineOf(a).sev === 'alta' ? -1 : 1)).slice(0, 8);
    const diff = d => Math.round((D.parse(d) - D.parse(today())) / 864e5);
    const sit = t => { const n = diff(t.due); return n < 0 ? `<span class="badge st-sobrecarga">Atrasada ${-n} dia${n < -1 ? 's' : ''}</span>` : `<span class="badge st-baixa">${n === 0 ? 'Vence hoje' : n === 1 ? 'Vence amanhã' : 'Vence em ' + n + ' dias'}</span>`; };
    const showWho = u.role !== 'employee' || P.isGlobal(u);
    const rows = list.map(t => { const f = fineOf(t), dp = P.dept(t.deptId), who = P.user(t.userId); return `<li class="fr-row ${stage(t)}" title="${esc(f.text)}">
        <div class="fr-main"><b>${esc(t.title)}${t.client && t.title.indexOf(t.client) < 0 ? ' — ' + esc(t.client) : ''}</b>
          <small>${dp ? esc(dp.name) + ' · ' : ''}${showWho && who ? esc(who.name) + ' · ' : ''}<span class="badge fine-tag ${f.sev === 'alta' ? 'st-sobrecarga' : 'st-baixa'}">${V.icon('alert')}Multa · ${SEV[f.sev]}</span></small></div>
        <span class="fr-due">${D.fmt(t.due)}</span>${sit(t)}</li>`; }).join('');
    const body = `<div class="fr-kpis">
        <div class="fr-k late"><small>Atrasadas com multa</small><b>${late.length}</b></div>
        <div class="fr-k soon"><small>Vencem em até ${DAYS} dias</small><b>${soon.length}</b></div>
        <div class="fr-k"><small>No prazo este mês</small><b>${ok}</b></div></div>
      ${rows ? `<ul class="fr-list">${rows}</ul>` : `<p class="fine">${V.icon('check')} Nenhuma obrigação com multa atrasada ou vencendo nos próximos ${DAYS} dias.</p>`}`;
    return V.card(`${V.icon('alert')} Obrigações com risco de multa`, body, { cls: 'fine-card', actions: V.btn('Ver todas', { act: 'fineView', icon: 'right', cls: 'ghost sm' }) });
  };
  const origDash = V.dashboard;
  V.dashboard = u => {
    const html = origDash(u), c = card(u);
    if (!c) return html;
    const box = document.createElement('div'); box.innerHTML = html;
    const head = box.querySelector('.wsum') || box.querySelector('.page-head');
    if (head) head.insertAdjacentHTML('afterend', c); else box.insertAdjacentHTML('afterbegin', c);
    return box.innerHTML;
  };

  /* ---------- Aviso no sino: uma vez ao entrar na janela de 3 dias e outra ao atrasar ---------- */
  // feito no navegador do responsável (evita aviso repetido); vai para ele e para o gestor do departamento
  const sent = u => { try { return JSON.parse(localStorage.getItem('prumo.fine.' + u.id) || '{}'); } catch (e) { return {}; } };
  const keep = (u, m) => { try { localStorage.setItem('prumo.fine.' + u.id, JSON.stringify(m)); } catch (e) { } };
  const notify = () => {
    const u = U(); if (!u || !P.notify) return;
    const m = sent(u), now = today(); let n = 0;
    Object.keys(m).forEach(k => { if (m[k] < D.iso(D.add(P.today(), -60))) delete m[k]; });
    (db().tasks || []).forEach(t => {
      if (t.userId !== u.id || t.status !== 'pendente' || !t.due) return;
      const st = stage(t), f = st !== 'ok' && fineOf(t); if (!f) return;
      const k = t.id + ':' + st; if (m[k]) return;
      const already = (db().notifications || []).some(x => x.userId === u.id && x.type === 'multa' && x.link === 'atividades' && x.text.indexOf('#' + t.id) >= 0 && x.title.indexOf(st === 'late' ? 'atrasada' : 'vence') >= 0);
      m[k] = now; if (already) return;
      const mgrs = (db().users || []).filter(x => x.active !== false && x.role === 'manager' && x.deptId === t.deptId && x.id !== u.id).map(x => x.id);
      const title = st === 'late' ? 'Obrigação atrasada, sujeita a multa' : 'Obrigação vence em breve, sujeita a multa';
      const text = `${t.title}${t.client && t.title.indexOf(t.client) < 0 ? ' — ' + t.client : ''} · prazo ${D.fmt(t.due)} · ${(P.user(t.userId) || {}).name || ''}. ${f.text} (#${t.id})`;
      P.notify([u.id].concat(st === 'late' ? mgrs : []), { type: 'multa', icon: 'alert', title, text, link: 'atividades' }); n++;
    });
    keep(u, m);
    if (n) { P.store.save(); if (P.render && (!document.querySelector('#modal-root') || document.querySelector('#modal-root').hidden)) P.render(); }
  };
  setTimeout(notify, 6000);
  setInterval(notify, 30 * 60e3);
})(window.P);
