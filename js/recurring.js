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
  const clientsOf = r => r.clients && r.clients.length ? r.clients : [r.client || ''];
  const respOf = (r, client) => {
    if (!r.auto) return r.userId;
    client = client != null ? client : clientsOf(r)[0];
    const ok = id => { const x = P.user(id); return x && x.active !== false; };
    const a = (db().clientAssignments || []).find(x => x.deptId === r.deptId && x.client === client && ok(x.userId));
    if (a) return a.userId;
    const d = P.dept(r.deptId); return d && ok(d.managerId) ? d.managerId : null;
  };
  /* Recorrência trimestral (ex.: fechamento de IRPJ e CSLL): a tarefa vence no mês seguinte ao fim de cada trimestre (jan, abr, jul, out).
   * O banco só conhece recorrência mensal, então as trimestrais ficam com active:false para ele ignorar e são geradas aqui, pelo navegador
   * de quem gerencia o departamento. "Pausada" para elas é o campo paused. */
  const isQ = r => r.freq === 'trimestral';
  const isOn = r => isQ(r) ? !r.paused : r.active !== false;
  const QMONTHS = [0, 3, 6, 9];
  const quarterOf = m => { const mo = m.getMonth(), y = m.getFullYear(); return mo === 0 ? '4º tri/' + (y - 1) : (mo / 3 + 0) + 'º tri/' + y; };
  // onlyQ: em produção o banco gera as mensais; aqui só as trimestrais
  function localGenerate(onlyQ) {
    const cur = D.monthStart(P.today()); let n = 0;
    const multi = r => !!(r.clients && r.clients.length);
    recs().filter(r => isOn(r) && (!onlyQ || isQ(r)) && (!onlyQ || canManage(U(), r.deptId))).forEach(r => (isQ(r) ? Array.from({ length: 13 }, (_, i) => D.addMonths(cur, i)) : [cur, D.addMonths(cur, 1)]).forEach(m => clientsOf(r).forEach(client => {
      if (isQ(r) && !QMONTHS.includes(m.getMonth())) return;
      const k = ym(m); if (k < (r.start || '0000') || (r.end && k > r.end)) return;
      // uma tarefa por empresa e por mês (ou por trimestre)
      const key = multi(r) ? r.id + '|' + client + '|' + k : r.id + '|' + k, uid = respOf(r, client), who = P.user(uid);
      if (!who || who.active === false || db().tasks.some(t => t.recKey === key)) return;
      const title = (multi(r) ? r.title + (isQ(r) ? ' (' + quarterOf(m) + ')' : '') + (client ? ' — ' + client : '') : r.title + (isQ(r) ? ' (' + quarterOf(m) + ')' : ''));
      // id fixo nas trimestrais: se dois navegadores gerarem ao mesmo tempo, o banco recusa o repetido em vez de duplicar
      const id = isQ(r) ? 'tq_' + key.replace(/[^A-Za-z0-9]+/g, '_') : P.uid('t');
      db().tasks.push({ id, userId: uid, deptId: r.deptId, title, activityId: r.activityId || null, client: client || '', due: dueOf(r, m), status: 'pendente', createdBy: r.createdBy, recId: r.id, recKey: key }); n++;
    })));
    return n;
  }
  let lastRun = 0;
  async function generate(force) {
    if (!U() || (!force && Date.now() - lastRun < 10 * 60e3)) return;
    lastRun = Date.now();
    if (P.isLive && P.backend && P.backend.client) {
      const { data, error } = await P.backend.client.rpc('generate_recurring_tasks');
      if (!error && data > 0 && P.backend.reload) await P.backend.reload();
      if (localGenerate(true)) { P.store.save(); P.render(); }
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
  /* ---------- Filtros e seleção em lote (recorrências e tarefas geradas) ---------- */
  const normS = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const rf = () => (P.state.rf = P.state.rf || { q: '', freq: '', st: '' });
  const recSel = () => (P.state.recSel = P.state.recSel || new Set());
  const taskSel = () => (P.state.taskSel = P.state.taskSel || new Set());
  const recFiltered = u => {
    const f = rf(), q = normS(f.q);
    return recs().filter(r => canManage(u, r.deptId))
      .filter(r => (!q || normS(r.title + ' ' + clientsOf(r).join(' ') + ' ' + ((P.dept(r.deptId) || {}).name || '')).includes(q)) && (!f.freq || (f.freq === 'trimestral') === isQ(r)) && (!f.st || (f.st === 'ativa') === isOn(r)))
      .sort((a, b) => a.title.localeCompare(b.title, 'pt-BR', { sensitivity: 'base', numeric: true }));
  };
  const cadLists = u => {
    const pend = P.api.tasks(u).filter(t => t.status === 'pendente' && canManage(u, t.deptId));
    return { pend, avulsas: V.taskFilter(pend.filter(t => !t.recId)).sort((a, b) => a.due.localeCompare(b.due)), geradas: V.taskFilter(pend.filter(t => t.recId)).sort((a, b) => a.due.localeCompare(b.due)) };
  };
  const recBar = (list, total) => {
    const f = rf(), n = list.filter(r => recSel().has(r.id)).length, on = !!(f.q || f.freq || f.st);
    return `<div class="toolbar tfilter">
      <label class="picker grow">${V.icon('search')}<input type="search" data-set="rf.q" data-live value="${esc(f.q)}" placeholder="Buscar recorrência por nome, empresa ou departamento" aria-label="Buscar recorrências" autocomplete="off"></label>
      <label class="picker"><select data-set="rf.freq" aria-label="Repetição"><option value="">Mensais e trimestrais</option><option value="mensal" ${f.freq === 'mensal' ? 'selected' : ''}>Só mensais</option><option value="trimestral" ${f.freq === 'trimestral' ? 'selected' : ''}>Só trimestrais</option></select></label>
      <label class="picker"><select data-set="rf.st" aria-label="Situação"><option value="">Ativas e pausadas</option><option value="ativa" ${f.st === 'ativa' ? 'selected' : ''}>Só ativas</option><option value="pausada" ${f.st === 'pausada' ? 'selected' : ''}>Só pausadas</option></select></label>
      ${on ? V.btn('Limpar filtros', { act: 'rfClear', icon: 'x', cls: 'sm ghost' }) : ''}
      ${n ? `<span class="fine"><b>${n}</b> selecionada(s)</span>${V.btn('Pausar', { act: 'recBulk', icon: 'clock', cls: 'sm ghost', attrs: 'data-do="pause"' })}${V.btn('Reativar', { act: 'recBulk', icon: 'check', cls: 'sm ghost', attrs: 'data-do="resume"' })}${V.btn('Excluir selecionadas', { act: 'recBulk', icon: 'trash', cls: 'sm ghost danger', attrs: 'data-do="delete"' })}` : ''}
      <span class="fine tf-count">${list.length} de ${total} recorrência(s)</span></div>`;
  };
  const recTable = list => list.length ? `<div class="table-wrap"><table class="tbl"><thead><tr><th class="chk-col"><input type="checkbox" data-act="recSelAll" aria-label="Selecionar todas" ${list.every(r => recSel().has(r.id)) ? 'checked' : ''}></th><th>Tarefa</th><th>Responsável</th><th>Prazo</th><th>Período</th><th>Situação</th><th class="actions-col"></th></tr></thead><tbody>
    ${list.map(r => { const cl = clientsOf(r).filter(Boolean), many = cl.length > 1; return `<tr class="${!isOn(r) ? 'inactive' : ''}"><td class="chk-col"><input type="checkbox" data-act="recSel" data-id="${esc(r.id)}" aria-label="Selecionar" ${recSel().has(r.id) ? 'checked' : ''}></td><td><b>${esc(r.title)}</b>${many ? `<small class="obs" title="${esc(cl.join(', '))}">${cl.length} empresas</small>` : cl[0] ? `<small class="obs">${esc(cl[0])}</small>` : ''}</td><td>${r.auto ? `${many ? 'Responsável de cada empresa' : who(respOf(r))}<small class="obs">automático (carteira de ${esc((P.dept(r.deptId) || {}).name || '—')})</small>` : who(r.userId)}</td>
      <td class="nowrap">${isQ(r) ? 'Trimestral · dia ' + r.day : 'Todo dia ' + r.day}${r.businessDay ? ' <small class="muted">(dia útil)</small>' : ''}${isQ(r) ? '<small class="obs">jan, abr, jul e out</small>' : ''}</td>
      <td class="nowrap">${r.start.split('-').reverse().join('/')}${r.end ? ' a ' + r.end.split('-').reverse().join('/') : ' em diante'}</td>
      <td>${!isOn(r) ? '<span class="badge st-sem">Pausada</span>' : '<span class="badge es-aprovado">Ativa</span>'}</td>
      <td class="actions-col">${V.ibtn(!isOn(r) ? 'check' : 'clock', !isOn(r) ? 'Reativar' : 'Pausar', { act: 'toggleTaskRec', attrs: `data-id="${esc(r.id)}"` })}${V.ibtn('trash', 'Excluir recorrência', { act: 'deleteTaskRec', attrs: `data-id="${esc(r.id)}"` })}</td></tr>`; }).join('')}
    </tbody></table></div>` : V.empty('Nenhuma tarefa recorrente. Use "Nova tarefa" e marque "Repetir todo mês".', 'refresh');
  // corpo da aba "Cadastro de tarefas" (dentro de Atividades)
  const cadastro = u => {
    const allRecs = recs().filter(r => canManage(u, r.deptId)), list = recFiltered(u);
    const today = D.iso(P.today());
    const { pend, avulsas, geradas } = cadLists(u);
    const delBtn = l => { const n = l.filter(t => taskSel().has(t.id)).length; return n ? V.btn('Excluir selecionadas (' + n + ')', { act: 'taskBulkDelete', icon: 'trash', cls: 'sm ghost danger' }) : ''; };
    const taskRows = (l, key) => { const pg = V.pageSlice(l, key); return l.length ? taskTable(pg.items, key) + pg.bar : V.empty('Nenhuma tarefa pendente.', 'check'); };
    const taskTable = (l, key) => `<div class="table-wrap"><table class="tbl"><thead><tr><th class="chk-col"><input type="checkbox" data-act="taskSelAll" data-list="${key}" aria-label="Selecionar todas as filtradas" ${(key === 'gen' ? geradas : avulsas).every(t => taskSel().has(t.id)) ? 'checked' : ''}></th><th>Tarefa</th><th>Responsável</th><th>Prazo</th><th class="actions-col"></th></tr></thead><tbody>${l.map(t => `<tr><td class="chk-col"><input type="checkbox" data-act="taskSel" data-id="${t.id}" aria-label="Selecionar" ${taskSel().has(t.id) ? 'checked' : ''}></td><td><b>${esc(t.title)}</b>${t.client && !t.title.includes(t.client) ? `<small class="obs">${esc(t.client)}</small>` : ''}</td><td>${who(t.userId)}</td><td class="nowrap${t.due < today ? ' bad' : ''}">${D.fmt(t.due)}${t.due < today ? ' <small>(atrasada)</small>' : ''}${t.postponed && t.postponed.length ? ' <small title="' + esc(t.postponed.map(x => D.fmt(x.from) + ' → ' + D.fmt(x.to) + ': ' + x.reason).join('\n')) + '">(adiada)</small>' : ''}</td><td class="actions-col"><div class="row-actions">${taskBtns(u, t)}</div></td></tr>`).join('')}</tbody></table></div>`;
    return `<div class="kpis k3">${V.kpi('Recorrências ativas', allRecs.filter(isOn).length, { icon: 'refresh' })}${V.kpi('Geradas pendentes', geradas.length, { icon: 'clock' })}${V.kpi('Avulsas pendentes', avulsas.length, { icon: 'clipboard' })}</div>
      ${recBar(list, allRecs.length)}
      ${V.card('Tarefas recorrentes', recTable(list), { cls: 'flush', sub: 'As mensais são criadas para o mês atual e o próximo; as trimestrais, para os próximos 12 meses. Pausar ou excluir não apaga as já criadas.' })}
      ${V.taskFilterBar(pend, avulsas.length + geradas.length)}
      <div class="grid g-1-1">${V.card('Geradas pelas recorrências (pendentes)', taskRows(geradas, 'gen'), { cls: 'flush', actions: delBtn(geradas) })}${V.card('Tarefas avulsas (pendentes)', taskRows(avulsas, 'avu'), { cls: 'flush', actions: delBtn(avulsas) })}</div>`;
  };
  A.taskRecurrences = () => { P.state.atvTab = 'cadastro'; P.go('atividades'); };

  /* ---------- Abas dentro de Atividades: Tarefas | Cadastro de tarefas | Atividades e pesos ---------- */
  // criar atividades e definir pesos: só diretoria, gerência e gestores (o gestor, no próprio departamento)
  const origAtv = V.atividades;
  V.atividades = u => {
    if (u.role === 'employee' || !P.PAGES.tarefas.includes(u.role)) return origAtv(u);
    const S = P.state, tab = S.atvTab || 'tarefas';
    const dept = V.scopeDept(u) || (u.role === 'manager' ? u.deptId : '');
    const tabs = `<div class="toolbar atv-tabs">${V.tabs([['tarefas', 'Tarefas da equipe'], ['cadastro', 'Cadastro de tarefas', recs().filter(r => canManage(u, r.deptId) && isOn(r)).length], ['pesos', 'Atividades e pesos']], tab, 'atvTab')}</div>`;
    if (tab === 'tarefas') { const html = origAtv(u), i = html.indexOf('<div class="strip">'); return i > 0 ? html.slice(0, i) + tabs + html.slice(i) : tabs + html; }
    const head = tab === 'cadastro'
      ? V.pageHead('Cadastro de tarefas', 'Atividade, peso, empresa e recorrência num só cadastro. Todo mês a tarefa aparece para quem cuida da empresa no departamento.', V.deptPicker(u) + V.btn('Editar em lote', { act: 'batchEditTasks', icon: 'edit', cls: 'ghost' }) + V.btn('Tarefa avulsa', { act: 'newTask', icon: 'plus', cls: 'ghost' }) + V.btn('Nova tarefa recorrente', { act: 'newActRec', icon: 'refresh', cls: 'primary' }))
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
    // "+ Nova atividade" fica no topo da lista (no fim ninguém achava); a primeira atividade continua selecionada
    const actOpts = deptId => '<option value="__new">+ Nova atividade…</option>' + P.api.activities(u, deptId).map((a, i) => `<option value="${a.id}" data-w="${a.weight}" ${i === 0 ? 'selected' : ''}>${esc(a.name)} · ${P.fmt.n(a.weight, 2)} pt</option>`).join('');
    P.ui.modal({
      title: 'Nova tarefa recorrente', wide: true, submit: 'Salvar',
      body: `<div class="fgrid">
        <label class="field span3"><span>Departamento</span><select id="ar-dept">${depts.map(d => `<option value="${d.id}" ${d.id === d0.id ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</select></label>
        <label class="field span2"><span>Atividade</span><select id="ar-act">${actOpts(d0.id)}</select></label>
        <label class="field"><span>Peso (pontos)</span><input type="number" id="ar-w" min="0.05" step="0.05"></label>
        <label class="field span2 ar-new" style="display:none"><span>Nome da nova atividade</span><input id="ar-name" placeholder="Ex.: Apuração do Simples Nacional"></label>
        <label class="field ar-new" style="display:none"><span>Unidade</span><input id="ar-unit" placeholder="Ex.: empresa/mês"></label>
        <div class="field span3"><span>Empresas (uma, duas ou mais)</span>${P.companyPickerHtml('ar-co')}</div>
        <div class="span3"><button type="button" class="link" id="ar-all">Adicionar todas as empresas da carteira deste departamento</button></div>
        <div class="span3 ar-chips" id="ar-chips"><p class="fine">Nenhuma empresa escolhida.</p></div>
        <label class="field span3"><span>Repetição</span><select id="ar-freq"><option value="mensal">Todo mês</option><option value="trimestral">Trimestral: o prazo cai em jan, abr, jul e out (mês seguinte ao fim de cada trimestre)</option></select></label>
        <label class="field"><span>Dia do prazo</span><input type="number" id="ar-day" min="1" max="31" value="20"></label>
        <label class="field"><span>Começa em</span><input type="month" id="ar-start" value="${ym(P.today())}"></label>
        <label class="field"><span>Termina em (opcional)</span><input type="month" id="ar-end"></label>
        <label class="field check span3"><input type="checkbox" id="ar-bd" checked><span>Se cair no fim de semana, antecipa para o dia útil anterior</span></label>
      </div><p class="fine">${V.icon('info')} Todo mês a tarefa é criada para quem tem a empresa na carteira do departamento (Atividades → Carteira de empresas). Se ninguém tiver, vai para o gestor do departamento. Mudou o responsável na carteira? Os próximos meses já vão para a pessoa nova.</p>`,
      onSubmit: m => {
        const deptId = $('#ar-dept').value, actSel = $('#ar-act').value, w = $('#ar-w').value;
        if (!canManage(u, deptId)) throw new P.AccessError('Você só cadastra tarefas do seu departamento.');
        if (!sel.length) throw new Error('Escolha pelo menos uma empresa.');
        // evita cadastrar duas vezes a mesma recorrência (cada cadastro gera uma tarefa por empresa)
        const wantQ = $('#ar-freq').value === 'trimestral', nm = ((actSel === '__new' ? $('#ar-name').value : (P.act(actSel) || {}).name) || '').trim().toLowerCase();
        const dupe = nm && recs().find(x => x.deptId === deptId && isOn(x) && isQ(x) === wantQ && String(x.title || '').trim().toLowerCase() === nm);
        if (dupe) throw new Error('Já existe uma recorrência ativa "' + dupe.title + '" neste departamento (' + (isQ(dupe) ? 'trimestral' : 'mensal') + ', dia ' + dupe.day + '). Exclua ou pause a existente antes de criar outra.');
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
        const quarterly = $('#ar-freq').value === 'trimestral';
        const r = { id: P.uid('tr'), auto: true, userId: null, deptId, title: act.name, activityId: act.id, clients: sel.slice(), day, businessDay: $('#ar-bd').checked, start, end: end || '', active: !quarterly, createdBy: u.id, createdAt: D.stamp() };
        if (quarterly) { r.freq = 'trimestral'; r.paused = false; }
        recs().push(r); P.audit(u, 'Tarefa recorrente criada', r.id, r.title + (quarterly ? ' (trimestral, dia ' : ' (dia ') + day + ')');
        if (!P.isLive || quarterly) localGenerate(P.isLive);
        P.store.save(); if (P.isLive && !quarterly) setTimeout(() => generate(true), 1500);
        P.toast('Tarefa recorrente criada para ' + sel.length + ' empresa(s): ' + (quarterly ? 'trimestral, dia ' + day + ' de jan, abr, jul e out' : 'todo dia ' + day) + ', para o responsável de cada uma.'); P.render();
      }
    });
    const sel = [];
    const drawChips = () => {
      const dep = $('#ar-dept').value;
      $('#ar-chips').innerHTML = sel.length ? `<p class="fine">${sel.length} empresa(s). Quem recebe cada tarefa:</p><ul class="ar-list">${sel.map((c, i) => { const id = respOf({ auto: true, deptId: dep, client: c }), x = P.user(id), inCart = (db().clientAssignments || []).some(a => a.deptId === dep && a.client === c);
        return `<li><span>${esc(c)}</span><small class="${inCart ? '' : 'warn'}">${x ? esc(x.name) + (inCart ? '' : ' (gestor: ninguém na carteira)') : 'sem responsável'}</small><button type="button" class="link" data-i="${i}" aria-label="Remover ${esc(c)}">×</button></li>`; }).join('')}</ul>` : '<p class="fine">Nenhuma empresa escolhida.</p>';
      $('#ar-chips').querySelectorAll('button[data-i]').forEach(b => b.addEventListener('click', () => { sel.splice(Number(b.dataset.i), 1); drawChips(); }));
    };
    const add = name => { if (name && !sel.includes(name)) { sel.push(name); drawChips(); } const i = $('#ar-co'); if (i) { i.value = ''; const x = $('#ar-co-x'); if (x) x.hidden = true; } };
    $('#ar-all').addEventListener('click', () => { const dep = $('#ar-dept').value; (db().clientAssignments || []).filter(a => a.deptId === dep).map(a => a.client).sort().forEach(c => { if (!sel.includes(c)) sel.push(c); }); drawChips(); });
    const syncW = () => { const o = $('#ar-act').selectedOptions[0], isNew = o.value === '__new'; document.querySelectorAll('.ar-new').forEach(x => { x.style.display = isNew ? '' : 'none'; }); $('#ar-w').value = isNew ? 1 : o.dataset.w; };
    $('#ar-act').addEventListener('change', syncW); syncW();
    $('#ar-dept').addEventListener('change', () => { $('#ar-act').innerHTML = actOpts($('#ar-dept').value); syncW(); drawChips(); });
    P.companyPicker(comps, 'ar-co', add);
  };

  /* ---------- Adiar ou dispensar uma tarefa (com motivo) ---------- */
  // o responsável pela tarefa, o gestor do departamento, a gerência e a diretoria
  const canHandle = (u, t) => !!u && !!t && (t.userId === u.id || canManage(u, t.deptId));
  const taskOf = el => db().tasks.find(x => x.id === el.dataset.id);
  const notifyOwner = (t, u, text) => { if (t.userId !== u.id && P.notify) P.notify([t.userId], { type: 'tarefa', icon: 'clipboard', title: 'Tarefa alterada', text, link: 'atividades' }); };
  const notifyMgr = (t, u, text) => { const d = P.dept(t.deptId); if (P.notify && d && d.managerId && d.managerId !== u.id) P.notify([d.managerId], { type: 'tarefa', icon: 'clipboard', title: 'Tarefa alterada', text, link: 'atividades' }); };
  const reasonOk = v => { if ((v || '').trim().length < 5) throw new Error('Descreva o motivo (pelo menos 5 caracteres).'); return v.trim(); };
  A.postponeTask = el => {
    const u = U(), t = taskOf(el);
    if (!canHandle(u, t) || t.status !== 'pendente') return P.toast('Você não pode adiar esta tarefa.', 'err');
    const end = D.iso(D.monthEnd(D.parse(t.due)));
    P.ui.modal({
      title: 'Adiar tarefa', submit: 'Adiar',
      body: `<p class="prose"><b>${esc(t.title)}</b><br><small class="muted">Prazo atual: ${D.fmt(t.due)}</small></p>
        <div class="fgrid"><label class="field"><span>Novo prazo</span><input type="date" id="tp-due" min="${D.iso(D.add(D.parse(t.due), 1))}" value="${D.iso(D.add(D.parse(t.due), 7))}"></label>
        <label class="field span3"><span>Motivo</span><textarea id="tp-why" rows="3" placeholder="Ex.: cliente ainda não enviou os extratos"></textarea></label></div>
        <p class="fine">${V.icon('info')} O adiamento fica registrado na tarefa, com o motivo e quem adiou.${t.recId ? ' A tarefa do mês seguinte continua sendo criada normalmente.' : ''}</p>`,
      onSubmit: m => {
        const due = $('#tp-due').value, why = reasonOk($('#tp-why').value);
        if (!due || due <= t.due) throw new Error('Escolha um prazo depois do atual.');
        (t.postponed = t.postponed || []).push({ from: t.due, to: due, reason: why, by: u.id, at: D.stamp() });
        if (!t.originalDue) t.originalDue = t.due;
        t.due = due;
        P.audit(u, 'Tarefa adiada', t.id, t.title + ' para ' + D.fmt(due) + ' · ' + why);
        notifyOwner(t, u, `${t.title}: prazo adiado para ${D.fmt(due)} (${why}).`); notifyMgr(t, u, `${u.name} adiou "${t.title}" para ${D.fmt(due)}: ${why}`);
        P.store.save(); P.toast('Tarefa adiada para ' + D.fmt(due) + '.'); P.render();
      }
    });
    void end;
  };
  A.dismissTask = el => {
    const u = U(), t = taskOf(el);
    if (!canHandle(u, t) || t.status !== 'pendente') return P.toast('Você não pode dispensar esta tarefa.', 'err');
    P.ui.modal({
      title: 'Dispensar tarefa', submit: 'Dispensar',
      body: `<p class="prose"><b>${esc(t.title)}</b><br><small class="muted">Prazo: ${D.fmt(t.due)}</small></p>
        <label class="field"><span>Motivo da dispensa</span><textarea id="td-why" rows="3" placeholder="Ex.: empresa sem movimento no mês"></textarea></label>
        <p class="fine">${V.icon('info')} A tarefa sai das pendentes e não conta como atrasada. Ela não gera pontos e fica registrada em "Concluídas" como dispensada.${t.recId ? ' A do mês seguinte continua sendo criada.' : ''}</p>`,
      onSubmit: m => {
        const why = reasonOk($('#td-why').value);
        t.status = 'dispensada'; t.dismissed = { reason: why, by: u.id, at: D.stamp() };
        P.audit(u, 'Tarefa dispensada', t.id, t.title + ' · ' + why);
        notifyOwner(t, u, `${t.title}: dispensada (${why}).`); notifyMgr(t, u, `${u.name} dispensou "${t.title}": ${why}`);
        P.store.save(); P.toast('Tarefa dispensada.'); P.render();
      }
    });
  };
  A.reopenTask = el => {
    const u = U(), t = taskOf(el);
    if (!t || !canManage(u, t.deptId) || t.status !== 'dispensada') return;
    if (!confirm('Reabrir esta tarefa? Ela volta para as pendentes.')) return;
    (t.reopened = t.reopened || []).push({ by: u.id, at: D.stamp(), dismissed: t.dismissed }); t.status = 'pendente'; delete t.dismissed;
    P.audit(u, 'Tarefa reaberta', t.id, t.title); notifyOwner(t, u, `${t.title}: reaberta por ${u.name}.`);
    P.store.save(); P.render();
  };
  // editar uma tarefa já lançada (prazo, responsável, título, atividade, empresa): gestor do departamento, gerência e diretoria
  A.editTask = el => {
    const u = U(), t = taskOf(el);
    if (!t || !canManage(u, t.deptId) || t.status !== 'pendente') return P.toast('Você não pode editar esta tarefa.', 'err');
    const people = db().users.filter(x => x.deptId === t.deptId && x.active !== false && (x.role === 'employee' || x.role === 'manager')).sort((a, b) => a.name.localeCompare(b.name));
    if (!people.some(x => x.id === t.userId) && P.user(t.userId)) people.unshift(P.user(t.userId));
    const acts = P.api.activities(u, t.deptId);
    const clients = [...new Set((db().clientAssignments || []).filter(a => a.deptId === t.deptId).map(a => a.client).concat(t.client ? [t.client] : []))].sort((a, b) => a.localeCompare(b));
    P.ui.modal({
      title: 'Editar tarefa', submit: 'Salvar alterações',
      body: `<div class="fgrid">
        <label class="field span3"><span>Título</span><input type="text" id="te-title" value="${esc(t.title)}" maxlength="160"></label>
        <label class="field span3"><span>Responsável</span><select id="te-user">${people.map(x => `<option value="${x.id}" ${x.id === t.userId ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>
        <label class="field span3"><span>Atividade</span><select id="te-act"><option value="">Sem atividade</option>${acts.map(a => `<option value="${a.id}" ${a.id === t.activityId ? 'selected' : ''}>${esc(a.name)} · ${P.fmt.n(a.weight, 2)} pt</option>`).join('')}</select></label>
        <label class="field span2"><span>Empresa</span><select id="te-client"><option value="">Sem empresa vinculada</option>${clients.map(c => `<option value="${esc(c)}" ${c === t.client ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label>
        <label class="field"><span>Prazo</span><input type="date" id="te-due" value="${esc(t.due)}"></label></div>
        <p class="fine">${V.icon('info')} A alteração fica registrada com data e autor${t.recId ? '. A tarefa do mês seguinte continua sendo criada normalmente pela recorrência' : ''}.</p>`,
      onSubmit: m => {
        const title = $('#te-title').value.trim(), userId = $('#te-user').value, actId = $('#te-act').value, client = $('#te-client').value, due = $('#te-due').value;
        if (!title) throw new Error('Informe o título.');
        if (!due) throw new Error('Informe o prazo.');
        const who2 = P.user(userId); if (!who2 || who2.deptId !== t.deptId) throw new Error('O responsável precisa ser do mesmo departamento da tarefa.');
        if (actId && (P.act(actId) || {}).deptId !== t.deptId) throw new Error('A atividade escolhida é de outro departamento.');
        const changes = [];
        if (title !== t.title) changes.push('título');
        if (due !== t.due) { changes.push('prazo ' + D.fmt(t.due) + ' → ' + D.fmt(due)); if (!t.originalDue) t.originalDue = t.due; }
        if (userId !== t.userId) changes.push('responsável: ' + ((P.user(t.userId) || {}).name || '—') + ' → ' + who2.name);
        if ((actId || null) !== (t.activityId || null)) changes.push('atividade');
        if (client !== (t.client || '')) changes.push('empresa');
        if (!changes.length) return;
        const oldUser = t.userId;
        (t.edits = t.edits || []).push({ by: u.id, at: D.stamp(), changes: changes.join('; ') });
        Object.assign(t, { title, userId, activityId: actId || null, client, due });
        P.audit(u, 'Tarefa editada', t.id, t.title + ' · ' + changes.join('; '));
        if (P.notify) {
          const ids = [...new Set([userId, oldUser])].filter(id => id !== u.id);
          if (ids.length) P.notify(ids, { type: 'tarefa', icon: 'clipboard', title: 'Tarefa alterada', text: `${u.name} editou "${t.title}" (${changes.join('; ')}).`, link: 'atividades' });
        }
        P.store.save(); P.toast('Tarefa atualizada.'); P.render();
      }
    });
  };
  /* ---------- Editar em lote: filtra pelo nome (ex.: ISS) e muda prazo/responsável de todas de uma vez ---------- */
  A.batchEditTasks = () => {
    const u = U();
    const scope = () => P.api.tasks(u, { deptId: V.scopeDept(u) || undefined }).filter(t => t.status === 'pendente' && canManage(u, t.deptId));
    // o nome que vale é o da atividade/recorrência (o título das tarefas por empresa leva o nome da empresa)
    const keyOf = t => (P.act(t.activityId) || {}).name || (t.recId && recs().find(r => r.id === t.recId) || {}).title || t.title || '';
    const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
    const all = scope();
    if (!all.length) return P.toast('Não há tarefas pendentes para editar.', 'err');
    // banco de tarefas do departamento: atividades cadastradas + recorrências + o que já existe pendente, com a contagem de pendentes
    const bank = new Map();
    const addName = (name, n) => { const k = norm(name || ''); if (!k) return; const b = bank.get(k) || { name, n: 0 }; b.n += n; bank.set(k, b); };
    [...new Set(all.map(t => t.deptId))].forEach(d => { P.api.activities(u, d).forEach(a => addName(a.name, 0)); });
    recs().filter(r => canManage(u, r.deptId) && (!V.scopeDept(u) || r.deptId === V.scopeDept(u))).forEach(r => addName(r.title, 0));
    all.forEach(t => addName(keyOf(t), 1));
    const names = [...bank.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name));
    const owners = [...new Set(all.map(t => t.userId))].map(id => P.user(id)).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name));
    const deptIds = [...new Set(all.map(t => t.deptId))];
    const people = deptIds.map(d => ({ d, list: db().users.filter(x => x.deptId === d && x.active !== false && (x.role === 'employee' || x.role === 'manager')).sort((a, b) => a.name.localeCompare(b.name)) }));
    const pick = () => {
      const q = $('#bt-q').value, mon = $('#bt-mon').value, from = $('#bt-from').value;
      return all.filter(t => (!q || norm(keyOf(t)) === q) && (!mon || t.due.slice(0, 7) === mon) && (!from || t.userId === from));
    };
    P.ui.modal({
      title: 'Editar tarefas em lote', wide: true, submit: 'Aplicar a todas',
      body: `<div class="fgrid">
        <p class="fine span3"><b>1. Quais tarefas?</b> Escolha a tarefa na lista. Mês e responsável são filtros opcionais: deixe em branco para pegar todos.</p>
        <label class="field span2"><span>Tarefa (do banco de tarefas do departamento)</span><select id="bt-q"><option value="">Todas as tarefas</option>${names.map(([k, b]) => `<option value="${esc(k)}">${esc(b.name)} (${b.n} pendente${b.n === 1 ? '' : 's'})</option>`).join('')}</select></label>
        <label class="field"><span>Mês do prazo</span><input type="month" id="bt-mon"></label>
        <label class="field span3"><span>Responsável atual</span><select id="bt-from"><option value="">Todos</option>${owners.map(x => `<option value="${x.id}">${esc(x.name)}</option>`).join('')}</select></label>
        <div class="span3 fine" id="bt-prev"></div>
        <p class="fine span3"><b>2. O que mudar?</b> Preencha só o que quiser alterar.</p>
        <label class="field"><span>Novo dia do prazo (1 a 31)</span><input type="number" id="bt-day" min="1" max="31" placeholder="Ex.: 15"></label>
        <label class="field"><span>ou prazo exato</span><input type="date" id="bt-due"></label>
        <label class="field"><span>Novo responsável</span><select id="bt-user"><option value="">Não mudar</option>${people.map(g => `<optgroup label="${esc((P.dept(g.d) || { name: '—' }).name)}">${g.list.map(x => `<option value="${x.id}">${esc(x.name)}</option>`).join('')}</optgroup>`).join('')}</select></label>
        <label class="field check span3"><input type="checkbox" id="bt-rec" checked><span><b>Aplicar também nas recorrências</b> (os próximos meses já nascem com o novo dia e o novo responsável)</span></label>
      </div><p class="fine">${V.icon('info')} "Novo dia" mantém o mês de cada tarefa e antecipa para dia útil quando a recorrência está assim. O novo responsável vale só para tarefas do mesmo departamento dele; nas recorrências automáticas, quem recebe continua sendo definido pela carteira de empresas.</p>`,
      onSubmit: m => {
        const list = pick(); if (!list.length) throw new Error('Nenhuma tarefa corresponde ao filtro.');
        const day = Number($('#bt-day').value) || 0, due = $('#bt-due').value, userId = $('#bt-user').value, withRec = $('#bt-rec').checked;
        if (!day && !due && !userId) throw new Error('Escolha o que mudar: dia do prazo, prazo exato ou responsável.');
        if (day && due) throw new Error('Use o dia do prazo ou o prazo exato, não os dois.');
        if (day && !(day >= 1 && day <= 31)) throw new Error('O dia do prazo vai de 1 a 31.');
        const newUser = userId ? P.user(userId) : null;
        if (userId && !newUser) throw new Error('Responsável não encontrado.');
        if (list.length > 20 && !confirm('Alterar ' + list.length + ' tarefas de uma vez?')) return false; // false: mantém o modal aberto
        const stamp = D.stamp(), notes = new Map(); const recDone = new Set(); let n = 0, skipped = 0;
        list.forEach(t => {
          const rec = t.recId ? recs().find(r => r.id === t.recId) : null, ch = [];
          let nd = t.due;
          if (due) nd = due; else if (day) { const d0 = D.parse(t.due); nd = dueOf({ day, businessDay: rec ? rec.businessDay : false }, new Date(d0.getFullYear(), d0.getMonth(), 1)); }
          if (nd !== t.due) { ch.push('prazo ' + D.fmt(t.due) + ' → ' + D.fmt(nd)); if (!t.originalDue) t.originalDue = t.due; }
          let nu = t.userId;
          if (newUser) { if (newUser.deptId !== t.deptId) skipped++; else if (newUser.id !== t.userId) { ch.push('responsável: ' + ((P.user(t.userId) || {}).name || '—') + ' → ' + newUser.name); nu = newUser.id; } }
          if (!ch.length) return;
          (t.edits = t.edits || []).push({ by: u.id, at: stamp, changes: ch.join('; '), batch: true });
          [t.userId, nu].forEach(id => { if (id && id !== u.id) notes.set(id, (notes.get(id) || 0) + 1); });
          t.due = nd; t.userId = nu; n++;
          if (rec && withRec && !recDone.has(rec.id)) {
            recDone.add(rec.id);
            if (day) rec.day = day;
            if (newUser && !rec.auto && newUser.deptId === rec.deptId) rec.userId = newUser.id;
          }
        });
        if (!n) { P.toast('Nada mudou: as tarefas já estão assim.'); return false; }
        P.audit(u, 'Tarefas editadas em lote', 'lote', n + ' tarefa(s)' + (recDone.size ? ' e ' + recDone.size + ' recorrência(s)' : '') + ' · ' + [day ? 'dia ' + day : due ? 'prazo ' + D.fmt(due) : '', newUser ? 'responsável ' + newUser.name : ''].filter(Boolean).join(' · '));
        if (P.notify && notes.size) notes.forEach((c, id) => P.notify([id], { type: 'tarefa', icon: 'clipboard', title: 'Tarefas alteradas', text: `${u.name} alterou ${c} tarefa(s) sua(s) em lote. Veja os novos prazos.`, link: 'atividades' }));
        P.store.save();
        P.toast(n + ' tarefa(s) atualizada(s)' + (recDone.size ? ' e ' + recDone.size + ' recorrência(s)' : '') + (skipped ? '. ' + skipped + ' ficaram com o responsável antigo (outro departamento)' : '') + '.');
        P.render();
      }
    });
    const prev = () => {
      const l = pick(), sample = l.slice(0, 5).map(t => esc(t.title) + ' (' + D.fmt(t.due) + ')').join(' · ');
      $('#bt-prev').innerHTML = `<b>${l.length}</b> tarefa(s) selecionada(s) de ${all.length}.${l.length ? '<br>' + sample + (l.length > 5 ? ' …' : '') : ''}`;
    };
    ['bt-q', 'bt-mon', 'bt-from'].forEach(id => { const el = $('#' + id); el.addEventListener('input', prev); el.addEventListener('change', prev); });
    prev();
  };
  // lista de tarefas: botões Adiar/Dispensar/Editar e o registro do motivo
  // botões com texto (não só ícone), para ficarem fáceis de achar
  const taskBtns = (u, t) => t.status === 'pendente' && canHandle(u, t)
    ? (canManage(u, t.deptId) ? V.btn('Editar', { act: 'editTask', icon: 'edit', cls: 'sm ghost', attrs: `data-id="${t.id}"` }) : '') + V.btn('Adiar', { act: 'postponeTask', icon: 'clock', cls: 'sm ghost', attrs: `data-id="${t.id}"` }) + V.btn('Dispensar', { act: 'dismissTask', icon: 'x', cls: 'sm ghost', attrs: `data-id="${t.id}"` })
    : t.status === 'dispensada' && canManage(u, t.deptId) ? V.btn('Reabrir', { act: 'reopenTask', icon: 'refresh', cls: 'sm ghost', attrs: `data-id="${t.id}"` }) : '';
  V.taskExtra = (u, t) => {
      const extra = [];
      if (t.status === 'dispensada' && t.dismissed) extra.push(`<span class="badge st-sem">${V.icon('x')}Dispensada</span><small class="task-why">${esc(t.dismissed.reason)} · ${esc((P.user(t.dismissed.by) || {}).name || '')}</small>`);
      if (t.status === 'pendente' && t.postponed && t.postponed.length) { const p = t.postponed[t.postponed.length - 1]; extra.push(`<small class="task-why" title="${esc(t.postponed.map(x => D.fmt(x.from) + ' → ' + D.fmt(x.to) + ': ' + x.reason).join('\n'))}">Adiada${t.postponed.length > 1 ? ' ' + t.postponed.length + 'x' : ''} (era ${D.fmt(t.originalDue || p.from)}): ${esc(p.reason)}</small>`); }
      const btns = taskBtns(u, t);
      return `${btns ? `<div class="task-acts">${btns}</div>` : ''}${extra.length ? `<div class="task-extra">${extra.join(' ')}</div>` : ''}`;
  };

  A.toggleTaskRec = el => {
    const r = recs().find(x => x.id === el.dataset.id); if (!r || !canManage(U(), r.deptId)) return;
    if (isQ(r)) r.paused = !r.paused; else r.active = r.active === false;
    const on = isOn(r); P.audit(U(), 'Tarefa recorrente ' + (on ? 'reativada' : 'pausada'), r.id, r.title);
    if (on && !P.isLive) localGenerate();
    P.store.save(); if (on && P.isLive) setTimeout(() => generate(true), 1500);
    P.render();
  };
  A.deleteTaskRec = el => {
    const r = recs().find(x => x.id === el.dataset.id); if (!r || !canManage(U(), r.deptId)) return;
    if (!confirm(`Excluir a recorrência "${r.title}"? Ela deixa de ser criada nos próximos meses.`)) return;
    // as tarefas pendentes que ela já criou podem sair junto (útil quando o cadastro foi feito em duplicidade)
    const pend = db().tasks.filter(t => t.recId === r.id && t.status === 'pendente');
    let removed = 0;
    if (pend.length && confirm(`Apagar também as ${pend.length} tarefa(s) PENDENTE(S) criadas por esta recorrência?\n\nOK = apagar as pendentes. Cancelar = manter as tarefas já criadas.`)) {
      const ids = new Set(pend.map(t => t.id)); db().tasks = db().tasks.filter(t => !ids.has(t.id)); removed = ids.size;
    }
    db().taskRecurrences = recs().filter(x => x.id !== r.id); P.audit(U(), 'Tarefa recorrente excluída', r.id, r.title + (removed ? ' · ' + removed + ' tarefa(s) pendente(s) apagada(s)' : '')); P.store.save();
    P.toast('Recorrência excluída' + (removed ? ' e ' + removed + ' tarefa(s) pendente(s) apagada(s)' : '') + '.'); P.render();
  };

  /* ---------- Ações em lote ---------- */
  const flip = (set, id) => { set.has(id) ? set.delete(id) : set.add(id); };
  A.recSel = el => { flip(recSel(), el.dataset.id); P.render(); };
  A.recSelAll = () => { const list = recFiltered(U()), s = recSel(), all = list.every(r => s.has(r.id)); list.forEach(r => all ? s.delete(r.id) : s.add(r.id)); P.render(); };
  A.rfClear = () => { P.state.rf = { q: '', freq: '', st: '' }; P.render(); };
  A.recBulk = el => {
    const u = U(), what = el.dataset.do, chosen = recFiltered(u).filter(r => recSel().has(r.id));
    if (!chosen.length) return P.toast('Selecione ao menos uma recorrência.', 'err');
    if (what === 'pause' || what === 'resume') {
      chosen.forEach(r => { const pause = what === 'pause'; if (isQ(r)) r.paused = pause; else r.active = !pause; });
      P.audit(u, 'Recorrências ' + (what === 'pause' ? 'pausadas' : 'reativadas') + ' em lote', 'lote', chosen.length + ' recorrência(s)');
      P.store.save(); if (what === 'resume' && P.isLive) setTimeout(() => generate(true), 1500); else if (what === 'resume') localGenerate();
      recSel().clear(); P.toast(chosen.length + ' recorrência(s) ' + (what === 'pause' ? 'pausada(s)' : 'reativada(s)') + '.'); P.render(); return;
    }
    if (!confirm(`Excluir ${chosen.length} recorrência(s)? Elas deixam de ser criadas nos próximos meses.`)) return;
    const ids = new Set(chosen.map(r => r.id)), pend = db().tasks.filter(t => ids.has(t.recId) && t.status === 'pendente');
    let removed = 0;
    if (pend.length && confirm(`Apagar também as ${pend.length} tarefa(s) PENDENTE(S) criadas por elas?\n\nOK = apagar as pendentes. Cancelar = manter as tarefas já criadas.`)) {
      const tids = new Set(pend.map(t => t.id)); db().tasks = db().tasks.filter(t => !tids.has(t.id)); removed = tids.size;
    }
    db().taskRecurrences = recs().filter(r => !ids.has(r.id));
    P.audit(u, 'Recorrências excluídas em lote', 'lote', ids.size + ' recorrência(s)' + (removed ? ' e ' + removed + ' tarefa(s) pendente(s)' : ''));
    P.store.save(); recSel().clear(); taskSel().clear();
    P.toast(ids.size + ' recorrência(s) excluída(s)' + (removed ? ' e ' + removed + ' tarefa(s) pendente(s) apagada(s)' : '') + '.'); P.render();
  };
  A.taskSel = el => { flip(taskSel(), el.dataset.id); P.render(); };
  A.taskSelAll = el => { const l = cadLists(U())[el.dataset.list === 'gen' ? 'geradas' : 'avulsas'], s = taskSel(), all = l.every(t => s.has(t.id)); l.forEach(t => all ? s.delete(t.id) : s.add(t.id)); P.render(); };
  A.taskBulkDelete = () => {
    const u = U(), { pend } = cadLists(u), ids = new Set(pend.filter(t => taskSel().has(t.id)).map(t => t.id));
    if (!ids.size) return P.toast('Selecione ao menos uma tarefa.', 'err');
    if (!confirm(`Apagar ${ids.size} tarefa(s) pendente(s)? Isso não pode ser desfeito.`)) return;
    db().tasks = db().tasks.filter(t => !ids.has(t.id));
    P.audit(u, 'Tarefas excluídas em lote', 'lote', ids.size + ' tarefa(s) pendente(s)');
    P.store.save(); taskSel().clear(); P.toast(ids.size + ' tarefa(s) apagada(s).'); P.render();
  };

})(window.P);
