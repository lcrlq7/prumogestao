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
      (P.isGlobal(u) ? V.btn('Consultas às senhas', { act: 'certLog', icon: 'history', cls: 'ghost' }) : '') + (P.state.user.role === 'admin' ? V.btn('Quem pode editar', { act: 'certEditors', icon: 'shield', cls: 'ghost' }) : '') + (edit ? V.btn('Novo certificado', { act: 'certNew', icon: 'plus', cls: 'primary' }) : ''));
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
    const d = daysOf(c), s = statusOf(c), open = c.id in st().shown, hasPw = c.hasPassword || c.password;
    return `<tr><td><b>${esc(c.company)}</b></td><td>${esc(c.type || '—')}</td>
      <td class="nowrap">${c.validity ? esc(D.fmt(c.validity)) : '—'}${d == null ? '' : `<small class="obs">${d < 0 ? 'venceu há ' + (-d) + ' dia(s)' : d === 0 ? 'vence hoje' : 'faltam ' + d + ' dia(s)'}</small>`}</td>
      <td><span class="badge ${s[2]}">${s[1]}</span></td><td>${esc(c.location || '—')}</td>
      <td class="nowrap">${open ? `<code>${esc(st().shown[c.id])}</code>` : '<span class="muted">••••••••</span>'} ${hasPw ? V.ibtn(open ? 'x' : 'eye', open ? 'Ocultar senha' : 'Mostrar senha (fica registrado)', { act: 'certShow', attrs: `data-id="${esc(c.id)}"` }) + V.ibtn('copy', 'Copiar senha (fica registrado)', { act: 'certCopy', attrs: `data-id="${esc(c.id)}"` }) : ''}</td>
      <td>${esc(c.note || '')}</td>
      ${edit ? `<td class="actions-col">${V.ibtn('edit', 'Editar', { act: 'certEdit', attrs: `data-id="${esc(c.id)}"` })}${V.ibtn('trash', 'Excluir', { act: 'certDel', attrs: `data-id="${esc(c.id)}"` })}</td>` : ''}</tr>`;
  };

  A.certFilter = el => { st().f = el.dataset.k || ''; st().all = false; P.render(); };
  A.certAll = () => { st().all = true; P.render(); };

  // a senha só vem do servidor quando alguém pede (função cert_reveal), que registra quem consultou; some da tela em 20 segundos
  const rpc = P.backend && P.backend.rpc ? (fn, args) => P.backend.rpc(fn, args) : null;
  const fetchPw = async (c, how) => {
    if (!rpc) { P.audit(U(), 'Senha de certificado consultada', '', c.company + ' (' + how + ')'); P.store.save(); return c.password || ''; } // modo de demonstração
    const { data, error } = await rpc('cert_reveal', { p_id: c.id, p_how: how });
    if (error && /cert_reveal|function|schema cache/i.test(error.message)) { // SQL ainda não rodado: usa a senha que ainda está no documento (se houver)
      if (c.password) return c.password;
      throw new Error('A atualização do banco para as senhas ainda não foi aplicada.');
    }
    if (error) throw new Error(error.message);
    return data || '';
  };
  A.certShow = async el => {
    const c = list().find(x => x.id === el.dataset.id); if (!c) return;
    const s = st();
    if (c.id in s.shown) { delete s.shown[c.id]; return P.render(); }
    try { s.shown[c.id] = await fetchPw(c, 'ver'); } catch (e) { return P.toast(e.message, 'err'); }
    P.render();
    setTimeout(() => { if (c.id in s.shown) { delete s.shown[c.id]; if (P.state.route.page === 'certificados') P.render(); } }, 20000);
  };
  A.certCopy = async el => {
    const c = list().find(x => x.id === el.dataset.id); if (!c) return;
    try { const pw = await fetchPw(c, 'copiar'); await navigator.clipboard.writeText(pw); P.toast('Senha copiada.'); } catch (e) { P.toast(e.message || 'Não foi possível copiar.', 'err'); }
  };
  const setPw = (c, pw) => { // pw: texto novo, '' = não mexe, null = apagar
    if (!rpc) { if (pw !== '') c.password = pw || ''; return; }
    if (pw === '') return;
    rpc('cert_set_password', { p_id: c.id, p_pw: pw }).then(r => { if (r.error) P.toast('A senha não foi salva: ' + r.error.message, 'err'); });
  };
  // quem consultou as senhas (diretoria e gerência)
  A.certLog = async () => {
    if (!P.isGlobal(U())) return;
    if (!rpc) return P.toast('O registro de consultas existe só no sistema real.', 'err');
    const { data, error } = await rpc('cert_access_list');
    if (error) return P.toast(error.message, 'err');
    P.ui.modal({ title: 'Consultas às senhas dos certificados', submit: 'Fechar', body: (data || []).length ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>Quando</th><th>Quem</th><th>Empresa</th><th>Ação</th></tr></thead><tbody>${data.map(r => `<tr><td class="nowrap">${esc(new Date(r.at).toLocaleString('pt-BR'))}</td><td>${esc(r.user_name || '—')}</td><td>${esc(r.company || '—')}</td><td>${esc(r.action === 'copiar' ? 'Copiou' : 'Viu')}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">Ninguém consultou ainda.</p>', onSubmit: () => { } });
  };

  const $v = s => String((document.querySelector(s) || {}).value || '').trim();
  const form = c => `<div class="fgrid">
    <label class="field span3"><span>Empresa</span><input id="ce-co" maxlength="160" value="${esc(c.company || '')}"></label>
    <label class="field"><span>Tipo</span><select id="ce-type">${['A1', 'A3', 'e-CNPJ', 'e-CPF', 'Outro'].concat(c.type && !['A1', 'A3', 'e-CNPJ', 'e-CPF', 'Outro'].includes(c.type) ? [c.type] : []).map(t => `<option ${((c.type || 'A1') === t) ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
    <label class="field"><span>Vencimento</span><input type="date" id="ce-val" value="${esc(c.validity || '')}"></label>
    <label class="field"><span>Localização</span><input id="ce-loc" maxlength="80" value="${esc(c.location || 'Arquivo')}" placeholder="Arquivo, token, cartão…"></label>
    <label class="field span3"><span>Senha${c.hasPassword || c.password ? ' <small>(deixe em branco para manter a atual)</small>' : ''}</span><input id="ce-pw" maxlength="120" value="" autocomplete="new-password"></label>
    <label class="field span3"><span>Anotação (opcional)</span><input id="ce-note" maxlength="200" value="${esc(c.note || '')}"></label></div>`;
  const save = (u, c, isNew) => {
    const company = $v('#ce-co'); if (company.length < 2) throw new Error('Informe a empresa.');
    const pw = $v('#ce-pw');
    Object.assign(c, { company, type: $v('#ce-type'), validity: $v('#ce-val'), location: $v('#ce-loc'), note: $v('#ce-note') });
    if (rpc) delete c.password; // no sistema real a senha não fica no documento
    if (pw) c.hasPassword = true;
    c.by = u.id; c.at = Date.now();
    setPw(c, pw);
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
    list().splice(list().indexOf(c), 1); setPw(c, null); P.audit(u, 'Certificado excluído', '', c.company); P.store.save(); P.render();
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

  // guia de novidade (mesmo estilo do tour do site): aponta o item do menu, uma vez para cada pessoa
  const SEEN = () => 'prumo.certGuia.' + ((U() || {}).id || '');
  const guide = () => {
    const u = U(); if (!u || !u.tourDone || P.certMissing || !certs().length || !P.fx || !P.fx.guide) return;
    try { if (localStorage.getItem(SEEN()) === '1') return; } catch (e) { return; }
    const grp = document.querySelector('.nav-grp[data-g=clientes]');
    if (grp && grp.classList.contains('shut')) { const h = grp.querySelector('.nav-grp-h'); if (h) h.click(); } // abre o grupo Clientes para mostrar o item
    setTimeout(() => {
      P.fx.guide([['.nav-a[data-go=certificados]', 'Novo: Certificados digitais', 'Aqui você vê a validade e a senha dos certificados das empresas. A senha fica oculta e cada consulta é registrada. Quem a diretoria liberar também cadastra e altera. Clique em Concluir para abrir.']], done => {
        try { localStorage.setItem(SEEN(), '1'); } catch (e) { }
        if (done && P.state.route.page !== 'certificados') P.go('certificados');
      });
    }, 500);
  };
  setTimeout(guide, 6000);
})(window.P);
