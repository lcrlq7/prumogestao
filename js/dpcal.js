/* Prumo — Datas do Departamento Pessoal: feriados, dias de profissões, feriados de categoria e datas de convenção coletiva,
 * com aviso antecipado para o DP. As datas próprias ficam em settings.dpDates (cadastradas pela diretoria/gerência). */
'use strict';
(function (P) {
  const D = P.date, esc = P.esc, V = P.V, A = P.actions, icon = V.icon;
  const db = () => P.store.db, U = () => P.state.user;
  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  P.PAGES.datasdp = ['admin', 'office', 'manager', 'employee'];

  const KINDS = {
    feriado: ['Feriado', 'st-sem', 7],
    profissao: ['Dia da profissão', 'es-aprovado', 7],
    feriado_cat: ['Feriado da categoria', 'es-correcao', 15],
    convencao: ['Convenção / data-base', 'st-sobrecarga', 30]
  };
  // dias de profissões de data fixa (sugestões: não são feriado; confira o que a convenção de cada sindicato garante)
  const PROF = [
    ['01-20', 'Dia do Farmacêutico'], ['04-07', 'Dia do Jornalista'], ['04-25', 'Dia do Contador'], ['05-12', 'Dia do Enfermeiro'],
    ['07-25', 'Dia do Motorista'], ['08-11', 'Dia do Advogado'], ['08-28', 'Dia do Bancário'], ['09-09', 'Dia do Administrador'],
    ['09-30', 'Dia da Secretária'], ['10-15', 'Dia do Professor'], ['10-18', 'Dia do Médico'], ['10-25', 'Dia do Dentista'],
    ['10-30', 'Dia do Comerciário'], ['12-11', 'Dia do Engenheiro']
  ];
  const custom = () => (db().settings.dpDates = db().settings.dpDates || []);
  const isDp = u => !!u && !!u.deptId && (() => { const d = P.dept(u.deptId); return !!d && (/pessoal/.test(norm(d.name)) || norm(d.code) === 'dp'); })();
  const canSee = u => !!u && (P.isGlobal(u) || isDp(u));
  const canEdit = u => !!u && P.isGlobal(u);

  // todas as ocorrências de um ano
  const ofYear = y => {
    const out = [], pad = n => String(n).padStart(2, '0');
    P.holidays.list(y).forEach(h => out.push({ key: 'h' + h.date, date: h.date, name: h.name, kind: 'feriado', scope: P.holidays.TYPES[h.type] || '', advance: KINDS.feriado[2] }));
    PROF.forEach(([md, name]) => out.push({ key: 'p' + md + y, date: y + '-' + md, name, kind: 'profissao', scope: 'Sugerido', advance: KINDS.profissao[2] }));
    custom().forEach(c => {
      const date = c.yearly ? y + '-' + String(c.date).slice(5) : c.date; if (!date || date.slice(0, 4) !== String(y)) return;
      out.push({ key: 'c' + c.id + y, id: c.id, date, name: c.name, kind: c.kind, scope: c.scope || '', notes: c.notes || '', advance: c.advance != null && c.advance !== '' ? Number(c.advance) : KINDS[c.kind][2], own: true });
    });
    return out.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
  };
  const daysTo = iso => Math.round((D.parse(iso) - P.today()) / 864e5);
  // as que estão dentro do prazo de aviso (ou dentro de um horizonte fixo)
  const upcoming = (horizon) => {
    const y = P.today().getFullYear(), all = ofYear(y).concat(ofYear(y + 1));
    return all.map(e => Object.assign({ left: daysTo(e.date) }, e)).filter(e => e.left >= 0 && (horizon != null ? e.left <= horizon : e.left <= e.advance));
  };
  const when = n => n === 0 ? 'hoje' : n === 1 ? 'amanhã' : 'em ' + n + ' dias';

  // avisa o DP (e a diretoria/gerência) uma única vez por data
  const remind = () => {
    const u = U(); if (!u || !canSee(u) || !P.notify) return;
    const list = upcoming(), notifs = (db().notifications = db().notifications || []);
    let changed = false;
    list.forEach(e => {
      const tag = 'dp:' + e.key; if (notifs.some(n => n.userId === u.id && n.key === tag)) return;
      P.notify([u.id], { type: 'dp', icon: 'calendar', title: KINDS[e.kind][0] + ' ' + when(e.left), text: e.name + ' · ' + D.fmt(e.date) + (e.scope ? ' · ' + e.scope : ''), link: 'datasdp' });
      const n = notifs[notifs.length - 1]; if (n) n.key = tag; changed = true;
    });
    if (changed) P.store.save();
  };
  setInterval(remind, 10 * 60e3); window.addEventListener('focus', remind); setTimeout(remind, 4000);

  P.dpCal = { canSee, upcoming, ofYear };

  const st = () => (P.state.dpc = P.state.dpc || { year: P.today().getFullYear(), kind: '' });
  const row = (e, u) => `<tr class="${e.left != null && e.left < 0 ? 'dim' : ''}"><td class="nowrap"><b>${esc(D.fmt(e.date))}</b><small class="obs">${esc(['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'][D.parse(e.date).getDay()])}${e.left != null && e.left >= 0 ? ' · ' + when(e.left) : ''}</small></td>
    <td><b>${esc(e.name)}</b>${e.scope ? `<small class="obs">${esc(e.scope)}</small>` : ''}${e.notes ? `<small class="obs">${esc(e.notes)}</small>` : ''}</td>
    <td><span class="badge ${KINDS[e.kind][1]}">${esc(KINDS[e.kind][0])}</span></td><td class="nowrap">${e.advance} dia(s) antes</td>
    <td class="actions-col">${e.own && canEdit(u) ? V.ibtn('trash', 'Excluir', { act: 'dpDel', attrs: `data-id="${esc(e.id)}"` }) : ''}</td></tr>`;
  const table = (list, u) => list.length ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>Data</th><th>O quê</th><th>Tipo</th><th>Aviso</th><th class="actions-col"></th></tr></thead><tbody>${list.map(e => row(e, u)).join('')}</tbody></table></div>` : V.empty('Nada por aqui.', 'calendar');

  V.datasdp = u => {
    if (!canSee(u)) throw new P.AccessError('Esta página é do Departamento Pessoal.');
    const s = st(), up = upcoming(60);
    const year = ofYear(s.year).filter(e => !s.kind || e.kind === s.kind).map(e => Object.assign({ left: daysTo(e.date) }, e));
    const head = V.pageHead('Datas do DP', 'Feriados, dias de profissões, feriados de categoria e datas de convenção. O DP é avisado com antecedência.', canEdit(u) ? V.btn('Cadastrar data', { act: 'dpNew', icon: 'plus', cls: 'primary' }) : '');
    return `${head}
      ${V.card('Próximos 60 dias', table(up, u), { cls: 'flush', sub: 'Cada data tem a sua antecedência de aviso (feriado e profissão: 7 dias; categoria: 15; convenção: 30).' })}
      <div class="toolbar tfilter">
        <label class="picker"><select data-set="dpc.year" aria-label="Ano">${[s.year - 1, s.year, s.year + 1].filter((v, i, a) => a.indexOf(v) === i).map(y => `<option value="${y}" ${y === s.year ? 'selected' : ''}>${y}</option>`).join('')}</select></label>
        <label class="picker"><select data-set="dpc.kind" aria-label="Tipo"><option value="">Todos os tipos</option>${Object.entries(KINDS).map(([k, v]) => `<option value="${k}" ${s.kind === k ? 'selected' : ''}>${v[0]}</option>`).join('')}</select></label>
        <span class="fine tf-count">${year.length} data(s) em ${s.year}</span></div>
      ${V.card('Calendário de ' + s.year, table(year, u), { cls: 'flush', sub: 'Feriados de Volta Redonda (RJ). Os dias de profissão marcados como "Sugerido" são só lembretes: confira na convenção de cada sindicato se geram folga. Datas de convenção e feriados de categoria são cadastrados por você.' })}`;
  };

  A.dpNew = () => {
    const u = U(); if (!canEdit(u)) return P.toast('Somente diretoria e gerência cadastram datas.', 'err');
    P.ui.modal({
      title: 'Cadastrar data do DP', submit: 'Salvar',
      body: `<div class="fgrid">
        <label class="field span2"><span>Nome</span><input id="dp-name" maxlength="120" placeholder="Ex.: Dia da Construção Civil · Data-base Sindicato do Comércio"></label>
        <label class="field"><span>Data</span><input type="date" id="dp-date" value="${D.iso(P.today())}"></label>
        <label class="field span2"><span>Tipo</span><select id="dp-kind">${Object.entries(KINDS).filter(([k]) => k !== 'feriado').map(([k, v]) => `<option value="${k}">${v[0]}</option>`).join('')}</select></label>
        <label class="field"><span>Avisar com quantos dias?</span><input type="number" id="dp-adv" min="0" max="365" placeholder="Padrão do tipo"></label>
        <label class="field span3"><span>Sindicato / categoria (opcional)</span><input id="dp-scope" maxlength="120" placeholder="Ex.: Sindicato da Construção Civil de Volta Redonda"></label>
        <label class="field span3"><span>Observação (opcional)</span><input id="dp-notes" maxlength="200" placeholder="Ex.: folga garantida pela convenção"></label>
        <label class="field check span3"><input type="checkbox" id="dp-yearly" checked><span>Repete todo ano na mesma data</span></label></div>`,
      onSubmit: () => {
        const name = $v('#dp-name'), date = $v('#dp-date');
        if (name.length < 3) throw new Error('Informe o nome da data.');
        if (!date) throw new Error('Informe a data.');
        custom().push({ id: P.uid('dp'), name, date, kind: $v('#dp-kind'), advance: $v('#dp-adv'), scope: $v('#dp-scope'), notes: $v('#dp-notes'), yearly: document.querySelector('#dp-yearly').checked, by: u.id });
        P.audit(u, 'Data do DP cadastrada', '', name + ' · ' + date); P.store.save(); P.toast('Data cadastrada.'); remind(); P.render();
      }
    });
  };
  const $v = s => String((document.querySelector(s) || {}).value || '').trim();
  A.dpDel = el => {
    const u = U(); if (!canEdit(u)) return;
    const c = custom().find(x => x.id === el.dataset.id); if (!c || !confirm('Excluir "' + c.name + '"?')) return;
    db().settings.dpDates = custom().filter(x => x.id !== c.id); P.audit(u, 'Data do DP excluída', '', c.name); P.store.save(); P.render();
  };

  // aviso na tela inicial
  const origDash = V.dashboard;
  V.dashboard = u => {
    const html = origDash(u);
    if (!canSee(u)) return html;
    const up = upcoming().slice(0, 4); if (!up.length) return html;
    return `<div class="banner warn">${icon('calendar')}<div><b>Datas do DP chegando:</b> ${up.map(e => esc(e.name) + ' (' + D.fmt(e.date) + ', ' + when(e.left) + ')').join(' · ')} ${V.btn('Ver datas', { go: 'datasdp', cls: 'sm ghost' })}</div></div>` + html;
  };
})(window.P);
