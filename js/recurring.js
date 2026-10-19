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
  // responsável do mês: fixo, ou (automático) quem tem a empresa na carteira do departamento; sem ninguém, o gestor do departamento
  const respOf = r => {
    if (!r.auto) return r.userId;
    const ok = id => { const x = P.user(id); return x && x.active !== false; };
    const a = (db().clientAssignments || []).find(x => x.deptId === r.deptId && x.client === r.client && ok(x.userId));
    if (a) return a.userId;
    const d = P.dept(r.deptId); return d && ok(d.managerId) ? d.managerId : null;
  };
  function localGenerate() {
    const cur = D.monthStart(P.today()); let n = 0;
    recs().filter(r => r.active !== false).forEach(r => [cur, D.addMonths(cur, 1)].forEach(m => {
      const k = ym(m); if (k < (r.start || '0000') || (r.end && k > r.end)) return;
      const key = r.id + '|' + k, uid = respOf(r), who = P.user(uid);
      if (!who || who.active === false || db().tasks.some(t => t.recKey === key)) return;
      db().tasks.push({ id: P.uid('t'), userId: uid, deptId: r.deptId, title: r.title, activityId: r.activityId || null, client: r.client || '', due: dueOf(r, m), status: 'pendente', createdBy: r.createdBy, recId: r.id, recKey: key }); n++;
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

  /* ---------- Aba "Cadastro de tarefas" ---------- */
  P.PAGES.tarefas = ['admin', 'office', 'manager'];
  const who = id => esc((P.user(id) || { name: '—' }).name);
  const recTable = list => list.length ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>Tarefa</th><th>Responsável</th><th>Prazo</th><th>Período</th><th>Situação</th><th class="actions-col"></th></tr></thead><tbody>
    ${list.map(r => `<tr class="${r.active === false ? 'inactive' : ''}"><td><b>${esc(r.title)}</b>${r.client ? `<small class="obs">${esc(r.client)}</small>` : ''}</td><td>${r.auto ? `${who(respOf(r))}<small class="obs">automático (carteira de ${esc((P.dept(r.deptId) || {}).name || '—')})</small>` : who(r.userId)}</td>
      <td class="nowrap">Todo dia ${r.day}${r.businessDay ? ' <small class="muted">(dia útil)</small>' : ''}</td>
      <td class="nowrap">${r.start.split('-').reverse().join('/')}${r.end ? ' a ' + r.end.split('-').reverse().join('/') : ' em diante'}</td>
      <td>${r.active === false ? '<span class="badge st-sem">Pausada</span>' : '<span class="badge es-aprovado">Ativa</span>'}</td>
      <td class="actions-col">${V.ibtn(r.active === false ? 'check' : 'clock', r.active === false ? 'Reativar' : 'Pausar', { act: 'toggleTaskRec', attrs: `data-id="${esc(r.id)}"` })}${V.ibtn('trash', 'Excluir recorrência', { act: 'deleteTaskRec', attrs: `data-id="${esc(r.id)}"` })}</td></tr>`).join('')}
    </tbody></table></div>` : V.empty('Nenhuma tarefa recorrente. Use "Nova tarefa" e marque "Repetir todo mês".', 'refresh');
  // corpo da aba "Cadastro de tarefas" (dentro de Atividades)
  const cadastro = u => {
    const list = recs().filter(r => canManage(u, r.deptId)).sort((a, b) => (P.user(a.userId) || {}).name > (P.user(b.userId) || {}).name ? 1 : -1);
    const today = D.iso(P.today());
    const avulsas = P.api.tasks(u).filter(t => !t.recId && t.status === 'pendente').sort((a, b) => a.due.localeCompare(b.due));
    const geradas = P.api.tasks(u).filter(t => t.recId && t.status === 'pendente').sort((a, b) => a.due.localeCompare(b.due));
    const taskRows = l => l.length ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>Tarefa</th><th>Responsável</th><th>Prazo</th></tr></thead><tbody>${l.map(t => `<tr><td><b>${esc(t.title)}</b>${t.client ? `<small class="obs">${esc(t.client)}</small>` : ''}</td><td>${who(t.userId)}</td><td class="nowrap${t.due < today ? ' bad' : ''}">${D.fmt(t.due)}${t.due < today ? ' <small>(atrasada)</small>' : ''}</td></tr>`).join('')}</tbody></table></div>` : V.empty('Nenhuma tarefa pendente.', 'check');
    return `<div class="kpis k3">${V.kpi('Recorrências ativas', list.filter(r => r.active !== false).length, { icon: 'refresh' })}${V.kpi('Geradas pendentes', geradas.length, { icon: 'clock' })}${V.kpi('Avulsas pendentes', avulsas.length, { icon: 'clipboard' })}</div>
      ${V.card('Tarefas recorrentes', recTable(list), { cls: 'flush', sub: 'As tarefas são criadas automaticamente para o mês atual e o próximo. Pausar ou excluir não apaga as já criadas.' })}
      <div class="grid g-1-1">${V.card('Geradas pelas recorrências (pendentes)', taskRows(geradas), { cls: 'flush' })}${V.card('Tarefas avulsas (pendentes)', taskRows(avulsas), { cls: 'flush' })}</div>`;
  };
  A.taskRecurrences = () => { P.state.atvTab = 'cadastro'; P.go('atividades'); };

  /* ---------- Abas dentro de Atividades: Tarefas | Cadastro de tarefas | Atividades e pesos ---------- */
  // criar atividades e definir pesos: só diretoria, gerência e gestores (o gestor, no próprio departamento)
  const origAtv = V.atividades;
  V.atividades = u => {
    if (u.role === 'employee' || !P.PAGES.tarefas.includes(u.role)) return origAtv(u);
    const S = P.state, tab = S.atvTab || 'tarefas';
    const dept = V.scopeDept(u) || (u.role === 'manager' ? u.deptId : '');
    const tabs = `<div class="toolbar atv-tabs">${V.tabs([['tarefas', 'Tarefas da equipe'], ['cadastro', 'Cadastro de tarefas', recs().filter(r => canManage(u, r.deptId) && r.active !== false).length], ['pesos', 'Atividades e pesos']], tab, 'atvTab')}</div>`;
    if (tab === 'tarefas') { const html = origAtv(u), i = html.indexOf('<div class="strip">'); return i > 0 ? html.slice(0, i) + tabs + html.slice(i) : tabs + html; }
    const head = tab === 'cadastro'
      ? V.pageHead('Cadastro de tarefas', 'Atividade, peso, empresa e recorrência num só cadastro. Todo mês a tarefa aparece para quem cuida da empresa no departamento.', V.deptPicker(u) + V.btn('Tarefa avulsa', { act: 'newTask', icon: 'plus', cls: 'ghost' }) + V.btn('Nova tarefa recorrente', { act: 'newActRec', icon: 'refresh', cls: 'primary' }))
      : V.pageHead('Atividades e pesos', 'Cadastre os tipos de tarefa e o peso de cada um. 1 ponto ≈ 1 hora média de trabalho.', V.deptPicker(u) + (dept ? V.btn('Nova atividade', { act: 'atvNewActivity', icon: 'plus', cls: 'primary' }) : ''));
    const body = tab === 'cadastro' ? cadastro(u)
      : dept ? V.card('Atividades e pesos · ' + esc((P.dept(dept) || {}).name || ''), V.weightTable(u, dept, true), { cls: 'flush', sub: 'O novo peso vale para os lançamentos futuros; os já feitos mantêm o peso da época. Somente diretoria, gerência e o gestor do departamento alteram.' })
      : V.empty('Escolha um departamento no seletor acima para ver e cadastrar as atividades e os pesos.', 'scale');
    return head + tabs + body;
  };
  A.atvNewActivity = () => { const u = U(); P.state.pesoDept = V.scopeDept(u) || u.deptId; A.editActivity({ dataset: {} }); };
  /* ---------- Cadastro único: atividade + peso + empresa + recorrência ---------- */
  A.newActRec = () => {
    const u = U(), depts = P.api.departments(u).filter(d => canManage(u, d.id));
    if (!depts.length) return P.toast('Somente diretoria, gerência e gestores cadastram tarefas recorrentes.', 'err');
    const d0 = depts.find(d => d.id === (V.scopeDept(u) || u.deptId)) || depts[0];
    const comps = (db().companies || []).filter(c => c.active !== false).sort((a, b) => a.name.localeCompare(b.name));
    const actOpts = deptId => P.api.activities(u, deptId).map(a => `<option value="${a.id}" data-w="${a.weight}">${esc(a.name)} · ${P.fmt.n(a.weight, 2)} pt</option>`).join('') + '<option value="__new">+ Nova atividade…</option>';
    P.ui.modal({
      title: 'Nova tarefa recorrente', wide: true, submit: 'Salvar',
      body: `<div class="fgrid">
        <label class="field span3"><span>Departamento</span><select id="ar-dept">${depts.map(d => `<option value="${d.id}" ${d.id === d0.id ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</select></label>
        <label class="field span2"><span>Atividade</span><select id="ar-act">${actOpts(d0.id)}</select></label>
        <label class="field"><span>Peso (pontos)</span><input type="number" id="ar-w" min="0.05" step="0.05"></label>
        <label class="field span2 ar-new" style="display:none"><span>Nome da nova atividade</span><input id="ar-name" placeholder="Ex.: Apuração do Simples Nacional"></label>
        <label class="field ar-new" style="display:none"><span>Unidade</span><input id="ar-unit" placeholder="Ex.: empresa/mês"></label>
        <div class="field span3"><span>Empresa</span>${P.companyPickerHtml('ar-co')}</div>
        <p class="fine span3" id="ar-resp">Escolha a empresa para ver quem recebe a tarefa.</p>
        <label class="field"><span>Dia do prazo (todo mês)</span><input type="number" id="ar-day" min="1" max="31" value="20"></label>
        <label class="field"><span>Começa em</span><input type="month" id="ar-start" value="${ym(P.today())}"></label>
        <label class="field"><span>Termina em (opcional)</span><input type="month" id="ar-end"></label>
        <label class="field check span3"><input type="checkbox" id="ar-bd" checked><span>Se cair no fim de semana, antecipa para o dia útil anterior</span></label>
      </div><p class="fine">${V.icon('info')} Todo mês a tarefa é criada para quem tem a empresa na carteira do departamento (Atividades → Carteira de empresas). Se ninguém tiver, vai para o gestor do departamento. Mudou o responsável na carteira? Os próximos meses já vão para a pessoa nova.</p>`,
      onSubmit: m => {
        const deptId = $('#ar-dept').value, actSel = $('#ar-act').value, client = $('#ar-co').value.trim(), w = $('#ar-w').value;
        if (!canManage(u, deptId)) throw new P.AccessError('Você só cadastra tarefas do seu departamento.');
        if (!comps.some(c => c.name === client)) throw new Error('Escolha uma empresa do cadastro.');
        const day = Number($('#ar-day').value), start = $('#ar-start').value, end = $('#ar-end').value;
        if (!(day >= 1 && day <= 31)) throw new Error('Informe o dia do prazo (1 a 31).');
        if (!start) throw new Error('Informe o mês de início.');
        if (end && end < start) throw new Error('O mês de término precisa ser depois do início.');
        let act;
        if (actSel === '__new') {
          const name = $('#ar-name').value.trim(), unit = $('#ar-unit').value.trim() || 'empresa/mês';
          if (!name) throw new Error('Informe o nome da nova atividade.');
          act = P.api.saveActivity(u, { deptId, name, unit, weight: w, reason: 'Criada no cadastro de tarefa recorrente' }) || P.store.db.activities.find(a => a.deptId === deptId && a.name === name);
        } else {
          act = P.act(actSel);
          if (Number(String(w).replace(',', '.')) !== act.weight) P.api.saveActivity(u, { id: act.id, deptId, name: act.name, unit: act.unit, weight: w, reason: 'Ajustado no cadastro de tarefa recorrente' });
        }
        if (!act) throw new Error('Não foi possível salvar a atividade.');
        const r = { id: P.uid('tr'), auto: true, userId: null, deptId, title: act.name + ' — ' + client, activityId: act.id, client, day, businessDay: $('#ar-bd').checked, start, end: end || '', active: true, createdBy: u.id, createdAt: D.stamp() };
        recs().push(r); P.audit(u, 'Tarefa recorrente criada', r.id, r.title + ' (dia ' + day + ')');
        if (!P.isLive) localGenerate();
        P.store.save(); if (P.isLive) setTimeout(() => generate(true), 1500);
        const resp = P.user(respOf(r));
        P.toast('Tarefa recorrente criada: todo dia ' + day + (resp ? ', para ' + resp.name : '') + '.'); P.render();
      }
    });
    const syncW = () => { const o = $('#ar-act').selectedOptions[0], isNew = o.value === '__new'; document.querySelectorAll('.ar-new').forEach(x => { x.style.display = isNew ? '' : 'none'; }); $('#ar-w').value = isNew ? 1 : o.dataset.w; };
    const showResp = () => { const c = $('#ar-co').value.trim(); if (!c) return; const id = respOf({ auto: true, deptId: $('#ar-dept').value, client: c }), x = P.user(id), assigned = (db().clientAssignments || []).some(a => a.deptId === $('#ar-dept').value && a.client === c);
      $('#ar-resp').innerHTML = x ? `Responsável hoje: <b>${esc(x.name)}</b>${assigned ? ' (carteira do departamento)' : ' — <b>ninguém tem esta empresa na carteira</b>; vai para o gestor até alguém ser vinculado'}.` : 'Ninguém tem esta empresa na carteira e o departamento não tem gestor: a tarefa só é criada quando houver um responsável.'; };
    $('#ar-act').addEventListener('change', syncW); syncW();
    $('#ar-dept').addEventListener('change', () => { $('#ar-act').innerHTML = actOpts($('#ar-dept').value); syncW(); showResp(); });
    P.companyPicker(comps, 'ar-co', showResp);
  };

  A.toggleTaskRec = el => {
    const r = recs().find(x => x.id === el.dataset.id); if (!r || !canManage(U(), r.deptId)) return;
    r.active = r.active === false; P.audit(U(), 'Tarefa recorrente ' + (r.active ? 'reativada' : 'pausada'), r.id, r.title);
    if (r.active && !P.isLive) localGenerate();
    P.store.save(); if (r.active && P.isLive) setTimeout(() => generate(true), 1500);
    P.render();
  };
  A.deleteTaskRec = el => {
    const r = recs().find(x => x.id === el.dataset.id); if (!r || !canManage(U(), r.deptId)) return;
    if (!confirm(`Excluir a recorrência "${r.title}"? Ela deixa de ser criada nos próximos meses. As tarefas já criadas continuam.`)) return;
    db().taskRecurrences = recs().filter(x => x.id !== r.id); P.audit(U(), 'Tarefa recorrente excluída', r.id, r.title); P.store.save(); P.render();
  };

})(window.P);
