/* Prumo — Carteira de empresas: gestor, gerente e diretoria escolhem quem é responsável por cada empresa.
 * Abre uma pessoa, vê as empresas dela e marca para colocar ou tirar. Tarefas automáticas pendentes acompanham o novo responsável. */
'use strict';
(function (P) {
  const D = P.date, esc = P.esc, V = P.V, A = P.actions, api = P.api, icon = V.icon;
  const db = () => P.store.db, U = () => P.state.user;
  const st = () => (P.state.cart = P.state.cart || { userId: '', q: '', view: 'ela', limit: 100 });
  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const byName = (a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR', { sensitivity: 'base', numeric: true });
  const scopeDept = u => V.scopeDept(u) || (u.role === 'manager' ? u.deptId : '');
  P.PAGES.carteira = ['admin', 'office', 'manager', 'employee'];

  // tudo o que a tela e as ações precisam, calculado do mesmo jeito nos dois lugares
  const model = u => {
    const s = st(), deptId = scopeDept(u);
    if (!deptId) return { s, deptId: '' };
    const people = api.workers(u, deptId);
    if (people.length && !people.some(p => p.id === s.userId)) s.userId = people[0].id;
    const assigns = db().clientAssignments.filter(a => a.deptId === deptId);
    const byClient = new Map(assigns.map(a => [a.client, a]));
    const counts = {}; assigns.forEach(a => { counts[a.userId] = (counts[a.userId] || 0) + 1; });
    const q = norm(s.q);
    let list = (db().companies || []).filter(c => c.active !== false).sort(byName)
      .filter(c => !q || norm(c.name + ' ' + (c.code || '') + ' ' + (c.cnpj || '')).includes(q));
    const mine = c => (byClient.get(c.name) || {}).userId === s.userId;
    if (s.view === 'ela') list = list.filter(mine);
    else if (s.view === 'livres') list = list.filter(c => !byClient.has(c.name));
    else if (s.view === 'outros') list = list.filter(c => byClient.has(c.name) && !mine(c));
    return { s, deptId, people, assigns, byClient, counts, list, mine };
  };

  // funcionário: só consulta (sem editar) as empresas que estão na carteira dele, com as tarefas pendentes de cada uma
  const minhaCarteira = u => {
    const s = st(), q = norm(s.q), today = D.iso(P.today());
    const mine = db().clientAssignments.filter(a => a.userId === u.id);
    const comps = new Map((db().companies || []).map(c => [c.name, c]));
    const pend = new Map();
    db().tasks.forEach(t => { if (t.userId === u.id && t.status === 'pendente' && t.client) { const e = pend.get(t.client) || { n: 0, next: '', late: 0 }; e.n++; if (t.due) { if (!e.next || t.due < e.next) e.next = t.due; if (t.due < today) e.late++; } pend.set(t.client, e); } });
    const list = mine.map(a => ({ a, c: comps.get(a.client) || { name: a.client, regime: '' } })).filter(x => !q || norm(x.c.name + ' ' + (x.c.code || '')).includes(q)).sort((x, y) => byName(x.c, y.c));
    const shown = list.slice(0, s.limit), rest = list.length - shown.length;
    const rows = shown.map(({ c }) => { const p = pend.get(c.name);
      return `<tr><td><b>${esc(c.name)}</b>${c.code ? `<small class="obs">${esc(c.code)}</small>` : ''}</td><td>${esc((P.REGIMES[c.regime] || {}).label || '—')}</td>
        <td>${p ? p.n + (p.late ? ` <span class="badge st-sobrecarga">${p.late} em atraso</span>` : '') : '<span class="muted">nenhuma</span>'}</td><td class="nowrap">${p && p.next ? esc(D.fmt(p.next)) : '—'}</td></tr>`; }).join('');
    return `${V.pageHead('Minhas empresas', 'As empresas pelas quais você é responsável. Para mudar a carteira, fale com o seu gestor.')}
      <div class="toolbar tfilter"><label class="picker grow">${icon('search')}<input type="search" id="cart-q" data-set="cart.q" data-live value="${esc(s.q)}" placeholder="Buscar empresa por nome ou código" aria-label="Buscar empresa" autocomplete="off"></label><span class="fine tf-count">${list.length} empresa(s)</span></div>
      ${V.card('Carteira de ' + esc(u.name), list.length ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>Empresa</th><th>Regime</th><th>Tarefas pendentes</th><th>Próximo prazo</th></tr></thead><tbody>${rows}</tbody></table></div>${rest > 0 ? `<div class="pager">${V.btn('Mostrar mais (' + rest + ' restantes)', { act: 'cartMore', icon: 'plus', cls: 'sm ghost' })}</div>` : ''}` : V.empty(mine.length ? 'Nenhuma empresa neste filtro.' : 'Você ainda não tem empresas na carteira.', 'building'), { cls: 'flush' })}`;
  };

  V.carteira = u => {
    if (u.role === 'employee') return minhaCarteira(u);
    const m = model(u);
    const head = V.pageHead('Carteira de empresas', 'Escolha uma pessoa e marque as empresas pelas quais ela é responsável. As tarefas automáticas vão para o responsável da carteira.', V.deptPicker(u));
    if (!m.deptId) return head + V.empty('Escolha um departamento no seletor acima.', 'building');
    if (!m.people.length) return head + V.empty('Este departamento ainda não tem colaboradores.', 'users');
    const { s, people, counts, list, byClient, mine } = m, me = P.user(s.userId) || people[0];
    const shown = list.slice(0, s.limit), rest = list.length - shown.length;
    const semDono = (db().companies || []).filter(c => c.active !== false && !byClient.has(c.name)).length;
    const rows = shown.map(c => {
      const a = byClient.get(c.name), owner = a ? P.user(a.userId) : null, isMine = mine(c);
      return `<tr class="${isMine ? '' : 'dim'}"><td class="chk-col"><input type="checkbox" data-act="cartToggle" data-id="${esc(c.id)}" aria-label="Responsável: ${esc(me.name)}" ${isMine ? 'checked' : ''}></td>
        <td><b>${esc(c.name)}</b>${c.code ? `<small class="obs">${esc(c.code)}</small>` : ''}</td>
        <td>${esc((P.REGIMES[c.regime] || {}).label || '—')}</td>
        <td>${isMine ? '<span class="badge es-aprovado">' + icon('check') + 'Dela</span>' : owner ? esc(owner.name) : '<span class="badge st-sem">Sem responsável</span>'}</td></tr>`;
    }).join('');
    return `${head}
      <div class="cart-grid">
        <aside class="card cart-people"><h3 class="cart-h">Pessoas</h3>
          ${people.map(p => `<button type="button" class="cart-person ${p.id === s.userId ? 'on' : ''}" data-act="cartPerson" data-id="${esc(p.id)}">${V.avatar(p, 'sm')}<span>${esc(p.name)}<small>${p.role === 'manager' ? 'Gestor(a) · ' : ''}${counts[p.id] || 0} empresa(s)</small></span></button>`).join('')}
          <p class="fine">${semDono} empresa(s) ativa(s) sem responsável neste departamento.</p>
        </aside>
        <section class="cart-main">
          <div class="toolbar tfilter">
            <label class="picker grow">${icon('search')}<input type="search" id="cart-q" data-set="cart.q" data-live value="${esc(s.q)}" placeholder="Buscar empresa por nome, código ou CNPJ" aria-label="Buscar empresa" autocomplete="off"></label>
            <label class="picker"><select data-set="cart.view" aria-label="Mostrar"><option value="ela" ${s.view === 'ela' ? 'selected' : ''}>Só as de ${esc(P.firstName ? P.firstName(me.name) : me.name)}</option><option value="todas" ${s.view === 'todas' ? 'selected' : ''}>Todas as empresas</option><option value="livres" ${s.view === 'livres' ? 'selected' : ''}>Sem responsável</option><option value="outros" ${s.view === 'outros' ? 'selected' : ''}>De outras pessoas</option></select></label>
            <span class="fine tf-count">${list.length} empresa(s)</span></div>
          <div class="cart-bulk">${V.btn('Marcar todas as filtradas', { act: 'cartAll', icon: 'check', cls: 'sm ghost' })}${V.btn('Desmarcar todas as filtradas', { act: 'cartNone', icon: 'x', cls: 'sm ghost' })}<span class="fine">Marcar uma empresa de outra pessoa transfere para ${esc(me.name)}. Cada clique já salva.</span></div>
          ${V.card('Empresas · responsável: ' + esc(me.name), list.length ? `<div class="table-wrap"><table class="tbl"><thead><tr><th class="chk-col"></th><th>Empresa</th><th>Regime</th><th>Responsável atual</th></tr></thead><tbody>${rows}</tbody></table></div>${rest > 0 ? `<div class="pager">${V.btn('Mostrar mais (' + rest + ' restantes)', { act: 'cartMore', icon: 'plus', cls: 'sm ghost' })}</div>` : ''}` : V.empty('Nenhuma empresa neste filtro.', 'building'), { cls: 'flush' })}
        </section>
      </div>`;
  };

  // tarefas automáticas pendentes da empresa acompanham o novo responsável (as editadas à mão não mudam)
  const moveTasks = (deptId, client, userId) => {
    let n = 0;
    db().tasks.forEach(t => {
      if (t.deptId === deptId && t.client === client && t.recId && t.status === 'pendente' && t.userId !== userId && !(t.edits || []).some(e => !e.carteira)) {
        (t.edits = t.edits || []).push({ by: U().id, at: D.stamp(), changes: 'responsável (carteira): ' + ((P.user(t.userId) || {}).name || '—') + ' → ' + ((P.user(userId) || {}).name || '—'), batch: true, carteira: true });
        t.userId = userId; n++;
      }
    });
    return n;
  };
  const guard = fn => P.ui.guard(fn);

  A.cartPerson = el => { st().userId = el.dataset.id; st().limit = 100; P.render(); };
  A.cartMore = () => { st().limit += 100; P.render(); };
  A.cartToggle = el => guard(() => {
    const u = U(), m = model(u), c = (db().companies || []).find(x => x.id === el.dataset.id);
    if (!c || !m.deptId) return;
    const cur = m.byClient.get(c.name);
    if (cur && cur.userId === m.s.userId) { api.removeClientAssignment(u, cur.id); P.toast(c.name + ' saiu da carteira de ' + (P.user(m.s.userId) || {}).name + '.'); }
    else { api.assignClient(u, { client: c.name, userId: m.s.userId }); const n = moveTasks(m.deptId, c.name, m.s.userId); if (n) P.store.save(); P.toast(c.name + ' agora é de ' + (P.user(m.s.userId) || {}).name + (n ? ' · ' + n + ' tarefa(s) pendente(s) acompanharam.' : '.')); }
    P.render();
  });
  A.cartAll = () => guard(() => {
    const u = U(), m = model(u), todo = m.list.filter(c => !m.mine(c));
    if (!todo.length) return P.toast('Todas as empresas filtradas já são dessa pessoa.');
    if (!confirm(`Colocar ${todo.length} empresa(s) na carteira de ${(P.user(m.s.userId) || {}).name}? As que são de outras pessoas serão transferidas.`)) return;
    let moved = 0; todo.forEach(c => { api.assignClient(u, { client: c.name, userId: m.s.userId }); moved += moveTasks(m.deptId, c.name, m.s.userId); });
    P.store.save(); P.toast(todo.length + ' empresa(s) colocada(s)' + (moved ? ' · ' + moved + ' tarefa(s) pendente(s) acompanharam' : '') + '.'); P.render();
  });
  A.cartNone = () => guard(() => {
    const u = U(), m = model(u), todo = m.list.filter(c => m.mine(c));
    if (!todo.length) return P.toast('Nenhuma das empresas filtradas é dessa pessoa.');
    if (!confirm(`Tirar ${todo.length} empresa(s) da carteira de ${(P.user(m.s.userId) || {}).name}? Elas ficam sem responsável.`)) return;
    todo.forEach(c => api.removeClientAssignment(u, m.byClient.get(c.name).id));
    P.toast(todo.length + ' empresa(s) retirada(s) da carteira.'); P.render();
  });
})(window.P);
