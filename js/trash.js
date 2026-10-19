/* Prumo — Lixeira: o que é excluído (tarefas, recorrências, atividades, reconhecimentos) fica guardado por 30 dias e pode ser restaurado.
 * Guarda na coleção "trash" (tabela trash). Se a tabela ainda não existe no banco, a exclusão funciona como antes (definitiva). */
'use strict';
(function (P) {
  const D = P.date, esc = P.esc, V = P.V, A = P.actions, icon = V.icon;
  const db = () => P.store.db, U = () => P.state.user;
  const bin = () => (db().trash = db().trash || []);
  const available = () => !(P.isLive && P.trashMissing);
  const DAYS = 30, DAY_MS = 864e5;
  P.PAGES.lixeira = ['admin', 'office', 'manager'];
  const KINDS = { task: 'Tarefa', recurrence: 'Recorrência', activity: 'Atividade', recognition: 'Reconhecimento' };
  const TARGET = { task: 'tasks', recurrence: 'taskRecurrences', activity: 'activities', recognition: 'recognitions' };
  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const labelOf = (kind, it) => {
    if (kind === 'task') return (it.title || 'Tarefa') + (it.due ? ' · prazo ' + D.fmt(it.due) : '') + ((P.user(it.userId) || {}).name ? ' · ' + P.user(it.userId).name : '');
    if (kind === 'recurrence') return (it.title || 'Recorrência') + (it.regime ? ' · regime ' + ((P.REGIMES[it.regime] || {}).label || it.regime) : '') + (it.freq === 'trimestral' ? ' · trimestral' : it.freq === 'unica' ? ' · uma vez' : ' · mensal');
    if (kind === 'activity') return (it.name || 'Atividade') + (it.unit ? ' · ' + it.unit : '') + (it.weight != null ? ' · peso ' + it.weight : '');
    return String(it.text || 'Reconhecimento').slice(0, 90) + ((P.user(it.userId) || {}).name ? ' · ' + P.user(it.userId).name : '');
  };
  const deptOf = (kind, it) => it.deptId || (kind === 'task' || kind === 'recognition' ? (P.user(it.userId) || {}).deptId : null) || null;
  const canSee = (u, e) => P.isGlobal(u) || (u.role === 'manager' && e.deptId === u.deptId);
  const expiresIn = e => Math.max(0, Math.ceil((e.ts + DAYS * DAY_MS - Date.now()) / DAY_MS));

  P.trash = {
    available,
    // move os itens para a lixeira (quem chama é quem remove da lista original). Devolve quantos foram guardados.
    put(u, kind, items) {
      if (!available() || !items || !items.length) return 0;
      const at = D.stamp(), ts = Date.now();
      items.forEach(it => bin().push({ id: P.uid('tz'), kind, deptId: deptOf(kind, it), label: labelOf(kind, it), item: JSON.parse(JSON.stringify(it)), deletedBy: u.id, deletedAt: at, ts }));
      return items.length;
    },
    count: u => bin().filter(e => canSee(u, e)).length
  };

  const st = () => (P.state.lx = P.state.lx || { q: '', kind: '', sel: new Set(), limit: 100 });
  const visible = u => {
    const s = st(), q = norm(s.q);
    return bin().filter(e => canSee(u, e) && (!s.kind || e.kind === s.kind) && (!q || norm(e.label + ' ' + KINDS[e.kind]).includes(q))).sort((a, b) => b.ts - a.ts);
  };

  V.lixeira = u => {
    const s = st(), list = visible(u), shown = list.slice(0, s.limit), rest = list.length - shown.length, n = list.filter(e => s.sel.has(e.id)).length;
    const head = V.pageHead('Lixeira', `Tudo o que foi excluído fica aqui por ${DAYS} dias e pode ser restaurado. Depois disso é apagado de vez.`);
    if (!available()) return head + `<div class="banner warn">${icon('alert')}<div><b>A lixeira ainda não está ativa.</b> Falta criar a tabela <code>trash</code> no banco (SQL enviado no chat). Enquanto isso, as exclusões são definitivas.</div></div>`;
    const who = id => esc((P.user(id) || { name: '—' }).name);
    const rows = shown.map(e => `<tr><td class="chk-col"><input type="checkbox" data-act="lxSel" data-id="${esc(e.id)}" aria-label="Selecionar" ${s.sel.has(e.id) ? 'checked' : ''}></td>
      <td><span class="chip-s">${esc(KINDS[e.kind] || e.kind)}</span></td><td><b>${esc(e.label)}</b>${e.deptId ? `<small class="obs">${esc((P.dept(e.deptId) || {}).name || '')}</small>` : ''}</td>
      <td>${who(e.deletedBy)}<small class="obs">${esc(D.fmt(String(e.deletedAt).slice(0, 10)))} ${esc(String(e.deletedAt).slice(11, 16))}</small></td><td class="nowrap">${expiresIn(e)} dia(s)</td></tr>`).join('');
    return `${head}
      <div class="toolbar tfilter">
        <label class="picker grow">${icon('search')}<input type="search" id="lx-q" data-set="lx.q" data-live value="${esc(s.q)}" placeholder="Buscar no que foi excluído" aria-label="Buscar na lixeira" autocomplete="off"></label>
        <label class="picker"><select data-set="lx.kind" aria-label="Tipo"><option value="">Todos os tipos</option>${Object.entries(KINDS).map(([k, l]) => `<option value="${k}" ${s.kind === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <span class="fine tf-count">${list.length} item(ns)</span></div>
      <div class="cart-bulk">${V.btn(list.length && list.every(e => s.sel.has(e.id)) ? 'Desmarcar todos' : 'Selecionar todos os filtrados (' + list.length + ')', { act: 'lxSelAll', icon: 'check', cls: 'sm ghost' })}
        ${n ? `<span class="fine"><b>${n}</b> selecionado(s)</span>${V.btn('Restaurar selecionados', { act: 'lxRestore', icon: 'undo', cls: 'sm primary' })}${P.isGlobal(u) ? V.btn('Excluir de vez', { act: 'lxPurge', icon: 'trash', cls: 'sm ghost danger' }) : ''}` : '<span class="fine">Marque o que quer recuperar.</span>'}</div>
      ${V.card('Itens excluídos', list.length ? `<div class="table-wrap"><table class="tbl"><thead><tr><th class="chk-col"></th><th>Tipo</th><th>Item</th><th>Excluído por</th><th>Some em</th></tr></thead><tbody>${rows}</tbody></table></div>${rest > 0 ? `<div class="pager">${V.btn('Mostrar mais (' + rest + ' restantes)', { act: 'lxMore', icon: 'plus', cls: 'sm ghost' })}</div>` : ''}` : V.empty('A lixeira está vazia.', 'trash'), { cls: 'flush' })}`;
  };

  const flip = (set, id) => { set.has(id) ? set.delete(id) : set.add(id); };
  A.lxSel = el => { flip(st().sel, el.dataset.id); P.render(); };
  A.lxSelAll = () => { const list = visible(U()), s = st().sel, all = list.length && list.every(e => s.has(e.id)); list.forEach(e => all ? s.delete(e.id) : s.add(e.id)); P.render(); };
  A.lxMore = () => { st().limit += 100; P.render(); };
  A.lxRestore = () => P.ui.guard(() => {
    const u = U(), s = st(), chosen = visible(u).filter(e => s.sel.has(e.id));
    if (!chosen.length) return P.toast('Selecione o que restaurar.', 'err');
    const have = {}; Object.values(TARGET).forEach(k => { have[k] = new Set((db()[k] || []).map(x => x.id)); });
    let ok = 0, skipped = 0; const byKind = {};
    chosen.forEach(e => {
      const key = TARGET[e.kind];
      if (!key) return;
      if (have[key].has(e.item.id)) { skipped++; } else { (db()[key] = db()[key] || []).push(e.item); have[key].add(e.item.id); ok++; byKind[e.kind] = (byKind[e.kind] || 0) + 1; }
    });
    const ids = new Set(chosen.map(e => e.id)); db().trash = bin().filter(e => !ids.has(e.id));
    s.sel.clear(); P.reindex(); P.audit(u, 'Itens restaurados da lixeira', 'lixeira', ok + ' item(ns)' + (skipped ? ' (' + skipped + ' já existiam)' : '')); P.store.save();
    P.toast(ok + ' item(ns) restaurado(s)' + (skipped ? ' · ' + skipped + ' já existia(m)' : '') + '.'); P.render();
  });
  A.lxPurge = () => P.ui.guard(() => {
    const u = U(), s = st(), chosen = visible(u).filter(e => s.sel.has(e.id));
    if (!P.isGlobal(u)) return P.toast('Só a diretoria e a gerência excluem de vez.', 'err');
    if (!chosen.length) return P.toast('Selecione o que excluir.', 'err');
    if (!confirm(`Excluir DE VEZ ${chosen.length} item(ns)? Não há como recuperar depois.`)) return;
    const ids = new Set(chosen.map(e => e.id)); db().trash = bin().filter(e => !ids.has(e.id)); s.sel.clear();
    P.audit(u, 'Itens excluídos de vez da lixeira', 'lixeira', ids.size + ' item(ns)'); P.store.save(); P.toast(ids.size + ' item(ns) excluído(s) de vez.'); P.render();
  });
  // limpeza automática: o que passou de 30 dias na lixeira some (feita por diretoria e gerência ao abrir o sistema)
  setTimeout(() => {
    const u = U(); if (!u || !P.isGlobal(u) || !available()) return;
    const limit = Date.now() - DAYS * DAY_MS, keep = bin().filter(e => e.ts > limit);
    if (keep.length !== bin().length) { db().trash = keep; P.store.save(); }
  }, 8000);
})(window.P);
