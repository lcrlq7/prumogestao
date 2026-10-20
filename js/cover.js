/* Prumo — substituição nas férias e transferência de tarefas
 * - No pedido de férias o colaborador escolhe um substituto do departamento. Quando as férias são aprovadas, as tarefas
 *   pendentes com prazo dentro do período passam para o substituto (quem concluir pontua). No dia seguinte ao fim das
 *   férias, as que ainda estiverem pendentes voltam para o titular.
 * - O gestor pode trocar o substituto ao aprovar e pode transferir tarefas de uma pessoa para outra (temporária ou definitiva).
 * A troca é feita no navegador de quem tem permissão de editar a tarefa (o próprio dono ou quem gere o departamento). */
'use strict';
(function (P) {
  const D = P.date, esc = P.esc, V = P.V, A = P.actions, api = P.api, $ = (s, r) => (r || document).querySelector(s);
  const db = () => P.store.db, U = () => P.state.user;
  const manages = (u, deptId) => !!u && (P.isGlobal(u) || (u.role === 'manager' && u.deptId === deptId));
  const canEdit = (u, t) => !!u && !!t && (t.userId === u.id || manages(u, t.deptId));
  const nameOf = id => (P.user(id) || { name: '—' }).name;
  const first = n => String(n || '').split(' ')[0];
  const today = () => D.iso(P.today());
  // colegas que podem cobrir: mesmo departamento, ativos, que produzem (funcionário ou gestor)
  const peers = (deptId, exceptId) => (db().users || []).filter(x => x.active !== false && x.id !== exceptId && x.deptId === deptId && (x.role === 'employee' || x.role === 'manager')).sort((a, b) => a.name.localeCompare(b.name));
  const inPeriod = (userId, s, e) => (db().tasks || []).filter(t => t.userId === userId && t.status === 'pendente' && t.due >= s && t.due <= e);
  const awayOn = (userId, s, e) => (db().vacations || []).some(v => v.userId === userId && ['gestor', 'gerente', 'diretoria', 'aprovada'].includes(v.status) && !(e < v.start || s > v.end));

  /* ---------- Formulário de férias: escolha do substituto ---------- */
  const coverInfo = (u, s, e, cid) => {
    if (!cid) return 'Sem substituto: as suas tarefas continuam com você.';
    if (!s || !e || e < s) return '';
    const l = inPeriod(u.id, s, e), by = {};
    l.forEach(t => { const a = t.activityId && P.act(t.activityId); const k = a ? a.name : 'Outras'; by[k] = (by[k] || 0) + 1; });
    const parts = Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, n]) => n + ' de ' + k);
    return l.length ? `Hoje seriam transferidas <b>${l.length} tarefa(s)</b> com prazo de ${D.fmt(s)} a ${D.fmt(e)}${parts.length ? ': ' + esc(parts.join(', ')) : ''}. Tarefas criadas depois para esse período também vão para ${esc(first(nameOf(cid)))}.` : `Nenhuma tarefa sua tem prazo nesse período por enquanto. As que forem criadas para essas datas vão para ${esc(first(nameOf(cid)))}.`;
  };
  const origForm = V.vacForm;
  V.vacForm = (u, id = 'vac-form') => {
    const html = origForm(u, id), list = peers(u.deptId, u.id);
    if (!list.length) return html;
    const box = `<div class="span3 cover-box">
        <div class="cover-h">${V.icon('users')}<b>Quem cuida das suas tarefas durante as férias?</b></div>
        <label class="field"><span>Substituto(a)</span><select name="coverBy" id="${id}-cover" data-vf><option value="">Ninguém (as tarefas continuam comigo)</option>${list.map(x => `<option value="${x.id}">${esc(x.name)}</option>`).join('')}</select></label>
        <p class="fine" data-cover-info>${coverInfo(u, '', '', '')}</p>
        <p class="fine">${V.icon('info')} A transferência acontece quando as férias forem aprovadas (o gestor pode trocar o substituto). Quem concluir pontua normalmente. Ao voltar, o que ainda estiver pendente volta para você.</p>
      </div>`;
    const i = html.indexOf('<label class="field span3"><span>Comentário');
    return i > 0 ? html.slice(0, i) + box + html.slice(i) : html.replace('</div>\n      <p class="fine">', box + '</div>\n      <p class="fine">');
  };
  document.addEventListener('input', e => {
    const f = e.target.closest && e.target.closest('[data-vac-form]'); if (!f || !U()) return;
    const out = $('[data-cover-info]', f), sel = $('[name=coverBy]', f); if (!out || !sel) return;
    out.innerHTML = coverInfo(U(), ($('[name=start]', f) || {}).value, ($('[name=end]', f) || {}).value, sel.value);
  });
  document.addEventListener('change', e => { if (e.target.name === 'coverBy') e.target.dispatchEvent(new Event('input', { bubbles: true })); });

  // grava o substituto no pedido
  const origReq = api.requestVacation;
  api.requestVacation = function (u, data) {
    const mr = $('#modal-root'), sel = (mr && !mr.hidden && $('[data-vac-form] [name=coverBy]', mr)) || $('[data-vac-form] [name=coverBy]'), cid = data.coverBy != null ? data.coverBy : (sel ? sel.value : '');
    if (cid) {
      const c = P.user(cid);
      if (!c || c.active === false || c.deptId !== u.deptId || c.id === u.id) throw new Error('Escolha um substituto ativo do seu departamento.');
      if (awayOn(cid, data.start, data.end)) throw new Error(first(c.name) + ' também estará de férias nesse período. Escolha outro substituto.');
    }
    const v = origReq.apply(this, arguments);
    if (cid) { v.coverBy = cid; v.history.push({ at: D.stamp(), by: u.id, action: 'Substituto indicado: ' + nameOf(cid), note: '' }); P.store.save(); }
    return v;
  };

  /* ---------- Aprovação: o gestor pode trocar o substituto ---------- */
  const origReview = A.reviewVacation;
  A.reviewVacation = function (el) {
    origReview.apply(this, arguments);
    const v = (db().vacations || []).find(x => x.id === el.dataset.id); if (!v || el.dataset.op !== 'aprovar') return;
    const body = $('#modal-root .modal-b, #modal-root .modal-body') || $('#modal-root form') || $('#modal-root .modal'); if (!body) return;
    const list = peers(v.deptId, v.userId);
    const html = `<div class="cover-box" style="margin:10px 0"><div class="cover-h">${V.icon('users')}<b>Substituto durante as férias</b></div>
      <label class="field"><span>${v.coverBy ? 'Indicado por ' + esc(first(nameOf(v.userId))) + '. Troque se não concordar:' : 'Nenhum substituto indicado. Se quiser, escolha um:'}</span>
      <select id="rv-cover"><option value="">Ninguém (as tarefas continuam com ${esc(first(nameOf(v.userId)))})</option>${list.map(x => `<option value="${x.id}" ${x.id === v.coverBy ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>
      <p class="fine">${inPeriod(v.userId, v.start, v.end).length} tarefa(s) com prazo no período hoje.</p></div>`;
    const anchor = $('.modal-f, .modal-foot, .modal-actions', body.closest('#modal-root') || document);
    if (anchor && anchor.parentNode) anchor.insertAdjacentHTML('beforebegin', html); else body.insertAdjacentHTML('beforeend', html);
  };
  const origApi = api.reviewVacation;
  api.reviewVacation = function (u, id, action) {
    const sel = $('#rv-cover'), v0 = (db().vacations || []).find(x => x.id === id);
    if (sel && v0 && action === 'aprovar') {
      const nv = sel.value || null;
      if (nv && awayOn(nv, v0.start, v0.end)) throw new Error(first(nameOf(nv)) + ' também estará de férias nesse período. Escolha outro substituto.');
      if ((v0.coverBy || null) !== nv) { v0.history.push({ at: D.stamp(), by: u.id, action: nv ? 'Substituto alterado para ' + nameOf(nv) : 'Substituto retirado', note: '' }); v0.coverBy = nv; }
    }
    const v = origApi.apply(this, arguments);
    if (v.status === 'aprovada') setTimeout(() => sync(true), 300);
    return v;
  };

  /* ---------- Transferir e devolver (sincronização) ---------- */
  const move = (t, to, cover, why, u) => {
    (t.transfers = t.transfers || []).push({ from: t.userId, to, at: D.stamp(), by: u.id, reason: why, temp: !!cover });
    if (cover) t.coverOf = cover; else delete t.coverOf;
    t.userId = to;
  };
  let busy = false, last = 0;
  function sync(force) {
    const u = U(); if (!u || busy || !db() || (!force && Date.now() - last < 60e3)) return 0;
    busy = true; last = Date.now(); let n = 0; const backs = {};
    try {
      const td = today();
      // 1) férias aprovadas com substituto: passa as tarefas com prazo no período (inclui as criadas depois)
      (db().vacations || []).filter(v => v.status === 'aprovada' && v.coverBy && v.end >= td).forEach(v => {
        const c = P.user(v.coverBy); if (!c || c.active === false) return;
        inPeriod(v.userId, v.start, v.end).forEach(t => {
          if (t.coverOf || !canEdit(u, t)) return;
          move(t, v.coverBy, { userId: v.userId, vacId: v.id, until: v.end }, 'Férias de ' + nameOf(v.userId), u); n++;
        });
      });
      // 2) passou a data: o que estiver pendente volta para o titular
      (db().tasks || []).filter(t => t.coverOf && t.coverOf.until < td).forEach(t => {
        if (!canEdit(u, t)) return;
        const back = t.coverOf.userId;
        if (t.status === 'pendente' && P.user(back) && P.user(back).active !== false) { (backs[back] = backs[back] || []).push(t); move(t, back, null, t.coverOf.vacId ? 'Volta das férias' : 'Fim da transferência temporária', u); }
        else { t.coverDone = Object.assign({}, t.coverOf, { closedAt: D.stamp() }); delete t.coverOf; }
        n++;
      });
      Object.entries(backs).forEach(([uid, l]) => { if (P.notify) P.notify([uid], { type: 'tarefa', icon: 'clipboard', title: 'Tarefas de volta para você', text: `${l.length} tarefa(s) pendente(s) que estavam com outra pessoa voltaram para você.`, link: 'atividades' }); });
      if (n) { P.audit(u, 'Tarefas transferidas/devolvidas automaticamente', '', n + ' tarefa(s)'); P.store.save(); }
    } finally { busy = false; }
    return n;
  }
  P.cover = { sync };
  setInterval(() => { if (sync() && P.render) P.render(); }, 60e3);
  window.addEventListener('focus', () => { if (sync() && P.render) P.render(); });
  setTimeout(() => { if (sync(true) && P.render) P.render(); }, 4000);

  /* ---------- Etiqueta na tarefa ---------- */
  const origExtra = V.taskExtra;
  V.taskExtra = (u, t) => {
    let tag = '';
    if (t.coverOf && t.status === 'pendente') tag = `<span class="badge st-baixa cover-tag">${V.icon('users')}${t.coverOf.vacId ? 'Cobrindo férias de ' : 'Transferida de '}${esc(first(nameOf(t.coverOf.userId)))} até ${D.fmt(t.coverOf.until)}</span>`;
    const btn = t.status === 'pendente' && manages(u, t.deptId) ? V.btn('Transferir', { act: 'transferTasks', icon: 'users', cls: 'sm ghost', attrs: `data-id="${t.id}"` }) : '';
    const base = origExtra ? origExtra(u, t) : '';
    return (tag ? `<div class="task-extra">${tag}</div>` : '') + (btn ? `<div class="task-acts">${btn}</div>` : '') + base;
  };

  /* ---------- Transferência pelo gestor ---------- */
  A.transferTasks = el => {
    const u = U(); const pre = el && el.dataset && el.dataset.id ? db().tasks.find(t => t.id === el.dataset.id) : null;
    const team = (db().users || []).filter(x => x.active !== false && (x.role === 'employee' || x.role === 'manager') && x.deptId && manages(u, x.deptId)).sort((a, b) => a.name.localeCompare(b.name));
    if (!team.length) return P.toast('Somente o gestor, a gerência e a diretoria transferem tarefas.', 'err');
    const from0 = pre ? pre.userId : (P.state.taskUser && team.some(x => x.id === P.state.taskUser) ? P.state.taskUser : team[0].id);
    const opts = (l, sel) => l.map(x => `<option value="${x.id}" ${x.id === sel ? 'selected' : ''}>${esc(x.name)}</option>`).join('');
    P.ui.modal({
      title: 'Transferir tarefas', wide: true, submit: 'Transferir',
      body: `<div class="fgrid">
        <label class="field"><span>De</span><select id="tt-from">${opts(team, from0)}</select></label>
        <label class="field"><span>Para</span><select id="tt-to"></select></label>
        <label class="field"><span>Tipo</span><select id="tt-kind"><option value="temp">Temporária (volta numa data)</option><option value="def">Definitiva</option></select></label>
        <label class="field tt-temp"><span>Volta em</span><input type="date" id="tt-until" min="${D.iso(D.add(P.today(), 1))}" value="${D.iso(D.add(P.today(), 7))}"></label>
        <label class="field check span3 tt-def" style="display:none"><input type="checkbox" id="tt-cart"><span>Passar também as empresas dessas tarefas na carteira (as próximas tarefas recorrentes já vão para a nova pessoa)</span></label>
        <label class="field span3"><span>Motivo</span><input id="tt-why" placeholder="Ex.: atestado médico de 3 dias"></label>
        <div class="span3"><div class="tt-head"><label class="check"><input type="checkbox" id="tt-all"> <b>Tarefas pendentes</b></label><small class="muted" id="tt-count"></small></div><div class="tt-list" id="tt-list"></div></div>
      </div><p class="fine">${V.icon('info')} Quem concluir a tarefa pontua normalmente. Na temporária, o que estiver pendente na data de volta retorna para a pessoa de origem.</p>`,
      onSubmit: m => {
        const from = $('#tt-from').value, to = $('#tt-to').value, kind = $('#tt-kind').value, why = $('#tt-why').value.trim(), until = $('#tt-until').value;
        const ids = [...document.querySelectorAll('#tt-list input:checked')].map(i => i.value);
        if (!to) throw new Error('Escolha para quem vão as tarefas.');
        if (!ids.length) throw new Error('Marque pelo menos uma tarefa.');
        if (why.length < 5) throw new Error('Descreva o motivo (pelo menos 5 caracteres).');
        if (kind === 'temp' && (!until || until <= today())) throw new Error('Escolha a data de volta (a partir de amanhã).');
        const dest = P.user(to);
        const list = ids.map(id => db().tasks.find(t => t.id === id)).filter(t => t && t.status === 'pendente' && t.userId === from && canEdit(u, t));
        if (list.some(t => t.deptId !== dest.deptId)) throw new Error('Só é possível transferir para alguém do mesmo departamento da tarefa.');
        list.forEach(t => move(t, to, kind === 'temp' ? { userId: from, until, by: u.id } : null, why, u));
        let cart = 0;
        if (kind === 'def' && $('#tt-cart').checked) {
          const clients = [...new Set(list.map(t => t.client).filter(Boolean))];
          (db().clientAssignments || []).forEach(a => { if (a.userId === from && a.deptId === dest.deptId && clients.includes(a.client)) { a.userId = to; a.assignedAt = D.stamp(); a.assignedBy = u.id; cart++; } });
        }
        P.audit(u, 'Tarefas transferidas', from + '>' + to, list.length + ' tarefa(s) de ' + nameOf(from) + ' para ' + nameOf(to) + (kind === 'temp' ? ' até ' + D.fmt(until) : ' (definitiva)') + ' · ' + why);
        if (P.notify) { P.notify([to], { type: 'tarefa', icon: 'clipboard', title: 'Tarefas transferidas para você', text: `${list.length} tarefa(s) de ${nameOf(from)}${kind === 'temp' ? ' até ' + D.fmt(until) : ''}: ${why}`, link: 'atividades' }); P.notify([from], { type: 'tarefa', icon: 'clipboard', title: 'Suas tarefas foram transferidas', text: `${list.length} tarefa(s) para ${nameOf(to)}${kind === 'temp' ? ' até ' + D.fmt(until) + ' (depois voltam para você)' : ''}: ${why}`, link: 'atividades' }); }
        P.store.save(); P.toast(`${list.length} tarefa(s) transferida(s) para ${first(dest.name)}${cart ? ' · ' + cart + ' empresa(s) na carteira' : ''}.`); P.render();
      }
    });
    const draw = () => {
      const from = $('#tt-from').value, f = P.user(from);
      $('#tt-to').innerHTML = '<option value="">Escolha…</option>' + opts(peers(f.deptId, from).filter(x => manages(u, x.deptId)), '');
      const l = (db().tasks || []).filter(t => t.userId === from && t.status === 'pendente').sort((a, b) => a.due.localeCompare(b.due));
      $('#tt-list').innerHTML = l.length ? l.map(t => `<label class="check tt-row"><input type="checkbox" value="${t.id}" ${pre && pre.id === t.id ? 'checked' : ''}><span>${esc(t.title)}</span><small class="muted">${D.fmt(t.due)}${t.coverOf ? ' · já transferida' : ''}</small></label>`).join('') : '<p class="fine">Nenhuma tarefa pendente.</p>';
      count();
    };
    const count = () => { const n = document.querySelectorAll('#tt-list input:checked').length; $('#tt-count').textContent = n + ' marcada(s)'; };
    $('#tt-from').addEventListener('change', draw);
    $('#tt-kind').addEventListener('change', e => { const d = e.target.value === 'def'; document.querySelectorAll('.tt-temp').forEach(x => { x.style.display = d ? 'none' : ''; }); document.querySelectorAll('.tt-def').forEach(x => { x.style.display = d ? '' : 'none'; }); });
    $('#tt-all').addEventListener('change', e => { document.querySelectorAll('#tt-list input').forEach(i => { i.checked = e.target.checked; }); count(); });
    $('#tt-list').addEventListener('change', count);
    draw();
  };

  // botão "Transferir tarefas" ao lado de "Atribuir tarefa" (Atividades)
  const origAtv = V.atividades;
  V.atividades = u => {
    const html = origAtv(u);
    if (u.role === 'employee' || !(P.isGlobal(u) || u.role === 'manager')) return html;
    const i = html.indexOf('data-act="newTask"'); if (i < 0) return html;
    const b = html.lastIndexOf('<button', i);
    return html.slice(0, b) + V.btn('Transferir tarefas', { act: 'transferTasks', icon: 'users', cls: 'ghost' }) + html.slice(b);
  };
})(window.P);
