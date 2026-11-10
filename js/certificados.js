/* Prumo — Certificados digitais das empresas
 * Todos os usuários veem a lista (empresa, tipo, validade, situação, localização) e podem consultar a senha:
 * cada consulta fica registrada no histórico. Cadastrar, editar e excluir é só para quem a diretoria delegar
 * (e para a diretoria e a gerência). A mesma regra vale no banco (políticas de certificates).
 * A lista de quem pode editar fica na linha especial "_cfg" da própria tabela. */
'use strict';
(function (P) {
  const D = P.date, esc = P.esc, V = P.V, A = P.actions, icon = V.icon;
  const db = () => P.store.db, U = () => P.state.user, norm = P.norm;
  P.PAGES.certificados = ['admin', 'office', 'manager', 'employee'];

  const list = () => (db().certificates = db().certificates || []);
  const certs = () => list().filter(c => c.id !== '_cfg');
  const cfg = () => { let c = list().find(x => x.id === '_cfg'); if (!c) { c = { id: '_cfg', editors: [] }; list().push(c); } return c; };
  const canEdit = u => !!u && (P.isGlobal(u) || ((list().find(x => x.id === '_cfg') || {}).editors || []).includes(u.id));
  const SOON = 30; // "vencendo" = faltam até 30 dias
  const daysOf = c => c.validity ? Math.round((D.parse(c.validity) - P.today()) / 864e5) : null;
  const statusOf = c => { const d = daysOf(c); return d == null ? ['sem', 'Sem validade', 'st-sem'] : d < 0 ? ['vencido', 'Vencido', 'st-sobrecarga'] : d <= SOON ? ['vencendo', 'Vencendo', 'es-correcao'] : ['prazo', 'No prazo', 'es-aprovado']; };
  const st = () => (P.state.cert = P.state.cert || { q: '', f: '', type: '', all: false, shown: {} });
  const LIMIT = 100;

  V.certificados = u => {
    const s = st(), all = certs(), edit = canEdit(u);
    const cnt = { prazo: 0, vencendo: 0, vencido: 0 };
    all.forEach(c => { const k = statusOf(c)[0]; if (cnt[k] != null) cnt[k]++; });
    const q = norm(s.q);
    let rows = all.filter(c => (!s.f || statusOf(c)[0] === s.f) && (!s.type || c.type === s.type) && (!q || norm(c.company).includes(q) || norm(c.note || '').includes(q)));
    rows.sort((a, b) => (daysOf(a) == null) - (daysOf(b) == null) || (daysOf(a) - daysOf(b)) || String(a.company).localeCompare(String(b.company)));
    const total = rows.length; if (!s.all) rows = rows.slice(0, LIMIT);
    const types = [...new Set(all.map(c => c.type).filter(Boolean))].sort();
    const head = V.pageHead('Certificados digitais', 'Validade e senha dos certificados das empresas. Todos consultam; quem a diretoria delegar cadastra e altera.',
      (P.state.user.role === 'admin' ? V.btn('Quem pode editar', { act: 'certEditors', icon: 'shield', cls: 'ghost' }) : '') + (edit ? V.btn('Novo certificado', { act: 'certNew', icon: 'plus', cls: 'primary' }) : ''));
    if (P.certMissing) return `${head}<div class="banner warn">${icon('alert')}<div>A tabela de certificados ainda não foi criada no banco. Peça para rodar o arquivo <b>modelos/certificados.sql</b> no Supabase.</div></div>`;
    const chip = (k, label, n, cls) => `<button type="button" class="chip ${s.f === k ? 'on' : ''}" data-act="certFilter" data-k="${k}">${label} <b>${n}</b></button>`;
    return `${head}
      <div class="toolbar tfilter">
        <input type="search" class="search" data-set="cert.q" data-live value="${esc(s.q)}" placeholder="Buscar empresa ou anotação" aria-label="Buscar" autocomplete="off">
        ${chip('', 'Todos', all.length)}${chip('prazo', 'No prazo', cnt.prazo)}${chip('vencendo', 'Vencendo (30 dias)', cnt.vencendo)}${chip('vencido', 'Vencidos', cnt.vencido)}
        <label class="picker"><select data-set="cert.type" aria-label="Tipo"><option value="">Todos os tipos</option>${types.map(t => `<option ${s.type === t ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>
        <span class="fine tf-count">${total} certificado(s)</span></div>
      ${V.card('Certificados', rows.length ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>Empresa</th><th>Tipo</th><th>Vencimento</th><th>Situação</th><th>Localização</th><th>Senha</th><th>Anotação</th>${edit ? '<th class="actions-col"></th>' : ''}</tr></thead><tbody>${rows.map(c => row(c, edit)).join('')}</tbody></table></div>
        ${total > rows.length ? `<div class="fine" style="padding:10px">Mostrando ${rows.length} de ${total}. ${V.btn('Mostrar todos', { act: 'certAll', cls: 'sm ghost' })}</div>` : ''}` : '<div class="empty"><p>Nenhum certificado encontrado.</p></div>', { cls: 'flush' })}`;
  };
  const row = (c, edit) => {
    const d = daysOf(c), s = statusOf(c), shown = st().shown[c.id];
    return `<tr><td><b>${esc(c.company)}</b></td><td>${esc(c.type || '—')}</td>
      <td class="nowrap">${c.validity ? esc(D.fmt(c.validity)) : '—'}${d == null ? '' : `<small class="obs">${d < 0 ? 'venceu há ' + (-d) + ' dia(s)' : d === 0 ? 'vence hoje' : 'faltam ' + d + ' dia(s)'}</small>`}</td>
      <td><span class="badge ${s[2]}">${s[1]}</span></td><td>${esc(c.location || '—')}</td>
      <td class="nowrap">${shown ? `<code>${esc(c.password || '')}</code>` : '<span class="muted">••••••••</span>'} ${c.password ? V.ibtn(shown ? 'x' : 'eye', shown ? 'Ocultar senha' : 'Mostrar senha (fica registrado)', { act: 'certShow', attrs: `data-id="${esc(c.id)}"` }) + V.ibtn('copy', 'Copiar senha (fica registrado)', { act: 'certCopy', attrs: `data-id="${esc(c.id)}"` }) : ''}</td>
      <td>${esc(c.note || '')}</td>
      ${edit ? `<td class="actions-col">${V.ibtn('edit', 'Editar', { act: 'certEdit', attrs: `data-id="${esc(c.id)}"` })}${V.ibtn('trash', 'Excluir', { act: 'certDel', attrs: `data-id="${esc(c.id)}"` })}</td>` : ''}</tr>`;
  };

  A.certFilter = el => { st().f = el.dataset.k || ''; st().all = false; P.render(); };
  A.certAll = () => { st().all = true; P.render(); };

  // consultar a senha: fica no histórico; some da tela depois de 20 segundos
  const consult = (u, c, how) => { P.audit(u, 'Senha de certificado consultada', '', c.company + ' (' + how + ')'); P.store.save(); };
  A.certShow = el => {
    const u = U(), c = list().find(x => x.id === el.dataset.id); if (!c) return;
    const s = st();
    if (s.shown[c.id]) { delete s.shown[c.id]; return P.render(); }
    consult(u, c, 'ver'); s.shown[c.id] = true; P.render();
    setTimeout(() => { if (s.shown[c.id]) { delete s.shown[c.id]; if (P.state.route.page === 'certificados') P.render(); } }, 20000);
  };
  A.certCopy = el => {
    const u = U(), c = list().find(x => x.id === el.dataset.id); if (!c) return;
    const done = () => { consult(u, c, 'copiar'); P.toast('Senha copiada.'); };
    try { navigator.clipboard.writeText(String(c.password || '')).then(done, () => P.toast('Não foi possível copiar. Use Mostrar senha.', 'err')); } catch (e) { P.toast('Não foi possível copiar. Use Mostrar senha.', 'err'); }
  };

  const $v = s => String((document.querySelector(s) || {}).value || '').trim();
  const form = c => `<div class="fgrid">
    <label class="field span3"><span>Empresa</span><input id="ce-co" maxlength="160" value="${esc(c.company || '')}"></label>
    <label class="field"><span>Tipo</span><select id="ce-type">${['A1', 'A3', 'e-CNPJ', 'e-CPF', 'Outro'].concat(c.type && !['A1', 'A3', 'e-CNPJ', 'e-CPF', 'Outro'].includes(c.type) ? [c.type] : []).map(t => `<option ${((c.type || 'A1') === t) ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
    <label class="field"><span>Vencimento</span><input type="date" id="ce-val" value="${esc(c.validity || '')}"></label>
    <label class="field"><span>Localização</span><input id="ce-loc" maxlength="80" value="${esc(c.location || 'Arquivo')}" placeholder="Arquivo, token, cartão…"></label>
    <label class="field span3"><span>Senha</span><input id="ce-pw" maxlength="120" value="${esc(c.password || '')}" autocomplete="off"></label>
    <label class="field span3"><span>Anotação (opcional)</span><input id="ce-note" maxlength="200" value="${esc(c.note || '')}"></label></div>`;
  const save = (u, c, isNew) => {
    const company = $v('#ce-co'); if (company.length < 2) throw new Error('Informe a empresa.');
    Object.assign(c, { company, type: $v('#ce-type'), validity: $v('#ce-val'), location: $v('#ce-loc'), password: $v('#ce-pw'), note: $v('#ce-note') });
    c.by = u.id; c.at = Date.now();
    if (isNew) list().push(c);
    P.audit(u, isNew ? 'Certificado cadastrado' : 'Certificado alterado', '', company); P.store.save(); P.toast('Certificado salvo.'); P.render();
  };
  A.certNew = () => {
    const u = U(); if (!canEdit(u)) return P.toast('Você não tem permissão para cadastrar certificados.', 'err');
    P.ui.modal({ title: 'Novo certificado', submit: 'Salvar', body: form({}), onSubmit: () => save(u, { id: P.uid('ce') }, true) });
  };
  A.certEdit = el => {
    const u = U(); if (!canEdit(u)) return P.toast('Você não tem permissão para alterar certificados.', 'err');
    const c = list().find(x => x.id === el.dataset.id); if (!c) return;
    P.ui.modal({ title: 'Editar certificado', submit: 'Salvar', body: form(c), onSubmit: () => save(u, c, false) });
  };
  A.certDel = el => {
    const u = U(); if (!canEdit(u)) return P.toast('Você não tem permissão para excluir certificados.', 'err');
    const c = list().find(x => x.id === el.dataset.id); if (!c || !confirm('Excluir o certificado de "' + c.company + '"?')) return;
    list().splice(list().indexOf(c), 1); P.audit(u, 'Certificado excluído', '', c.company); P.store.save(); P.render();
  };

  // diretoria escolhe quem pode cadastrar/alterar (além da diretoria e da gerência, que sempre podem)
  A.certEditors = () => {
    const u = U(); if (u.role !== 'admin') return P.toast('Somente a diretoria escolhe quem edita.', 'err');
    const cur = cfg().editors || [];
    const people = db().users.filter(x => x.active !== false && !P.isGlobal(x)).sort((a, b) => String(a.name).localeCompare(String(b.name)));
    P.ui.modal({
      title: 'Quem pode editar certificados', submit: 'Salvar',
      body: `<p class="fine">Todos veem a lista e consultam a senha. Marque quem também pode cadastrar, alterar e excluir. Diretoria e gerência sempre podem.</p>
        <div class="checklist">${people.map(x => `<label class="field check"><input type="checkbox" class="ce-ed" value="${esc(x.id)}" ${cur.includes(x.id) ? 'checked' : ''}><span>${esc(x.name)} <small class="muted">${esc(P.ROLES[x.role] || '')}${P.dept(x.deptId) ? ' · ' + esc(P.dept(x.deptId).name) : ''}</small></span></label>`).join('') || '<p class="muted">Nenhum colaborador ativo.</p>'}</div>`,
      onSubmit: () => {
        cfg().editors = [...document.querySelectorAll('.ce-ed:checked')].map(i => i.value);
        P.audit(u, 'Permissão de certificados alterada', '', cfg().editors.length + ' pessoa(s) podem editar'); P.store.save(); P.toast('Permissões salvas.'); P.render();
      }
    });
  };

  // aviso de novidade: uma vez para cada pessoa (notificação no sino + faixa no Dashboard até ela dispensar)
  const SEEN = () => 'prumo.certNovo.' + ((U() || {}).id || '');
  const seen = () => { try { return localStorage.getItem(SEEN()) === '1'; } catch (e) { return false; } };
  const announce = () => {
    const u = U(); if (!u || !P.notify || P.certMissing || !certs().length) return;
    const notifs = (db().notifications = db().notifications || []), tag = 'cert:novo';
    if (notifs.some(n => n.userId === u.id && n.key === tag)) return;
    P.notify([u.id], { type: 'cert', icon: 'shield', title: 'Novo: Certificados digitais', text: 'Veja a validade e a senha dos certificados das empresas. Menu Clientes, Certificados digitais.', link: 'certificados' });
    const n = notifs[notifs.length - 1]; if (n) n.key = tag;
    P.store.save();
  };
  setTimeout(announce, 5000);
  A.certDismiss = () => { try { localStorage.setItem(SEEN(), '1'); } catch (e) { } P.render(); };
  const origDash = V.dashboard;
  V.dashboard = u => {
    const html = origDash(u);
    if (seen() || P.certMissing || !certs().length) return html;
    return `<div class="banner">${icon('shield')}<div><b>Novo: Certificados digitais.</b> Agora você consulta a validade e a senha dos certificados das empresas direto no Prumo. ${V.btn('Ver certificados', { go: 'certificados', cls: 'sm primary' })} ${V.btn('Entendi', { act: 'certDismiss', cls: 'sm ghost' })}</div></div>` + html;
  };
})(window.P);
