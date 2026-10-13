/*
 * Prumo — Comunicação interna (canais e conversas diretas)
 *
 * Quem fala com quem:
 *  - Gestor ↔ funcionários do próprio departamento (canal do departamento e conversa direta)
 *  - Gestores ↔ gestores e gerente do escritório (canal "Gestores e gerência" e conversa direta)
 *  - Diretoria ↔ diretoria (canal "Diretoria")
 *  - Diretoria ↔ gerente (canal "Diretoria e gerência")
 *  - Diretoria ↔ gestores (canal "Diretoria e gestores")
 *  - Diretoria → todos (canal "Geral": só a diretoria publica; todos leem)
 * Funcionários não conversam diretamente entre si nem com gerência ou diretoria.
 * Um diretor que também é gestor de um departamento (P.ledDept) fala com a equipe dele como gestor.
 * Carregado antes do app.js: a página é V.comunicacao e as ações entram por P.ext.actions.
 */
'use strict';
(function (P) {
  const D = P.date, esc = P.esc, V = P.V, icon = V.icon;
  const db = () => P.store.db;
  const S = () => P.state;
  const $ = (s, r = document) => r.querySelector(s);
  const A = P.ext.actions;
  const deny = msg => { throw new P.AccessError(msg); };
  const active = () => db().users.filter(x => x.active !== false);
  const msgs = () => (db().messages = db().messages || []);
  const reads = () => (db().chatReads = db().chatReads || {});
  const st = () => (S().chat = S().chat || { conv: null, q: '', drafts: {} });

  /* ---------- Regras ---------- */
  const leads = (m, e) => { const d = P.ledDept(m); return !!d && e.role === 'employee' && e.deptId === d.id; };
  const canChat = (a, b) => {
    if (!a || !b || a.id === b.id || a.active === false || b.active === false) return false;
    if (a.role === 'employee' || b.role === 'employee') {
      const [e, o] = a.role === 'employee' ? [a, b] : [b, a];
      return o.role !== 'employee' && leads(o, e);
    }
    return ['manager-manager', 'manager-office', 'admin-admin', 'admin-office', 'admin-manager'].includes([a.role, b.role].sort().join('-'));
  };
  const CHANNELS = [
    { id: 'geral', name: 'Geral', icon: 'megaphone', desc: 'Comunicados da diretoria para todo o escritório. Só a diretoria publica; todos leem.', members: () => active(), canPost: u => u.role === 'admin' },
    { id: 'diretoria', name: 'Diretoria', icon: 'shield', desc: 'Conversa entre os diretores.', members: () => active().filter(x => x.role === 'admin'), canPost: () => true },
    { id: 'dir-gerencia', name: 'Diretoria e gerência', icon: 'building', desc: 'Diretoria e gerente do escritório.', members: () => active().filter(x => x.role === 'admin' || x.role === 'office'), canPost: () => true },
    { id: 'dir-gestores', name: 'Diretoria e gestores', icon: 'users', desc: 'Diretoria e gestores de departamento.', members: () => active().filter(x => x.role === 'admin' || x.role === 'manager'), canPost: () => true },
    { id: 'gestao', name: 'Gestores e gerência', icon: 'users', desc: 'Gestores de departamento e gerente do escritório.', members: () => active().filter(x => x.role === 'manager' || x.role === 'office'), canPost: () => true }
  ];
  const deptChannel = d => {
    const m = d.managerId && P.user(d.managerId);
    if (!m || m.active === false) return null;
    return { id: 'dept:' + d.id, name: d.name, icon: 'briefcase', dept: d, desc: `Gestor(a) ${m.name} e a equipe de ${d.name}.`, members: () => active().filter(x => x.id === m.id || (x.role === 'employee' && x.deptId === d.id)), canPost: () => true };
  };
  const channelsFor = u => {
    const list = CHANNELS.filter(c => c.members().some(x => x.id === u.id));
    const d = u.role === 'employee' ? P.dept(u.deptId) : P.ledDept(u);
    const dc = d && deptChannel(d);
    if (dc && dc.members().some(x => x.id === u.id)) list.splice(1, 0, dc);
    return list;
  };
  const dmId = (a, b) => 'dm:' + [a, b].sort().join('|');
  const dmOther = (u, conv) => { const ids = conv.slice(3).split('|'); return P.user(ids[0] === u.id ? ids[1] : ids[0]); };
  // Resolve uma conversa para quem consulta (null se não tiver acesso)
  const resolve = (u, conv) => {
    if (!conv) return null;
    if (conv.startsWith('dm:')) {
      const ids = conv.slice(3).split('|'); if (!ids.includes(u.id)) return null;
      const o = dmOther(u, conv); if (!o) return null;
      const ok = canChat(u, o);
      // conversa não permitida pelas regras e sem histórico: não existe para quem consulta
      if (!ok && !msgs().some(m => m.conv === conv)) return null;
      return { id: conv, dm: true, other: o, name: o.name, desc: P.ROLES[o.role] + (P.dept(o.deptId) ? ' · ' + P.dept(o.deptId).name : ''), canPost: () => ok, readonly: !ok, members: () => [u, o] };
    }
    return channelsFor(u).find(c => c.id === conv) || null;
  };
  const lastRead = (u, conv) => (reads()[u.id] || {})[conv] || 0;
  const markRead = (u, conv) => {
    const ts = msgs().reduce((mx, m) => m.conv === conv && m.ts > mx ? m.ts : mx, 0);
    const r = reads()[u.id] = reads()[u.id] || {};
    if (ts && r[conv] !== ts) { r[conv] = ts; P.store.save(); }
  };
  const convsFor = u => {
    const ch = channelsFor(u).map(c => c.id);
    const dms = [...new Set(msgs().filter(m => m.conv.startsWith('dm:') && m.conv.slice(3).split('|').includes(u.id)).map(m => m.conv))];
    return ch.concat(dms);
  };
  const unreadIn = (u, conv) => { const lr = lastRead(u, conv); return msgs().filter(m => m.conv === conv && m.ts > lr && m.from !== u.id && !m.deleted).length; };

  P.chat = {
    canChat, channelsFor,
    contacts: u => active().filter(x => canChat(u, x)).sort((a, b) => P.LEVEL[b.role] - P.LEVEL[a.role] || a.name.localeCompare(b.name)),
    unread: u => u ? convsFor(u).reduce((n, c) => n + unreadIn(u, c), 0) : 0,
    send(u, conv, text) {
      const c = resolve(u, conv);
      if (!c && conv && conv.startsWith('dm:')) deny('Pelas regras de comunicação, vocês não podem conversar diretamente.');
      if (!c) deny('Você não participa desta conversa.');
      if (!c.canPost(u)) deny(c.id === 'geral' ? 'Somente a diretoria publica no canal Geral.' : 'Pelas regras de comunicação, esta conversa agora é só para leitura.');
      const t = String(text || '').trim();
      if (!t) deny('Escreva a mensagem.');
      if (t.length > 2000) deny('A mensagem pode ter no máximo 2.000 caracteres.');
      const m = { id: P.uid('m'), conv, from: u.id, text: t, at: D.stamp(), ts: Date.now() };
      msgs().push(m);
      reads()[u.id] = Object.assign(reads()[u.id] || {}, { [conv]: m.ts });
      P.store.save();
      return m;
    },
    remove(u, id) {
      const m = msgs().find(x => x.id === id);
      if (!m || m.from !== u.id) deny('Você só apaga as próprias mensagens.');
      m.deleted = true; m.text = ''; P.store.save();
    }
  };

  // Primeira vez: uma mensagem de boas-vindas no canal Geral para o teste não começar vazio
  const seedOnce = () => {
    const d = db(); if (!d || d.chatSeeded || P.isLive) return;
    const dir = d.users.find(x => x.role === 'admin' && x.active !== false);
    if (dir) d.messages = (d.messages || []).concat([{ id: P.uid('m'), conv: 'geral', from: dir.id, text: 'Bem-vindos à aba Comunicação! Aqui a diretoria publica os comunicados para todo o escritório. Cada departamento tem o seu canal com o gestor, e gestores, gerência e diretoria têm canais próprios.', at: D.stamp(), ts: Date.now() - 60000 }]);
    d.chatSeeded = true;
  };

  /* ---------- Página ---------- */
  const hm = ts => new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const dayLabel = ts => { const iso = D.iso(new Date(ts)), t = D.iso(P.today()); return iso === t ? 'Hoje' : iso === D.iso(D.add(P.today(), -1)) ? 'Ontem' : D.fmt(iso); };
  const lastMsg = conv => msgs().reduce((b, m) => m.conv === conv && (!b || m.ts > b.ts) ? m : b, null);
  const linkify = t => esc(t).replace(/\n/g, '<br>');

  V.comunicacao = u => {
    seedOnce();
    const c = st(), q = (c.q || '').toLowerCase();
    let cur = resolve(u, c.conv);
    if (!cur && c.conv) c.conv = null;
    const channels = channelsFor(u);
    const dms = [...new Set(msgs().filter(m => m.conv.startsWith('dm:') && m.conv.slice(3).split('|').includes(u.id)).map(m => m.conv))]
      .map(id => resolve(u, id)).filter(Boolean).sort((a, b) => ((lastMsg(b.id) || {}).ts || 0) - ((lastMsg(a.id) || {}).ts || 0));
    const contacts = P.chat.contacts(u).filter(x => !dms.some(d => d.other.id === x.id));
    const item = (conv, label, sub, ic, av) => {
      const un = unreadIn(u, conv), lm = lastMsg(conv);
      return `<button type="button" class="cv ${c.conv === conv ? 'on' : ''} ${un ? 'unread' : ''}" data-act="chatOpen" data-id="${esc(conv)}">
        ${av ? V.avatar(av) : `<span class="cv-ic">${icon(ic)}</span>`}
        <span class="cv-t"><b>${esc(label)}</b><small>${lm ? (lm.deleted ? 'Mensagem apagada' : esc((lm.from === u.id ? 'Você: ' : P.firstName((P.user(lm.from) || {}).name || '') + ': ') + lm.text.slice(0, 60))) : esc(sub)}</small></span>
        ${un ? `<em class="cv-n">${un}</em>` : lm ? `<span class="cv-time">${dayLabel(lm.ts) === 'Hoje' ? hm(lm.ts) : dayLabel(lm.ts)}</span>` : ''}
      </button>`;
    };
    const match = s => !q || String(s).toLowerCase().includes(q);
    const side = `<aside class="chat-side">
      <label class="in-ic chat-q">${icon('search')}<input type="search" id="chat-q" placeholder="Buscar conversa ou pessoa" value="${esc(c.q || '')}" data-set="chat.q" data-live></label>
      <div class="cv-list">
        <div class="cv-g">Canais</div>
        ${channels.filter(ch => match(ch.name)).map(ch => item(ch.id, ch.name, ch.desc, ch.icon)).join('') || '<p class="cv-none">Nenhum canal.</p>'}
        <div class="cv-g">Conversas diretas</div>
        ${dms.filter(d => match(d.name)).map(d => item(d.id, d.name, d.desc, 'user', d.other)).join('')}
        ${contacts.filter(x => match(x.name)).map(x => `<button type="button" class="cv new" data-act="chatOpen" data-id="${esc(dmId(u.id, x.id))}">${V.avatar(x)}<span class="cv-t"><b>${esc(x.name)}</b><small>${esc(P.ROLES[x.role] + (P.dept(x.deptId) && x.role !== 'admin' && x.role !== 'office' ? ' · ' + P.dept(x.deptId).name : ''))}</small></span><span class="cv-start">${icon('plus')}</span></button>`).join('')}
        ${!dms.length && !contacts.length ? '<p class="cv-none">Pelas regras de comunicação, você não tem conversas diretas disponíveis.</p>' : ''}
      </div>
    </aside>`;
    let main;
    if (!cur) {
      main = `<section class="chat-main empty">${V.empty('Escolha um canal ou uma pessoa para começar.', 'message')}
        <div class="chat-rules"><b>Quem fala com quem</b><ul>
          <li>Gestor(a) e a equipe do próprio departamento</li><li>Gestores entre si e com o gerente do escritório</li>
          <li>Diretoria entre si, com o gerente e com os gestores</li><li>Diretoria com todo o escritório no canal Geral</li></ul></div></section>`;
    } else {
      const list = msgs().filter(m => m.conv === cur.id).sort((a, b) => a.ts - b.ts);
      const members = cur.members();
      const canPost = cur.canPost(u);
      let lastDay = '', lastFrom = '', lastTs = 0;
      const geral = cur.id === 'geral';
      const total = members.length;
      const body = list.length ? list.map(m => {
        const who = P.user(m.from) || { name: '—', id: 'x' }, mine = m.from === u.id, dl = dayLabel(m.ts);
        const sep = dl !== lastDay ? `<div class="msg-day"><span>${dl}</span></div>` : '';
        const cont = !sep && lastFrom === m.from && m.ts - lastTs < 5 * 60000;
        lastDay = dl; lastFrom = m.from; lastTs = m.ts;
        const seen = geral && u.role === 'admin' ? members.filter(x => x.id !== m.from && lastRead(x, cur.id) >= m.ts).length : null;
        return `${sep}<div class="msg ${mine ? 'me' : ''} ${cont ? 'cont' : ''} ${geral ? 'notice' : ''}">
          ${mine || cont ? '<span class="msg-av"></span>' : `<span class="msg-av">${V.avatar(who)}</span>`}
          <div class="msg-b">${cont ? '' : `<div class="msg-h"><b>${mine ? 'Você' : esc(who.name)}</b>${!cur.dm ? `<small>${esc(P.ROLES[who.role] || '')}</small>` : ''}<time>${hm(m.ts)}</time></div>`}
            <div class="msg-txt ${m.deleted ? 'del' : ''}">${m.deleted ? icon('x') + ' Mensagem apagada' : linkify(m.text)}</div>
            ${seen != null ? `<small class="msg-seen">${icon('check')} Visto por ${seen} de ${total - 1}</small>` : ''}
          </div>
          ${mine && !m.deleted ? V.ibtn('trash', 'Apagar mensagem', { act: 'chatDelete', cls: 'msg-del', attrs: `data-id="${m.id}"` }) : ''}
        </div>`;
      }).join('') : `<div class="msg-empty">${icon('message')}<p>${cur.dm ? 'Comece a conversa com ' + esc(P.firstName(cur.name)) + '.' : 'Nenhuma mensagem neste canal ainda.'}</p></div>`;
      main = `<section class="chat-main">
        <header class="chat-h">
          <button type="button" class="ibtn chat-back" data-act="chatOpen" data-id="" aria-label="Voltar para as conversas">${icon('left')}</button>
          ${cur.dm ? V.avatar(cur.other) : `<span class="cv-ic">${icon(cur.icon)}</span>`}
          <div><b>${esc(cur.name)}</b><small>${esc(cur.dm ? cur.desc : cur.desc + ' · ' + total + ' participante' + (total > 1 ? 's' : ''))}</small></div>
        </header>
        <div class="chat-msgs" id="chat-msgs">${body}</div>
        ${canPost ? `<div class="chat-in"><textarea id="chat-text" rows="1" placeholder="${geral ? 'Escreva um comunicado para todo o escritório…' : 'Escreva uma mensagem…'}" maxlength="2000">${esc((c.drafts || {})[cur.id] || '')}</textarea>${V.btn('Enviar', { act: 'chatSend', icon: 'right', cls: 'primary' })}</div>
          <p class="chat-hint">Enter envia · Shift+Enter quebra a linha</p>`
        : `<div class="chat-ro">${icon('lock')} ${geral ? 'Somente a diretoria publica no canal Geral.' : 'Pelas regras de comunicação, esta conversa está só para leitura.'}</div>`}
      </section>`;
      markRead(u, cur.id);
    }
    return `${V.pageHead('Comunicação', 'Canais por departamento e por nível, e conversas diretas seguindo a hierarquia do escritório.')}
      <div class="chat ${cur ? 'has-conv' : ''}">${side}${main}</div>`;
  };

  /* ---------- Ações ---------- */
  const scrollEnd = () => { const box = $('#chat-msgs'); if (box) box.scrollTop = box.scrollHeight; };
  A.chatOpen = el => {
    const c = st(), id = el.dataset.id || null;
    if (id && !resolve(S().user, id)) return P.toast('Você não participa desta conversa.', 'err');
    c.conv = id; P.render();
    requestAnimationFrame(() => { scrollEnd(); const t = $('#chat-text'); if (t && innerWidth > 1020) t.focus(); });
  };
  A.chatSend = () => {
    const c = st(), t = $('#chat-text'); if (!t || !c.conv) return;
    P.ui.guard(() => {
      P.chat.send(S().user, c.conv, t.value);
      c.drafts[c.conv] = '';
      P.render();
      requestAnimationFrame(() => { scrollEnd(); const n = $('#chat-text'); if (n) n.focus(); });
    });
  };
  A.chatDelete = el => P.ui.guard(() => { P.chat.remove(S().user, el.dataset.id); P.render(); });
  // rascunho por conversa (não se perde se a tela redesenhar) e Enter para enviar
  document.addEventListener('input', ev => {
    if (ev.target.id === 'chat-text') {
      st().drafts[st().conv] = ev.target.value;
      ev.target.style.height = 'auto'; ev.target.style.height = Math.min(160, ev.target.scrollHeight) + 'px';
    }
  });
  document.addEventListener('keydown', ev => {
    if (ev.target.id === 'chat-text' && ev.key === 'Enter' && !ev.shiftKey && !ev.isComposing) { ev.preventDefault(); A.chatSend(); }
  });
  // Ao abrir a página, a conversa já aparece no fim
  const origAfter = P.fx.afterRender;
  P.fx.afterRender = routeChanged => { origAfter(routeChanged); if (S().user && S().route.page === 'comunicacao') scrollEnd(); };

  // Mensagens que chegam de outra aba: aviso no canto (se a conversa não estiver aberta)
  let lastSeenTs = Date.now();
  const onExternal = () => {
    if (!S().user) return;
    setTimeout(() => {
      const u = S().user; if (!u) return;
      const mine = new Set(convsFor(u));
      const fresh = msgs().filter(m => m.ts > lastSeenTs && m.from !== u.id && mine.has(m.conv) && !m.deleted);
      lastSeenTs = Date.now();
      fresh.filter(m => !(S().route.page === 'comunicacao' && st().conv === m.conv)).slice(-2).forEach(m => {
        const c = resolve(u, m.conv), who = P.user(m.from);
        P.fx.popNotif({ icon: 'message', title: c.dm ? 'Mensagem de ' + who.name : 'Nova mensagem em ' + c.name, text: (c.dm ? '' : P.firstName(who.name) + ': ') + m.text.slice(0, 120) }, { onClick: () => { st().conv = m.conv; P.go('comunicacao'); } });
      });
      if (S().route.page === 'comunicacao') scrollEnd();
    }, 30);
  };
  window.addEventListener('storage', ev => { if (!P.isLive && ev.key === 'prumo.db.v3') onExternal(); });
  window.addEventListener('prumo:remote', onExternal);
})(window.P);
