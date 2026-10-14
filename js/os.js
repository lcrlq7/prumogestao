/*
 * Prumo — Ordens de serviço (OS)
 *
 * Abrem e atualizam/concluem OS: diretoria, gerência, gestores e funcionários habilitados no perfil
 * ("Pode abrir OS", marcado por diretoria, gerência ou o gestor do departamento). No menu aparece "Solicitar OS".
 * Os demais colaboradores veem "Consultar OS": só leitura das OS do próprio departamento (e das que abriram).
 * Cada OS: empresa, demanda, departamento responsável, tipo (comentário breve) e prazo.
 * Situações: em andamento → aguardando retorno do cliente → concluída ou não concluída (com motivo).
 * As mesmas regras valem no banco (políticas de service_orders e guard_profiles).
 */
'use strict';
(function (P) {
  const D = P.date, esc = P.esc, V = P.V, icon = V.icon;
  const A = P.ext.actions;
  const db = () => P.store.db;
  const S = () => P.state;
  const U = () => S().user;
  const $ = (s, r = document) => r.querySelector(s);
  const deny = m => { throw new P.AccessError(m); };

  P.PAGES.os = ['admin', 'office', 'manager', 'employee'];
  const canOpen = u => !!u && u.active !== false && (['admin', 'office', 'manager'].includes(u.role) || (u.role === 'employee' && !!u.canOS));
  const canSeeOS = (u, o) => P.isGlobal(u) || o.by === u.id || o.deptId === u.deptId || (u.role === 'manager' && P.ledDept(u) && P.ledDept(u).id === o.deptId);
  const canAct = (u, o) => canOpen(u) && canSeeOS(u, o);
  const list = () => (db().serviceOrders = db().serviceOrders || []);
  const visible = u => list().filter(o => canSeeOS(u, o));

  const STATUS = {
    andamento: ['Em andamento', 'es-pendente', 'clock'],
    aguardando: ['Aguardando retorno do cliente', 'es-correcao', 'message'],
    concluido: ['Concluída', 'es-aprovado', 'check'],
    nao_concluido: ['Não concluída', 'es-recusado', 'x']
  };
  const open = o => o.status === 'andamento' || o.status === 'aguardando';
  const late = o => open(o) && o.due < D.iso(P.today());
  const badge = o => `<span class="badge ${STATUS[o.status][1]}">${icon(STATUS[o.status][2])}${STATUS[o.status][0]}</span>${late(o) ? ' <span class="badge es-recusado">' + icon('alert') + 'Atrasada</span>' : ''}`;
  const notify = (ids, n) => { if (P.notify) P.notify([...new Set(ids)].filter(id => id && id !== U().id), Object.assign({ type: 'os', icon: 'clipboard', link: 'os' }, n)); };
  const deptPeople = deptId => db().users.filter(x => x.active !== false && x.deptId === deptId && (x.role === 'manager' || x.canOS)).map(x => x.id)
    .concat(((P.dept(deptId) || {}).managerId) || []);

  P.os = { canOpen, label: u => canOpen(u) ? 'Solicitar OS' : 'Consultar OS', badge: u => !u ? 0 : visible(u).filter(o => canAct(u, o) && late(o)).length };

  /* ---------- Página ---------- */
  const st = () => (S().osv = S().osv || { tab: 'abertas', q: '', dept: '' });
  V.os = u => {
    if (P.isSupport(u)) deny('Ordens de serviço não se aplicam ao seu departamento.');
    const s = st(), q = (s.q || '').toLowerCase(), all = visible(u);
    const filt = all.filter(o => (!s.dept || o.deptId === s.dept) && (!q || [o.company, o.demand, o.type, o.code].some(x => String(x || '').toLowerCase().includes(q))));
    const tabs = { abertas: filt.filter(open), atrasadas: filt.filter(late), aguardando: filt.filter(o => o.status === 'aguardando'), concluidas: filt.filter(o => o.status === 'concluido'), nao: filt.filter(o => o.status === 'nao_concluido'), todas: filt };
    const shown = (tabs[s.tab] || tabs.abertas).slice().sort((a, b) => open(a) && open(b) ? (a.due < b.due ? -1 : 1) : (a.at < b.at ? 1 : -1));
    const depts = P.api.departments(u);
    const title = canOpen(u) ? 'Solicitar OS' : 'Consultar OS';
    const sub = canOpen(u) ? 'Abra ordens de serviço para as empresas, acompanhe o andamento e conclua quando o trabalho for entregue.'
      : 'Consulte as ordens de serviço do seu departamento. Quem abre e conclui OS são a gestão e os colegas habilitados.';
    return `${V.pageHead(title, sub, canOpen(u) ? V.btn('Nova OS', { act: 'osNew', icon: 'plus', cls: 'primary' }) : '')}
      <div class="strip">
        <div><span>Em aberto</span><b>${all.filter(open).length}</b></div>
        <div class="${all.some(late) ? 't-warn' : ''}"><span>Atrasadas</span><b>${all.filter(late).length}</b></div>
        <div><span>Aguardando cliente</span><b>${all.filter(o => o.status === 'aguardando').length}</b></div>
        <div><span>Concluídas no mês</span><b>${all.filter(o => o.status === 'concluido' && (o.closedAt || '').slice(0, 7) === D.iso(P.today()).slice(0, 7)).length}</b></div>
      </div>
      <section class="card"><div class="card-b"><div class="filters">
        <label class="field"><span>Buscar</span><input type="search" value="${esc(s.q)}" data-set="osv.q" data-live placeholder="Empresa, demanda, tipo ou nº"></label>
        ${P.isGlobal(u) ? `<label class="field"><span>Departamento</span><select data-set="osv.dept"><option value="">Todos</option>${depts.map(d => `<option value="${d.id}" ${s.dept === d.id ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</select></label>` : ''}
      </div></div></section>
      <div class="toolbar">${V.tabs([['abertas', 'Em aberto', tabs.abertas.length], ['atrasadas', 'Atrasadas', tabs.atrasadas.length], ['aguardando', 'Aguardando cliente', tabs.aguardando.length], ['concluidas', 'Concluídas', tabs.concluidas.length], ['nao', 'Não concluídas', tabs.nao.length], ['todas', 'Todas', tabs.todas.length]], s.tab, 'osv.tab')}</div>
      ${V.card('', shown.length ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>Nº</th><th>Empresa</th><th>Demanda</th><th>Departamento</th><th>Tipo</th><th>Prazo</th><th>Situação</th><th>Aberta por</th><th class="actions-col"></th></tr></thead><tbody>
        ${shown.map(o => `<tr class="${o.status === 'nao_concluido' ? 'inactive' : ''}">
          <td class="mono nowrap">${esc(o.code)}</td><td><b>${esc(o.company)}</b></td>
          <td>${esc(o.demand.length > 90 ? o.demand.slice(0, 90) + '…' : o.demand)}</td>
          <td>${esc((P.dept(o.deptId) || {}).name || '—')}</td><td>${esc(o.type)}</td>
          <td class="nowrap ${late(o) ? 'neg' : ''}">${D.fmt(o.due)}</td><td>${badge(o)}</td>
          <td>${esc((P.user(o.by) || {}).name || '—')}</td>
          <td class="actions-col"><div class="row-actions">${canAct(u, o) ? V.ibtn('edit', 'Atualizar situação', { act: 'osStatus', attrs: `data-id="${o.id}"` }) : ''}${V.ibtn('info', 'Detalhes e histórico', { act: 'osDetail', attrs: `data-id="${o.id}"` })}</div></td></tr>`).join('')}
        </tbody></table></div>` : V.empty(s.tab === 'abertas' ? (canOpen(u) ? 'Nenhuma OS em aberto. Use "Nova OS".' : 'Nenhuma OS em aberto no seu departamento.') : 'Nada por aqui.', 'clipboard'), { cls: 'flush' })}`;
  };

  /* ---------- Ações ---------- */
  const get = id => list().find(o => o.id === id);
  const hist = (o, action, note) => o.history.push({ at: D.stamp(), by: U().id, action, note: note || '' });
  const done = msg => { P.store.save(); P.toast(msg); P.render(); };
  A.osNew = () => {
    const u = U(); if (!canOpen(u)) return P.toast('Você não está habilitado a abrir OS.', 'err');
    const compList = P.api.companies(u).filter(c => c.active !== false).sort((a, b) => a.name.localeCompare(b.name));
    const comps = compList.map(c => c.name);
    const depts = P.api.departments(u, false);
    const defDept = u.deptId && depts.some(d => d.id === u.deptId) ? u.deptId : '';
    P.ui.modal({
      title: 'Nova ordem de serviço', submit: 'Abrir OS', wide: true,
      body: `<div class="fgrid">
        <div class="field span2"><span>Empresa</span>
          <div class="combo" id="os-co-box">
            <input id="os-co" placeholder="Digite o nome ou o código da empresa" autocomplete="off" role="combobox" aria-expanded="false" aria-controls="os-co-list">
            <button type="button" class="combo-x" id="os-co-x" title="Limpar e escolher outra" aria-label="Limpar empresa" hidden>×</button>
            <ul class="combo-list" id="os-co-list" role="listbox" hidden></ul>
          </div></div>
        <label class="field"><span>Departamento responsável</span><select id="os-dp"><option value="">Escolha…</option>${depts.map(d => `<option value="${d.id}" ${d.id === defDept ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</select></label>
        <label class="field span3"><span>Demanda</span><textarea id="os-dm" rows="3" maxlength="1000" placeholder="O que precisa ser feito"></textarea></label>
        <label class="field span2"><span>Tipo de solicitação <small>(comentário breve)</small></span><input id="os-tp" maxlength="80" placeholder="Ex.: alteração contratual, retificação de declaração"></label>
        <label class="field"><span>Prazo para finalização</span><input type="date" id="os-due" min="${D.iso(P.today())}" value="${D.iso(D.add(P.today(), 7))}"></label></div>`,
      onSubmit: m => {
        const company = $('#os-co', m).value.trim(), deptId = $('#os-dp', m).value, demand = $('#os-dm', m).value.trim(), type = $('#os-tp', m).value.trim(), due = $('#os-due', m).value;
        if (!comps.includes(company)) throw new Error('Escolha uma empresa do cadastro (digite e selecione na lista).');
        if (!deptId) throw new Error('Escolha o departamento responsável.');
        if (demand.length < 5) throw new Error('Descreva a demanda.');
        if (type.length < 3) throw new Error('Informe o tipo de solicitação.');
        if (!due || due < D.iso(P.today())) throw new Error('Informe um prazo a partir de hoje.');
        const n = new Date(), code = 'OS-' + String(n.getFullYear()).slice(2) + String(n.getMonth() + 1).padStart(2, '0') + String(n.getDate()).padStart(2, '0') + '-' + Math.random().toString(36).slice(2, 6).toUpperCase();
        const o = { id: P.uid('os'), code, by: u.id, at: D.stamp(), company, demand, deptId, type, due, status: 'andamento', history: [] };
        hist(o, 'OS aberta'); list().push(o);
        P.audit(u, 'OS aberta', o.id, code + ' · ' + company + ' · ' + type);
        notify(deptPeople(deptId), { title: 'Nova OS para o seu departamento', text: code + ' · ' + company + ' · prazo ' + D.fmt(due) });
        st().tab = 'abertas'; done('OS ' + code + ' aberta.');
      }
    });
    companyPicker(compList);
  };
  /*
   * Seletor de empresa com busca: mostra a lista inteira ao clicar, filtra por nome, código ou CNPJ,
   * aceita teclado (↑ ↓ Enter Esc) e deixa trocar a escolha a qualquer momento (botão × ou digitando de novo).
   */
  function companyPicker(list) {
    const box = $('#os-co-box'), inp = $('#os-co'), ul = $('#os-co-list'), x = $('#os-co-x');
    if (!box) return;
    const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    let shown = [], hi = -1;
    const draw = q => {
      const t = norm(q), d = String(q || '').replace(/\D/g, '');
      shown = (t ? list.filter(c => norm(c.name).includes(t) || norm(c.tradeName).includes(t) || (c.code && norm(c.code).startsWith(t)) || (d.length >= 3 && String(c.cnpj || '').replace(/\D/g, '').includes(d))) : list).slice(0, 60);
      hi = shown.length ? 0 : -1;
      ul.innerHTML = shown.length ? shown.map((c, i) => `<li role="option" data-i="${i}" class="${i === hi ? 'on' : ''}"><b>${esc(c.name)}</b>${c.code ? `<small>cód. ${esc(c.code)}</small>` : ''}</li>`).join('')
        + (!t && list.length > 60 ? `<li class="combo-more">Mostrando 60 de ${list.length}. Digite para buscar.</li>` : '') : '<li class="combo-more">Nenhuma empresa encontrada.</li>';
      ul.hidden = false; inp.setAttribute('aria-expanded', 'true');
    };
    const close = () => { ul.hidden = true; inp.setAttribute('aria-expanded', 'false'); };
    const pick = c => { inp.value = c.name; x.hidden = false; close(); };
    const mark = () => ul.querySelectorAll('li[data-i]').forEach(li => li.classList.toggle('on', Number(li.dataset.i) === hi));
    // clicar ou focar: lista completa (mesmo com uma empresa já escolhida, para poder trocar)
    inp.addEventListener('focus', () => { inp.select(); draw(''); });
    inp.addEventListener('click', () => { if (ul.hidden) draw(''); });
    inp.addEventListener('input', () => { x.hidden = !inp.value; draw(inp.value); });
    inp.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (ul.hidden) draw(inp.value); hi = Math.max(0, Math.min(shown.length - 1, hi + (e.key === 'ArrowDown' ? 1 : -1))); mark(); const el = ul.querySelector('li.on'); if (el) el.scrollIntoView({ block: 'nearest' }); }
      else if (e.key === 'Enter' && !ul.hidden && shown[hi]) { e.preventDefault(); pick(shown[hi]); }
      else if (e.key === 'Escape' && !ul.hidden) { e.stopPropagation(); close(); }
    });
    ul.addEventListener('mousedown', e => { const li = e.target.closest('li[data-i]'); if (li) { e.preventDefault(); pick(shown[Number(li.dataset.i)]); } });
    x.addEventListener('click', () => { inp.value = ''; x.hidden = true; inp.focus(); });
    inp.addEventListener('blur', () => setTimeout(close, 120));
  }
  A.osStatus = el => {
    const o = get(el.dataset.id), u = U(); if (!o || !canAct(u, o)) return;
    P.ui.modal({
      title: 'Atualizar ' + esc(o.code), submit: 'Salvar',
      body: `<p class="prose"><b>${esc(o.company)}</b> · ${esc(o.type)} · prazo ${D.fmt(o.due)}</p>
        <div class="fgrid">
          <label class="field span2"><span>Situação</span><select id="os-st">${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${o.status === k ? 'selected' : ''}>${v[0]}</option>`).join('')}</select></label>
          <label class="field"><span>Novo prazo <small>(opcional)</small></span><input type="date" id="os-nd" value="${o.due}"></label>
          <label class="field span3" id="os-rs-w"><span>Motivo <small>(obrigatório se não concluída)</small></span><textarea id="os-rs" rows="2" maxlength="500">${esc(o.reason || '')}</textarea></label>
          <label class="field span3"><span>Comentário <small>(opcional)</small></span><input id="os-cm" maxlength="300" placeholder="Ex.: cliente enviou os documentos"></label></div>`,
      onSubmit: m => {
        const ns = $('#os-st', m).value, rs = $('#os-rs', m).value.trim(), cm = $('#os-cm', m).value.trim(), nd = $('#os-nd', m).value;
        if (ns === 'nao_concluido' && rs.length < 3) throw new Error('Informe o motivo de não conclusão.');
        if (ns === o.status && nd === o.due && !cm) throw new Error('Nada mudou.');
        const parts = [];
        if (ns !== o.status) { parts.push(STATUS[o.status][0] + ' → ' + STATUS[ns][0]); o.status = ns; o.closedAt = ns === 'concluido' || ns === 'nao_concluido' ? D.stamp() : null; o.closedBy = o.closedAt ? u.id : null; }
        if (nd && nd !== o.due) { parts.push('prazo ' + D.fmt(o.due) + ' → ' + D.fmt(nd)); o.due = nd; }
        if (ns === 'nao_concluido') o.reason = rs; else if (o.reason && ns !== 'nao_concluido') o.reason = '';
        hist(o, parts.join(' · ') || 'Comentário', ns === 'nao_concluido' ? 'Motivo: ' + rs + (cm ? ' · ' + cm : '') : cm);
        P.audit(u, 'OS atualizada', o.id, o.code + ' · ' + (parts.join(' · ') || cm));
        if (o.by !== u.id) notify([o.by], { title: 'OS atualizada: ' + o.code, text: o.company + ' · ' + STATUS[o.status][0] });
        done('OS atualizada.');
      }
    });
  };
  A.osDetail = el => {
    const o = get(el.dataset.id); if (!o) return;
    const who = id => esc((P.user(id) || {}).name || '—');
    P.ui.modal({ title: esc(o.code + ' · ' + o.company), wide: true, cancel: 'Fechar',
      body: `<p class="prose">${badge(o)}</p>
        <dl class="rep-meta"><div><dt>Departamento</dt><dd>${esc((P.dept(o.deptId) || {}).name || '—')}</dd></div><div><dt>Tipo</dt><dd>${esc(o.type)}</dd></div><div><dt>Prazo</dt><dd>${D.fmt(o.due)}</dd></div><div><dt>Aberta por</dt><dd>${who(o.by)} · ${esc(o.at)}</dd></div></dl>
        <h4 class="sub-h">Demanda</h4><p class="prose">${esc(o.demand).replace(/\n/g, '<br>')}</p>
        ${o.status === 'nao_concluido' ? `<div class="banner warn sm">${icon('alert')}<div><b>Motivo de não conclusão:</b> ${esc(o.reason)}</div></div>` : ''}
        <h4 class="sub-h">Histórico</h4><ul class="day-list">${o.history.slice().reverse().map(h => `<li><span>${esc(h.action)}${h.note ? `<small>${esc(h.note)}</small>` : ''}</span><b>${who(h.by)} · ${esc(h.at)}</b></li>`).join('')}</ul>` });
  };
})(window.P);
