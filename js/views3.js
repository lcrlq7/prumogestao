/* Prumo — relatórios, histórico, alertas, configurações e administração */
'use strict';
(function (P) {
  const F = P.fmt, D = P.date, esc = P.esc, M = P.M, api = P.api, C = P.charts, V = P.V;
  const icon = V.icon;

  /* ---------- Relatórios ---------- */
  P.buildReport = (u, rep) => {
    const p = P.period(rep.period, rep.custom);
    const months = 6;
    if (rep.type === 'individual') {
      const emp = api.employee(u, rep.userId);
      const st = M.stats(emp, p);
      const acts = M.byActivity([emp], p);
      const evo = M.monthly([emp], months);
      const ins = u.role === 'employee' ? [] : P.insights(u, emp.deptId).filter(i => i.emp === emp.id);
      const load = P.seesLoad(u); // o funcionário não vê capacidade, utilização nem classificação de carga
      return {
        kind: 'individual', title: 'Relatório individual', subject: emp.name, p, load,
        meta: [['Funcionário', emp.name], ['Departamento', P.dept(emp.deptId).name], ['Cargo', emp.title || '—'], ['Período', p.label + ' (' + D.fmt(p.s) + ' a ' + D.fmt(p.e) + ')']].concat(load ? [['Capacidade semanal', F.n(emp.capacity) + ' pts']] : []),
        summary: load ? [['Pontos', F.n(st.points)], ['Capacidade no período', F.n(st.capacity)], ['Utilização', F.pct(st.util)], ['Classificação', V.STATUS[st.status].label], ['Atividades (unidades)', F.n(st.tasks)], ['Lançamentos', F.n(st.n)]]
          : [['Pontos', F.n(st.points)], ['Atividades (unidades)', F.n(st.tasks)], ['Lançamentos', F.n(st.n)]],
        acts, evo, insights: ins,
        entries: M.entries(emp.id, p)
      };
    }
    const d = api.department(u, rep.deptId);
    const emps = api.workers(u, d.id);
    const tm = M.team(emps, p);
    const acts = M.byActivity(emps, p);
    const evo = M.monthly(emps, months);
    return {
      kind: 'departamento', title: 'Relatório do departamento', subject: d.name, p, load: true,
      meta: [['Departamento', d.name], ['Gestor(a)', (P.user(d.managerId) || {}).name || '—'], ['Período', p.label + ' (' + D.fmt(p.s) + ' a ' + D.fmt(p.e) + ')']],
      summary: [['Pessoas com produção', emps.length], ['Total de pontos', F.n(tm.points)], ['Total de atividades', F.n(tm.tasks)], ['Média por pessoa', F.n(tm.avg)], ['Capacidade', F.n(tm.capacity)], ['Utilização', F.pct(tm.util)], ['Em sobrecarga', tm.over], ['Baixa utilização', tm.low]],
      team: tm.rows.sort((a, b) => (b.util || 0) - (a.util || 0)), acts, evo,
      insights: P.insights(u, d.id),
      entries: emps.flatMap(e => M.entries(e.id, p))
    };
  };

  V.relatorios = u => {
    const S = P.state, r = S.rep;
    if (u.role === 'employee') { r.type = 'individual'; r.userId = u.id; }
    if (u.role === 'manager') r.deptId = u.deptId;
    if (!r.deptId) r.deptId = api.departments(u)[0].id;
    const emps = u.role === 'employee' ? [u] : api.workers(u, P.isGlobal(u) ? r.deptId : undefined);
    if (r.type === 'individual' && !emps.some(e => e.id === r.userId)) r.userId = (emps[0] || {}).id;
    let rep, err = '';
    try { rep = P.buildReport(u, r); } catch (e) { err = e.message; }
    const periods = [['semana', 'Esta semana'], ['semana_ant', 'Semana anterior'], ['mes', 'Este mês'], ['mes_ant', 'Mês anterior'], ['3m', 'Últimos 3 meses'], ['6m', 'Últimos 6 meses'], ['custom', 'Personalizado']];
    return `${V.pageHead('Relatórios', 'Monte o relatório, confira a prévia e exporte em PDF ou Excel.', V.btn('Agendar', { act: 'scheduleReport', icon: 'clock', cls: 'ghost' }))}
      <section class="card"><div class="card-b"><div class="fgrid rep-form">
        ${u.role !== 'employee' ? `<label class="field"><span>Tipo</span><select id="rep-type" data-set="rep.type"><option value="departamento" ${r.type === 'departamento' ? 'selected' : ''}>Departamento</option><option value="individual" ${r.type === 'individual' ? 'selected' : ''}>Individual</option></select></label>` : ''}
        ${P.isGlobal(u) ? `<label class="field"><span>Departamento</span><select id="rep-dept" data-set="rep.deptId">${api.departments(u).map(d => `<option value="${d.id}" ${r.deptId === d.id ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</select></label>` : ''}
        ${r.type === 'individual' && u.role !== 'employee' ? `<label class="field"><span>Funcionário</span><select id="rep-user" data-set="rep.userId">${emps.map(e => `<option value="${e.id}" ${r.userId === e.id ? 'selected' : ''}>${esc(e.name)}</option>`).join('')}</select></label>` : ''}
        <label class="field"><span>Período</span><select id="rep-period" data-set="rep.period">${periods.map(([k, l]) => `<option value="${k}" ${r.period === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        ${r.period === 'custom' ? `<label class="field"><span>Início</span><input type="date" id="rep-s" value="${r.custom.start}" data-set="rep.custom.start"></label><label class="field"><span>Fim</span><input type="date" id="rep-e" value="${r.custom.end}" data-set="rep.custom.end"></label>` : ''}
        <div class="field rep-btns">${V.btn('Exportar PDF', { act: 'exportPdf', icon: 'download', cls: 'primary' })}${V.btn('Exportar Excel', { act: 'exportXlsx', icon: 'download' })}</div>
      </div></div></section>
      ${err ? `<div class="banner crit">${icon('lock')}<div>${esc(err)}</div></div>` : V.reportPreview(rep)}`;
  };

  V.reportPreview = rep => `
    <article class="card report">
      <header class="rep-h"><div class="brand-mini">${icon('plumb')}<span>Prumo</span></div><div><h2>${rep.title}</h2><p>${esc(rep.subject)} · gerado em ${D.fmt(D.iso(P.today()))}</p></div></header>
      <dl class="rep-meta">${rep.meta.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
      <div class="rep-sum">${rep.summary.map(([k, v]) => `<div><span>${k}</span><b>${esc(v)}</b></div>`).join('')}</div>
      ${rep.team ? `<h4 class="sub-h">Carga por colaborador</h4><div class="table-wrap"><table class="tbl"><thead><tr><th>Funcionário</th><th class="num">Pontos</th><th class="num">Capacidade</th><th class="num">Utilização</th><th class="num">Tarefas</th><th>Classificação</th></tr></thead><tbody>${rep.team.map(r => `<tr><td>${esc(r.user.name)}</td><td class="num">${F.n(r.points)}</td><td class="num">${F.n(r.capacity)}</td><td class="num">${F.pct(r.util)}</td><td class="num">${F.n(r.tasks)}</td><td>${V.badge(r.status)}</td></tr>`).join('')}</tbody></table></div>` : ''}
      <div class="grid g-1-1">
        <div><h4 class="sub-h">Atividades no período</h4>${rep.acts.rows.length ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>Atividade</th><th class="num">Qtd.</th><th class="num">Pontos</th><th class="num">%</th></tr></thead><tbody>${rep.acts.rows.map(r => `<tr><td>${esc(r.act.name)}</td><td class="num">${F.n(r.qty, 2)}</td><td class="num">${F.n(r.points)}</td><td class="num">${F.pct0(r.share)}</td></tr>`).join('')}</tbody></table></div>` : V.empty('Sem atividades no período.')}</div>
        <div><h4 class="sub-h">Evolução mensal</h4>${C.slot({ type: 'bars', data: rep.evo.map(m => ({ label: m.label, value: m.points, partial: m.partial, tip: `${D.monthLabel(m.start, true)}: ${F.n(m.points)} pts${rep.load ? ' · ' + F.pct0(m.util) : ''}` })), ref: rep.load ? { values: rep.evo.map(m => m.capacity), label: 'Capacidade' } : null, height: 220, aria: 'Evolução mensal' })}
          <div class="table-wrap"><table class="tbl compact"><thead><tr><th>Mês</th><th class="num">Pontos</th>${rep.load ? '<th class="num">Utilização</th>' : ''}</tr></thead><tbody>${rep.evo.map(m => `<tr><td>${D.monthLabel(m.start, true)}${m.partial ? ' (parcial)' : ''}</td><td class="num">${F.n(m.points)}</td>${rep.load ? `<td class="num">${F.pct(m.util)}</td>` : ''}</tr>`).join('')}</tbody></table></div></div>
      </div>
      ${rep.insights.length ? `<h4 class="sub-h">Insights</h4>${V.insightList(rep.insights.slice(0, 8), { links: false })}` : ''}
    </article>`;

  /* ---------- Histórico ---------- */
  V.historico = u => {
    const S = P.state, h = S.hist;
    const scopeDept = P.isGlobal(u) ? (h.deptId || undefined) : undefined;
    const emps = u.role === 'employee' ? [u] : api.workers(u, scopeDept);
    if (h.userId && !emps.some(e => e.id === h.userId)) h.userId = '';
    const acts = u.role === 'employee' ? api.activities(u, u.deptId, true) : api.activities(u, P.isGlobal(u) ? scopeDept : u.deptId, true);
    const list = api.entries(u, { deptId: scopeDept, userId: h.userId || undefined, activityId: h.activityId || undefined, client: h.client || undefined, status: h.status || undefined, s: h.s || undefined, e: h.e || undefined })
      .filter(e => (P.user(e.userId) || {}).active !== false) // desligados não aparecem no histórico (os dados continuam guardados)
      .slice().reverse();
    const per = 40, pages = Math.max(1, Math.ceil(list.length / per));
    if (h.page > pages) h.page = pages;
    const slice = list.slice((h.page - 1) * per, h.page * per);
    const tot = list.filter(P.counts).reduce((a, e) => a + e.points, 0);
    return `${V.pageHead('Histórico de atividades', 'Todos os lançamentos do seu escopo de acesso, com filtros combináveis.', V.btn('Exportar Excel', { act: 'exportHist', icon: 'download' }))}
      <section class="card"><div class="card-b"><div class="filters">
        ${u.role !== 'employee' ? `<label class="field"><span>Funcionário</span><select id="h-user" data-set="hist.userId"><option value="">Todos</option>${emps.map(e => `<option value="${e.id}" ${h.userId === e.id ? 'selected' : ''}>${esc(e.name)}</option>`).join('')}</select></label>` : ''}
        <label class="field"><span>Atividade</span><select id="h-act" data-set="hist.activityId"><option value="">Todas</option>${acts.map(a => `<option value="${a.id}" ${h.activityId === a.id ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select></label>
        <label class="field"><span>Cliente</span><input type="search" id="h-client" value="${esc(h.client)}" data-set="hist.client" data-live placeholder="Buscar cliente"></label>
        ${P.isGlobal(u) ? `<label class="field"><span>Departamento</span><select id="h-dept" data-set="hist.deptId"><option value="">Todos</option>${api.departments(u).map(d => `<option value="${d.id}" ${h.deptId === d.id ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</select></label>` : ''}
        <label class="field"><span>De</span><input type="date" id="h-s" value="${h.s}" data-set="hist.s"></label>
        <label class="field"><span>Até</span><input type="date" id="h-e" value="${h.e}" data-set="hist.e"></label>
        <label class="field"><span>Status</span><select id="h-status" data-set="hist.status"><option value="">Todos</option>${Object.entries(V.ENTRY).map(([k, v]) => `<option value="${k}" ${h.status === k ? 'selected' : ''}>${v.label}</option>`).join('')}</select></label>
        <div class="field"><span>&nbsp;</span>${V.btn('Limpar filtros', { act: 'clearHist', cls: 'ghost', icon: 'refresh' })}</div>
      </div></div></section>
      <div class="strip"><div><span>Lançamentos</span><b>${F.n(list.length, 0)}</b></div><div><span>Pontos (válidos)</span><b>${F.n(tot)}</b></div><div><span>Pendentes</span><b>${list.filter(e => e.status === 'pendente').length}</b></div><div><span>Recusados</span><b>${list.filter(e => e.status === 'recusado').length}</b></div></div>
      ${V.card('', V.entryTable(slice, { who: u.role !== 'employee', actions: e => V.ibtn('history', 'Histórico de alterações', { act: 'entryHistory', attrs: `data-id="${e.id}"` }) }) + (pages > 1 ? `<div class="pager">${V.ibtn('left', 'Página anterior', { act: 'histPage', attrs: `data-d="-1" ${h.page <= 1 ? 'disabled' : ''}` })}<span>Página ${h.page} de ${pages}</span>${V.ibtn('right', 'Próxima página', { act: 'histPage', attrs: `data-d="1" ${h.page >= pages ? 'disabled' : ''}` })}</div>` : ''), { cls: 'flush' })}`;
  };

  /* ---------- Alertas ---------- */
  V.ALERT = { red: ['Acima da capacidade', 'alert'], orange: ['Pendente de aprovação', 'clock'], yellow: ['Abaixo de 70%', 'down'], blue: ['Sem lançamentos', 'info'], green: ['Meta atingida', 'check'] };
  V.alertas = u => {
    const S = P.state;
    const all = P.alerts(u);
    const list = S.alertFilter === 'all' ? all : all.filter(a => a.color === S.alertFilter);
    const counts = {}; all.forEach(a => { counts[a.color] = (counts[a.color] || 0) + 1; });
    // Funcionário não vê filtros de carga (acima da capacidade / abaixo de 70%)
    const kinds = Object.entries(V.ALERT).filter(([k]) => P.seesLoad(u) || (k !== 'red' && k !== 'yellow'));
    return `${V.pageHead('Central de alertas', P.seesLoad(u) ? 'Sinais calculados a partir dos lançamentos, capacidade e metas.' : 'Avisos sobre os seus lançamentos, metas e reconhecimentos.', V.btn('Marcar todos como lidos', { act: 'readAll', icon: 'check', cls: 'ghost' }))}
      <div class="toolbar">${V.tabs([['all', 'Todos', all.length]].concat(kinds.map(([k, v]) => [k, `<i class="dot-c ${k}"></i>${v[0]}`, counts[k] || 0])), S.alertFilter, 'alertFilter')}</div>
      ${V.card('', list.length ? `<ul class="alerts">${list.map(a => `
        <li class="alert-i ${a.color} ${a.read ? 'read' : ''}">
          <span class="al-ic">${icon(V.ALERT[a.color][1])}</span>
          <div><b>${esc(a.title)}</b><p>${esc(a.text)}</p><small>${D.relative(a.date)}</small></div>
          <div class="row-actions">${a.emp && u.role !== 'employee' ? V.btn('Ver', { go: 'funcionario/' + a.emp, cls: 'sm ghost' }) : a.link ? V.btn('Abrir', { go: a.link, cls: 'sm ghost' }) : ''}${!a.read ? V.ibtn('check', 'Marcar como lido', { act: 'readAlert', attrs: `data-id="${esc(a.id)}"` }) : ''}</div>
        </li>`).join('')}</ul>` : V.empty('Nenhum alerta neste filtro.', 'check'), { cls: 'flush' })}`;
  };

  /* ---------- Configurações (todos) ---------- */
  V.configuracoes = u => {
    const theme = P.state.theme;
    return `${V.pageHead('Configurações', 'Preferências da sua conta.')}
      <div class="grid g-1-1">
        ${V.card('Meu perfil', `<form class="form profile-form" id="profile-form" novalidate>
          <div class="profile-photo">
            ${V.avatar(u, 'xl')}
            <div class="profile-photo-actions">
              <label class="btn sm" for="pf-photo">${icon('edit')}<span>${u.photo ? 'Trocar foto' : 'Adicionar foto'}</span></label>
              <input type="file" id="pf-photo" accept="image/jpeg,image/png,image/webp" hidden>
              ${u.photo ? V.btn('Ajustar foto', { act: 'adjustPhoto', cls: 'sm ghost', icon: 'image' }) : ''}
              ${u.photo ? V.btn('Remover foto', { act: 'removePhoto', cls: 'sm ghost', icon: 'trash' }) : ''}
              <small class="muted">JPG, PNG ou WEBP. A imagem é recortada em quadrado e reduzida automaticamente.</small>
            </div>
          </div>
          <label class="field"><span>Nome de exibição</span><input type="text" id="pf-name" value="${esc(u.name)}" maxlength="80" autocomplete="name"></label>
          <div class="form-foot"><span class="fine">O nome aparece para a sua equipe, nas aprovações e nos relatórios.</span>${V.btn('Salvar nome', { act: 'saveProfileName', cls: 'primary sm', icon: 'check' })}</div>
        </form>`)}
        ${V.card('Minha conta', `<dl class="kv">
          <div><dt>E-mail</dt><dd>${esc(u.email)}</dd></div>
          <div><dt>Perfil de acesso</dt><dd>${P.ROLES[u.role]}</dd></div>
          <div><dt>Departamento</dt><dd>${u.deptId ? esc(P.dept(u.deptId).name) : 'Todos (acesso global)'}</dd></div>
          ${!P.isGlobal(u) && u.deptId ? `<div><dt>Gestor(a) responsável</dt><dd>${V.deptManager(u.deptId) ? (V.deptManager(u.deptId).id === u.id ? 'Você' : esc(V.deptManager(u.deptId).name)) : 'Sem gestor no momento'}</dd></div>` : ''}
          ${u.role === 'manager' ? `<div><dt>Capacidade semanal</dt><dd>${F.n(u.capacity)} pontos</dd></div>` : ''}
        </dl>`)}
        ${V.card('Aparência', `<div class="seg" role="group">${[['light', 'Claro', 'sun'], ['dark', 'Escuro', 'moon'], ['system', 'Sistema', 'monitor']].map(([k, l, i]) => `<button type="button" class="${theme === k ? 'on' : ''}" data-act="theme" data-key="${k}">${icon(i)}${l}</button>`).join('')}</div>
          <div class="pref-rows">
            <label class="check-inline"><input type="checkbox" data-act="toggleDense" ${document.body.classList.contains('dense') ? 'checked' : ''}> Tabelas compactas (menos espaço entre as linhas)</label>
            <div class="pref-btns">${V.btn('Rever o tour', { act: 'startTour', icon: 'zap', cls: 'sm ghost' })}${V.btn('Atalhos de teclado', { act: 'shortcuts', icon: 'help', cls: 'sm ghost' })}</div>
          </div>`)}
      </div>
      ${V.card('Metodologia de pontos', !P.seesLoad(u) ? `<div class="prose">
        <p><b>1 ponto ≈ 1 hora média de trabalho.</b> Cada lançamento gera pontos pela fórmula <code>quantidade × peso da atividade</code>. O peso fica gravado no lançamento, então recalibrações não alteram o passado.</p>
        <p>Os pesos são revisados periodicamente pela gestão, com base no tempo real das atividades. Cada ajuste fica registrado com data, autor e motivo.</p></div>` : `<div class="prose">
        <p><b>1 ponto ≈ 1 hora média de trabalho.</b> Cada lançamento gera pontos pela fórmula <code>quantidade × peso da atividade</code>. O peso fica gravado no lançamento, então recalibrações não alteram o passado.</p>
        <p><b>Capacidade.</b> A referência é de 30 a 32 pontos semanais para uma jornada de 40 horas, cerca de 75% a 80% do tempo disponível, considerando reuniões, pausas e imprevistos. A capacidade de cada pessoa é configurável.</p>
        <p><b>Utilização.</b> Pontos entregues ÷ capacidade do período × 100. Em períodos em andamento, a capacidade é proporcional aos dias úteis decorridos.</p>
        <p><b>Faixas.</b> Abaixo de ${P.store.db.settings.lowThreshold}%: baixa utilização. De ${P.store.db.settings.lowThreshold}% a ${P.store.db.settings.highThreshold}%: faixa saudável. Acima de ${P.store.db.settings.highThreshold}%: sobrecarga. Duas semanas seguidas acima geram alerta de sobrecarga recorrente.</p>
        <p><b>Calibração.</b> Registre o tempo real das atividades por 2 semanas, use a mediana e revise os pesos periodicamente. Cada ajuste fica registrado no histórico de pesos com data, autor e motivo.</p>
        <p class="muted">As métricas existem para enxergar carga, capacidade e distribuição de tarefas e orientar melhorias de processo, não para pressionar pessoas por produção.</p></div>`)}
      ${P.isLive ? '' : V.card('Dados de demonstração', `<p class="prose">Esta versão roda com dados fictícios salvos no seu navegador. Restaurar apaga as alterações feitas aqui e gera a base de exemplo novamente.</p>${V.btn('Restaurar dados de demonstração', { act: 'resetDemo', icon: 'refresh', cls: 'ghost' })}`)}`;
  };

  /* ---------- Administração ---------- */
  V.departamentos = u => {
    const p = V.curPeriod();
    const rows = api.departments(u).map(d => ({ d, emps: api.workers(u, d.id) })).map(r => Object.assign(r, { tm: M.team(r.emps, p) }));
    return `${V.pageHead('Departamentos', 'Estrutura da empresa, gestores responsáveis e comparação entre áreas.', V.periodBar(['semana', 'mes', 'mes_ant', 'custom']) + V.btn('Novo departamento', { act: 'editDept', icon: 'plus', cls: 'primary' }))}
      <div class="dept-cards">${rows.map(r => {
        const m = P.user(r.d.managerId);
        return `<section class="card dept-card">
          <header><span class="code">${esc(r.d.code)}</span><h3>${esc(r.d.name)}</h3>${V.ibtn('edit', 'Editar departamento', { act: 'editDept', attrs: `data-id="${r.d.id}"` })}</header>
          <p class="muted">${esc(r.d.description || '')}</p>
          <div class="dc-mgr">${m ? V.person(m, 'Gestão') : '<span class="muted">Sem gestor definido</span>'}</div>
          <div class="dc-nums"><div><b>${r.emps.length}</b><span>pessoas</span></div><div><b>${F.n(r.tm.points, 0)}</b><span>pontos</span></div><div><b>${F.pct0(r.tm.util)}</b><span>utilização</span></div></div>
          ${V.progress(r.tm.util, { status: M.classify(r.tm.util) })}
          ${V.btn('Ver equipe', { go: 'equipe?dept=' + r.d.id, cls: 'ghost sm', icon: 'right' })}
        </section>`;
      }).join('')}</div>
      ${V.card('Comparação entre departamentos', V.deptCompareTable(rows), { sub: p.label })}
      <div class="grid g-1-1">
        ${V.card('Pontos por pessoa', C.slot({ type: 'bars', data: rows.map(r => ({ label: r.d.code, value: P.round2(r.tm.avg), tip: `${r.d.name}: ${F.n(r.tm.avg)} pts por pessoa` })), height: 220, aria: 'Pontos por pessoa por departamento' }), { sub: 'Normaliza o tamanho das equipes' })}
        ${V.card('Utilização da capacidade', C.load(rows.map(r => ({ name: r.d.name, util: r.tm.util, status: M.classify(r.tm.util), points: r.tm.points, capacity: r.tm.capacity }))))}
      </div>`;
  };

  /* ---------- Desligamento (demissão) ---------- */
  V.userStatus = x => {
    const dm = (x.dismissals || [])[0];
    if (x.active === false && dm && !dm.readmittedAt) return `<span class="badge es-recusado" title="${esc(dm.reason)}">${icon('userminus')}Desligado(a) em ${D.fmt(dm.at)}</span>`;
    if (x.active === false) return '<span class="badge st-sem">' + icon('x') + 'Inativo</span>';
    return '<span class="badge es-aprovado">' + icon('check') + 'Ativo</span>';
  };
  /* Só a diretoria desliga e readmite; não se desliga a si mesma */
  V.dismissBtns = (u, x) => {
    if (u.role !== 'admin' || x.id === u.id) return '';
    return x.active === false
      ? V.ibtn('refresh', 'Readmitir', { act: 'readmitUser', attrs: `data-id="${x.id}"` })
      : V.ibtn('userminus', 'Desligar', { act: 'dismissUser', cls: 'danger', attrs: `data-id="${x.id}"` });
  };
  V.dismissedCard = u => {
    const gone = P.store.db.users.filter(x => x.active === false && (x.dismissals || []).length && !x.dismissals[0].readmittedAt)
      .sort((a, b) => a.dismissals[0].at < b.dismissals[0].at ? 1 : -1);
    if (!gone.length) return '';
    return V.card('Desligados', `<div class="table-wrap"><table class="tbl"><thead><tr><th>Nome</th><th>Função na saída</th><th>Departamento</th><th>Data</th><th>Motivo</th><th>Registrado por</th><th class="actions-col"></th></tr></thead>
      <tbody>${gone.map(x => { const dm = x.dismissals[0], d = P.dept(dm.deptId); return `<tr class="inactive"><td>${V.person(x, false)}</td><td>${V.roleBadge(dm.role)}</td><td>${d ? esc(d.name) : '—'}</td><td class="nowrap">${D.fmt(dm.at)}</td><td>${esc(dm.reason)}</td><td>${esc((P.user(dm.by) || {}).name || '—')}</td><td class="actions-col">${V.dismissBtns(u, x)}</td></tr>`; }).join('')}</tbody></table></div>`,
      { cls: 'flush', sub: 'O histórico de lançamentos, metas e auditoria dessas pessoas é preservado. O acesso ao sistema fica bloqueado.' });
  };

  V.funcionarios = u => {
    const S = P.state, f = S.empFilter;
    let list = api.allEmployees(u);
    if (f.dept) list = list.filter(e => e.deptId === f.dept);
    if (f.q) { const q = f.q.toLowerCase(); list = list.filter(e => e.name.toLowerCase().includes(q) || e.email.includes(q)); }
    // Desligados ficam fora da lista; só aparecem se escolher "Desligados" em Situação (para readmitir)
    list = list.filter(e => f.status === 'inativo' ? e.active === false : e.active !== false);
    list.sort((a, b) => a.name.localeCompare(b.name));
    const global = P.isGlobal(u);
    return `${V.pageHead('Funcionários', global ? 'Cadastro, departamento, capacidade e situação de cada colaborador.' : 'Funcionários do seu departamento. Você pode cadastrar e editar os dados deles.', V.btn('Códigos de convite', { act: 'inviteCodes', icon: 'key', cls: 'ghost' }) + V.btn('Novo funcionário', { act: 'editUser', icon: 'plus', cls: 'primary', attrs: 'data-role="employee"' }))}
      <section class="card"><div class="card-b"><div class="filters">
        <label class="field"><span>Buscar</span><input type="search" id="ef-q" value="${esc(f.q)}" data-set="empFilter.q" data-live placeholder="Nome ou e-mail"></label>
        ${global ? `<label class="field"><span>Departamento</span><select id="ef-dept" data-set="empFilter.dept"><option value="">Todos</option>${api.departments(u).map(d => `<option value="${d.id}" ${f.dept === d.id ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</select></label>` : ''}
        <label class="field"><span>Situação</span><select id="ef-st" data-set="empFilter.status"><option value="">Ativos</option><option value="inativo" ${f.status === 'inativo' ? 'selected' : ''}>Desligados</option></select></label>
      </div></div></section>
      ${V.card('', `<div class="table-wrap"><table class="tbl"><thead><tr><th>Funcionário</th><th>E-mail</th><th>Departamento</th><th>Gestor(a)</th><th class="num">Jornada</th><th class="num">Capacidade</th><th>Situação</th><th class="actions-col"></th></tr></thead>
        <tbody>${list.map(e => { const d = P.dept(e.deptId); return `<tr class="${e.active === false ? 'inactive' : ''}"><td>${V.person(e)}</td><td>${esc(e.email)}</td><td>${d ? esc(d.name) : '—'}</td><td>${d && P.user(d.managerId) ? esc(P.user(d.managerId).name) : '—'}</td><td class="num">${e.hours || 40}h</td><td class="num">${F.n(e.capacity)} pts</td><td>${V.userStatus(e)}</td>
          <td class="actions-col"><div class="row-actions">${P.canManageUser(u, e) ? V.ibtn('edit', 'Editar', { act: 'editUser', attrs: `data-id="${e.id}"` }) : ''}${P.canChangeRole(u, e) ? V.ibtn('shield', 'Promover ou rebaixar', { act: 'changeRole', attrs: `data-id="${e.id}"` }) : ''}${e.active !== false ? V.ibtn('right', 'Abrir painel', { attrs: `data-go="funcionario/${e.id}"` }) : ''}${V.dismissBtns(u, e)}</div></td></tr>`; }).join('')}</tbody></table></div>`, { cls: 'flush', sub: list.length + ' registros' })}`;
  };

  V.gestores = u => {
    const p = V.curPeriod();
    const mgrs = P.store.db.users.filter(x => x.role === 'manager' && x.active !== false);
    return `${V.pageHead('Gestores e diretoria', 'Estrutura de hierarquia. Cada gestor enxerga somente o próprio departamento; gerente e diretoria veem todos.', V.btn('Códigos de convite', { act: 'inviteCodes', icon: 'key', cls: 'ghost' }) + V.btn('Novo gestor', { act: 'editUser', icon: 'plus', cls: 'primary', attrs: 'data-role="manager"' }))}
      ${V.card('', `<div class="table-wrap"><table class="tbl"><thead><tr><th>Gestor(a)</th><th>E-mail</th><th>Departamento</th><th class="num">Equipe</th><th class="num">Pontos</th><th class="util-col">Utilização</th><th>Situação</th><th>Escopo de acesso</th><th class="actions-col"></th></tr></thead>
      <tbody>${mgrs.map(m => { const d = P.dept(m.deptId), st = M.stats(m, p); return `<tr><td>${V.person(m)}</td><td>${esc(m.email)}</td><td>${d ? esc(d.name) : '<span class="muted">Sem departamento</span>'}</td><td class="num">${d ? api.employees(u, d.id).length : 0}</td><td class="num strong">${F.n(st.points)}</td><td class="util-col">${F.pct(st.util)}</td><td>${V.badge(st.status)}</td><td><span class="badge es-aprovado">${icon('lock')}${d ? 'Somente ' + esc(d.name) : 'Nenhum'}</span></td><td class="actions-col"><div class="row-actions">${V.ibtn('right', 'Abrir rendimento', { attrs: `data-go="funcionario/${m.id}"` })}${P.canManageUser(u, m) ? V.ibtn('edit', 'Editar', { act: 'editUser', attrs: `data-id="${m.id}"` }) : ''}${P.canChangeRole(u, m) ? V.ibtn('shield', 'Promover ou rebaixar', { act: 'changeRole', attrs: `data-id="${m.id}"` }) : ''}${V.dismissBtns(u, m)}</div></td></tr>`; }).join('')}</tbody></table></div>`, { cls: 'flush' })}
      ${V.card('Diretoria e gerência', V.hierarchyChart() + `<div class="table-wrap"><table class="tbl"><thead><tr><th>Nome</th><th>Função</th><th>E-mail</th><th>Escopo de acesso</th><th class="actions-col"></th></tr></thead>
        <tbody>${P.store.db.users.filter(x => P.isGlobal(x) && x.active !== false).sort((a, b) => P.LEVEL[b.role] - P.LEVEL[a.role] || a.name.localeCompare(b.name)).map(a => `<tr><td>${V.person(a)}${a.id === u.id ? ' <small class="muted">(você)</small>' : ''}</td><td>${V.roleBadge(a.role)}${P.ledDept(a) ? `<small class="muted role-extra">e gestor(a) de ${esc(P.ledDept(a).name)}</small>` : ''}</td><td>${esc(a.email)}</td><td><span class="badge es-aprovado">${icon('shield')}Todos os departamentos</span></td>
          <td class="actions-col"><div class="row-actions">${P.canManageUser(u, a) ? V.ibtn('edit', 'Editar', { act: 'editUser', attrs: `data-id="${a.id}"` }) : ''}${P.canChangeRole(u, a) ? V.ibtn('shield', 'Promover ou rebaixar', { act: 'changeRole', attrs: `data-id="${a.id}"` }) : ''}${V.dismissBtns(u, a)}</div></td></tr>`).join('')}</tbody></table></div>`,
        { cls: 'flush', sub: 'Cada nível altera somente quem está abaixo dele.', actions: u.role === 'admin' ? V.btn('Novo diretor', { act: 'editUser', icon: 'plus', cls: 'sm', attrs: 'data-role="admin"' }) + V.btn('Novo gerente', { act: 'editUser', icon: 'plus', cls: 'sm', attrs: 'data-role="office"' }) : '' })}
      ${V.card('Como o acesso é aplicado', `<div class="prose"><p>O escopo vem do vínculo do usuário autenticado, não de parâmetros da página. Se um gestor tentar abrir o endereço de um colaborador de outro departamento, a consulta é bloqueada na camada de dados e a tentativa fica registrada na auditoria.</p><p>Na versão com banco de dados, a mesma regra é garantida por políticas de segurança por linha (RLS) no PostgreSQL. O script está no arquivo <code>supabase/schema.sql</code>.</p></div>`)}`;
  };

  V.pesos = u => {
    const S = P.state;
    // Gerente e diretoria editam os pesos de todos os departamentos; o gestor, os do próprio
    const global = P.isGlobal(u);
    const deptId = global ? S.pesoDept : u.deptId;
    const editable = global || u.role === 'manager';
    const hist = P.store.db.weightHistory.filter(h => { const a = P.act(h.activityId); return a && a.deptId === deptId; });
    return `${V.pageHead('Pesos das Atividades', 'Tabela de pesos por departamento. 1 ponto ≈ 1 hora média de trabalho.', editable ? V.btn('Nova atividade', { act: 'editActivity', icon: 'plus', cls: 'primary' }) : '')}
      ${global ? `<div class="toolbar">${V.tabs(api.departments(u).map(d => [d.id, esc(d.name), api.activities(u, d.id, true).length]), deptId, 'pesoDept')}</div>` : ''}
      <div class="banner info">${icon('scale')}<div><b>Os pesos não são definitivos.</b> Recomendação: registrar o tempo das atividades por 2 semanas, usar a mediana e revisar os pesos periodicamente. Mudanças valem para novos lançamentos e ficam registradas abaixo.</div></div>
      ${V.card('Banco de Atividades · ' + esc(P.dept(deptId).name), V.weightTable(u, deptId, editable), { cls: 'flush-b', sub: global ? '' : 'Você altera os pesos do seu departamento. Cada mudança de peso exige um motivo e fica no histórico.' })}
      ${V.card('Evolução dos pesos', hist.length ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>Atividade</th><th class="num">Peso anterior</th><th class="num">Novo peso</th><th>Data</th><th>Alterado por</th><th>Motivo</th></tr></thead>
        <tbody>${hist.map(h => `<tr><td><b>${esc(P.act(h.activityId).name)}</b></td><td class="num">${h.from == null ? '—' : F.n(h.from, 2)}</td><td class="num strong">${F.n(h.to, 2)} ${h.from != null ? V.delta((h.to - h.from) / h.from * 100) : ''}</td><td class="nowrap">${D.fmt(h.at)}</td><td>${esc((P.user(h.by) || {}).name || '—')}</td><td>${esc(h.reason)}</td></tr>`).join('')}</tbody></table></div>` : V.empty('Nenhuma alteração registrada para este departamento.'), { cls: 'flush-b' })}`;
  };

  V.gerais = u => {
    const s = P.store.db.settings;
    const logs = P.store.db.audit.slice(0, 60);
    return `${V.pageHead('Configurações Gerais', 'Parâmetros de cálculo e trilha de auditoria do sistema.')}
      ${V.card('Parâmetros de capacidade', `<form class="form" id="settings-form" novalidate><div class="fgrid">
        <label class="field span2"><span>Nome da empresa</span><input type="text" name="companyName" id="s-company" value="${esc(s.companyName)}"></label>
        <label class="field"><span>Capacidade padrão (pts/semana)</span><input type="number" name="defaultCapacity" id="s-cap" value="${s.defaultCapacity}" min="1" step="1"></label>
        <label class="field"><span>Limite de baixa utilização (%)</span><input type="number" name="lowThreshold" id="s-low" value="${s.lowThreshold}" min="1" max="99"></label>
        <label class="field"><span>Limite de sobrecarga (%)</span><input type="number" name="highThreshold" id="s-high" value="${s.highThreshold}" min="50" max="200"></label>
        <label class="field"><span>Semanas para sobrecarga recorrente</span><input type="number" name="recurringWeeks" id="s-rec" value="${s.recurringWeeks}" min="1" max="8"></label>
        <label class="field"><span>Dias úteis sem lançamento p/ alerta</span><input type="number" name="inactivityDays" id="s-idle" value="${s.inactivityDays}" min="1" max="15"></label>
        <label class="field check span2"><input type="checkbox" name="countPending" id="s-pend" ${s.countPending ? 'checked' : ''}><span>Contabilizar lançamentos pendentes de aprovação nas métricas</span></label>
        <label class="field check span2"><input type="checkbox" name="optionalDaysOff" id="s-opt" ${s.optionalDaysOff ? 'checked' : ''}><span>Considerar pontos facultativos (segunda e Quarta-feira de Cinzas no Carnaval, Corpus Christi) como dias não trabalhados</span></label>
      </div><div class="form-foot"><span></span>${V.btn('Salvar configurações', { act: 'saveSettings', cls: 'primary', icon: 'check' })}</div></form>`)}
      ${V.card('Auditoria', `<div class="table-wrap"><table class="tbl compact"><thead><tr><th>Quando</th><th>Quem</th><th>Ação</th><th>Detalhes</th></tr></thead><tbody>${logs.map(l => `<tr><td class="nowrap">${esc(l.at)}</td><td>${esc((P.user(l.by) || {}).name || '—')}</td><td><b>${esc(l.action)}</b></td><td>${esc(l.details || l.target || '')}</td></tr>`).join('')}</tbody></table></div>`, { cls: 'flush-b', sub: 'Últimos 60 eventos' })}`;
  };

  V.forbidden = msg => `<div class="forbidden">${icon('lock')}<h1>Acesso restrito</h1><p>${esc(msg)}</p><p class="muted">A tentativa foi registrada na auditoria.</p>${V.btn('Voltar ao início', { go: 'dashboard', cls: 'primary', icon: 'left' })}</div>`;

})(window.P);
