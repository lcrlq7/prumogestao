/*
 * Prumo — Agenda: reuniões e eventos com participantes
 *
 * - Qualquer pessoa agenda; os convidados seguem as regras da aba Comunicação (P.chat.canChat):
 *   funcionário convida o próprio gestor; gestor convida a equipe, outros gestores e o gerente;
 *   gerente convida gestores e diretoria; a diretoria pode convidar todo o escritório.
 * - Cada reunião/evento aparece só para quem criou e para os participantes.
 * - Os convidados recebem notificação ao criar, alterar e cancelar, e um lembrete no dia.
 * Eventos antigos sem participantes (prazos e eventos por departamento) continuam valendo como antes.
 * Carregado antes do app.js: ações entram por P.ext.actions.
 */
'use strict';
(function (P) {
  const D = P.date, esc = P.esc, V = P.V, icon = V.icon;
  const db = () => P.store.db;
  const S = () => P.state;
  const $ = (s, r = document) => r.querySelector(s);
  const A = P.ext.actions;
  const deny = msg => { throw new P.AccessError(msg); };
  const KIND = { reuniao: 'Reunião', evento: 'Evento' };

  const invitable = u => {
    const all = db().users.filter(x => x.active !== false && x.id !== u.id);
    return (u.role === 'admin' ? all : all.filter(x => P.chat.canChat(u, x))).sort((a, b) => P.LEVEL[b.role] - P.LEVEL[a.role] || a.name.localeCompare(b.name));
  };
  const canEdit = (u, e) => !!e && !!e.participants && (e.createdBy === u.id || u.role === 'admin');
  // Visível para quem consulta: reunião/evento com participantes → criador e convidados; antigos → regra por departamento
  const visible = (u, e, scope) => {
    if (e.canceled) return false;
    if (e.participants) return e.createdBy === u.id || e.participants.includes(u.id);
    return !e.deptId || (P.isGlobal(u) ? (!scope || e.deptId === scope) : e.deptId === u.deptId);
  };
  const when = e => D.fmt(e.date) + (e.start ? ' · ' + e.start + (e.end ? '–' + e.end : '') : '');

  P.agenda = {
    KIND, invitable, canEdit,
    forUser: (u, scope) => db().events.filter(e => visible(u, e, scope)),
    save(u, data) {
      const title = String(data.title || '').trim();
      if (!KIND[data.kind]) deny('Escolha o tipo: reunião ou evento.');
      if (title.length < 3) deny('Informe um título com pelo menos 3 letras.');
      if (!data.date) deny('Informe a data.');
      if (data.date < D.iso(P.today())) deny('A data não pode estar no passado.');
      if (!data.start) deny('Informe o horário de início.');
      if (data.end && data.end <= data.start) deny('O horário de término deve ser depois do início.');
      const allowed = new Set(invitable(u).map(x => x.id));
      const parts = [...new Set(data.participants || [])].filter(id => id !== u.id);
      if (!parts.length) deny('Escolha pelo menos um participante.');
      const bad = parts.filter(id => !allowed.has(id));
      if (bad.length) deny('Pelas regras de comunicação, você não pode convidar: ' + bad.map(id => (P.user(id) || {}).name).join(', ') + '.');
      let e = data.id && db().events.find(x => x.id === data.id);
      if (e && !canEdit(u, e)) deny('Somente quem agendou (ou a diretoria) altera este compromisso.');
      const isNew = !e;
      const before = e ? JSON.stringify([e.date, e.start, e.end, e.place]) : '';
      const prevParts = e ? e.participants.slice() : [];
      if (!e) { e = { id: P.uid('ev'), createdBy: u.id, createdAt: D.stamp() }; db().events.push(e); }
      Object.assign(e, { type: data.kind, title, date: data.date, start: data.start, end: data.end || '', place: String(data.place || '').trim(), notes: String(data.notes || '').trim(), participants: parts, deptId: null });
      const org = P.user(e.createdBy) || u;
      if (isNew) P.notify(parts, { type: 'agenda', icon: 'calendar', title: `Convite: ${KIND[e.type].toLowerCase()} ${e.title}`, text: `${when(e)}${e.place ? ' · ' + e.place : ''} · agendado por ${org.name}.`, link: 'calendario' });
      else {
        const added = parts.filter(id => !prevParts.includes(id)), removed = prevParts.filter(id => !parts.includes(id));
        const changed = before !== JSON.stringify([e.date, e.start, e.end, e.place]);
        if (added.length) P.notify(added, { type: 'agenda', icon: 'calendar', title: `Convite: ${KIND[e.type].toLowerCase()} ${e.title}`, text: `${when(e)}${e.place ? ' · ' + e.place : ''} · agendado por ${org.name}.`, link: 'calendario' });
        if (changed) P.notify(parts.filter(id => !added.includes(id)), { type: 'agenda', icon: 'calendar', title: `${KIND[e.type]} alterada: ${e.title}`, text: `Novo horário: ${when(e)}${e.place ? ' · ' + e.place : ''}.`, link: 'calendario' });
        if (removed.length) P.notify(removed, { type: 'agenda', icon: 'x', title: `Você não participa mais: ${e.title}`, text: when(e), link: 'calendario' });
      }
      P.audit(u, isNew ? KIND[e.type] + ' agendada' : KIND[e.type] + ' alterada', e.id, e.title + ' · ' + when(e) + ' · ' + parts.length + ' participante(s)');
      P.store.save(); return e;
    },
    cancel(u, id) {
      const e = db().events.find(x => x.id === id);
      if (!canEdit(u, e)) deny('Somente quem agendou (ou a diretoria) cancela este compromisso.');
      e.canceled = true;
      P.notify(e.participants.concat(e.createdBy).filter(x => x !== u.id), { type: 'agenda', icon: 'x', title: `${KIND[e.type]} cancelada: ${e.title}`, text: `${when(e)} · cancelada por ${u.name}.`, link: 'calendario' });
      P.audit(u, KIND[e.type] + ' cancelada', e.id, e.title); P.store.save();
    }
  };

  /* ---------- Visual (usado pelo calendário em views2) ---------- */
  // Etiqueta no dia do calendário (só reuniões e eventos)
  V.agendaTags = list => list.filter(e => e.type === 'reuniao' || e.type === 'evento').sort((a, b) => (a.start || '') < (b.start || '') ? -1 : 1)
    .map(e => `<i class="tag ${e.type}" title="${esc(KIND[e.type] + ': ' + e.title)}">${e.start ? `<b>${e.start}</b> ` : ''}${esc(e.title)}</i>`);
  // Detalhe no painel lateral
  V.agendaItem = (u, e) => {
    const isMeet = e.type === 'reuniao', parts = (e.participants || []).map(id => P.user(id)).filter(Boolean), org = P.user(e.createdBy);
    if (e.type === 'prazo') return `<div class="evt prazo">${icon('clock')}<span><b>${esc(e.title)}</b><small>${e.deptId ? esc(P.dept(e.deptId).name) : 'Todos os departamentos'} · Prazo</small></span></div>`;
    return `<div class="evt ${e.type}">${icon(isMeet ? 'users' : 'calendar')}<span>
      <b>${esc(e.title)}</b>
      <small>${KIND[e.type] || 'Evento'}${e.start ? ' · ' + e.start + (e.end ? '–' + e.end : '') : ''}${e.place ? ' · ' + esc(e.place) : ''}${!e.participants ? ' · ' + (e.deptId ? esc(P.dept(e.deptId).name) : 'Todos os departamentos') : ''}</small>
      ${e.notes ? `<em class="evt-comment">${esc(e.notes)}</em>` : ''}
      ${parts.length ? `<span class="evt-people" title="${esc(parts.map(p => p.name).join(', '))}">${parts.slice(0, 6).map(p => V.avatar(p, 'xs')).join('')}${parts.length > 6 ? `<em>+${parts.length - 6}</em>` : ''}<small>${org ? 'por ' + esc(P.firstName(org.name)) + ' · ' : ''}${parts.length} participante${parts.length > 1 ? 's' : ''}</small></span>` : ''}
      ${canEdit(u, e) ? `<span class="evt-acts">${V.btn('Editar', { act: 'agendaEdit', cls: 'sm ghost', icon: 'edit', attrs: `data-id="${e.id}"` })}${V.btn('Cancelar', { act: 'agendaCancel', cls: 'sm ghost', icon: 'x', attrs: `data-id="${e.id}"` })}</span>` : ''}
    </span></div>`;
  };

  /* ---------- Janela de agendamento ---------- */
  const groupsFor = (u, people) => {
    const g = [];
    const ids = new Set(people.map(p => p.id));
    // grupos de equipe só com 2 ou mais pessoas convidáveis (senão seria só o gestor)
    const add = (label, list, min = 1) => { const l = list.filter(p => ids.has(p.id)); if (l.length >= Math.max(min, label === 'Todos' ? 2 : 1)) g.push([label, l.map(p => p.id)]); };
    if (u.role === 'admin') add('Todos', people);
    add('Diretoria', people.filter(p => p.role === 'admin'));
    add('Gerência', people.filter(p => p.role === 'office'));
    add('Gestores', people.filter(p => p.role === 'manager'));
    db().departments.filter(d => d.active !== false).forEach(d => add('Equipe ' + d.name, people.filter(p => p.deptId === d.id && (p.role === 'employee' || p.id === d.managerId)), 2));
    return g;
  };
  // Aviso (sem bloquear) quando a data cai em feriado ou fim de semana
  const dayWarn = () => {
    const inp = $('#ag-date'), out = $('#ag-dwarn'); if (!inp || !out) return;
    const d = inp.value && D.parse(inp.value);
    const msg = !d ? '' : D.isWorkday(d) ? '' : (V.dayMark(d).label || (d.getDay() === 0 || d.getDay() === 6 ? 'fim de semana' : 'dia não útil'));
    out.hidden = !msg; out.innerHTML = msg ? icon('alert') + ' Atenção: ' + D.fmt(inp.value) + ' é ' + esc(msg.charAt(0).toLowerCase() + msg.slice(1)) + '.' : '';
  };
  const paintPeople = () => {
    const box = $('#ag-people'); if (!box) return;
    const q = ($('#ag-q').value || '').toLowerCase();
    box.querySelectorAll('.ag-p').forEach(el => { el.hidden = q && !el.dataset.name.includes(q); });
    const n = box.querySelectorAll('input:checked').length;
    $('#ag-count').textContent = n + ' selecionado' + (n === 1 ? '' : 's');
  };
  const openForm = (e, preDate) => {
    const u = S().user, people = invitable(u);
    if (!people.length) return P.toast('Pelas regras de comunicação, não há pessoas que você possa convidar.', 'err');
    const sel = new Set(e ? e.participants : []);
    const byDept = {};
    people.forEach(p => { const k = p.role === 'admin' ? 'Diretoria' : p.role === 'office' ? 'Gerência' : (P.dept(p.deptId) || { name: 'Sem departamento' }).name; (byDept[k] = byDept[k] || []).push(p); });
    const groups = groupsFor(u, people);
    P.ui.modal({
      title: e ? 'Editar ' + KIND[e.type].toLowerCase() : 'Agendar reunião ou evento', wide: true, submit: e ? 'Salvar alterações' : 'Agendar e convidar',
      body: `<form id="ag-form" class="form" novalidate><div class="fgrid">
        <fieldset class="field ag-kind"><legend>Tipo</legend>${Object.entries(KIND).map(([k, l]) => `<label class="check-inline"><input type="radio" name="ag-kind" value="${k}" ${(e ? e.type : 'reuniao') === k ? 'checked' : ''}> ${l}</label>`).join('')}</fieldset>
        <label class="field span2"><span>Título</span><input type="text" id="ag-title" maxlength="80" value="${esc(e ? e.title : '')}" placeholder="Ex.: Alinhamento do fechamento de outubro"></label>
        <p class="ag-dwarn span3" id="ag-dwarn" hidden></p>
        <label class="field"><span>Data</span><input type="date" id="ag-date" min="${D.iso(P.today())}" value="${e ? e.date : preDate || D.iso(P.today())}"></label>
        <label class="field"><span>Início</span><input type="time" id="ag-start" value="${e ? e.start : '09:00'}"></label>
        <label class="field"><span>Término</span><input type="time" id="ag-end" value="${e ? e.end : '10:00'}"></label>
        <label class="field span3"><span>Local ou link <small>(opcional)</small></span><input type="text" id="ag-place" maxlength="160" value="${esc(e ? e.place : '')}" placeholder="Sala de reuniões, Google Meet, Teams…"></label>
        <label class="field span3"><span>Pauta / observações <small>(opcional)</small></span><textarea id="ag-notes" rows="2" maxlength="600">${esc(e ? e.notes : '')}</textarea></label>
      </div>
      <div class="ag-ph"><b>Participantes</b><span id="ag-count"></span></div>
      ${groups.length ? `<div class="ag-groups">${groups.map(([l, ids]) => `<button type="button" class="chip-btn" data-act="agendaGroup" data-ids="${ids.join(',')}">${icon('plus')}${esc(l)}</button>`).join('')}<button type="button" class="chip-btn ghost" data-act="agendaGroup" data-ids="">${icon('x')}Limpar</button></div>` : ''}
      <label class="in-ic ag-q">${icon('search')}<input type="search" id="ag-q" placeholder="Buscar pessoa"></label>
      <div class="ag-people" id="ag-people">${Object.entries(byDept).map(([k, list]) => `<div class="ag-dg"><small>${esc(k)}</small>${list.map(p => `<label class="ag-p" data-name="${esc(p.name.toLowerCase())}"><input type="checkbox" value="${p.id}" ${sel.has(p.id) ? 'checked' : ''}>${V.avatar(p)}<span><b>${esc(p.name)}</b><small>${esc(P.ROLES[p.role])}</small></span></label>`).join('')}</div>`).join('')}</div>
      <p class="fine">Os participantes recebem uma notificação com o convite e um lembrete no dia. Você só convida quem a regra de comunicação permite${u.role === 'admin' ? ' (a diretoria pode convidar todo o escritório)' : ''}.</p></form>`,
      onSubmit: m => {
        const r = P.agenda.save(u, { id: e && e.id, kind: (m.querySelector('input[name=ag-kind]:checked') || {}).value, title: $('#ag-title', m).value, date: $('#ag-date', m).value, start: $('#ag-start', m).value, end: $('#ag-end', m).value, place: $('#ag-place', m).value, notes: $('#ag-notes', m).value, participants: [...m.querySelectorAll('#ag-people input:checked')].map(i => i.value) });
        S().cal.sel = r.date; S().cal.month = D.monthStart(D.parse(r.date));
        P.toast(e ? 'Compromisso atualizado. Os participantes foram avisados.' : `${KIND[r.type]} agendada. ${r.participants.length} participante${r.participants.length > 1 ? 's foram convidados' : ' foi convidado'}.`);
        P.fx && P.fx.success(); P.render();
      }
    });
    paintPeople(); dayWarn();
  };
  A.agendaNew = el => openForm(null, (el && el.dataset && el.dataset.date) || S().cal.sel || null);
  A.agendaEdit = el => { const e = db().events.find(x => x.id === el.dataset.id); if (e) openForm(e); };
  A.agendaCancel = el => {
    const e = db().events.find(x => x.id === el.dataset.id); if (!e) return;
    P.ui.modal({ title: 'Cancelar ' + KIND[e.type].toLowerCase(), submit: 'Cancelar compromisso', danger: true, cancel: 'Voltar',
      body: `<p class="prose"><b>${esc(e.title)}</b> · ${when(e)}. Os ${e.participants.length} participante(s) serão avisados do cancelamento.</p>`,
      onSubmit: () => { P.agenda.cancel(S().user, e.id); P.toast('Compromisso cancelado.'); P.render(); } });
  };
  A.agendaGroup = el => {
    const ids = el.dataset.ids ? el.dataset.ids.split(',') : null;
    document.querySelectorAll('#ag-people input').forEach(i => { if (!ids) i.checked = false; else if (ids.includes(i.value)) i.checked = true; });
    paintPeople();
  };
  document.addEventListener('input', ev => { if (ev.target.id === 'ag-q') paintPeople(); if (ev.target.id === 'ag-date') dayWarn(); });
  document.addEventListener('change', ev => { if (ev.target.closest && ev.target.closest('#ag-people')) paintPeople(); });

  // Lembrete no dia: uma notificação por compromisso, na primeira entrada do dia
  const origLogin = P.fx.onLogin;
  P.fx.onLogin = (user, boot) => {
    try {
      const u = P.user(user.id), today = D.iso(P.today());
      const key = 'prumo.agendaRemind.' + u.id + '.' + today, done = new Set(JSON.parse(P.ui.ls.get(key) || '[]'));
      P.agenda.forUser(u).filter(e => e.participants && e.date === today && !done.has(e.id)).forEach(e => {
        P.notify([u.id], { type: 'agenda', icon: 'clock', title: `Hoje: ${KIND[e.type].toLowerCase()} ${e.title}`, text: `${e.start}${e.end ? '–' + e.end : ''}${e.place ? ' · ' + e.place : ''}`, link: 'calendario' });
        done.add(e.id);
      });
      P.ui.ls.set(key, JSON.stringify([...done])); P.store.save();
    } catch (err) { console.warn(err); }
    origLogin(user, boot);
  };
})(window.P);
