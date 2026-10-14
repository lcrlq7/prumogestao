/* Prumo — cadastro de empresas e férias (solicitação, aprovação em duas etapas e calendário) */
'use strict';
(function (P) {
  const F = P.fmt, D = P.date, esc = P.esc, api = P.api, V = P.V;
  const icon = V.icon;
  const REG_CLS = { simples: 's1', presumido: 's3', real: 's2', mei: 's4', imune: 's5' };

  V.regime = r => P.REGIMES[r]
    ? `<span class="reg"><i class="sw ${REG_CLS[r] || 's1'}"></i>${esc(P.REGIMES[r].label)}</span>`
    : '<span class="reg muted"><i class="sw sw-empty"></i>Não informado</span>';
  const incomplete = c => !P.REGIMES[c.regime] || !c.cnpj;

  /* ---------- Empresas ---------- */
  V.empresas = u => {
    const S = P.state, f = S.comp;
    const canEdit = u.role !== 'employee';
    // Responsáveis pela carteira (somente no escopo de quem consulta)
    const owners = {};
    if (canEdit) api.clientAssignments(u).forEach(a => { (owners[a.client] = owners[a.client] || []).push(a); });
    const deptsOf = c => [...new Set((c.depts || []).concat((owners[c.name] || []).map(a => a.deptId)))];
    const all = api.companies(u);
    let list = all;
    if (f.q) { const q = f.q.toLowerCase(), qd = P.cnpj.digits(f.q); list = list.filter(c => c.name.toLowerCase().includes(q) || (c.code || '').toLowerCase() === q || (c.tradeName || '').toLowerCase().includes(q) || (qd.length >= 3 && P.cnpj.digits(c.cnpj).includes(qd))); }
    // Busca por código: o código exato aparece primeiro, depois os que começam com o que foi digitado
    if (f.code) {
      const k = String(f.code).trim().toLowerCase();
      list = list.filter(c => (c.code || '').toLowerCase().startsWith(k))
        .sort((a, b) => ((b.code || '').toLowerCase() === k) - ((a.code || '').toLowerCase() === k) || (a.code || '').localeCompare(b.code || '', 'pt-BR', { numeric: true }));
    }
    if (f.regime) list = list.filter(c => f.regime === 'nao' ? !P.REGIMES[c.regime] : c.regime === f.regime);
    if (f.dept) list = list.filter(c => deptsOf(c).includes(f.dept));
    if (f.status) list = list.filter(c => f.status === 'ativas' ? c.active : f.status === 'incompletas' ? c.active && incomplete(c) : f.status === 'semcodigo' ? !c.code : !c.active);
    // Seleção para ações em lote (só administrador); a seleção sobrevive a trocas de filtro
    const canBulk = P.isGlobal(u);
    const sel = S.compSel = S.compSel || new Set();
    [...sel].forEach(id => { if (!P.idx.companies.has(id)) sel.delete(id); });
    // Quantidade exibida por página (10, 50, 100 ou todas); volta à 1ª página quando os filtros mudam
    const LIMITS = [['10', 'Até 10'], ['50', 'Até 50'], ['100', 'Até 100'], ['all', 'Todas']];
    const limit = LIMITS.some(([k]) => k === f.limit) ? f.limit : '50';
    const sig = [f.q, f.code, f.regime, f.dept, f.status, limit].join('|');
    if (S.compSig !== sig) { S.compSig = sig; S.compPage = 1; }
    const size = limit === 'all' ? Math.max(list.length, 1) : Number(limit);
    const pages = Math.max(1, Math.ceil(list.length / size));
    const page = S.compPage = Math.min(Math.max(1, S.compPage || 1), pages);
    const shown = list.slice((page - 1) * size, page * size);
    P.actions._compVisible = shown.map(c => c.id);
    const allVisibleSel = shown.length > 0 && shown.every(c => sel.has(c.id));

    const active = all.filter(c => c.active);
    const counts = {}; active.forEach(c => { const k = P.REGIMES[c.regime] ? c.regime : 'nao'; counts[k] = (counts[k] || 0) + 1; });
    const nIncomplete = active.filter(incomplete).length;
    const depts = P.store.db.departments.filter(d => d.active !== false);
    const regFilters = Object.entries(P.REGIMES).map(([k, r]) => [k, r.label, REG_CLS[k]]).concat([['nao', 'Não informado', 'sw-empty']]);
    const job = S.receitaJob;
    const withCnpj = active.filter(c => c.cnpj).length;
    return `${V.pageHead('Empresas', 'Clientes atendidos, com regime tributário, departamentos e responsáveis pela carteira.', (canEdit ? `<a class="btn ghost" href="modelos/Modelo_importacao_clientes.xlsx" download title="Planilha padrão para importar empresas">${icon('download')}<span>Modelo de planilha</span></a>` : '') + V.btn('Importar carteira', { act: 'importPortfolio', icon: 'briefcase', cls: canEdit ? 'ghost' : 'primary' }) + (canEdit ? ((P.store.db.importLogs || []).length ? V.btn('Importações', { act: 'importHistory', icon: 'history', cls: 'ghost' }) : '') + V.btn('Importar planilha', { act: 'importCompanies', icon: 'file' }) + V.btn('Atualizar pela Receita', { act: 'bulkReceita', icon: 'refresh', attrs: job && job.running ? 'disabled' : '' }) + V.btn('Nova empresa', { act: 'editCompany', icon: 'plus', cls: 'primary' }) : ''))}
      ${job ? `<div class="banner ${job.running ? 'info' : job.errors.length ? 'warn' : 'info'}">${icon(job.running ? 'clock' : 'check')}<div>
        ${job.running ? `<b>Consultando a Receita: ${job.done} de ${job.total}.</b> As consultas são feitas uma por vez para respeitar o limite da API. ${V.btn('Interromper', { act: 'stopReceita', cls: 'sm ghost' })}`
        : `<b>Atualização concluída: ${job.ok} de ${job.total} empresa${job.total > 1 ? 's' : ''} atualizada${job.total > 1 ? 's' : ''}${job.changed ? ', ' + job.changed + ' com regime ou nome fantasia preenchido' : ''}.</b>${job.pendingRegime ? ` ${job.pendingRegime} ficaram com o regime pendente porque a BrasilAPI e o Minha Receita estavam instáveis; rode a atualização de novo mais tarde.` : ''}${job.errors.length ? ` ${job.errors.length} não puderam ser consultadas: ${job.errors.slice(0, 4).map(x => esc(x)).join('; ')}${job.errors.length > 4 ? '…' : ''}` : ''} <button type="button" class="link" data-act="clearReceitaJob">Fechar</button>`}
        ${job.running ? V.progress(job.total ? job.done / job.total * 100 : 0, { max: 100, marks: false }) : ''}</div></div>` : ''}
      ${canEdit && !job && withCnpj === 0 && active.length ? `<div class="banner info">${icon('info')}<div>Para puxar os dados públicos da Receita, informe o CNPJ ao editar uma empresa. O sistema preenche razão social, CNAEs, situação cadastral e sugere o regime tributário.</div></div>` : ''}
      ${canEdit && nIncomplete ? `<div class="banner warn">${icon('alert')}<div><b>${nIncomplete} empresa${nIncomplete > 1 ? 's' : ''} com cadastro incompleto.</b> Informe o regime tributário e o CNPJ ao editar. <button type="button" class="link" data-act="setComp" data-key="status" data-val="incompletas">Mostrar só essas</button></div></div>` : ''}
      <div class="strip">
        <div><span>Empresas ativas</span><b>${active.length}</b></div>
        ${regFilters.map(([k, l, cls]) => `<div class="clickable-strip ${f.regime === k ? 'on' : ''}" data-act="setComp" data-key="regime" data-val="${f.regime === k ? '' : k}" role="button" tabindex="0"><span><i class="sw ${cls}"></i> ${l}</span><b>${counts[k] || 0}</b></div>`).join('')}
      </div>
      <section class="card"><div class="card-b"><div class="filters">
        <label class="field"><span>Código</span><input type="search" id="cp-code" value="${esc(f.code || '')}" data-set="comp.code" data-live placeholder="Ex.: 120" inputmode="search" style="max-width:140px"></label>
        <label class="field"><span>Buscar</span><input type="search" id="cp-q" value="${esc(f.q)}" data-set="comp.q" data-live placeholder="Razão social ou CNPJ"></label>
        <label class="field"><span>Regime tributário</span><select id="cp-reg" data-set="comp.regime"><option value="">Todos</option>${regFilters.map(([k, l]) => `<option value="${k}" ${f.regime === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="field"><span>Departamento</span><select id="cp-dept" data-set="comp.dept"><option value="">Todos</option>${depts.map(d => `<option value="${d.id}" ${f.dept === d.id ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</select></label>
        <label class="field"><span>Situação</span><select id="cp-st" data-set="comp.status"><option value="">Todas</option><option value="ativas" ${f.status === 'ativas' ? 'selected' : ''}>Ativas</option><option value="incompletas" ${f.status === 'incompletas' ? 'selected' : ''}>Cadastro incompleto</option><option value="inativas" ${f.status === 'inativas' ? 'selected' : ''}>Inativas</option><option value="semcodigo" ${f.status === 'semcodigo' ? 'selected' : ''}>Sem código (não vieram da planilha)</option></select></label>
        <label class="field"><span>Exibir</span><select id="cp-limit" data-set="comp.limit">${LIMITS.map(([k, l]) => `<option value="${k}" ${limit === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      </div></div></section>
      ${canBulk && sel.size ? `<div class="bulkbar" role="region" aria-label="Ações em lote">
        <span><b>${sel.size}</b> empresa${sel.size > 1 ? 's' : ''} selecionada${sel.size > 1 ? 's' : ''}${[...sel].some(id => !list.some(c => c.id === id)) ? ' <small class="muted">(algumas fora do filtro atual)</small>' : ''}</span>
        <div class="bulkbar-actions">
          ${V.btn('Limpar seleção', { act: 'compSelClear', cls: 'sm ghost' })}
          ${V.btn('Inativar selecionadas', { act: 'compBulkInactivate', cls: 'sm', icon: 'toggle' })}
          ${V.btn('Apagar selecionadas', { act: 'compBulkDelete', cls: 'sm danger-solid', icon: 'trash' })}
        </div>
      </div>` : ''}
      ${V.card('', list.length ? `<div class="table-wrap"><table class="tbl">
        <thead><tr>${canBulk ? `<th class="w-check"><input type="checkbox" data-act="compSelAll" ${allVisibleSel ? 'checked' : ''} aria-label="Selecionar as empresas desta página" title="Selecionar as ${shown.length} empresas desta página"></th>` : ''}<th>Código</th><th>Empresa</th><th>CNPJ</th><th>Regime tributário</th><th>Departamentos</th>${canEdit ? '<th>Responsáveis</th>' : ''}<th>Situação</th>${canEdit ? '<th class="actions-col"></th>' : ''}</tr></thead>
        <tbody>${shown.map(c => `<tr class="${c.active ? '' : 'inactive'} ${sel.has(c.id) ? 'row-sel' : ''}">
          ${canBulk ? `<td class="w-check"><input type="checkbox" data-act="compSel" data-id="${c.id}" ${sel.has(c.id) ? 'checked' : ''} aria-label="Selecionar ${esc(c.name)}"></td>` : ''}
          <td class="mono nowrap">${c.code ? esc(c.code) : '<span class="muted">—</span>'}</td>
          <td><b>${esc(c.name)}</b>${c.tradeName && c.tradeName !== c.name ? `<small class="obs">${esc(c.tradeName)}</small>` : ''}${c.receita && c.receita.cnaeMain ? `<small class="cnae" title="${esc(c.receita.cnaeMain.desc)}">CNAE ${esc(c.receita.cnaeMain.code)} · ${esc(c.receita.cnaeMain.desc)}</small>` : ''}</td>
          <td class="mono nowrap">${c.cnpj ? esc(c.cnpj) : '<span class="muted">—</span>'}</td>
          <td>${V.regime(c.regime)}${c.history && c.history.length ? ` <small class="muted" title="Regime alterado">(antes: ${esc(P.REGIMES[c.history[0].from].short)})</small>` : ''}${(() => { const s = c.receita && c.receita.suggestion; return s && s.regime && P.REGIMES[c.regime] && s.regime !== c.regime ? `<small class="cnae t-warn" title="${esc(s.source)}">${icon('alert')}Receita indica ${esc(P.REGIMES[s.regime].label)}</small>`
            : c.receita && !P.REGIMES[c.regime] && !P.receita.hasRegimeSource(c.receita) ? `<small class="cnae" title="Será buscado de novo em Atualizar pela Receita">${icon('clock')}Regime pendente na Receita</small>` : ''; })()}</td>
          <td><div class="chips">${deptsOf(c).map(d => P.dept(d) ? `<span class="code" title="${esc(P.dept(d).name)}">${esc(P.dept(d).code)}</span>` : '').join('')}</div></td>
          ${canEdit ? `<td>${(owners[c.name] || []).map(a => `<small class="owner">${esc(P.dept(a.deptId).code)} · ${esc((P.user(a.userId) || {}).name || '—')}</small>`).join('') || '<span class="muted">—</span>'}</td>` : ''}
          <td>${c.receita && c.receita.situation && c.receita.situation !== 'ATIVA' ? `<span class="badge es-recusado" title="Situação cadastral na Receita">${icon('alert')}Receita: ${esc(c.receita.situation.toLowerCase())}</span>` : !c.active ? '<span class="badge st-sem">' + icon('x') + 'Inativa</span>' : incomplete(c) ? '<span class="badge es-correcao">' + icon('alert') + 'Incompleto</span>' : '<span class="badge es-aprovado">' + icon('check') + 'Ativa</span>'}</td>
          ${canEdit ? `<td class="actions-col"><div class="row-actions">${V.ibtn('edit', 'Editar', { act: 'editCompany', attrs: `data-id="${c.id}"` })}${P.isGlobal(u) ? V.ibtn('toggle', c.active ? 'Inativar' : 'Reativar', { act: 'toggleCompany', attrs: `data-id="${c.id}"` }) : ''}</div></td>` : ''}
        </tr>`).join('')}</tbody></table></div>${pages > 1 ? `<div class="pager"><span>Página ${page} de ${pages}</span>${V.btn('Anterior', { act: 'compPage', cls: 'sm ghost', icon: 'left', attrs: `data-d="-1" ${page <= 1 ? 'disabled' : ''}` })}${V.btn('Próxima', { act: 'compPage', cls: 'sm ghost', icon: 'right', attrs: `data-d="1" ${page >= pages ? 'disabled' : ''}` })}</div>` : ''}` : V.empty('Nenhuma empresa encontrada com esses filtros.'), { cls: 'flush', sub: (list.length ? 'Mostrando ' + ((page - 1) * size + 1) + '–' + ((page - 1) * size + shown.length) + ' de ' + list.length : '0') + (list.length !== all.length ? ' filtradas (' + all.length + ' no total)' : ' empresas') })}`;
  };

  V.companyForm = c => {
    const depts = P.store.db.departments.filter(d => d.active !== false);
    return `<div class="fgrid">
      <label class="field"><span>Código</span><input type="text" id="co-code" value="${esc(c.code || '')}" placeholder="Ex.: 0001" maxlength="20"></label>
      <label class="field span2"><span>Razão social</span><input type="text" id="co-name" value="${esc(c.name || '')}" placeholder="Ex.: Padaria Pão Dourado Ltda"></label>
      <div class="field"><span>CNPJ <small>(consulta a Receita ao completar)</small></span><div class="input-btn"><input type="text" id="co-cnpj" value="${esc(c.cnpj || '')}" placeholder="00.000.000/0000-00" inputmode="numeric" maxlength="18" data-mask="cnpj" data-lookup aria-label="CNPJ"><button type="button" class="btn sm" data-act="lookupCnpj" title="Consultar dados públicos na Receita">${icon('search')}<span>Receita</span></button></div></div>
      <label class="field span2"><span>Nome fantasia</span><input type="text" id="co-trade" value="${esc(c.tradeName && c.tradeName !== c.name ? c.tradeName : '')}"></label>
      <label class="field"><span>Cliente desde</span><input type="date" id="co-since" value="${c.since || D.iso(P.today())}"></label>
      <label class="field span2"><span>Regime tributário</span><select id="co-reg">${P.REGIMES[c.regime] ? '' : '<option value="" selected>Selecione o regime</option>'}${Object.entries(P.REGIMES).map(([k, r]) => `<option value="${k}" ${c.regime === k ? 'selected' : ''}>${r.label}</option>`).join('')}</select></label>
      ${c.id ? `<label class="field"><span>Motivo da troca de regime</span><input type="text" id="co-regnote" placeholder="Só se o regime mudar"></label>` : '<span></span>'}
      <fieldset class="field span3 checks"><legend>Departamentos que atendem a empresa</legend>${depts.map(d => `<label><input type="checkbox" name="co-dept" value="${d.id}" ${(c.depts || []).includes(d.id) ? 'checked' : ''}> ${esc(d.name)}</label>`).join('')}</fieldset>
      <label class="field span3"><span>Observações</span><textarea id="co-notes" rows="2" placeholder="Ex.: matriz e 2 filiais; folha com sindicato do comércio">${esc(c.notes || '')}</textarea></label>
    </div>
    <div id="co-receita" aria-live="polite">${c.receita ? V.receitaPanel(c.receita) : ''}</div>
    ${c.history && c.history.length ? `<h4 class="sub-h">Histórico de regime</h4><ul class="day-list">${c.history.map(h => `<li><span>${esc(P.REGIMES[h.from].label)} → ${esc(P.REGIMES[h.to].label)}${h.note ? `<small>${esc(h.note)}</small>` : ''}</span><b>${esc(h.at.slice(0, 10).split('-').reverse().join('/'))}</b></li>`).join('')}</ul>` : ''}`;
  };

  /* ---------- Importação de empresas por planilha ---------- */
  V.importStart = () => `
    <div class="imp-steps">
      <ol>
        <li>Baixe o <a href="modelos/Modelo_importacao_clientes.xlsx" download>modelo de planilha</a> e preencha a aba <b>Clientes</b>: Código, Nome da empresa, CNPJ e Regime tributário.</li>
        <li>Escolha o arquivo abaixo (.xlsx ou .csv). Nada é gravado antes da sua confirmação.</li>
        <li>Confira a prévia: empresas novas, atualizadas e linhas com erro.</li>
      </ol>
      <a class="btn ghost sm" href="modelos/Modelo_importacao_clientes.xlsx" download>${icon('download')}<span>Baixar modelo de planilha</span></a>
    </div>
    <label class="drop" for="imp-file">${icon('file')}<span><b>Escolher planilha</b><small>ou arraste o arquivo para cá</small></span><input type="file" id="imp-file" accept=".xlsx,.xls,.csv" hidden></label>
    <div id="imp-preview" aria-live="polite"></div>`;

  V.importPreview = (plan, fileName) => {
    const ST = { nova: ['Nova', 'es-aprovado', 'plus'], atualizar: ['Atualizar', 'es-pendente', 'refresh'], igual: ['Sem alteração', 'st-sem', 'check'], erro: ['Erro', 'es-recusado', 'x'] };
    const f = P.state.impFilter || 'todas';
    const rows = plan.rows.filter(l => f === 'todas' || l.status === f);
    const ok = plan.novas + plan.atualizar;
    return `
      <div class="imp-head">${icon('file')}<b>${esc(fileName)}</b><span class="muted">${plan.total} linha${plan.total === 1 ? '' : 's'} lida${plan.total === 1 ? '' : 's'}</span></div>
      <div class="strip imp-strip">
        ${[['todas', 'Todas', plan.total, ''], ['nova', 'Novas', plan.novas, ''], ['atualizar', 'Atualizar', plan.atualizar, ''], ['igual', 'Sem alteração', plan.iguais, ''], ['erro', 'Com erro', plan.erros, plan.erros ? 't-crit' : '']].map(([k, l, n, cls]) =>
          `<div class="clickable-strip ${cls} ${f === k ? 'on' : ''}" data-act="impFilter" data-key="${k}" role="button" tabindex="0"><span>${l}</span><b>${n}</b></div>`).join('')}
      </div>
      ${plan.erros ? `<div class="banner warn sm">${icon('alert')}<div>As ${plan.erros} linha${plan.erros > 1 ? 's' : ''} com erro ${plan.erros > 1 ? 'serão ignoradas' : 'será ignorada'}. Corrija na planilha e importe de novo, se quiser incluí-la${plan.erros > 1 ? 's' : ''}.</div></div>` : ''}
      <div class="table-wrap imp-table"><table class="tbl compact">
        <thead><tr><th class="num">Linha</th><th>Situação</th><th>Código</th><th>Nome da empresa</th><th>CNPJ</th><th>Regime</th><th>Detalhes</th></tr></thead>
        <tbody>${rows.slice(0, 300).map(l => {
          const s = ST[l.status];
          const det = [].concat(
            l.errors.map(e => `<span class="t-crit">${esc(e)}</span>`),
            l.changes.map(c => `${esc(c[0])}: <s class="muted">${esc(c[1])}</s> → ${esc(c[2])}`),
            l.status === 'atualizar' || l.status === 'igual' ? [`<span class="muted">Encontrada pelo ${l.matchBy}</span>`] : [],
            l.warnings.map(w => `<span class="muted">${esc(w)}</span>`)
          );
          return `<tr class="${l.status === 'erro' ? 'imp-err' : ''}"><td class="num">${l.row}</td><td><span class="badge ${s[1]}">${icon(s[2])}${s[0]}</span></td>
            <td class="mono">${esc(l.code) || '—'}</td><td>${esc(l.name) || '—'}</td><td class="mono nowrap">${esc(l.cnpj || l.cnpjRaw) || '—'}</td>
            <td>${l.regime ? esc(P.REGIMES[l.regime].label) : l.regimeRaw ? esc(l.regimeRaw) : '<span class="muted">—</span>'}</td><td class="imp-det">${det.join('<br>')}</td></tr>`;
        }).join('')}</tbody></table></div>
      ${rows.length > 300 ? `<p class="fine">Mostrando as primeiras 300 de ${rows.length} linhas deste filtro.</p>` : ''}
      ${ok ? `<label class="field check"><input type="checkbox" id="imp-receita" checked><span>Depois de importar, consultar a Receita para as empresas com CNPJ (completa CNAEs, situação e o regime que estiver em branco)</span></label>` : ''}`;
  };

  /* Relação da importação: o que entrou com sucesso e o que falhou, com o motivo */
  V.REP_ST = { criada: ['Importada (nova)', 'es-aprovado', 'plus'], atualizada: ['Importada (atualizada)', 'es-aprovado', 'refresh'], igual: ['Sem alteração', 'st-sem', 'check'], falha: ['Falha', 'es-recusado', 'x'] };
  V.importReport = (rep, filter) => {
    const f = filter || 'todas';
    const ok = rep.criadas + rep.atualizadas;
    const match = l => f === 'todas' || (f === 'sucesso' ? (l.status === 'criada' || l.status === 'atualizada') : l.status === f);
    const rows = rep.rows.filter(match);
    const who = (P.user(rep.by) || {}).name || '—';
    const when = rep.at.slice(0, 10).split('-').reverse().join('/') + ' às ' + rep.at.slice(11);
    return `
      <div class="imp-head">${icon('file')}<b>${esc(rep.file)}</b><span class="muted">importado em ${esc(when)} por ${esc(who)}</span></div>
      <div class="rep-cards">
        <div class="rc ok">${icon('check')}<span><b>${ok}</b> importada${ok === 1 ? '' : 's'} com sucesso<small>${rep.criadas} nova${rep.criadas === 1 ? '' : 's'} · ${rep.atualizadas} atualizada${rep.atualizadas === 1 ? '' : 's'}</small></span></div>
        <div class="rc same">${icon('info')}<span><b>${rep.iguais}</b> sem alteração<small>já estavam iguais no cadastro</small></span></div>
        <div class="rc fail">${icon('alert')}<span><b>${rep.falhas}</b> falha${rep.falhas === 1 ? '' : 's'}<small>${rep.falhas ? 'não foram importadas' : 'nenhuma linha recusada'}</small></span></div>
      </div>
      <div class="tabs" role="tablist">${[['todas', 'Todas', rep.total], ['sucesso', 'Importadas com sucesso', ok], ['igual', 'Sem alteração', rep.iguais], ['falha', 'Falhas', rep.falhas]].map(([k, l, n]) => `<button type="button" role="tab" class="${f === k ? 'on' : ''}" aria-selected="${f === k}" data-act="repFilter" data-key="${k}">${l}<span class="count">${n}</span></button>`).join('')}</div>
      <div class="table-wrap imp-table"><table class="tbl compact">
        <thead><tr><th class="num">Linha</th><th>Resultado</th><th>Código</th><th>Nome da empresa</th><th>CNPJ</th><th>Regime</th><th>${f === 'falha' ? 'Motivo da falha' : 'Detalhes'}</th></tr></thead>
        <tbody>${rows.length ? rows.map(l => { const s = V.REP_ST[l.status]; return `<tr class="${l.status === 'falha' ? 'imp-err' : ''}">
          <td class="num">${l.row}</td><td><span class="badge ${s[1]}">${icon(s[2])}${s[0]}</span></td>
          <td class="mono">${esc(l.code) || '—'}</td><td>${esc(l.name) || '—'}</td><td class="mono nowrap">${esc(l.cnpj) || '—'}</td><td>${esc(l.regime) || '<span class="muted">—</span>'}</td>
          <td class="imp-det">${l.status === 'falha' ? `<span class="t-crit">${esc(l.detail)}</span>` : esc(l.detail)}</td></tr>`; }).join('') : `<tr><td colspan="7" class="muted">Nenhuma linha neste filtro.</td></tr>`}</tbody>
      </table></div>
      ${rep.falhas ? `<p class="fine">Para incluir as falhas, corrija essas linhas na planilha e importe de novo: as empresas já importadas aparecerão como "sem alteração".</p>` : ''}`;
  };
  V.importHistory = logs => logs.length ? `<ul class="day-list">${logs.map(r => `<li><button type="button" class="link" data-act="openImportReport" data-id="${r.id}">${esc(r.file)}</button><b>${esc(r.at.slice(0, 10).split('-').reverse().join('/'))} · ${r.criadas + r.atualizadas} ok · ${r.falhas} falha${r.falhas === 1 ? '' : 's'}</b></li>`).join('')}</ul>` : '<p class="muted">Nenhuma importação feita ainda.</p>';

  /* Painel com os dados públicos da Receita (dentro do formulário da empresa) */
  V.receitaPanel = (r, o = {}) => {
    const s = r.suggestion;
    const money = v => v ? v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—';
    const row = (k, v) => v ? `<div><dt>${k}</dt><dd>${v}</dd></div>` : '';
    return `<section class="receita">
      <header><span>${icon('building')}<b>Dados públicos da Receita</b></span><small>Consultado em ${esc(r.fetchedAt.slice(0, 10).split('-').reverse().join('/'))} ${esc(r.fetchedAt.slice(11))} · fonte: ${esc(r.source || 'BrasilAPI')} (dados abertos da Receita Federal)</small></header>
      ${r.situation && r.situation !== 'ATIVA' ? `<div class="banner crit sm">${icon('alert')}<div><b>Situação cadastral: ${esc(r.situation)}</b>${r.situationDate ? ' desde ' + D.fmt(r.situationDate) : ''}${r.situationReason ? ' · ' + esc(r.situationReason) : ''}</div></div>` : ''}
      ${o.filled && o.filled.length ? `<p class="fine filled">${icon('check')}Preenchido automaticamente: ${o.filled.join(', ')}. Revise antes de salvar.</p>` : ''}
      <div class="rec-suggest ${s && s.regime ? '' : 'none'}">
        <span>Regime tributário</span>
        ${s ? `<b>${s.regime ? esc(P.REGIMES[s.regime].label) : esc(s.label || 'Não identificado')}</b><small>${esc(s.source)}${s.year && s.year < new Date().getFullYear() ? '. Pode ter mudado depois desse ano: confirme com o cliente.' : ''}</small>` : '<b>Não identificado</b><small>A empresa não é optante do Simples/MEI e não há escrituração (ECF) publicada. Informe manualmente.</small>'}
        ${!P.receita.hasRegimeSource(r) ? `<div class="rec-retry">
          <small>A forma de tributação vem da BrasilAPI ou do Minha Receita, que estão instáveis agora${r.fallbackFrom ? ' (' + esc(r.fallbackFrom.join(' · ')) + ')' : ''}. <span data-regime-status>O sistema vai tentar de novo automaticamente.</span></small>
          <button type="button" class="btn sm" data-act="retryRegime">${icon('refresh')}<span>Buscar regime de novo</span></button>
        </div>` : ''}
      </div>
      <dl class="rec-grid">
        ${row('Razão social', esc(r.name))}
        ${row('Nome fantasia', esc(r.tradeName))}
        ${row('Situação', esc(r.situation) + (r.situationDate ? ' desde ' + D.fmt(r.situationDate) : ''))}
        ${row('Abertura', r.openedAt ? D.fmt(r.openedAt) : '')}
        ${row('Natureza jurídica', esc(r.nature))}
        ${row('Porte', esc(r.size))}
        ${row('Capital social', money(r.capital))}
        ${row('Estabelecimento', esc(r.branch))}
        ${row('Simples Nacional', r.simples.opt ? 'Optante desde ' + D.fmt(r.simples.since) : r.simples.until ? 'Excluída em ' + D.fmt(r.simples.until) : 'Não optante')}
        ${row('MEI', r.mei.opt ? 'Sim, desde ' + D.fmt(r.mei.since) : 'Não')}
        ${row('Endereço', esc([r.address, r.city && r.city + '/' + r.uf, r.cep].filter(Boolean).join(' · ')))}
        ${row('Contato', esc([r.phone, r.email].filter(Boolean).join(' · ')))}
      </dl>
      ${r.cnaeMain ? `<h4 class="sub-h">CNAE principal</h4><p class="cnae-line"><code>${esc(r.cnaeMain.code)}</code> ${esc(r.cnaeMain.desc)}</p>` : ''}
      ${r.cnaes.length ? `<details><summary>CNAEs secundários (${r.cnaes.length})</summary><ul class="cnae-list">${r.cnaes.map(c => `<li><code>${esc(c.code)}</code> ${esc(c.desc)}</li>`).join('')}</ul></details>` : ''}
      ${r.regimes.length ? `<details><summary>Forma de tributação por ano (${r.regimes.length})</summary><ul class="cnae-list">${r.regimes.slice().reverse().map(x => `<li><code>${x.year}</code> ${esc(x.form)}</li>`).join('')}</ul></details>` : ''}
      ${r.partners.length ? `<details><summary>Quadro de sócios (${r.partners.length})</summary><ul class="cnae-list">${r.partners.map(p => `<li>${esc(p.name)} <small class="muted">· ${esc(p.role)}</small></li>`).join('')}</ul></details>` : ''}
    </section>`;
  };

  /* ---------- Férias ---------- */
  /* Etapas: Solicitada → Gestor → Gerente → Diretoria → No calendário. Etapas puladas (pedido de gestor, cargo vago) aparecem como "não se aplica". */
  const STEPS = ['Solicitada', 'Gestor', 'Gerente', 'Diretoria', 'No calendário'];
  const STAGE_KEY = { 1: 'gestor', 2: 'gerente', 3: 'diretoria' };
  const STAGE_WHO = { 1: 'pelo gestor', 2: 'pelo gerente', 3: 'pela diretoria' };
  V.vacSteps = v => {
    const h = (v.history || []).map(x => x.action);
    const pos = { gestor: 1, gerente: 2, diretoria: 3, aprovada: 4 }[v.status];
    return `<ol class="steps">${STEPS.map((s, i) => {
      let st = '';
      if (i === 0) st = 'done';
      else if (i === 4) st = v.status === 'aprovada' ? 'done' : (v.status === 'recusada' || v.status === 'cancelada') ? 'off' : '';
      else if (h.includes('Aprovada ' + STAGE_WHO[i])) st = 'done';
      else if (h.includes('Recusada ' + STAGE_WHO[i])) st = 'fail';
      else if (v.status === STAGE_KEY[i]) st = 'now';
      else if (pos && pos > i) st = 'skip';
      else if (v.status === 'recusada' || v.status === 'cancelada') st = 'off';
      return `<li class="${st}" ${st === 'skip' ? 'title="Etapa não se aplica a este pedido"' : ''}><span>${st === 'done' ? icon('check') : st === 'fail' ? icon('x') : st === 'skip' ? '–' : i + 1}</span>${s}</li>`;
    }).join('')}</ol>`;
  };
  V.vacBadge = st => { const s = P.VAC[st]; return `<span class="badge ${s.cls}">${icon(s.icon)}${s.label}</span>`; };
  const period = v => `${D.fmt(v.start)} a ${D.fmt(v.end)}`;
  const workdaysOf = v => D.workdays(D.parse(v.start), D.parse(v.end));
  const returnDay = v => { let d = D.add(D.parse(v.end), 1); while (!D.isWorkday(d)) d = D.add(d, 1); return D.iso(d); };

  // Pessoa ainda não carregada neste navegador (ex.: acabou de se cadastrar): mostra um marcador e pede nova carga
  const whoOf = id => {
    const x = P.user(id); if (x) return x;
    if (P.backend && P.backend.reload && !whoOf.pending) { whoOf.pending = true; P.backend.reload().catch(() => {}).finally(() => { whoOf.pending = false; P.render && P.render(); }); }
    return { id, name: 'Carregando…', role: 'employee', email: '' };
  };
  V.vacItem = (u, v, o = {}) => {
    const who = whoOf(v.userId);
    const conflicts = o.conflicts ? api.vacationConflicts(v) : [];
    const notes = (v.history || []).filter(h => h.note);
    return `<li class="vac">
      <div class="vac-top">
        ${o.self ? `<div class="vac-when"><b>${period(v)}</b><small>${v.days} dias corridos · ${workdaysOf(v)} dias úteis · retorno em ${D.fmt(returnDay(v))}</small></div>` : `${V.person(who, (P.dept(v.deptId) ? P.dept(v.deptId).name : P.ROLES[who.role]) + ' · ' + period(v) + ' · ' + v.days + ' dias')}`}
        ${V.vacBadge(v.status)}
      </div>
      ${v.abono || v.adiant13 ? `<div class="chips">${v.abono ? '<span class="chip-s">Abono pecuniário (vender 10 dias)</span>' : ''}${v.adiant13 ? '<span class="chip-s">Adiantar 1ª parcela do 13º</span>' : ''}</div>` : ''}
      ${o.comment && v.comment ? `<blockquote class="vac-comment">${icon('message')}<span>${esc(v.comment)}</span></blockquote>` : ''}
      ${V.vacSteps(v)}
      ${notes.length && o.history !== false ? `<ul class="vac-notes">${notes.map(h => `<li><b>${esc(h.action)}</b> · ${esc((P.user(h.by) || {}).name || '—')}: ${esc(h.note)}</li>`).join('')}</ul>` : ''}
      ${conflicts.length ? `<div class="banner warn sm">${icon('users')}<div><b>${conflicts.length} colega${conflicts.length > 1 ? 's' : ''} do departamento fora no mesmo período:</b> ${conflicts.map(c => `${esc(whoOf(c.userId).name)} (${D.short(c.start)}–${D.short(c.end)}, ${P.VAC[c.status].short.toLowerCase()})`).join(', ')}</div></div>` : ''}
      ${o.actions ? `<div class="vac-actions">${o.actions}</div>` : ''}
    </li>`;
  };

  V.vacForm = (u, id = 'vac-form') => {
    const t = P.today();
    let s = D.add(t, 30); while ([5, 6, 0].includes(s.getDay())) s = D.add(s, 1);
    const e = D.add(s, 13);
    return `<form class="form" id="${id}" data-vac-form novalidate>
      <div class="fgrid">
        <label class="field"><span>Início</span><input type="date" name="start" id="${id}-start" value="${D.iso(s)}" min="${D.iso(D.add(t, 1))}" data-vf></label>
        <label class="field"><span>Fim</span><input type="date" name="end" id="${id}-end" value="${D.iso(e)}" min="${D.iso(D.add(t, 1))}" data-vf></label>
        <div class="field calc"><span>Período</span><output data-vac-calc>${V.vacCalcText(D.iso(s), D.iso(e))}</output></div>
        <label class="field check span3"><input type="checkbox" name="abono" id="${id}-abono"><span>Quero vender 10 dias (abono pecuniário)</span></label>
        <label class="field check span3"><input type="checkbox" name="adiant13" id="${id}-13"><span>Quero adiantar a 1ª parcela do 13º salário</span></label>
        <label class="field span3"><span>Comentário para o gestor e a diretoria <small>(opcional)</small></span><textarea name="comment" id="${id}-comment" rows="3" placeholder="Ex.: viagem já reservada, preferência por emendar com feriado, quem pode cobrir sua carteira…"></textarea></label>
      </div>
      <p class="fine">Regras: mínimo de 5 dias corridos por período; o início não pode cair na sexta, no sábado, no domingo, em feriado ou nos dois dias antes de um feriado. O comentário é visto apenas por quem aprova (gestor, gerente e diretoria).</p>
    </form>`;
  };
  V.vacCalcText = (s, e) => {
    if (!s || !e || e < s) return '—';
    const days = Math.round((D.parse(e) - D.parse(s)) / 864e5) + 1;
    const err = api.vacationRules(s, e);
    return `<span>${days} dias corridos · ${D.workdays(D.parse(s), D.parse(e))} úteis</span>${err ? `<em class="vac-err">${icon('alert')}${esc(err)}</em>` : ''}`;
  };

  /* Calendário de férias (mês) */
  V.vacCalendar = (u, list, showComments) => {
    const S = P.state, m = S.vac.month;
    const ms = D.monthStart(m), me = D.monthEnd(m), gs = D.weekStart(ms);
    const today = D.iso(P.today());
    const visible = list.filter(v => v.status === 'aprovada' || (['gestor', 'gerente', 'diretoria'].includes(v.status) && (u.role !== 'employee' || v.userId === u.id)));
    let cells = '';
    for (let d = new Date(gs); d <= me || d.getDay() !== 1; d = D.add(d, 1)) {
      const iso = D.iso(d), inM = d.getMonth() === m.getMonth();
      const on = visible.filter(v => iso >= v.start && iso <= v.end);
      const dm = V.dayMark(d);
      cells += `<button type="button" class="cal-cell vac-cell ${inM ? '' : 'out'} ${iso === today ? 'today' : ''} ${S.vac.sel === iso ? 'sel' : ''} ${D.isWorkday(d) ? '' : 'off'} ${dm.cls}" data-act="vacSel" data-date="${iso}" aria-label="${D.fmt(iso)}${dm.label ? ', ' + esc(dm.label) : ''}${on.length ? ', ' + on.length + ' pessoa(s) de férias' : ''}">
        <span class="cal-d">${d.getDate()}</span>
        <span class="cal-tags">${dm.tag}${on.slice(0, 3).map(v => `<i class="tag vac ${v.status === 'aprovada' ? '' : 'pend'} ${v.userId === u.id ? 'me' : ''}">${V.avatar(whoOf(v.userId), 'xs')}${esc(P.firstName(whoOf(v.userId).name))}</i>`).join('')}${on.length > 3 ? `<i class="tag more">+${on.length - 3}</i>` : ''}</span>
      </button>`;
    }
    const sel = S.vac.sel;
    const selList = sel ? visible.filter(v => sel >= v.start && sel <= v.end) : [];
    const mname = D.MONTHS[m.getMonth()];
    return `<div class="grid g-cal">
      <section class="card">
        <header class="card-h cal-h"><div class="cal-nav">${V.ibtn('left', 'Mês anterior', { act: 'vacMove', attrs: 'data-d="-1"' })}<h3>${mname[0].toUpperCase() + mname.slice(1)} ${m.getFullYear()}</h3>${V.ibtn('right', 'Próximo mês', { act: 'vacMove', attrs: 'data-d="1"' })}</div>
          <div class="cal-legend"><i class="lg-vac"></i><span>Aprovada</span><i class="lg-vac pend"></i><span>Em aprovação</span><i class="lg-hol"></i><span>Feriado</span><i class="lg-wk"></i><span>Não útil</span></div></header>
        <div class="card-b"><div class="cal-grid">${['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'].map(w => `<span class="cal-wd">${w}</span>`).join('')}${cells}</div></div>
      </section>
      ${V.card(sel ? 'Férias em ' + D.fmt(sel) : 'Selecione um dia', sel ? V.dayInfo(D.parse(sel)) + (selList.length ? `<ul class="vac-day">${selList.map(v => `<li>${V.person(P.user(v.userId), period(v))}${V.vacBadge(v.status)}${showComments && !v.restricted && v.comment ? `<blockquote class="vac-comment">${icon('message')}<span>${esc(v.comment)}</span></blockquote>` : ''}</li>`).join('')}</ul>` : '<p class="muted">Ninguém de férias neste dia.</p>') : `<p class="muted">Clique em um dia para ver quem estará de férias${showComments ? ' e os comentários das solicitações' : ''}.</p>`)}
    </div>`;
  };

  V.ferias = u => {
    const S = P.state;
    const all = api.vacations(u);
    const today = D.iso(P.today()), in90 = D.iso(D.add(P.today(), 90));
    const sortStart = (a, b) => a.start < b.start ? -1 : 1;
    const onNow = all.filter(v => v.status === 'aprovada' && today >= v.start && today <= v.end);
    const upcoming = all.filter(v => v.status === 'aprovada' && v.start > today && v.start <= in90);

    if (u.role === 'employee') {
      const mine = all.filter(v => v.userId === u.id).sort((a, b) => a.createdAt < b.createdAt ? 1 : -1);
      const cancel = v => ['gestor', 'gerente', 'diretoria'].includes(v.status) ? V.btn('Cancelar solicitação', { act: 'cancelVacation', cls: 'sm ghost', icon: 'x', attrs: `data-id="${v.id}"` }) : '';
      const gm = V.deptManager(u.deptId);
      return `${V.pageHead('Minhas férias', `Sua solicitação passa pelo gestor${gm ? ' (' + esc(gm.name) + ')' : ''}, pelo gerente do escritório e por um diretor. Aprovadas, as datas entram no calendário geral.`)}
        <div class="grid g-1-1">
          ${V.card('Solicitar férias', V.vacForm(u) + `<div class="form-foot"><span></span>${V.btn('Enviar solicitação', { act: 'requestVacation', cls: 'primary', icon: 'check' })}</div>`)}
          ${V.card('Minhas solicitações', mine.length ? `<ul class="vacs">${mine.map(v => V.vacItem(u, v, { self: true, comment: true, actions: cancel(v) })).join('')}</ul>` : V.empty('Você ainda não solicitou férias por aqui.', 'palm'), { cls: 'flush-b' })}
        </div>
        ${V.card('Calendário de férias da equipe', V.vacCalendar(u, all, false), { sub: 'Férias aprovadas dos colegas do seu departamento e as suas solicitações em andamento.', cls: 'bare' })}`;
    }

    // Cada nível aprova a sua etapa: gestor → gerente do escritório → diretoria (basta um diretor)
    const global = P.isGlobal(u);
    const scope = global ? (S.dept || null) : u.deptId;
    const scoped = scope ? all.filter(v => v.deptId === scope) : all;
    const inFlow = ['gestor', 'gerente', 'diretoria'];
    const mine = v => api.canReviewVacation(u, v);
    const waitingMe = scoped.filter(mine).sort(sortStart);
    const other = scoped.filter(v => inFlow.includes(v.status) && !mine(v)).sort(sortStart);
    const history = scoped.filter(v => ['aprovada', 'recusada', 'cancelada'].includes(v.status)).sort((a, b) => a.start < b.start ? 1 : -1).slice(0, 40);
    const tab = S.vac.tab;
    const led = P.ledDept(u);
    const actions = v => api.canOverrideVacation(u, v)
      ? `${V.btn('Aprovar direto', { act: 'reviewVacation', cls: 'sm primary', icon: 'check', attrs: `data-id="${v.id}" data-op="aprovar" title="Aprovar sem esperar as etapas anteriores"` })}${V.btn('Recusar', { act: 'reviewVacation', cls: 'sm ghost', icon: 'x', attrs: `data-id="${v.id}" data-op="recusar"` })}`
      : mine(v) ? `${V.btn('Aprovar', { act: 'reviewVacation', cls: 'sm primary', icon: 'check', attrs: `data-id="${v.id}" data-op="aprovar"` })}${V.btn('Recusar', { act: 'reviewVacation', cls: 'sm ghost', icon: 'x', attrs: `data-id="${v.id}" data-op="recusar"` })}` : '';
    const shown = tab === 'fila' ? waitingMe : tab === 'outra' ? other : history;
    const myPending = all.filter(v => v.userId === u.id && inFlow.concat('aprovada').includes(v.status));
    const HEAD = {
      manager: ['Férias da equipe', 'Primeira etapa de aprovação. Depois do seu aval, a solicitação segue para o gerente do escritório.'],
      office: ['Férias · Gerência', 'Segunda etapa: pedidos já aprovados pelos gestores. Depois do seu aval, seguem para a diretoria.'],
      admin: led
        ? ['Férias · Diretoria e ' + esc(led.name), `Você aprova a 1ª etapa (gestor) da equipe de ${esc(led.name)} e a etapa final da diretoria dos demais pedidos. Nos pedidos que você aprovou como gestor, a etapa da diretoria fica com outro diretor.`]
        : ['Férias · Diretoria', 'Aprovação final. Basta um diretor aprovar para as datas entrarem no calendário geral. Em "Nas outras etapas" você também pode aprovar direto, sem esperar gestor e gerente.']
    }[u.role];
    return `${V.pageHead(HEAD[0], HEAD[1], V.deptPicker(u) + V.btn('Solicitar minhas férias', { act: 'newVacation', icon: 'palm' }))}
      <div class="strip">
        <div class="${waitingMe.length ? 't-warn' : ''}"><span>Aguardando você</span><b>${waitingMe.length}</b></div>
        <div><span>Nas outras etapas</span><b>${other.length}</b></div>
        <div><span>De férias hoje</span><b>${(scope ? onNow.filter(v => v.deptId === scope) : onNow).length}</b></div>
        <div><span>Aprovadas (próx. 90 dias)</span><b>${(scope ? upcoming.filter(v => v.deptId === scope) : upcoming).length}</b></div>
      </div>
      <div class="toolbar">${V.tabs([['fila', 'Aguardando você', waitingMe.length], ['outra', 'Nas outras etapas', other.length], ['historico', 'Histórico']], tab, 'vac.tab')}</div>
      ${V.card('', shown.length ? `<ul class="vacs">${shown.map(v => V.vacItem(u, v, { comment: true, conflicts: v.status !== 'recusada' && v.status !== 'cancelada', actions: actions(v) })).join('')}</ul>` : V.empty(tab === 'fila' ? 'Nenhuma solicitação aguardando sua decisão.' : 'Nada por aqui.', 'check'), { cls: 'flush' })}
      ${myPending.length ? V.card('Minhas férias', `<ul class="vacs">${myPending.map(v => V.vacItem(u, v, { self: true, comment: true })).join('')}</ul>`, { cls: 'flush-b' }) : ''}
      ${V.card('Calendário de férias', V.vacCalendar(u, scoped, true), { sub: 'Inclui as solicitações em aprovação (tracejadas). Os comentários aparecem só para quem aprova.', cls: 'bare' })}`;
  };
})(window.P);
