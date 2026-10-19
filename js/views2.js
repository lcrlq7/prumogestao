/* Prumo — atividades, lançamentos, metas, insights, ranking e calendário */
'use strict';
(function (P) {
  const F = P.fmt, D = P.date, esc = P.esc, M = P.M, api = P.api, C = P.charts, V = P.V;
  const icon = V.icon;

  /* ---------- Formulário de registro de atividade ---------- */
  V.entryForm = (u, pre = {}, o = {}) => {
    const isEmp = u.role === 'employee';
    const own = isEmp || pre.own === true;
    const depts = api.departments(u);
    const deptId = pre.deptId || (own || u.role === 'manager' ? u.deptId : (P.state.dept || depts[0].id));
    const emps = own ? [u] : P.isGlobal(u) ? api.workers(u, deptId) : api.employees(u, deptId);
    const userId = pre.userId || (own ? u.id : (emps[0] || {}).id);
    const acts = api.activities(u, deptId);
    const actId = pre.activityId || (acts[0] || {}).id;
    const a = P.act(actId) || { weight: 0, unit: '' };
    const qty = pre.qty || 1;
    // Sugestões: clientes já lançados no departamento + empresas que o cadastro indica como atendidas por ele
    const clients = [...new Set(P.store.db.entries.filter(e => e.deptId === deptId).map(e => e.client).concat((P.store.db.companies || []).filter(c => c.active && (c.depts || []).includes(deptId)).map(c => c.name)))].filter(Boolean).sort();
    return `
    <form class="form entry-form" id="${o.id || 'entry-form'}" data-entry-form novalidate>
      ${pre.taskId ? `<input type="hidden" name="taskId" value="${esc(pre.taskId)}">` : ''}
      ${pre.entryId ? `<input type="hidden" name="entryId" value="${esc(pre.entryId)}">` : ''}
      <div class="fgrid">
        <label class="field"><span>Data</span><input type="date" name="date" id="${o.id || 'ef'}-date" value="${pre.date || D.iso(P.today())}" max="${D.iso(P.today())}" required></label>
        <label class="field"><span>Departamento</span><select name="deptId" id="${o.id || 'ef'}-dept" ${!P.isGlobal(u) || pre.entryId ? 'disabled' : ''} data-ef="dept">${depts.map(d => `<option value="${d.id}" ${d.id === deptId ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</select></label>
        <label class="field"><span>Responsável</span><select name="userId" id="${o.id || 'ef'}-user" ${own || pre.entryId ? 'disabled' : ''}>${emps.map(e => `<option value="${e.id}" ${e.id === userId ? 'selected' : ''}>${esc(e.name)}</option>`).join('')}</select></label>
        <label class="field span2"><span>Atividade</span><select name="activityId" id="${o.id || 'ef'}-act" data-ef="act" required>${acts.map(x => `<option value="${x.id}" data-w="${x.weight}" data-unit="${esc(x.unit)}" ${x.id === actId ? 'selected' : ''}>${esc(x.name)} · ${F.n(x.weight, 2)} pt/${esc(x.unit)}</option>`).join('')}</select></label>
        <label class="field"><span>Cliente</span><input type="text" name="client" id="${o.id || 'ef'}-client" list="${o.id || 'ef'}-clients" value="${esc(pre.client || '')}" placeholder="Razão social ou Interno" autocomplete="off"><datalist id="${o.id || 'ef'}-clients">${clients.map(c => `<option value="${esc(c)}">`).join('')}</datalist></label>
        <label class="field"><span>Quantidade <small data-unit>(${esc(a.unit)})</small></span><input type="number" name="qty" id="${o.id || 'ef'}-qty" value="${qty}" min="0.25" step="0.25" required data-ef="qty"></label>
        <label class="field"><span>Peso da atividade</span><input type="text" id="${o.id || 'ef'}-w" value="${F.n(a.weight, 2)}" readonly tabindex="-1" class="ro" data-weight></label>
        <div class="field calc"><span>Pontos calculados</span><output data-calc>${F.n(qty, 2)} × ${F.n(a.weight, 2)} = <b>${F.n(qty * a.weight, 2)} pontos</b></output></div>
        <label class="field span3"><span>Observação</span><textarea name="obs" id="${o.id || 'ef'}-obs" rows="2" placeholder="Contexto útil para o gestor: atrasos do cliente, retrabalho, complexidade fora do padrão…">${esc(pre.obs || '')}</textarea></label>
      </div>
      ${o.noSubmit ? '' : `<div class="form-foot"><p class="fine">${own && u.role === 'manager' ? 'Seu lançamento ficará pendente até a revisão do administrador.' : isEmp ? 'O lançamento entra como pendente até a aprovação do gestor.' : 'Lançamentos feitos por gestores entram como aprovados.'}</p>${V.btn(o.submitLabel || 'Registrar atividade', { cls: 'primary', icon: 'check', attrs: 'data-act="submitEntry"' })}</div>`}
    </form>`;
  };

  /* ---------- Filtros da lista de tarefas: busca (tarefa, empresa, responsável), empresa, prazo e atrasadas ---------- */
  const normT = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  V.taskFilter = list => {
    const f = P.state.tf || {}, q = normT(f.q).trim(), today = D.iso(P.today());
    if (!q && !f.client && !f.from && !f.to && !f.late) return list;
    return list.filter(t => {
      if (q && !normT(t.title + ' ' + (t.client || '') + ' ' + ((P.user(t.userId) || {}).name || '') + ' ' + ((P.act(t.activityId) || {}).name || '')).includes(q)) return false;
      if (f.client && !normT(t.client).includes(normT(f.client).trim())) return false;
      if (f.from && t.due < f.from) return false;
      if (f.to && t.due > f.to) return false;
      if (f.late && !(t.status === 'pendente' && t.due < today)) return false;
      return true;
    });
  };
  V.taskFilterBar = (base, shown) => {
    const f = P.state.tf || {}, clients = [...new Set(base.map(t => t.client).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    // sugestões da busca: nomes das tarefas (atividade/recorrência), sem repetir
    const names = [...new Set(base.map(t => (P.act(t.activityId) || {}).name || t.title).filter(Boolean))].sort((a, b) => a.localeCompare(b)).slice(0, 400);
    const on = !!(f.q || f.client || f.from || f.to || f.late);
    return `<div class="toolbar tfilter">
      <label class="picker grow">${icon('search')}<input type="search" id="tf-q" list="tf-names" data-set="tf.q" data-live value="${esc(f.q || '')}" placeholder="Buscar por tarefa, empresa ou responsável" aria-label="Buscar tarefas" autocomplete="off"><datalist id="tf-names">${names.map(n => `<option value="${esc(n)}"></option>`).join('')}</datalist></label>
      <label class="picker grow">${icon('building')}<input type="search" id="tf-client" list="tf-clients" data-set="tf.client" data-live value="${esc(f.client || '')}" placeholder="Empresa: digite para buscar" aria-label="Empresa" autocomplete="off"><datalist id="tf-clients">${clients.map(c => `<option value="${esc(c)}"></option>`).join('')}</datalist></label>
      <label class="picker"><span>Prazo de</span><input type="date" data-set="tf.from" value="${esc(f.from || '')}" aria-label="Prazo a partir de"></label>
      <label class="picker"><span>até</span><input type="date" data-set="tf.to" value="${esc(f.to || '')}" aria-label="Prazo até"></label>
      <label class="check-inline"><input type="checkbox" data-set="tf.late" ${f.late ? 'checked' : ''}> Só atrasadas</label>
      ${on ? V.btn('Limpar filtros', { act: 'tfClear', icon: 'x', cls: 'sm ghost' }) : ''}
      <span class="fine tf-count">${shown} de ${base.length} tarefa(s)</span></div>`;
  };

  /* ---------- Atividades / tarefas ---------- */
  V.atividades = u => {
    const S = P.state;
    const tab = S.taskTab;
    const today = D.iso(P.today());
    if (u.role === 'employee') {
      const inTab = t => tab === 'concluida' ? (t.status === 'concluida' || t.status === 'dispensada') : t.status === tab;
      const tabbed = api.tasks(u).filter(inTab).sort((a, b) => tab === 'pendente' ? (a.due < b.due ? -1 : 1) : (a.due > b.due ? -1 : 1));
      const tasks = V.taskFilter(tabbed);
      const counts = { pendente: api.tasks(u).filter(t => t.status === 'pendente').length, concluida: api.tasks(u).filter(t => t.status === 'concluida' || t.status === 'dispensada').length };
      return `${V.pageHead('Minhas tarefas', 'Tarefas atribuídas pelo seu gestor. Ao concluir, registre a atividade para gerar os pontos.', V.btn('Registrar atividade avulsa', { go: 'lancamentos', icon: 'plus', cls: 'primary' }))}
        ${V.tabs([['pendente', 'Pendentes', counts.pendente], ['concluida', 'Concluídas', counts.concluida]], tab, 'taskTab')}
        ${V.taskFilterBar(tabbed, tasks.length)}
        ${V.card('', V.taskList(u, tasks, today), { cls: 'flush' })}
        ${V.card('Tabela de pesos do meu departamento', V.weightTable(u, u.deptId, false), { sub: '1 ponto ≈ 1 hora média de trabalho' })}`;
    }
    const emps = V.team(u);
    let tasks = api.tasks(u, { deptId: V.scopeDept(u) || undefined }).filter(t => tab === 'concluida' ? (t.status === 'concluida' || t.status === 'dispensada') : t.status === tab);
    if (S.taskUser) tasks = tasks.filter(t => t.userId === S.taskUser);
    const tabbed = tasks; tasks = V.taskFilter(tasks);
    tasks.sort((a, b) => tab === 'pendente' ? (a.due < b.due ? -1 : 1) : (a.due > b.due ? -1 : 1));
    const all = api.tasks(u, { deptId: V.scopeDept(u) || undefined });
    const overdue = all.filter(t => t.status === 'pendente' && t.due < today).length;
    return `${V.pageHead(u.role === 'manager' ? 'Atividades da equipe e minhas tarefas' : 'Atividades da equipe', 'Tarefas atribuídas, prazos e o catálogo de atividades com seus pesos.', V.deptPicker(u) + V.btn('Carteira de empresas', { act: 'manageClientAssignments', icon: 'building', cls: 'ghost' }) + V.btn('Atribuir tarefa', { act: 'newTask', icon: 'plus', cls: 'primary' }))}
      <div class="strip">
        <div><span>Pendentes</span><b>${all.filter(t => t.status === 'pendente').length}</b></div>
        <div class="${overdue ? 't-crit' : ''}"><span>Em atraso</span><b>${overdue}</b></div>
        <div><span>Vencem em 7 dias</span><b>${all.filter(t => t.status === 'pendente' && t.due >= today && t.due <= D.iso(D.add(P.today(), 7))).length}</b></div>
        <div><span>Concluídas (30 dias)</span><b>${all.filter(t => t.status === 'concluida' && (t.doneAt || t.due) >= D.iso(D.add(P.today(), -30))).length}</b></div>
      </div>
      <div class="toolbar">${V.tabs([['lista', 'Lista'], ['quadro', 'Quadro da equipe']], S.taskView || 'lista', 'taskView')}${S.taskView === 'quadro' ? '' : V.tabs([['pendente', 'Pendentes'], ['concluida', 'Concluídas']], tab, 'taskTab')}
        <label class="picker">${icon('users')}<select id="task-user" data-set="taskUser" aria-label="Responsável"><option value="">Toda a equipe</option>${emps.map(e => `<option value="${e.id}" ${S.taskUser === e.id ? 'selected' : ''}>${esc(e.name)}</option>`).join('')}</select></label></div>
      ${S.taskView === 'quadro' ? '' : V.taskFilterBar(tabbed, tasks.length)}
      ${S.taskView === 'quadro' ? V.taskBoard(u, P.isGlobal(u) && !V.scopeDept(u) ? [] : emps, all.filter(t => t.status === 'pendente')) : V.card('', V.taskList(u, tasks, today, true, 'team'), { cls: 'flush' })}
      ${V.scopeDept(u) ? V.card('Atividades e pesos · ' + esc(P.dept(V.scopeDept(u)).name), V.weightTable(u, V.scopeDept(u), false), { sub: 'Para cadastrar atividades ou mudar pesos, use a aba "Atividades e pesos".', actions: V.btn('Atividades e pesos', { act: 'setState', icon: 'scale', cls: 'ghost sm', attrs: 'data-key="atvTab" data-val="pesos"' }) }) : ''}`;
  };
  V.tabs = (items, cur, key) => `<div class="tabs" role="tablist">${items.map(([k, l, n]) => `<button type="button" role="tab" class="${cur === k ? 'on' : ''}" aria-selected="${cur === k}" data-act="setState" data-key="${key}" data-val="${k}">${l}${n != null ? `<span class="count">${n}</span>` : ''}</button>`).join('')}</div>`;
  V.taskList = (u, tasks, today, showWho, key) => {
    if (!tasks.length) return V.empty('Nenhuma tarefa nesta lista.', 'check');
    // listas longas (ex.: depois de importar tarefas) são paginadas: 20, 50 ou 100 por página
    const pg = V.pageSlice(tasks, key || 'main'); tasks = pg.items;
    return `<ul class="tasks">${tasks.map(t => {
      const a = t.activityId ? P.act(t.activityId) : null, who = P.user(t.userId) || { name: 'Pessoa removida' };
      const late = t.status === 'pendente' && t.due < today;
      const soon = t.status === 'pendente' && !late && t.due <= D.iso(D.add(P.today(), 2));
      return `<li class="task ${late ? 'late' : ''}">
        <span class="task-ic ${t.status === 'concluida' ? 'done' : ''}">${icon(t.status === 'concluida' ? 'check' : 'clock')}</span>
        <div class="task-main"><b>${esc(t.title)}</b>
          <small>${showWho ? esc(who.name) + ' · ' : ''}${a ? F.n(a.weight, 2) + ' pt/' + esc(a.unit) + ' · ' : ''}${t.status === 'concluida' ? 'Concluída em ' + D.fmt(t.doneAt || t.due) : 'Prazo ' + D.fmt(t.due)}</small></div>
        ${late ? '<span class="badge st-sobrecarga">' + icon('alert') + 'Em atraso</span>' : soon ? '<span class="badge st-baixa">' + icon('clock') + 'Vence em breve</span>' : ''}
        ${t.status === 'pendente' && u.id === t.userId ? V.btn('Concluir e registrar', { act: 'completeTask', cls: 'sm primary', icon: 'check', attrs: `data-id="${t.id}"` }) : ''}
        ${V.taskExtra ? V.taskExtra(u, t) : ''}
      </li>`;
    }).join('')}</ul>${pg.bar}`;
  };
  // fatia a lista na página atual e monta a barra: itens por página (20/50/100) e Anterior/Próxima
  V.pageSlice = (list, key) => {
    const S = P.state, per = [20, 50, 100].includes(S.taskPer) ? S.taskPer : 20;
    S.taskPg = S.taskPg || {};
    const pages = Math.max(1, Math.ceil(list.length / per)), pg = Math.min(Math.max(S.taskPg[key] || 1, 1), pages);
    S.taskPg[key] = pg;
    const from = (pg - 1) * per, items = list.slice(from, from + per);
    if (list.length <= 20) return { items, bar: '' };
    const nav = (dir, label, off) => V.btn(label, { act: 'pgGo', cls: 'sm ghost', attrs: `data-key="${key}" data-dir="${dir}" ${off ? 'disabled' : ''}` });
    const bar = `<div class="pager"><label>Mostrar <select data-set="taskPer" aria-label="Itens por página">${[20, 50, 100].map(n => `<option value="${n}" ${n === per ? 'selected' : ''}>${n}</option>`).join('')}</select> por página</label>
      <span class="fine">${from + 1}–${from + items.length} de ${list.length}</span>
      <span class="pager-nav">${nav(-1, '‹ Anterior', pg <= 1)}<span class="fine">Página ${pg} de ${pages}</span>${nav(1, 'Próxima ›', pg >= pages)}</span></div>`;
    return { items, bar };
  };
  V.weightTable = (u, deptId, editable) => {
    const acts = api.activities(u, deptId, editable);
    const p30 = P.range(D.add(P.today(), -29), P.today());
    const used = {};
    P.store.db.entries.forEach(e => { if (e.deptId === deptId && e.date >= p30.s && P.counts(e)) { used[e.activityId] = (used[e.activityId] || 0) + e.points; } });
    return `<div class="table-wrap"><table class="tbl">
      <thead><tr><th>Atividade</th><th>Unidade</th><th class="num">Peso</th><th class="num">Pontos (30 dias)</th>${editable ? '<th>Status</th><th class="actions-col">Ações</th>' : ''}</tr></thead>
      <tbody>${acts.map(a => `<tr class="${a.active ? '' : 'inactive'}"><td><b>${esc(a.name)}</b></td><td>por ${esc(a.unit)}</td><td class="num strong">${F.n(a.weight, 2)}</td><td class="num">${F.n(used[a.id] || 0)}</td>
        ${editable ? `<td>${a.active ? '<span class="badge es-aprovado">' + icon('check') + 'Ativa</span>' : '<span class="badge st-sem">' + icon('x') + 'Inativa</span>'}</td>
        <td class="actions-col"><div class="row-actions">${V.ibtn('edit', 'Editar', { act: 'editActivity', attrs: `data-id="${a.id}"` })}${V.ibtn('toggle', a.active ? 'Desativar' : 'Ativar', { act: 'toggleActivity', attrs: `data-id="${a.id}"` })}${V.ibtn('trash', 'Excluir', { act: 'deleteActivity', attrs: `data-id="${a.id}"`, cls: 'danger' })}</div></td>` : ''}</tr>`).join('')}</tbody>
    </table></div>`;
  };

  /* ---------- Lançamentos ---------- */
  V.lancamentos = u => {
    const S = P.state;
    if (u.role === 'employee') {
      const mine = api.entries(u).slice().reverse();
      const corr = mine.filter(e => e.status === 'correcao');
      const recent = mine.slice(0, 25);
      const actions = e => (e.status === 'correcao' || e.status === 'pendente') ? `<div class="row-actions">${V.ibtn('edit', 'Corrigir', { act: 'fixEntry', attrs: `data-id="${e.id}"` })}${V.ibtn('history', 'Histórico', { act: 'entryHistory', attrs: `data-id="${e.id}"` })}</div>` : V.ibtn('history', 'Histórico', { act: 'entryHistory', attrs: `data-id="${e.id}"` });
      return `${V.pageHead('Registrar atividade', 'Informe o que foi feito. O peso é preenchido pela tabela do departamento e os pontos são calculados na hora.', V.btn('Lançamento em lote', { act: 'batchEntry', icon: 'inbox', cls: 'ghost' }))}
        ${corr.length ? `<div class="banner warn">${icon('undo')}<div><b>${corr.length} lançamento${corr.length > 1 ? 's precisam' : ' precisa'} de correção.</b> Veja a observação do gestor no histórico e reenvie.</div></div>` : ''}
        ${V.card('Novo lançamento', V.entryForm(u))}
        ${V.card('Meus lançamentos recentes', V.entryTable(recent, { who: false, actions }), { cls: 'flush-b' })}`;
    }
    const scope = V.scopeDept(u);
    const base = api.entries(u, { deptId: scope || undefined });
    const reviewQueue = u.role === 'manager' ? base.filter(e => e.userId !== u.id) : base;
    const ownPending = u.role === 'manager' ? base.filter(e => e.userId === u.id && (e.status === 'pendente' || e.status === 'correcao')).reverse() : [];
    const pend = reviewQueue.filter(e => e.status === 'pendente').reverse();
    const corr = reviewQueue.filter(e => e.status === 'correcao').reverse();
    const reviewed = reviewQueue.filter(e => e.status !== 'pendente' && e.status !== 'correcao' && (e.history || []).some(h => h.action !== 'Criado')).slice(-40).reverse();
    const tab = S.lancTab;
    const list = tab === 'pendente' ? pend : tab === 'correcao' ? corr : reviewed;
    const actions = e => `<div class="row-actions">
      ${e.status === 'pendente' || e.status === 'correcao' ? V.ibtn('check', 'Aprovar', { act: 'review', cls: 'ok', attrs: `data-id="${e.id}" data-op="aprovar"` }) : ''}
      ${V.ibtn('edit', 'Editar', { act: 'editEntry', attrs: `data-id="${e.id}"` })}
      ${e.status !== 'recusado' ? V.ibtn('x', 'Recusar', { act: 'reviewNote', cls: 'danger', attrs: `data-id="${e.id}" data-op="recusar"` }) : ''}
      ${e.status === 'pendente' ? V.ibtn('undo', 'Solicitar correção', { act: 'reviewNote', attrs: `data-id="${e.id}" data-op="correcao"` }) : ''}
      ${V.ibtn('history', 'Histórico de alterações', { act: 'entryHistory', attrs: `data-id="${e.id}"` })}
    </div>`;
    const pendPts = pend.reduce((a, e) => a + e.points, 0);
    return `${V.pageHead('Lançamentos', 'Revise os registros da equipe. Cada decisão fica gravada no histórico do lançamento.', V.deptPicker(u) + V.btn('Lançamento em lote', { act: 'batchEntry', icon: 'inbox', cls: 'ghost' }) + V.btn('Registrar para colaborador', { act: 'newEntry', icon: 'plus', cls: 'primary' }))}
      ${ownPending.length ? V.card('Meus lançamentos pendentes', V.entryTable(ownPending, { who: false, actions: e => `<div class="row-actions">${V.ibtn('edit', 'Editar e reenviar', { act: 'fixEntry', attrs: `data-id="${e.id}"` })}${V.ibtn('history', 'Histórico', { act: 'entryHistory', attrs: `data-id="${e.id}"` })}</div>` }), { cls: 'flush-b', sub: 'Aguardando revisão do administrador.' }) : ''}
      <div class="strip">
        <div><span>Pendentes de aprovação</span><b>${pend.length}</b></div>
        <div><span>Pontos pendentes</span><b>${F.n(pendPts)}</b></div>
        <div class="${corr.length ? 't-warn' : ''}"><span>Aguardando correção</span><b>${corr.length}</b></div>
        <div><span>Mais antigo pendente</span><b>${pend.length ? D.relative(pend[pend.length - 1].date) : '—'}</b></div>
      </div>
      <div class="toolbar">${V.tabs([['pendente', 'Pendentes', pend.length], ['correcao', 'Correção solicitada', corr.length], ['revisados', 'Revisados recentemente']], tab, 'lancTab')}
        ${tab === 'pendente' && pend.length ? `<div class="bulk">${V.btn('Aprovar selecionados', { act: 'bulkApprove', icon: 'check', cls: 'sm' })}</div>` : ''}</div>
      ${V.card('', V.entryTable(list, { actions, select: tab === 'pendente', emptyMsg: tab === 'pendente' ? 'Nenhum lançamento aguardando aprovação.' : 'Nada por aqui.' }), { cls: 'flush' })}`;
  };

  /* ---------- Metas ---------- */
  V.metas = u => {
    const goals = api.goals(u);
    if (u.role === 'employee') {
      return `${V.pageHead('Minhas metas', 'Metas de referência definidas pelo seu gestor. A barra fina mostra o ritmo esperado para hoje.')}
        <div class="grid g-1-1">${goals.map(g => V.card('Meta ' + g.period, V.goalBlock(g, u))).join('')}</div>
        ${V.card('Como as metas são usadas', `<p class="prose">As metas servem de referência para acompanhar a sua produção ao longo da semana e do mês. Se notar que está muito acima ou muito abaixo por várias semanas, converse com o seu gestor.</p>`)}`;
    }
    const scope = V.scopeDept(u);
    const depts = scope ? [P.dept(scope)] : api.departments(u);
    const canEdit = true;
    const pw = P.period('semana'), pm = P.period('mes');
    const weekPace = P.elapsedWorkdays(pw) / D.workdays(pw.start, D.add(pw.start, 6)) * 100;
    const monthPace = P.elapsedWorkdays(pm) / D.workdays(pm.start, D.monthEnd(pm.start)) * 100;
    return `${V.pageHead('Metas', 'Meta semanal e mensal por colaborador e por departamento. A marca vertical indica o ritmo esperado até hoje.', V.deptPicker(u))}
      ${depts.map(d => {
        const dg = goals.filter(g => g.scope === 'department' && g.refId === d.id);
        const emps = api.workers(u, d.id);
        return `<div class="grid g-1-1">${dg.map(g => V.card(`${esc(d.name)} · meta ${g.period}`, V.goalBlock(g), { actions: canEdit ? V.ibtn('edit', 'Editar meta', { act: 'editGoal', attrs: `data-id="${g.id}"` }) : '' })).join('')}</div>
        ${V.card('Metas individuais · ' + esc(d.name), `<div class="table-wrap"><table class="tbl">
          <thead><tr><th>Funcionário</th><th class="num">Meta semanal</th><th class="num">Realizado</th><th class="util-col">Progresso semana</th><th class="num">Meta mensal</th><th class="num">Realizado</th><th class="util-col">Progresso mês</th><th class="actions-col"></th></tr></thead>
          <tbody>${emps.map(e => {
            const gw = goals.find(g => g.scope === 'employee' && g.refId === e.id && g.period === 'semanal');
            const gm = goals.find(g => g.scope === 'employee' && g.refId === e.id && g.period === 'mensal');
            const rw = M.stats(e, pw).points, rm = M.stats(e, pm).points;
            const pw_ = gw ? rw / gw.target * 100 : 0, pm_ = gm ? rm / gm.target * 100 : 0;
            return `<tr><td>${V.person(e, false)}</td>
              <td class="num">${gw ? F.n(gw.target) : '—'}</td><td class="num strong">${F.n(rw)}</td>
              <td class="util-col"><div class="util-cell"><span class="num">${F.pct0(pw_)}</span>${V.progress(pw_, { max: 100, marks: false, cls: pw_ >= 100 ? 'st-saudavel' : 'acc', pace: weekPace })}</div></td>
              <td class="num">${gm ? F.n(gm.target) : '—'}</td><td class="num strong">${F.n(rm)}</td>
              <td class="util-col"><div class="util-cell"><span class="num">${F.pct0(pm_)}</span>${V.progress(pm_, { max: 100, marks: false, cls: pm_ >= 100 ? 'st-saudavel' : 'acc', pace: monthPace })}</div></td>
              <td class="actions-col"><div class="row-actions">${gw ? V.ibtn('edit', 'Editar meta semanal', { act: 'editGoal', attrs: `data-id="${gw.id}"` }) : ''}${gm ? V.ibtn('calendar', 'Editar meta mensal', { act: 'editGoal', attrs: `data-id="${gm.id}"` }) : ''}</div></td></tr>`;
          }).join('')}</tbody></table></div>`, { cls: 'flush-b' })}`;
      }).join('')}`;
  };

  /* ---------- Insights ---------- */
  V.insights = u => {
    const S = P.state;
    const scope = V.scopeDept(u);
    const all = P.insights(u, scope || undefined);
    const list = S.insFilter === 'all' ? all : all.filter(i => i.level === S.insFilter);
    const emps = V.team(u);
    const p = P.period('semana');
    const tm = M.team(emps, p);
    const over = tm.rows.filter(r => r.status === 'sobrecarga'), low = tm.rows.filter(r => r.status === 'baixa');
    const acts = M.byActivity(emps, P.range(D.add(P.today(), -29), P.today()));
    const cmp = M.compare(emps, 'mes');
    const n = l => l.length ? l.map(r => esc(P.firstName(r.user.name)) + ' (' + F.pct0(r.util) + ')').join(', ') : 'ninguém no momento';
    const counts = { all: all.length, crit: 0, warn: 0, info: 0, pos: 0, rec: 0 };
    all.forEach(i => counts[i.level]++);
    const recNames = [...new Set(all.filter(i => i.level === 'rec' && i.emp).map(i => P.firstName((P.user(i.emp) || { name: '—' }).name)))];
    const q = [
      ['Quem merece reconhecimento?', recNames.length ? recNames.map(esc).join(', ') + '. Veja os motivos na aba Reconhecimento.' : 'Nenhuma sugestão no momento.'],
      ['Quem está sobrecarregado?', n(over)],
      ['Quem possui capacidade disponível?', n(low)],
      ['Quais atividades consomem mais esforço?', acts.rows.slice(0, 3).map(r => esc(r.act.name) + ' (' + F.pct0(r.share) + ')').join(', ') || '—'],
      ['A produtividade está melhorando?', cmp.dPoints == null ? '—' : (cmp.dPoints >= 0 ? 'Sim: ' : 'Não: ') + F.delta(cmp.dPoints) + ' em pontos no mês, comparando os mesmos dias úteis do mês anterior.'],
      ['Onde redistribuir tarefas?', over.length && low.length ? `De ${esc(P.firstName(over[0].user.name))} para ${esc(P.firstName(low[0].user.name))}.` : over.length ? 'Há sobrecarga sem capacidade livre na equipe: avaliar apoio de outra área ou revisão de prazos.' : 'Carga equilibrada nesta semana.']
    ];
    return `${V.pageHead('Insights do Gestor', 'Observações geradas automaticamente a partir dos lançamentos. Use como ponto de partida para conversas e ajustes de processo.', V.deptPicker(u))}
      ${V.card('Leitura rápida · esta semana', `<dl class="qa">${q.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>`)}
      ${V.highlightsCard(u, scope)}
      ${V.recognitionsCard(u, scope)}
      <div class="toolbar">${V.tabs([['all', 'Todos', counts.all], ['rec', 'Reconhecimento', counts.rec], ['crit', 'Atenção', counts.crit], ['warn', 'Acompanhar', counts.warn], ['info', 'Informativos', counts.info], ['pos', 'Positivos', counts.pos]], S.insFilter, 'insFilter')}</div>
      ${V.card('', V.insightList(list), { cls: 'flush' })}`;
  };

  /*
   * Destaques: um bloco por departamento (os pesos são calibrados por departamento, então não se misturam).
   * Mínimo de dados para entrar, empates para notas próximas e destaques por categoria.
   * Lista visível só para gestores, gerente e diretoria.
   */
  V.highlightsCard = (u, scope) => {
    const S = P.state, key = S.hlPeriod || 'mes_ant', st = P.store.db.settings;
    const blocks = P.highlightsByDept(u, key, scope || undefined);
    const min = P.HL_MIN[key];
    const pmes = P.period('mes_ant').start;
    const label = { mes_ant: 'de ' + D.monthLabel(pmes, true), mes: 'deste mês (parcial)', ano: 'do ano de ' + P.today().getFullYear() }[key];
    const posCell = r => `<span class="hl-pos ${r.pos <= 3 ? 'hl-' + r.pos : ''}">${r.pos <= 3 ? icon('medal') : ''}${r.pos}º</span>${r.tie ? '<small class="hl-tie">empate</small>' : ''}`;
    const why = r => {
      const w = [];
      if (r.util != null && r.util >= 90 && r.util <= st.highThreshold) w.push('entrega plena sem sobrecarga');
      if (r.constancy != null && r.constancy >= 75) w.push('constância');
      if (r.quality != null && r.quality >= 98 && r.reviewed >= 20) w.push('qualidade exemplar');
      if (r.onTime != null && r.onTime >= 98 && r.tasks >= 5) w.push('prazos em dia');
      if (r.growth != null && r.growth >= 8) w.push('em crescente');
      if (r.util != null && r.util > st.highThreshold) w.push('acima da capacidade: reconhecer e cuidar da carga');
      return w.map(x => `<span class="chip-s">${esc(x)}</span>`).join('');
    };
    const pct = v => v == null ? '—' : F.pct0(v);
    const elapsed = P.elapsedWorkdays(P.period(key));
    const block = b => {
      const leaders = P.categoryLeaders(b.rows, b.dept.id, b.rows.period);
      const catOf = r => (leaders.find(l => l.people.some(p => p.user.id === r.user.id)) || { key: 'outro' }).key;
      const top = b.rows.filter(r => S.hlAll || r.pos <= 5);
      return `<div class="hl-block">
        <h4 class="hl-dept">${esc(b.dept.name)}</h4>
        ${leaders.length ? `<div class="hl-cats">${leaders.map(l => `<div class="hl-cat"><small>${icon('medal')}${esc(P.REC_CATEGORIES[l.key])}</small><b>${l.people.map(p => esc(P.firstName(p.user.name) + (p.user.name.split(' ').length > 1 ? ' ' + p.user.name.split(' ').slice(-1)[0] : ''))).join(', ')}</b><span>${esc(l.text)}</span></div>`).join('')}</div>` : ''}
        ${top.length ? `<div class="table-wrap"><table class="tbl hl-tbl"><thead><tr><th>#</th><th>Colaborador</th><th class="num">Pontos</th><th class="num" title="Pontos ÷ capacidade do período">Entrega</th><th class="num" title="Lançamentos aprovados sem correção nem recusa por erro no lançamento">Qualidade</th><th class="num" title="Tarefas concluídas até o vencimento">Prazos</th><th class="num" title="Semanas completas na faixa saudável">Constância</th>${key !== 'ano' ? '<th class="num" title="Variação da utilização em relação ao período anterior">Evolução</th>' : ''}<th class="num">Nota</th><th>Por que se destaca</th><th class="actions-col"></th></tr></thead>
        <tbody>${top.map(r => `<tr class="${r.pos <= 3 ? 'hl-top' : ''}"><td>${posCell(r)}</td><td>${V.person(r.user, r.user.title || '')}</td><td class="num">${F.n(r.points)}</td><td class="num">${pct(r.util)}</td><td class="num">${pct(r.quality)}</td><td class="num">${pct(r.onTime)}</td><td class="num">${pct(r.constancy)}</td>${key !== 'ano' ? `<td class="num">${r.growth == null ? '—' : (r.growth >= 0 ? '+' : '') + F.n(r.growth, 0) + ' p.p.'}</td>` : ''}<td class="num strong">${F.n(r.score, 0)}</td><td><div class="chips">${why(r)}</div></td><td class="actions-col">${api.canRecognize(u, r.user) ? V.btn('Reconhecer', { act: 'recognize', cls: 'sm ghost', icon: 'medal', attrs: `data-id="${r.user.id}" data-cat="${catOf(r)}"` }) : ''}</td></tr>`).join('')}</tbody></table></div>` : ''}
        ${b.rows.excluded.length ? `<p class="fine hl-excl">${icon('info')}${b.rows.excluded.length} pessoa${b.rows.excluded.length > 1 ? 's' : ''} sem dados suficientes no período (mínimo de ${min.days} dias úteis trabalhados e ${min.entries} lançamentos): ${b.rows.excluded.map(r => esc(P.firstName(r.user.name))).join(', ')}.</p>` : ''}
      </div>`;
    };
    const any = blocks.some(b => b.rows.length);
    const more = blocks.some(b => b.rows.some(r => r.pos > 5));
    const body = `
      <div class="toolbar hl-tools">${V.tabs([['mes_ant', 'Mês anterior'], ['mes', 'Mês atual'], ['ano', 'Ano']], key, 'hlPeriod')}</div>
      ${key === 'mes' && elapsed < min.days ? `<div class="hl-wait">${V.empty(`O mês atual tem só ${elapsed} dia${elapsed === 1 ? '' : 's'} út${elapsed === 1 ? 'il' : 'eis'} até agora. Os destaques aparecem a partir do ${min.days}º dia útil, para não reconhecer ninguém com base em poucos dias.`, 'clock')}</div>`
        : any || blocks.length ? blocks.map(block).join('') : V.empty('Sem dados suficientes para o período.', 'medal')}
      ${more ? `<div class="hl-more">${V.btn(S.hlAll ? 'Mostrar só os 5 primeiros de cada departamento' : 'Ver todos', { act: 'toggleHlAll', cls: 'ghost sm' })}</div>` : ''}
      <div class="fine hl-note">
        <p><b>Como a nota é calculada (0 a 100):</b> entrega em relação à capacidade (45%, sem bônus por passar de 100%), qualidade dos lançamentos (25%), prazos das tarefas (20%) e evolução em relação ao período anterior (10%). Capacidade reduzida e férias já são descontadas.</p>
        <p><b>Regras para ser justo:</b> a comparação é feita só dentro de cada departamento. Notas com menos de ${F.n(P.HL_TIE, 1)} pontos de diferença contam como empate. Correções pedidas por pendência do cliente ou mudança de escopo não reduzem a qualidade. Colaboração, iniciativa e atendimento ao cliente vêm das indicações dos gestores.</p>
        <p><b>Uso:</b> o número sugere e o gestor decide. Lista visível só para gestores, gerente e diretoria: não divulgue a classificação à equipe.</p>
      </div>`;
    return V.card('Destaques · melhores ' + esc(label), body, { cls: 'flush-b', sub: 'Por departamento · baseado nos lançamentos, nas tarefas e nas indicações dos gestores', actions: V.btn('Registrar reconhecimento', { act: 'recognize', cls: 'sm', icon: 'medal' }) });
  };

  /* Reconhecimentos registrados pelos gestores (com justificativa) */
  V.recList = (u, list, o = {}) => list.length ? `<ul class="rec-list">${list.map(r => { const x = P.user(r.userId), by = P.user(r.by); return `<li class="rec-item">
      ${o.self ? `<span class="rec-ic">${icon('medal')}</span>` : V.avatar(x)}
      <div class="rec-b">
        <div class="rec-h">${o.self ? '' : `<b>${esc(x ? x.name : '—')}</b>`}<span class="chip-s">${esc(P.REC_CATEGORIES[r.category] || r.category)}</span>${!o.self ? (r.shared ? '<span class="chip-s chip-wall">no mural da equipe</span>' : !r.visible ? '<small class="muted">· só para a gestão</small>' : '<small class="muted">· visível ao colaborador</small>') : ''}</div>
        <p>${esc(r.text)}</p>
        <small class="muted">${esc(by ? by.name : '—')} · ${D.fmt(r.date)}</small>
      </div>
      ${!o.self && (r.by === u.id || P.isGlobal(u)) ? `<div class="rec-acts">${V.ibtn('users', r.shared ? 'Retirar do mural da equipe' : 'Compartilhar no mural da equipe', { act: 'shareRecognition', cls: r.shared ? 'on' : '', attrs: `data-id="${r.id}" data-on="${r.shared ? 0 : 1}"` })}${V.ibtn('trash', 'Remover reconhecimento', { act: 'removeRecognition', attrs: `data-id="${r.id}"` })}</div>` : ''}
    </li>`; }).join('')}</ul>` : V.empty(o.empty || 'Nenhum reconhecimento registrado ainda.', 'medal');
  /* Mural da equipe: pessoa, categoria e mensagem (sem notas, ranking ou números de desempenho) */
  V.wallItems = (list, o = {}) => `<ul class="wall">${list.map(r => { const x = P.user(r.userId) || { id: '?', name: 'Pessoa removida' }, by = P.user(r.by), d = P.dept(r.deptId); return `<li class="wall-item">
      ${V.avatar(x, 'lg')}
      <div class="wall-b">
        <div class="wall-h"><b>${esc(x.name)}</b>${o.dept && d ? `<small class="muted">${esc(d.name)}</small>` : ''}<span class="chip-s">${icon('medal')}${esc(P.REC_CATEGORIES[r.category] || r.category)}</span></div>
        <p>${esc(r.text)}</p>
        <small class="muted">Reconhecido(a) por ${esc(by ? by.name : 'Gestão')} · ${D.fmt(r.date)}</small>
      </div></li>`; }).join('')}</ul>`;
  V.wallPreview = u => {
    const list = api.teamWall(u).slice(0, 3);
    return list.length ? V.card('Mural de reconhecimentos', V.wallItems(list), { cls: 'flush-b', sub: 'Reconhecimentos compartilhados com a equipe', actions: V.btn('Ver mural', { go: 'mural', cls: 'ghost sm', icon: 'right' }) }) : '';
  };
  V.mural = u => {
    const global = P.isGlobal(u), scope = global ? (P.state.dept || '') : u.deptId;
    const list = api.teamWall(u, scope || undefined);
    const d = P.dept(u.deptId);
    return `${V.pageHead('Mural de reconhecimentos', global ? 'Reconhecimentos que os gestores compartilharam com as equipes.' : `Reconhecimentos compartilhados com a equipe${d ? ' de ' + esc(d.name) : ''}. Aqui não aparecem notas, ranking nem números de desempenho.`, (global ? V.deptPicker(u) : '') + V.btn('Reconhecer um colega', { act: 'recognize', icon: 'medal', cls: 'primary' }))}
      ${V.card('', list.length ? V.wallItems(list, { dept: global && !scope }) : V.empty(u.role === 'employee' ? 'Ainda não há reconhecimentos compartilhados com a sua equipe.' : 'Nenhum reconhecimento compartilhado ainda. Ao registrar um reconhecimento, marque "Compartilhar com a equipe" para ele aparecer aqui.', 'medal'), { cls: 'flush' })}`;
  };
  V.recognitionsCard = (u, scope) => {
    const S = P.state;
    const list = api.recognitions(u, { deptId: scope || undefined });
    const shown = S.recAll ? list : list.slice(0, 6);
    return V.card('Reconhecimentos registrados', V.recList(u, shown, { empty: 'Nenhum reconhecimento registrado ainda. Use "Reconhecer" nos destaques ou nas sugestões abaixo.' }) + (list.length > 6 ? `<div class="hl-more">${V.btn(S.recAll ? 'Mostrar menos' : 'Ver todos (' + list.length + ')', { act: 'toggleRecAll', cls: 'ghost sm' })}</div>` : ''),
      { cls: 'flush-b', sub: 'Indicações com justificativa. Quando marcadas como visíveis, o colaborador vê a mensagem no próprio painel.' });
  };
  /* ---------- Ranking ---------- */
  V.ranking = u => {
    const S = P.state;
    const p = P.period(S.rankPeriod);
    const emps = V.team(u);
    const rows = M.team(emps, p).rows.sort((a, b) => b.points - a.points);
    const max = Math.max(1, ...rows.map(r => r.points));
    const deptRank = P.isGlobal(u) ? api.departments(u).map(d => ({ d, tm: M.team(api.workers(u, d.id), p), n: api.workers(u, d.id).length })).sort((a, b) => b.tm.points / (b.n || 1) - a.tm.points / (a.n || 1)) : [];
    return `${V.pageHead('Ranking', 'Visualização do volume entregue no período. Não é um mecanismo isolado de avaliação: pesos, carteira e complexidade dos clientes variam.', V.deptPicker(u) + `<div class="seg" role="group">${[['semana', 'Semana'], ['mes', 'Mês'], ['semana_ant', 'Semana anterior'], ['mes_ant', 'Mês anterior']].map(([k, l]) => `<button type="button" class="${S.rankPeriod === k ? 'on' : ''}" data-act="setState" data-key="rankPeriod" data-val="${k}">${l}</button>`).join('')}</div>`)}
      <div class="banner info">${icon('info')}<div>Leia o ranking junto com a coluna de utilização: um volume alto com utilização acima de ${P.store.db.settings.highThreshold}% sinaliza sobrecarga, não apenas bom desempenho.</div></div>
      <div class="grid ${deptRank.length ? 'g-2-1' : ''}">
        ${V.card('Ranking · ' + p.label + (V.scopeDept(u) ? ' · ' + esc(P.dept(V.scopeDept(u)).name) : ''), rows.length ? `<ol class="ranking">${rows.map((r, i) => `
          <li class="clickable" data-go="funcionario/${r.user.id}" tabindex="0" role="link">
            <span class="rk-pos">${i + 1}</span>
            ${V.avatar(r.user)}
            <div class="rk-main"><b>${esc(r.user.name)}</b><div class="rk-bar"><b style="width:${r.points / max * 100}%"></b></div></div>
            <span class="rk-pts">${F.n(r.points)}<small>pontos</small></span>
            <span class="rk-util">${F.pct0(r.util)}<small>utilização</small></span>
            ${V.badge(r.status)}
          </li>`).join('')}</ol>` : V.empty('Sem dados no período.'))}
        ${deptRank.length ? V.card('Departamentos', `<ol class="rank-list">${deptRank.map((r, i) => `<li><span class="rk-pos">${i + 1}</span><span class="rk-name">${esc(r.d.name)}<small>${F.n(r.tm.points)} pts · ${F.pct0(r.tm.util)}</small></span><span class="rk-val">${F.n(r.tm.points / (r.n || 1))}<small>pts/pessoa</small></span></li>`).join('')}</ol>`, { sub: 'Pontos por pessoa' }) : ''}
      </div>`;
  };

  /*
   * ---------- Calendário ----------
   * Na grade: somente feriados, férias, reuniões e eventos.
   * No painel lateral (dia selecionado): feriado, férias, reuniões, eventos, prazos, obrigações fiscais e
   * atividades realizadas (sem tarefas), além dos dias com mais pontos e das obrigações do mês.
   */
  V.calendario = u => {
    const S = P.state;
    const m = S.cal.month;
    const ms = D.monthStart(m), me = D.monthEnd(m);
    const gridStart = D.weekStart(ms);
    const scope = V.scopeDept(u);
    const emps = u.role === 'employee' ? [u] : V.team(u);
    const target = S.cal.userId && emps.find(e => e.id === S.cal.userId) ? [P.user(S.cal.userId)] : emps;
    const byDay = {};
    target.forEach(e => (P.idx.byUser.get(e.id) || []).forEach(x => { if (x.date >= D.iso(ms) && x.date <= D.iso(me) && P.counts(x)) { (byDay[x.date] = byDay[x.date] || { pts: 0, n: 0 }); byDay[x.date].pts += x.points; byDay[x.date].n++; } }));
    const evs = P.agenda.forUser(u, scope);
    const evByDay = {}; evs.forEach(e => { (evByDay[e.date] = evByDay[e.date] || []).push(e); });
    // Férias aprovadas entram no calendário geral; o comentário só aparece para gestor e diretoria
    const vacs = api.vacations(u).filter(v => v.status === 'aprovada' && (!P.isGlobal(u) || !scope || v.deptId === scope) && (!S.cal.userId || v.userId === S.cal.userId));
    const vacOn = iso => vacs.filter(v => iso >= v.start && iso <= v.end);
    const showVacComment = u.role !== 'employee';
    const capDay = target.reduce((a, e) => a + e.capacity / 5, 0);
    const load = P.seesLoad(u);
    const today = D.iso(P.today());
    let cells = '';
    for (let d = new Date(gridStart); d <= me || d.getDay() !== 1; d = D.add(d, 1)) {
      const iso = D.iso(d), inM = d.getMonth() === m.getMonth();
      const dm = V.dayMark(d), vo = vacOn(iso);
      const tags = [dm.tag]
        .concat(vo.length ? [`<i class="tag vac">${vo.length === 1 ? V.avatar(P.user(vo[0].userId), 'xs') + 'Férias: ' + esc(P.firstName((P.user(vo[0].userId) || { name: '—' }).name)) : vo.length + ' de férias'}</i>`] : [])
        .concat(V.agendaTags(evByDay[iso] || [])).filter(Boolean);
      const shown = tags.slice(0, 3), extra = tags.length - shown.length;
      cells += `<button type="button" class="cal-cell ${inM ? '' : 'out'} ${iso === today ? 'today' : ''} ${S.cal.sel === iso ? 'sel' : ''} ${D.isWorkday(d) ? '' : 'off'} ${dm.cls}" data-act="calSel" data-date="${iso}" aria-label="${D.fmt(iso)}${dm.label ? ', ' + esc(dm.label) : ''}">
        <span class="cal-d">${d.getDate()}</span>
        <span class="cal-tags">${shown.join('')}${extra > 0 ? `<i class="tag more">+${extra}</i>` : ''}</span>
      </button>`;
    }
    const sel = S.cal.sel;
    const selEntries = sel ? target.flatMap(e => (P.idx.byUser.get(e.id) || []).filter(x => x.date === sel)) : [];
    const selObr = sel ? (() => { const d = D.parse(sel); return P.obligationsFor(u, d.getFullYear(), d.getMonth(), scope).filter(o => o.date === sel); })() : [];
    const selEv = sel ? (evByDay[sel] || []).slice().sort((a, b) => (a.start || '99') < (b.start || '99') ? -1 : 1) : [];
    const heavy = Object.entries(byDay).sort((a, b) => b[1].pts - a[1].pts).slice(0, 3);
    return `${V.pageHead('Calendário', 'Feriados, férias, reuniões e eventos. Clique em um dia para ver também prazos, obrigações fiscais e atividades realizadas.', V.deptPicker(u) + (u.role !== 'employee' ? `<label class="picker">${icon('users')}<select id="cal-user" data-set="cal.userId" aria-label="Colaborador"><option value="">${P.isGlobal(u) && !scope ? 'Todos' : 'Toda a equipe'}</option>${emps.map(e => `<option value="${e.id}" ${S.cal.userId === e.id ? 'selected' : ''}>${esc(e.name)}</option>`).join('')}</select></label>` : '') + V.btn('Agendar', { act: 'agendaNew', icon: 'plus', cls: 'primary' }))}
      <div class="grid g-cal">
        <section class="card">
          <header class="card-h cal-h"><div class="cal-nav">${V.ibtn('left', 'Mês anterior', { act: 'calMove', attrs: 'data-d="-1"' })}<h3>${D.MONTHS[m.getMonth()][0].toUpperCase() + D.MONTHS[m.getMonth()].slice(1)} ${m.getFullYear()}</h3>${V.ibtn('right', 'Próximo mês', { act: 'calMove', attrs: 'data-d="1"' })}</div>
            <div class="cal-legend"><i class="lg-hol"></i><span>Feriado</span><i class="lg-vac2"></i><span>Férias</span><i class="lg-meet"></i><span>Reunião</span><i class="lg-ev"></i><span>Evento</span><i class="lg-wk"></i><span>Não útil</span></div></header>
          <div class="card-b"><div class="cal-grid">${['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'].map(w => `<span class="cal-wd">${w}</span>`).join('')}${cells}</div></div>
        </section>
        <div class="stack">
          ${V.card(sel ? D.fmt(sel) + ' · ' + D.WEEKDAYS_L[D.parse(sel).getDay()] : 'Selecione um dia', sel ? `
            ${V.dayInfo(D.parse(sel))}
            ${vacOn(sel).map(v => `<div class="evt vac">${icon('palm')}<span><b>Férias · ${esc((P.user(v.userId) || { name: '—' }).name)}</b><small>${D.fmt(v.start)} a ${D.fmt(v.end)} · ${v.days} dias</small>${showVacComment && !v.restricted && v.comment ? `<em class="evt-comment">“${esc(v.comment)}”</em>` : ''}</span></div>`).join('')}
            ${selEv.map(e => V.agendaItem(u, e)).join('')}
            ${selObr.map(o => `<div class="evt obr">${icon('file')}<span><b>${esc(o.name)}</b><small>Obrigação fiscal · ${esc(P.dept(o.dept) ? (P.dept(o.dept) || { name: '—' }).name : '')} · ${o.total ? o.total + ' empresa' + (o.total > 1 ? 's' : '') : 'nenhuma empresa com esse regime'}${o.mine ? ' · ' + o.mine + ' na sua carteira' : ''}</small></span></div>`).join('')}
            ${sel >= today ? `<div class="evt-add">${V.btn('Agendar neste dia', { act: 'agendaNew', cls: 'sm ghost', icon: 'plus', attrs: `data-date="${sel}"` })}</div>` : ''}
            ${selEntries.length ? `<h4 class="sub-h">Atividades realizadas · ${F.n(selEntries.filter(P.counts).reduce((a, e) => a + e.points, 0))} pts</h4><ul class="day-list">${selEntries.map(e => `<li><span>${esc((P.act(e.activityId) || { name: '—' }).name)}${target.length > 1 ? `<small>${esc((P.user(e.userId) || { name: '—' }).name)}</small>` : ''}</span><b>${F.n(e.points, 2)}</b></li>`).join('')}</ul>` : '<p class="muted">Nenhuma atividade registrada neste dia.</p>'}
          ` : '<p class="muted">Clique em um dia para ver detalhes.</p>')}
          ${V.card(load ? 'Dias de maior carga no mês' : 'Dias com mais pontos no mês', heavy.length ? `<ul class="day-list">${heavy.map(([k, v]) => `<li><button type="button" class="link" data-act="calSel" data-date="${k}">${D.fmt(k)} · ${D.WEEKDAYS[D.parse(k).getDay()]}</button><b>${F.n(v.pts)} pts${load ? ' · ' + F.pct0(v.pts / capDay * 100) : ''}</b></li>`).join('')}</ul>` : '<p class="muted">Sem registros.</p>')}
          ${V.obligationsCard(u, m, scope)}
          ${V.holidayYear(m.getFullYear())}
        </div>
      </div>`;
  };
  /* ---------- Feriados e dias não trabalhados ---------- */
  V.dayMark = d => {
    const iso = D.iso(d), h = P.holidays.on(iso), wk = d.getDay() === 0 || d.getDay() === 6;
    if (h) {
      const off = P.holidays.isOff(iso);
      const kind = { nacional: 'Feriado nacional', estadual: 'Feriado estadual', municipal: 'Feriado municipal', facultativo: 'Ponto facultativo' }[h.type];
      return { cls: off ? 'hol' : 'hol-opt', label: kind + ': ' + h.name, tag: `<i class="tag hol ${h.type}" title="${esc(P.holidays.TYPES[h.type] + ' · ' + h.law)}"><b>${esc(h.name)}</b><small>${kind}</small></i>` };
    }
    if (wk) return { cls: 'wk', label: 'fim de semana, não trabalhado', tag: '<i class="tag wk">Não útil</i>' };
    return { cls: '', label: '', tag: '' };
  };
  V.dayInfo = d => {
    const iso = D.iso(d), h = P.holidays.on(iso), wk = d.getDay() === 0 || d.getDay() === 6;
    const parts = [];
    if (h) parts.push(`<div class="evt hol ${h.type}">${icon('calendar')}<span><b>${esc(h.name)}</b><small>${esc(P.holidays.TYPES[h.type])} · ${esc(h.law)} · ${P.holidays.isOff(iso) ? 'dia não trabalhado' : 'dia trabalhado (ponto facultativo)'}</small></span></div>`);
    if (wk) parts.push(`<div class="evt wk">${icon('clock')}<span><b>${d.getDay() === 6 ? 'Sábado' : 'Domingo'}</b><small>Fim de semana · dia não trabalhado</small></span></div>`);
    return parts.join('');
  };
  V.holidayYear = y => {
    const list = P.holidays.list(y);
    const workdays = D.workdays(new Date(y, 0, 1), new Date(y, 11, 31));
    const wkNames = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
    return V.card('Feriados de ' + y, `<ul class="hol-list">${list.map(h => {
      const d = D.parse(h.date), wk = d.getDay() === 0 || d.getDay() === 6;
      return `<li class="${h.type}"><button type="button" class="link" data-act="calSel" data-date="${h.date}">${D.short(h.date)}</button><span><b>${esc(h.name)}</b><small>${wkNames[d.getDay()]} · ${esc(P.holidays.TYPES[h.type])}${wk && h.type !== 'facultativo' ? ' · cai no fim de semana' : ''}</small></span></li>`;
    }).join('')}</ul><p class="fine">${workdays} dias úteis em ${y}, já descontados fins de semana e feriados${P.store.db.settings.optionalDaysOff ? ' e pontos facultativos' : ''}. Fontes: leis federais 662/1949, 6.802/1980, 9.093/1995 e 14.759/2023; leis estaduais RJ 5.198/2008 e 5.243/2008; Lei Municipal de Volta Redonda 5.484/2018.</p>`, { sub: 'Nacionais, estaduais (RJ) e municipais (Volta Redonda)' });
  };

})(window.P);
