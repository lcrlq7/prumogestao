/* Prumo — Comunicação: grupos personalizados (como no WhatsApp). Qualquer pessoa cria um grupo e escolhe quem entra;
 * o dono renomeia, adiciona, remove e apaga; os participantes podem sair. Os grupos ficam na coleção chat_groups (tabela chat_groups). */
'use strict';
(function (P) {
  const V = P.V, A = P.actions, icon = V.icon, esc = P.esc;
  const S = () => P.state, st = () => (S().chat = S().chat || { conv: null, q: '', drafts: {} });
  const db = () => P.store.db, U = () => S().user;
  const groups = () => (db().chatGroups = db().chatGroups || []);
  const available = () => !(P.isLive && P.groupsMissing);
  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const mine = u => groups().filter(g => (g.members || []).includes(u.id));

  // os grupos entram na lista de canais de quem participa (lista, "não lidas" e abertura usam o mesmo caminho dos canais)
  P.chatGroups = {
    forUser: u => mine(u).map(g => ({
      id: g.id, group: true, owner: g.owner, name: g.name, icon: 'users',
      desc: 'Grupo criado por ' + ((P.user(g.owner) || {}).name || '—') + '.',
      canPost: () => true,
      members: () => (g.members || []).map(id => P.user(id)).filter(x => x && x.active !== false)
    })),
    available
  };

  const pickerRows = (u, sel) => P.chat.contacts(u).map(x => `<label class="grp-row" data-q="${esc(norm(x.name + ' ' + (P.dept(x.deptId) || {}).name))}"><input type="checkbox" class="grp-m" value="${esc(x.id)}" ${sel.has(x.id) ? 'checked' : ''}>${V.avatar(x, 'sm')}<span><b>${esc(x.name)}</b><small>${esc(P.ROLES[x.role])}${P.dept(x.deptId) ? ' · ' + esc(P.dept(x.deptId).name) : ''}</small></span></label>`).join('');
  document.addEventListener('input', ev => {
    if (!ev.target || ev.target.id !== 'grp-q') return;
    const q = norm(ev.target.value);
    document.querySelectorAll('.grp-row').forEach(r => { r.hidden = !!q && !r.dataset.q.includes(q); });
  });
  const form = (u, g) => {
    const sel = new Set(g ? g.members.filter(id => id !== u.id) : []);
    return `<div class="fgrid"><label class="field span3"><span>Nome do grupo</span><input id="grp-name" maxlength="60" placeholder="Ex.: Equipe do almoço" value="${esc(g ? g.name : '')}"></label></div>
      <p class="fine" style="margin:10px 0 6px">Quem participa <span class="muted" id="grp-n"></span></p>
      <label class="in-ic chat-q" style="margin:0 0 8px">${icon('search')}<input type="search" id="grp-q" placeholder="Buscar pessoa" autocomplete="off"></label>
      <div class="grp-list">${pickerRows(u, sel)}</div>`;
  };
  const chosen = () => [...document.querySelectorAll('.grp-m:checked')].map(i => i.value);
  document.addEventListener('change', ev => { if (ev.target && ev.target.classList && ev.target.classList.contains('grp-m')) { const n = document.getElementById('grp-n'); if (n) n.textContent = '(' + chosen().length + ' selecionada(s) além de você)'; } });

  A.chatGroupNew = () => {
    const u = U(); if (!u) return;
    if (!available()) return P.toast('Os grupos ainda não estão ativados no banco (falta rodar o SQL enviado no chat).', 'err');
    P.ui.modal({
      title: 'Novo grupo', submit: 'Criar grupo', body: form(u, null),
      onSubmit: () => {
        const name = document.getElementById('grp-name').value.trim(), ids = chosen();
        if (name.length < 2) throw new Error('Dê um nome ao grupo.');
        if (!ids.length) throw new Error('Escolha pelo menos uma pessoa.');
        const g = { id: 'grp:' + P.uid('g'), name, owner: u.id, members: [u.id].concat(ids), createdAt: P.date.stamp() };
        groups().push(g); P.store.save(); P.toast('Grupo "' + name + '" criado.');
        setTimeout(() => P.actions.chatOpen({ dataset: { id: g.id } }), 0);
      }
    });
  };
  A.chatGroupManage = () => {
    const u = U(), g = groups().find(x => x.id === st().conv); if (!u || !g || g.owner !== u.id) return;
    P.ui.modal({
      title: 'Gerenciar grupo', submit: 'Salvar',
      body: form(u, g) + `<p style="margin-top:14px"><button type="button" class="btn ghost danger" data-act="chatGroupDelete">${icon('trash')}<span>Apagar o grupo</span></button></p>`,
      onSubmit: () => {
        const name = document.getElementById('grp-name').value.trim(), ids = chosen();
        if (name.length < 2) throw new Error('Dê um nome ao grupo.');
        if (!ids.length) throw new Error('O grupo precisa de pelo menos mais uma pessoa. Para encerrar, apague o grupo.');
        g.name = name; g.members = [u.id].concat(ids); P.store.save(); P.toast('Grupo atualizado.'); P.render();
      }
    });
    setTimeout(() => { const n = document.getElementById('grp-n'); if (n) n.textContent = '(' + chosen().length + ' selecionada(s) além de você)'; }, 0);
  };
  A.chatGroupDelete = () => {
    const u = U(), g = groups().find(x => x.id === st().conv); if (!u || !g || g.owner !== u.id) return;
    if (!confirm('Apagar o grupo "' + g.name + '"? Ele some para todos os participantes.')) return;
    db().chatGroups = groups().filter(x => x.id !== g.id); st().conv = null; P.ui.closeModal(); P.store.save(); P.toast('Grupo apagado.'); P.render();
  };
  A.chatGroupLeave = async () => {
    const u = U(), g = groups().find(x => x.id === st().conv); if (!u || !g) return;
    if (!confirm('Sair do grupo "' + g.name + '"?')) return;
    if (P.isLive && P.backend && P.backend.client) {
      const { error } = await P.backend.client.rpc('leave_group', { c: g.id });
      if (error) return P.toast('Não foi possível sair do grupo: ' + error.message, 'err');
      st().conv = null; await P.backend.reload(); P.toast('Você saiu do grupo.'); P.render();
    } else {
      g.members = g.members.filter(id => id !== u.id);
      if (!g.members.length) db().chatGroups = groups().filter(x => x.id !== g.id); else if (g.owner === u.id) g.owner = g.members[0];
      st().conv = null; P.store.save(); P.toast('Você saiu do grupo.'); P.render();
    }
  };

  // botões do grupo no cabeçalho da conversa e "Novo grupo" na lista
  const prev = V.comunicacao;
  V.comunicacao = function (u) {
    let html = prev.apply(this, arguments);
    html = html.replace('<div class="chat-side-h">', '<div class="chat-side-h">').replace(/(<div class="chat-side-h">[\s\S]*?)(<button type="button" class="ibtn" data-act="chatNewDm")/, '$1' + V.ibtn('users', 'Novo grupo', { act: 'chatGroupNew', cls: 'chat-grp-new' }) + '$2');
    // linha bem visível no começo da lista, além do botão do cabeçalho
    html = html.replace('<div class="cv-list">', '<div class="cv-list"><button type="button" class="cv new-grp" data-act="chatGroupNew"><span class="cv-ic">' + icon('plus') + '</span><span class="cv-t"><b>Novo grupo</b><small>Crie um grupo e escolha quem entra</small></span></button>');
    const g = groups().find(x => x.id === st().conv);
    if (g && (g.members || []).includes(u.id)) {
      const b = g.owner === u.id ? V.ibtn('edit', 'Gerenciar grupo', { act: 'chatGroupManage', cls: 'chat-grp-btn' }) : '';
      html = html.replace(/<\/header>/, b + V.ibtn('logout', 'Sair do grupo', { act: 'chatGroupLeave', cls: 'chat-grp-btn' }) + '</header>');
    }
    return html;
  };
})(window.P);
