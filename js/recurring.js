/* Prumo — tarefas recorrentes: um cadastro gera a tarefa todo mês (mês atual e o próximo).
 * Em produção quem gera é o banco (generate_recurring_tasks); na demonstração, o cálculo local abaixo faz o mesmo. */
'use strict';
(function (P) {
  const D = P.date, esc = P.esc, V = P.V, A = P.actions, $ = s => document.querySelector(s);
  const db = () => P.store.db, U = () => P.state.user;
  const recs = () => (db().taskRecurrences = db().taskRecurrences || []);
  const ym = d => D.iso(d).slice(0, 7);
  const canManage = (u, deptId) => !!u && (P.isGlobal(u) || (u.role === 'manager' && u.deptId === deptId));
  const dueOf = (r, m) => {
    const last = D.monthEnd(m).getDate(); let d = new Date(m.getFullYear(), m.getMonth(), Math.min(Math.max(Number(r.day) || 1, 1), last));
    if (r.businessDay) while (d.getDay() === 0 || d.getDay() === 6) d = D.add(d, -1);
    return D.iso(d);
  };
  function localGenerate() {
    const cur = D.monthStart(P.today()); let n = 0;
    recs().filter(r => r.active !== false).forEach(r => [cur, D.addMonths(cur, 1)].forEach(m => {
      const k = ym(m); if (k < (r.start || '0000') || (r.end && k > r.end)) return;
      const key = r.id + '|' + k, who = P.user(r.userId);
      if (!who || who.active === false || db().tasks.some(t => t.recKey === key)) return;
      db().tasks.push({ id: P.uid('t'), userId: r.userId, deptId: r.deptId, title: r.title, activityId: r.activityId || null, client: r.client || '', due: dueOf(r, m), status: 'pendente', createdBy: r.createdBy, recId: r.id, recKey: key }); n++;
    }));
    return n;
  }
  let lastRun = 0;
  async function generate(force) {
    if (!U() || (!force && Date.now() - lastRun < 10 * 60e3)) return;
    lastRun = Date.now();
    if (P.isLive && P.backend && P.backend.client) {
      const { data, error } = await P.backend.client.rpc('generate_recurring_tasks');
      if (!error && data > 0 && P.backend.reload) P.backend.reload();
    } else if (localGenerate()) { P.store.save(); P.render(); }
  }
  P.taskRec = { generate, dueOf, localGenerate };
  setInterval(() => generate(), 60e3); window.addEventListener('focus', () => generate());
  setTimeout(() => generate(true), 3000);

  /* ---------- Cadastro dentro de "Atribuir tarefa" ---------- */
  // o modal de nova tarefa ganha "Repetir todo mês"; ao salvar com a opção marcada, cria a recorrência
  const origNew = A.newTask;
  A.newTask = function () {
    origNew.apply(this, arguments);
    const due = $('#nt-due'); if (!due || $('#nt-rep')) return;
    due.closest('.field').insertAdjacentHTML('afterend', `
      <label class="field check span3"><input type="checkbox" id="nt-rep"><span><b>Repetir todo mês</b> (um único cadastro gera a tarefa em todos os meses)</span></label>
      <label class="field nt-rep-f" style="display:none"><span>Dia do prazo (todo mês)</span><input type="number" id="nt-rep-day" min="1" max="31" value="${D.parse(due.value).getDate()}"></label>
      <label class="field nt-rep-f" style="display:none"><span>Começa em</span><input type="month" id="nt-rep-start" value="${ym(P.today())}"></label>
      <label class="field nt-rep-f" style="display:none"><span>Termina em (opcional)</span><input type="month" id="nt-rep-end"></label>
      <label class="field check span3 nt-rep-f" style="display:none"><input type="checkbox" id="nt-rep-bd" checked><span>Se cair no fim de semana, antecipa para o dia útil anterior</span></label>`);
    $('#nt-rep').addEventListener('change', e => { document.querySelectorAll('.nt-rep-f').forEach(x => { x.style.display = e.target.checked ? '' : 'none'; }); $('#nt-due').closest('.field').style.display = e.target.checked ? 'none' : ''; });
  };
  // intercepta o salvar quando "Repetir todo mês" está marcado
  const origSave = P.api.saveTask;
  P.api.saveTask = function (u, data) {
    const rep = $('#nt-rep');
    if (!rep || !rep.checked) return origSave.apply(this, arguments);
    const emp = P.user(data.userId);
    if (!emp || !canManage(u, emp.deptId)) throw new P.AccessError('Apenas o gestor do departamento, o gerente ou a diretoria podem cadastrar tarefas recorrentes.');
    const day = Number($('#nt-rep-day').value), start = $('#nt-rep-start').value, end = $('#nt-rep-end').value;
    if (!(day >= 1 && day <= 31)) throw new Error('Informe o dia do prazo (1 a 31).');
    if (!start) throw new Error('Informe o mês de início.');
    if (end && end < start) throw new Error('O mês de término precisa ser depois do início.');
    const r = { id: P.uid('tr'), userId: emp.id, deptId: emp.deptId, title: data.title, activityId: data.activityId || null, client: data.client || '', day, businessDay: $('#nt-rep-bd').checked, start, end: end || '', active: true, createdBy: u.id, createdAt: D.stamp() };
    recs().push(r); P.audit(u, 'Tarefa recorrente criada', r.id, emp.name + ': ' + r.title + ' (dia ' + day + ')');
    if (!P.isLive) localGenerate();
    P.store.save();
    if (P.isLive) setTimeout(() => generate(true), 1500);
    P.toast('Tarefa recorrente criada: todo dia ' + day + (end ? ' até ' + end.split('-').reverse().join('/') : '') + '.');
    return r;
  };

  /* ---------- Lista e gestão das recorrências ---------- */
  A.taskRecurrences = () => {
    const u = U(), list = recs().filter(r => canManage(u, r.deptId)).sort((a, b) => (P.user(a.userId) || {}).name > (P.user(b.userId) || {}).name ? 1 : -1);
    P.ui.modal({
      title: 'Tarefas recorrentes', wide: true, cancel: 'Fechar',
      body: list.length ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>Tarefa</th><th>Responsável</th><th>Prazo</th><th>Período</th><th>Situação</th><th class="actions-col"></th></tr></thead><tbody>
        ${list.map(r => `<tr class="${r.active === false ? 'inactive' : ''}"><td><b>${esc(r.title)}</b>${r.client ? `<small class="obs">${esc(r.client)}</small>` : ''}</td><td>${esc((P.user(r.userId) || { name: '—' }).name)}</td>
          <td class="nowrap">Todo dia ${r.day}${r.businessDay ? ' <small class="muted">(dia útil)</small>' : ''}</td>
          <td class="nowrap">${r.start.split('-').reverse().join('/')}${r.end ? ' a ' + r.end.split('-').reverse().join('/') : ' em diante'}</td>
          <td>${r.active === false ? '<span class="badge st-sem">Pausada</span>' : '<span class="badge es-aprovado">Ativa</span>'}</td>
          <td class="actions-col">${V.ibtn(r.active === false ? 'check' : 'clock', r.active === false ? 'Reativar' : 'Pausar', { act: 'toggleTaskRec', attrs: `data-id="${esc(r.id)}"` })}${V.ibtn('trash', 'Excluir recorrência', { act: 'deleteTaskRec', attrs: `data-id="${esc(r.id)}"` })}</td></tr>`).join('')}
        </tbody></table></div><p class="fine">${V.icon('info')} As tarefas são criadas automaticamente para o mês atual e o próximo. Pausar ou excluir não apaga as tarefas já criadas.</p>`
        : V.empty('Nenhuma tarefa recorrente. Em "Atribuir tarefa", marque "Repetir todo mês".', 'refresh')
    });
  };
  A.toggleTaskRec = el => {
    const r = recs().find(x => x.id === el.dataset.id); if (!r || !canManage(U(), r.deptId)) return;
    r.active = r.active === false; P.audit(U(), 'Tarefa recorrente ' + (r.active ? 'reativada' : 'pausada'), r.id, r.title);
    if (r.active && !P.isLive) localGenerate();
    P.store.save(); if (r.active && P.isLive) setTimeout(() => generate(true), 1500);
    P.ui.closeModal(); A.taskRecurrences(); P.render();
  };
  A.deleteTaskRec = el => {
    const r = recs().find(x => x.id === el.dataset.id); if (!r || !canManage(U(), r.deptId)) return;
    if (!confirm(`Excluir a recorrência "${r.title}"? Ela deixa de ser criada nos próximos meses. As tarefas já criadas continuam.`)) return;
    db().taskRecurrences = recs().filter(x => x.id !== r.id); P.audit(U(), 'Tarefa recorrente excluída', r.id, r.title); P.store.save(); P.ui.closeModal(); A.taskRecurrences(); P.render();
  };

  /* ---------- Botão na aba Atividades ---------- */
  const origAtv = V.atividades;
  if (origAtv) V.atividades = u => {
    const html = origAtv(u);
    if (!(P.isGlobal(u) || u.role === 'manager')) return html;
    return html.replace('data-act="newTask"', 'data-act="newTask" data-rec-anchor').replace(/(<button[^>]*data-rec-anchor[^>]*>)/, V.btn('Recorrentes', { act: 'taskRecurrences', icon: 'refresh', cls: 'ghost' }).replace(/\s+$/, '') + '$1');
  };
})(window.P);
