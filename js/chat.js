/*
 * Prumo — Comunicação interna (canais e conversas diretas)
 *
 * Conversas privadas: quaisquer duas pessoas ativas.
 * Canais (seguem a hierarquia):
 *  - Departamento: gestor(a) e a equipe
 *  - "Gestores e gerência", "Diretoria", "Diretoria e gerência", "Diretoria e gestores"
 *  - "Geral": só a diretoria publica; todos leem
 * Um diretor que também é gestor de um departamento (P.ledDept) participa do canal da equipe dele.
 * Mensagens podem ter emojis; figurinhas são enviadas como "::fig:<id>::".
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
  // mensagem que não aparece: apagada para todos, apagada só para mim ou de uma conversa que eu limpei
  const gone = m => {
    if (m.deleted) return true;
    const u = S().user, r = u && reads()[u.id];
    return !!r && ((r._hid && r._hid[m.id]) || (r._clr && r._clr[m.conv] >= m.ts));
  };

  /* ---------- Regras ---------- */
  // Conversa privada: quaisquer duas pessoas ativas (os canais continuam seguindo a hierarquia)
  const canChat = (a, b) => !!a && !!b && a.id !== b.id && a.active !== false && b.active !== false;
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
    if (P.chatGroups) list.push(...P.chatGroups.forUser(u)); // grupos personalizados (js/chatgroups.js)
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
      return { id: conv, dm: true, other: o, name: o.name, desc: P.ROLES[o.role] + (P.dept(o.deptId) ? ' · ' + (P.dept(o.deptId) || { name: '—' }).name : ''), canPost: () => ok, readonly: !ok, members: () => [u, o] };
    }
    return channelsFor(u).find(c => c.id === conv) || null;
  };
  // Em produção cada pessoa só lê as próprias marcações; para o "Visto por" do Geral a diretoria consulta o servidor
  let geralReads = null, geralAsked = 0;
  const loadGeralReads = () => {
    if (!P.isLive || !P.backend || Date.now() - geralAsked < 15000) return;
    geralAsked = Date.now();
    P.backend.client.rpc('geral_reads').then(({ data, error }) => {
      if (error || !data) return;
      const changed = JSON.stringify(data) !== JSON.stringify(geralReads);
      geralReads = data;
      if (changed && S().route.page === 'comunicacao' && st().conv === 'geral') P.render();
    });
  };
  const lastRead = (u, conv) => {
    if (P.isLive && conv === 'geral' && geralReads && u.id !== (S().user || {}).id) return Number(geralReads[u.id]) || 0;
    return (reads()[u.id] || {})[conv] || 0;
  };
  const markRead = (u, conv) => {
    const ts = msgs().reduce((mx, m) => m.conv === conv && m.ts > mx ? m.ts : mx, 0);
    const r = reads()[u.id] = reads()[u.id] || {};
    if (ts && r[conv] !== ts) { r[conv] = ts; P.store.save(); }
  };
  const convsFor = u => {
    const ch = channelsFor(u).map(c => c.id);
    // só conversas que a pessoa consegue abrir (ex.: com alguém que foi removido do sistema não contam como "não lidas")
    const dms = [...new Set(msgs().filter(m => m.conv.startsWith('dm:') && m.conv.slice(3).split('|').includes(u.id)).map(m => m.conv))].filter(id => resolve(u, id));
    return ch.concat(dms);
  };
  const unreadIn = (u, conv) => { const lr = lastRead(u, conv); return msgs().filter(m => m.conv === conv && m.ts > lr && m.from !== u.id && !gone(m)).length; };

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
    },
    // só para quem pede: a mensagem some da tela dele e continua para os outros
    hide(u, id) {
      const r = reads()[u.id] = reads()[u.id] || {};
      (r._hid = r._hid || {})[id] = 1; P.store.save();
    },
    clear(u, conv) {
      const r = reads()[u.id] = reads()[u.id] || {};
      (r._clr = r._clr || {})[conv] = Date.now(); P.store.save();
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
  const lastMsg = conv => msgs().reduce((b, m) => m.conv === conv && !gone(m) && (!b || m.ts > b.ts) ? m : b, null);
  const linkify = t => esc(t).replace(/\n/g, '<br>');

  /* ---------- Emojis e figurinhas ---------- */
  const EMOJI = [
    ['Rostos', 'smile', '😀 😃 😄 😁 😆 😅 🤣 😂 🙂 😉 😊 😇 🥰 😍 🤩 😘 😋 😜 🤪 😎 🤓 🧐 🤔 🤨 😐 😶 🙄 😏 😬 😌 😴 🤤 😷 🤒 🤯 🥳 🥺 😢 😭 😤 😡 🤬 😱 😨 😰 😳 🤗 🤭 🫡 🤫 🙃 🫠 😮‍💨'],
    ['Gestos', 'hand', '👍 👎 👌 ✌️ 🤞 🤟 🤘 🤙 👋 🙌 👏 🙏 🤝 💪 👊 ✊ 🫶 👀 🧠 ☝️ 👆 👇 👉 👈 ✋ 🤚 🖐️ 🫵'],
    ['Corações', 'heart', '❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💖 💗 💓 💞 💕 💝 ❣️ 💔 ❤️‍🔥 ✨ 🌟 ⭐ 💫 🔥 💯'],
    ['Trabalho', 'briefcase', '💼 📊 📈 📉 🧾 💰 💵 🪙 🏦 📑 📄 📃 📋 📁 📂 🗂️ 📌 📎 🖇️ ✏️ 📝 🖊️ 📅 📆 🗓️ ⏰ ⏳ ⌛ 🕐 💻 🖥️ 🖨️ ⌨️ 📱 ☎️ 📞 📧 📨 📬 🔍 🔒 🔑 ✅ ☑️ ❌ ⚠️ 🚨 📢 💡 🎯 🏆 🥇 🎖️ 🚀'],
    ['Comemoração', 'medal', '🎉 🎊 🥳 🎂 🍰 🎁 🎈 🍾 🥂 🍻 ☕ 🍵 🍕 🍔 🍟 🍫 🍩 🍪 🍿 🌮 🥗 🍎 🍉 🏖️ 🌴 ✈️ 🏝️ ⛱️ 🌞 🌈 ☀️ 🌧️ ⛈️ ❄️ 🌙'],
    ['Símbolos', 'check', '✔️ ➕ ➖ ✖️ ➗ ❓ ❗ ‼️ ⁉️ 💬 💭 🗨️ 🔔 🔕 🆗 🆕 🆙 🔝 ⬆️ ⬇️ ➡️ ⬅️ 🔄 🔁 ▶️ ⏸️ ⏹️ 🔴 🟠 🟡 🟢 🔵 🟣 ⚫ ⚪']
  ];
  P.chat.EMOJI = EMOJI; // o mural usa a mesma lista no seletor de emojis
  const STICKERS = [
    ['sim', '✅', 'Sim!', '#2f8f5b'], ['nao', '❌', 'Não', '#dc2626'], ['talvez', '🤔', 'Talvez', '#d97706'], ['claro', '👍', 'Com certeza!', '#2f8f5b'],
    ['ok', '🆗', 'Ok!', '#1f6f9c'], ['nao-sei', '🤷', 'Não sei', '#64748b'], ['pode-ser', '🙂', 'Pode ser', '#0f766e'], ['depois', '🕒', 'Depois eu vejo', '#64748b'],
    ['agora', '⚡', 'Agora mesmo', '#ca8a04'], ['concordo', '🤝', 'Concordo', '#2f8f5b'], ['discordo', '🙅', 'Discordo', '#dc2626'], ['sem-problema', '😎', 'Sem problema', '#1f6f9c'],
    ['aguarde', '✋', 'Aguarde um instante', '#ca8a04'], ['pensando', '💭', 'Pensando…', '#64748b'], ['conferido', '🔎', 'Conferido', '#0f766e'], ['enviado', '📨', 'Enviado!', '#1f6f9c'],
    ['recebido', '📥', 'Recebido', '#2f8f5b'], ['pendente', '📌', 'Pendente', '#d97706'], ['quase', '🏁', 'Quase lá', '#7c3aed'], ['atrasado', '🐢', 'Atrasado…', '#7c4a2d'],
    ['socorro', '😱', 'Socorro!', '#dc2626'], ['calma', '🧘', 'Calma', '#0f766e'], ['dica', '💡', 'Dica!', '#d97706'], ['vamos', '🙌', 'Vamos nessa!', '#7c3aed'],
    ['palmas', '👏', 'Palmas!', '#d97706'], ['amei', '❤️', 'Amei!', '#dc2626'], ['kkk', '🤣', 'Kkkkk', '#ca8a04'], ['que-pena', '😢', 'Que pena', '#64748b'],
    ['cheguei', '📍', 'Cheguei!', '#2f8f5b'], ['a-caminho', '🚗', 'A caminho', '#1f6f9c'], ['almoco', '🍽️', 'Hora do almoço', '#ea580c'], ['boa-noite', '🌙', 'Boa noite!', '#4338ca'],
    ['bom-fds', '🏖️', 'Bom fim de semana', '#db2777'], ['bom-descanso', '😴', 'Bom descanso', '#4338ca'],
    ['bom-trabalho', '👏', 'Bom trabalho!', '#2f8f5b'], ['obrigado', '🙏', 'Obrigado(a)!', '#1f6f9c'], ['parabens', '🎉', 'Parabéns!', '#c2410c'],
    ['prazo', '⏰', 'Prazo cumprido', '#2f8f5b'], ['fechamento', '📊', 'Fechamento OK', '#1f6f9c'], ['missao', '🚀', 'Missão cumprida', '#7c3aed'],
    ['bom-dia', '☀️', 'Bom dia!', '#d97706'], ['boa-tarde', '🌤️', 'Boa tarde!', '#ea580c'], ['cafe', '☕', 'Café?', '#7c4a2d'],
    ['reuniao', '📅', 'Reunião?', '#1f6f9c'], ['entendido', '👌', 'Entendido!', '#2f8f5b'], ['ja-volto', '⏳', 'Já volto', '#64748b'],
    ['urgente', '🚨', 'Urgente!', '#dc2626'], ['ajuda', '🆘', 'Me ajuda?', '#dc2626'], ['forca', '💪', 'Força, equipe!', '#7c3aed'],
    ['sexta', '🥳', 'Feliz sexta!', '#db2777'], ['top', '🏆', 'Você é top!', '#d97706'], ['haha', '😂', 'Hahaha', '#ca8a04'],
    ['revisar', '🔍', 'Vou revisar', '#0f766e'], ['feito', '✅', 'Feito!', '#2f8f5b']
  ];
  const STK = Object.fromEntries(STICKERS.map(s => [s[0], s]));
  const stickerOf = t => { const m = /^::fig:([a-z0-9-]+)::$/.exec(String(t || '')); return m && STK[m[1]] ? STK[m[1]] : null; };
  const stickerHtml = s => `<div class="stk" style="--stk:${s[3]}" role="img" aria-label="Figurinha: ${esc(s[2])}"><span class="stk-e">${s[1]}</span><span class="stk-t">${esc(s[2])}</span></div>`;
  const previewText = t => stickerOf(t) ? 'Figurinha ' + stickerOf(t)[1] : t;
  const recent = {
    get: () => { try { return JSON.parse(localStorage.getItem('prumo.emojiRecent') || '[]'); } catch (e) { return []; } },
    add: e => { try { const l = [e].concat(recent.get().filter(x => x !== e)).slice(0, 24); localStorage.setItem('prumo.emojiRecent', JSON.stringify(l)); } catch (e2) { } }
  };
  const pickerHtml = kind => {
    if (kind === 'fig') return `<div class="chat-pick" role="dialog" aria-label="Figurinhas"><div class="cp-h"><b>Figurinhas</b>${V.ibtn('x', 'Fechar', { act: 'chatPanel', attrs: 'data-k=""' })}</div>
      <div class="cp-stk">${STICKERS.map(s => `<button type="button" class="cp-s" data-act="chatSticker" data-id="${s[0]}" title="${esc(s[2])}">${stickerHtml(s)}</button>`).join('')}</div></div>`;
    const rec = recent.get();
    const cats = (rec.length ? [['Recentes', 'clock', rec.join(' ')]] : []).concat(EMOJI);
    return `<div class="chat-pick" role="dialog" aria-label="Emojis"><div class="cp-h"><input type="search" id="cp-q" placeholder="Buscar emoji (ex.: café, ok, festa)" autocomplete="off">${V.ibtn('x', 'Fechar', { act: 'chatPanel', attrs: 'data-k=""' })}</div>
      <div class="cp-tabs">${cats.map((c, i) => `<button type="button" data-cpt="${i}" title="${c[0]}">${icon(c[1])}</button>`).join('')}</div>
      <div class="cp-body" id="cp-body">${cats.map((c, i) => `<div class="cp-cat" id="cpc-${i}"><small>${c[0]}</small><div class="cp-grid">${c[2].split(' ').filter(Boolean).map(e => `<button type="button" class="cp-e" data-act="chatEmoji" data-e="${e}">${e}</button>`).join('')}</div></div>`).join('')}</div></div>`;
  };
  // palavras para a busca de emojis (português)
  const EMOJI_WORDS = { 'café': '☕', 'cafe': '☕', 'ok': '👌 ✅ 🆗 👍', 'festa': '🎉 🥳 🎊', 'parabens': '🎉 👏 🥳', 'parabéns': '🎉 👏 🥳', 'obrigado': '🙏 🤝', 'obrigada': '🙏 🤝', 'riso': '😂 🤣 😆', 'rir': '😂 🤣', 'amor': '❤️ 🥰 😍', 'coração': '❤️ 💖', 'triste': '😢 😭 🥺', 'raiva': '😡 🤬', 'fogo': '🔥', 'dinheiro': '💰 💵 🪙', 'prazo': '⏰ ⏳ 📅', 'data': '📅 🗓️', 'relógio': '⏰ 🕐', 'reunião': '📅 💬 🤝', 'documento': '📄 📑 🧾', 'nota': '🧾 📝', 'planilha': '📊 📈', 'gráfico': '📊 📈 📉', 'alerta': '⚠️ 🚨', 'urgente': '🚨 ❗', 'certo': '✅ ✔️ 👍', 'errado': '❌ ✖️', 'ideia': '💡', 'meta': '🎯 🏆', 'troféu': '🏆 🥇', 'foguete': '🚀', 'joinha': '👍', 'palmas': '👏', 'força': '💪', 'sol': '☀️ 🌞', 'chuva': '🌧️ ⛈️', 'férias': '🏖️ 🌴 ✈️', 'comida': '🍕 🍔 🥗', 'bolo': '🎂 🍰', 'pensando': '🤔', 'olhos': '👀', 'oi': '👋', 'tchau': '👋', 'estrela': '⭐ 🌟', 'computador': '💻 🖥️', 'telefone': '📞 ☎️ 📱', 'email': '📧 📨' };

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
        <span class="cv-t"><b>${esc(label)}</b><small>${lm ? (lm.deleted ? 'Mensagem apagada' : esc((lm.from === u.id ? 'Você: ' : P.firstName((P.user(lm.from) || {}).name || '') + ': ') + previewText(lm.text).slice(0, 60))) : esc(sub)}</small></span>
        ${un ? `<em class="cv-n">${un}</em>` : lm ? `<span class="cv-time">${dayLabel(lm.ts) === 'Hoje' ? hm(lm.ts) : dayLabel(lm.ts)}</span>` : ''}
      </button>`;
    };
    const match = s => !q || String(s).toLowerCase().includes(q);
    // filtros no estilo de app de chat: Tudo | Não lidas | Privadas | Canais
    const f = c.filter || 'all';
    const showCh = f === 'all' || f === 'ch' || f === 'unread', showDm = f === 'all' || f === 'dm' || f === 'unread';
    const okUnread = id => f !== 'unread' || unreadIn(u, id) > 0;
    // fileira de pessoas no topo: quem conversou por último primeiro, depois os demais colegas (um clique abre a conversa privada)
    const people = dms.map(d => d.other).concat(contacts).filter(Boolean).slice(0, 24);
    const strip = !q && people.length ? `<div class="cv-strip" role="list" aria-label="Pessoas">${people.map(x => `<button type="button" role="listitem" class="cv-p" data-act="chatOpen" data-id="${esc(dmId(u.id, x.id))}" title="${esc(x.name)}">${V.avatar(x)}<span>${esc(P.firstName(x.name))}</span></button>`).join('')}</div>` : '';
    const tabs = `<div class="cv-tabs" role="tablist">${[['all', 'Tudo'], ['unread', 'Não lidas'], ['dm', 'Privadas'], ['ch', 'Canais']].map(([k, l]) => `<button type="button" role="tab" class="${f === k ? 'on' : ''}" aria-selected="${f === k}" data-act="chatFilter" data-k="${k}">${l}</button>`).join('')}</div>`;
    const chList = showCh ? channels.filter(ch => !ch.group && match(ch.name) && okUnread(ch.id)) : [];
    const grpList = showCh ? channels.filter(ch => ch.group && match(ch.name) && okUnread(ch.id)) : [];
    const dmList = showDm ? dms.filter(d => match(d.name) && okUnread(d.id)) : [];
    const side = `<aside class="chat-side">
      <div class="chat-side-h"><b>Conversas</b><button type="button" class="ibtn" data-act="chatNewDm" title="Nova conversa privada" aria-label="Nova conversa privada">${icon('plus')}</button></div>
      <label class="in-ic chat-q">${icon('search')}<input type="search" id="chat-q" placeholder="Buscar conversa ou pessoa" value="${esc(c.q || '')}" data-set="chat.q" data-live></label>
      ${strip}${tabs}
      <div class="cv-list">
        ${showCh ? `<div class="cv-g">Canais</div>${chList.map(ch => item(ch.id, ch.name, ch.desc, ch.icon)).join('') || `<p class="cv-none">${f === 'unread' ? 'Nenhum canal com mensagem nova.' : 'Nenhum canal.'}</p>`}` : ''}
        ${grpList.length ? `<div class="cv-g">Grupos</div>${grpList.map(ch => item(ch.id, ch.name, ch.desc, ch.icon)).join('')}` : ''}
        ${showDm ? `<div class="cv-g">Conversas privadas</div>` : ''}
        ${dmList.map(d => item(d.id, d.name, d.desc, 'user', d.other)).join('')}
        ${showDm && f === 'unread' && !dmList.length ? '<p class="cv-none">Nenhuma conversa privada com mensagem nova.</p>' : ''}
        ${(q ? contacts.filter(x => match(x.name)) : []).map(x => `<button type="button" class="cv new" data-act="chatOpen" data-id="${esc(dmId(u.id, x.id))}">${V.avatar(x)}<span class="cv-t"><b>${esc(x.name)}</b><small>${esc(P.ROLES[x.role] + (P.dept(x.deptId) && x.role !== 'admin' && x.role !== 'office' ? ' · ' + (P.dept(x.deptId) || { name: '—' }).name : ''))}</small></span><span class="cv-start">${icon('plus')}</span></button>`).join('')}
        ${showDm && !dms.length && !q ? '<p class="cv-none">Nenhuma conversa privada ainda. Clique numa pessoa acima ou no <b>+</b> para começar.</p>' : ''}
      </div>
    </aside>`;
    let main;
    if (!cur) {
      // tela inicial: esfera de partículas animada (js/particles.js) com o título por cima
      main = `<section class="chat-main empty pt-stage"><canvas class="pt-canvas" aria-hidden="true"></canvas>
        <div class="pt-title"><b>Comunicação</b><span>Prumo</span></div>
        <p class="pt-sub">Escolha um canal ou uma pessoa para começar.</p>
        <div class="chat-rules"><b>Como funciona</b><ul>
          <li><b>Conversas privadas:</b> qualquer pessoa pode conversar com qualquer colega. Só os dois participantes leem.</li>
          <li><b>Canais:</b> grupos por departamento e por nível (gestores, gerência, diretoria)</li>
          <li><b>Geral:</b> comunicados da diretoria para todo o escritório</li></ul>
          <button type="button" class="btn primary" data-act="chatNewDm" style="margin-top:10px">${icon('plus')}<span>Nova conversa privada</span></button></div></section>`;
    } else {
      const allMsgs = msgs().filter(m => m.conv === cur.id && !gone(m)).sort((a, b) => a.ts - b.ts);
      const lim = c.limit || 150, hiddenN = Math.max(0, allMsgs.length - lim), list = hiddenN ? allMsgs.slice(-lim) : allMsgs;
      const members = cur.members();
      const canPost = cur.canPost(u);
      let lastDay = '', lastFrom = '', lastTs = 0;
      const geral = cur.id === 'geral';
      if (geral && u.role === 'admin') loadGeralReads();
      const total = members.length;
      const body = list.length ? list.map(m => {
        const who = P.user(m.from) || { name: '—', id: 'x' }, mine = m.from === u.id, dl = dayLabel(m.ts);
        const sep = dl !== lastDay ? `<div class="msg-day"><span>${dl}</span></div>` : '';
        const cont = !sep && lastFrom === m.from && m.ts - lastTs < 5 * 60000;
        lastDay = dl; lastFrom = m.from; lastTs = m.ts;
        const seen = geral && u.role === 'admin' && (!P.isLive || geralReads) ? members.filter(x => x.id !== m.from && lastRead(x, cur.id) >= m.ts).length : null;
        // conversa privada: só balões, com o horário embaixo (estilo app de chat); canais: avatar e nome de quem escreveu
        return `${sep}<div class="msg ${mine ? 'me' : ''} ${cont ? 'cont' : ''} ${geral ? 'notice' : ''} ${cur.dm ? 'dm' : ''}">
          ${cur.dm ? '' : mine || cont ? '<span class="msg-av"></span>' : `<span class="msg-av">${V.avatar(who)}</span>`}
          <div class="msg-b">${cont || cur.dm ? '' : `<div class="msg-h"><b>${mine ? 'Você' : esc(who.name)}</b><small>${esc(P.ROLES[who.role] || '')}</small><time>${hm(m.ts)}</time></div>`}
            ${!m.deleted && stickerOf(m.text) ? `<div class="msg-stk">${stickerHtml(stickerOf(m.text))}</div>`
              : `<div class="msg-txt ${m.deleted ? 'del' : ''} ${!m.deleted && /^(\p{Extended_Pictographic}|‍|️|\s){1,8}$/u.test(m.text) ? 'big-emoji' : ''}">${m.deleted ? icon('x') + ' Mensagem apagada' : linkify(m.text)}</div>`}
            ${cur.dm ? `<time class="msg-t">${hm(m.ts)}</time>` : ''}
            ${seen != null ? `<small class="msg-seen">${icon('check')} Visto por ${seen} de ${total - 1}</small>` : ''}
          </div>
          ${V.ibtn('trash', 'Apagar mensagem', { act: 'chatDelete', cls: 'msg-del', attrs: `data-id="${m.id}"` })}
        </div>`;
      }).join('') : `<div class="msg-empty">${icon('message')}<p>${cur.dm ? 'Comece a conversa com ' + esc(P.firstName(cur.name)) + '.' : 'Nenhuma mensagem neste canal ainda.'}</p></div>`;
      main = `<section class="chat-main">
        <header class="chat-h">
          <button type="button" class="ibtn chat-back" data-act="chatOpen" data-id="" aria-label="Voltar para as conversas">${icon('left')}</button>
          ${cur.dm ? V.avatar(cur.other) : `<span class="cv-ic">${icon(cur.icon)}</span>`}
          <div><b>${esc(cur.name)}</b><small>${esc(cur.dm ? cur.desc : cur.desc + ' · ' + total + ' participante' + (total > 1 ? 's' : ''))}</small></div>
          ${V.ibtn('trash', 'Apagar conversa só para mim', { act: 'chatClear', cls: 'chat-grp-btn' })}
          ${!cur.dm ? `<div class="chat-h-av" aria-label="${total} participantes">${members.slice(0, 4).map(x => V.avatar(x)).join('')}${total > 4 ? `<em>+${total - 4}</em>` : ''}</div>` : ''}
        </header>
        <div class="chat-msgs" id="chat-msgs">${hiddenN ? `<button type="button" class="link chat-more" data-act="chatMore">Ver mensagens anteriores (${hiddenN})</button>` : ''}${body}</div>
        ${canPost ? `<div class="chat-in">${c.panel ? pickerHtml(c.panel) : ''}
          <div class="chat-pill"><div class="chat-tools">${V.ibtn('smile', 'Emojis', { act: 'chatPanel', cls: c.panel === 'emoji' ? 'on' : '', attrs: 'data-k="emoji"' })}${V.ibtn('sticker', 'Figurinhas', { act: 'chatPanel', cls: c.panel === 'fig' ? 'on' : '', attrs: 'data-k="fig"' })}</div><textarea id="chat-text" rows="1" placeholder="${geral ? 'Escreva um comunicado para todo o escritório…' : cur.dm ? 'Mensagem para ' + esc(P.firstName(cur.name)) + '…' : 'Escreva uma mensagem…'}" maxlength="2000">${esc((c.drafts || {})[cur.id] || '')}</textarea>
          <button type="button" class="chat-send" data-act="chatSend" aria-label="Enviar" title="Enviar (Enter)">${icon('right')}</button></div></div>
          <p class="chat-hint">Enter envia · Shift+Enter quebra a linha</p>`
        : `<div class="chat-ro">${icon('lock')} ${geral ? 'Somente a diretoria publica no canal Geral.' : 'Pelas regras de comunicação, esta conversa está só para leitura.'}</div>`}
      </section>`;
      markRead(u, cur.id);
    }
    return `${V.pageHead('Comunicação', 'Canais por departamento e por nível, e conversas privadas com qualquer colega. Use emojis e figurinhas à vontade.')}
      <div class="chat ${cur ? 'has-conv' : ''}">${side}${main}</div>`;
  };

  /* ---------- Ações ---------- */
  const scrollEnd = () => { const box = $('#chat-msgs'); if (box) { box.scrollTop = box.scrollHeight; st().atBottom = true; } };
  // guarda se a pessoa está no fim da conversa ou lendo mensagens antigas (para não "pular" quando chega mensagem)
  document.addEventListener('scroll', ev => {
    if (ev.target.id !== 'chat-msgs') return;
    const b = ev.target; st().atBottom = b.scrollHeight - b.scrollTop - b.clientHeight < 80; st().scrollTop = b.scrollTop;
  }, true);
  const keepScroll = () => {
    const box = $('#chat-msgs'); if (!box) return;
    if (st().atBottom === false && st().scrollTop != null) box.scrollTop = st().scrollTop; else scrollEnd();
  };
  // após redesenhar: devolve a altura do campo de texto e o texto da busca de emojis
  const restoreComposer = () => {
    const t = $('#chat-text'); if (t && t.value) { t.style.height = 'auto'; t.style.height = Math.min(160, t.scrollHeight) + 'px'; }
    const q = $('#cp-q'); if (q && st().emojiQ) { q.value = st().emojiQ; q.dispatchEvent(new Event('input', { bubbles: true })); }
  };
  /* Escolher qualquer pessoa para uma conversa privada */
  A.chatNewDm = () => {
    const u = S().user;
    const people = active().filter(x => canChat(u, x))
      .sort((a, b) => (b.deptId === u.deptId) - (a.deptId === u.deptId) || a.name.localeCompare(b.name));
    if (!people.length) return P.toast('Não há outras pessoas ativas no sistema.', 'err');
    const sub = x => P.ROLES[x.role] + (P.dept(x.deptId) ? ' · ' + (P.dept(x.deptId) || { name: '—' }).name : '');
    const row = x => `<button type="button" class="cv new" data-act="chatPickDm" data-id="${esc(x.id)}" data-q="${esc((x.name + ' ' + sub(x)).toLowerCase())}">${V.avatar(x)}<span class="cv-t"><b>${esc(x.name)}</b><small>${esc(sub(x))}</small></span><span class="cv-start">${icon('message')}</span></button>`;
    P.ui.modal({
      title: 'Nova conversa privada', cancel: 'Fechar',
      body: `<label class="in-ic chat-q" style="margin-bottom:10px">${icon('search')}<input type="search" id="dm-q" placeholder="Buscar por nome, cargo ou departamento" autocomplete="off"></label>
        <div id="dm-list" class="cv-list" style="max-height:min(420px,55vh);overflow:auto">${people.map(row).join('')}</div>
        <p class="cv-none" id="dm-none" hidden>Ninguém encontrado.</p>`
    });
    const inp = $('#dm-q');
    inp.addEventListener('input', () => {
      const t = inp.value.trim().toLowerCase(); let n = 0;
      document.querySelectorAll('#dm-list [data-q]').forEach(b => { const ok = !t || b.dataset.q.includes(t); b.hidden = !ok; if (ok) n++; });
      $('#dm-none').hidden = n > 0;
    });
  };
  A.chatPickDm = el => {
    const u = S().user; P.ui.closeModal();
    A.chatOpen({ dataset: { id: dmId(u.id, el.dataset.id) } });
  };
  A.chatOpen = el => {
    const c = st(), id = el.dataset.id || null;
    if (id && !resolve(S().user, id)) return P.toast('Você não participa desta conversa.', 'err');
    // a conversa aberta vira um passo no histórico: o botão voltar do navegador/mouse (e Alt+←) fecha a conversa, como a seta da tela
    try {
      const inChat = history.state && history.state.chat;
      if (id && !inChat) history.pushState({ chat: id }, '', location.href);
      else if (id && inChat) history.replaceState({ chat: id }, '', location.href);
      else if (!id && inChat) { history.back(); return; } // o popstate abaixo fecha a conversa
    } catch (e) { }
    c.conv = id; c.panel = null; c.emojiQ = ''; c.atBottom = true; c.scrollTop = null; c.limit = null; P.render();
    requestAnimationFrame(() => { scrollEnd(); const t = $('#chat-text'); if (t && innerWidth > 1020) t.focus(); });
  };
  window.addEventListener('popstate', ev => {
    if (!S().user || S().route.page !== 'comunicacao' || !st().conv || (ev.state && ev.state.chat)) return;
    const c = st(); c.conv = null; c.panel = null; c.emojiQ = ''; P.render();
  });
  A.chatSend = () => {
    const c = st(), t = $('#chat-text'); if (!t || !c.conv) return;
    P.ui.guard(() => {
      P.chat.send(S().user, c.conv, t.value);
      c.drafts[c.conv] = ''; c.panel = null;
      P.render();
      requestAnimationFrame(() => { scrollEnd(); const n = $('#chat-text'); if (n) n.focus(); });
    });
  };
  /* Painel de emojis / figurinhas */
  A.chatFilter = el => { st().filter = el.dataset.k || 'all'; P.render(); };
  A.chatPanel = el => {
    const c = st(), k = el.dataset.k || null;
    c.panel = c.panel === k ? null : k; c.emojiQ = '';
    const t = $('#chat-text'); if (t) c.drafts[c.conv] = t.value;
    P.render();
    requestAnimationFrame(() => { const q = $('#cp-q'); if (q && innerWidth > 1020) q.focus(); });
  };
  A.chatEmoji = el => {
    const t = $('#chat-text'), e = el.dataset.e; if (!t) return;
    const s = t.selectionStart ?? t.value.length, f = t.selectionEnd ?? s;
    t.value = t.value.slice(0, s) + e + t.value.slice(f);
    const pos = s + e.length; t.focus(); t.setSelectionRange(pos, pos);
    st().drafts[st().conv] = t.value; recent.add(e);
  };
  A.chatSticker = el => {
    const c = st(); if (!c.conv) return;
    P.ui.guard(() => {
      P.chat.send(S().user, c.conv, '::fig:' + el.dataset.id + '::');
      c.panel = null; P.render();
      requestAnimationFrame(scrollEnd);
    });
  };
  // busca e atalhos de categoria no painel de emojis
  document.addEventListener('input', ev => {
    if (ev.target.id !== 'cp-q') return;
    st().emojiQ = ev.target.value;
    const q = ev.target.value.trim().toLowerCase();
    const hit = new Set(Object.entries(EMOJI_WORDS).filter(([w]) => q && w.includes(q)).flatMap(([, v]) => v.split(' ')));
    document.querySelectorAll('#cp-body .cp-e').forEach(b => { b.hidden = !!q && !hit.has(b.dataset.e); });
    document.querySelectorAll('#cp-body .cp-cat').forEach(c => { c.hidden = !!q && !c.querySelector('.cp-e:not([hidden])'); });
  });
  document.addEventListener('click', ev => {
    const b = ev.target.closest && ev.target.closest('[data-cpt]');
    if (b) { const sec = $('#cpc-' + b.dataset.cpt); if (sec) sec.scrollIntoView({ block: 'start', behavior: 'smooth' }); }
    // clicar fora do painel de emojis/figurinhas fecha o painel
    const c = st();
    if (c.panel && S().route.page === 'comunicacao' && ev.target.isConnected && !ev.target.closest('.chat-pick, .chat-tools')) { c.panel = null; c.emojiQ = ''; const p = $('.chat-pick'); if (p) p.remove(); document.querySelectorAll('.chat-tools .ibtn.on').forEach(x => x.classList.remove('on')); }
  });
  document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && st().panel && S().route.page === 'comunicacao') { st().panel = null; P.render(); } });
  A.chatDelete = el => {
    const m = msgs().find(x => x.id === el.dataset.id), u = S().user; if (!m || !u) return;
    P.ui.modal({
      title: 'Apagar mensagem', cancel: 'Cancelar',
      body: `<p class="prose">Escolha como apagar esta mensagem.</p>
        <div style="display:flex;flex-direction:column;gap:8px">
          ${m.from === u.id ? `<button type="button" class="btn danger" data-act="chatDelAll" data-id="${esc(m.id)}">${icon('trash')}<span>Apagar para todos</span></button>` : ''}
          <button type="button" class="btn ghost" data-act="chatDelMe" data-id="${esc(m.id)}">${icon('trash')}<span>Apagar só para mim</span></button></div>`
    });
  };
  A.chatDelAll = el => P.ui.guard(() => { P.chat.remove(S().user, el.dataset.id); P.ui.closeModal(); P.render(); });
  A.chatDelMe = el => { P.chat.hide(S().user, el.dataset.id); P.ui.closeModal(); P.render(); };
  A.chatClear = () => {
    const c = st(); if (!c.conv || !confirm('Apagar toda esta conversa só para você? Os outros participantes continuam vendo as mensagens.')) return;
    P.chat.clear(S().user, c.conv); P.render();
  };
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
  P.fx.afterRender = routeChanged => {
    origAfter(routeChanged);
    if (S().user && S().route.page === 'comunicacao') {
      if (routeChanged) scrollEnd(); else keepScroll(); restoreComposer();
      const cv = document.querySelector('.pt-canvas'); if (cv && P.particles) P.particles.mount(cv);
    }
  };

  // Mensagens que chegam de outra aba: aviso no canto (se a conversa não estiver aberta)
  let lastSeenTs = Date.now();
  const onExternal = () => {
    if (!S().user) return;
    setTimeout(() => {
      const u = S().user; if (!u) return;
      const mine = new Set(convsFor(u));
      const fresh = msgs().filter(m => m.ts > lastSeenTs && m.from !== u.id && mine.has(m.conv) && !gone(m));
      lastSeenTs = Date.now();
      fresh.filter(m => !(S().route.page === 'comunicacao' && st().conv === m.conv)).slice(-2).forEach(m => {
        // remetente ou conversa ainda não carregados (ex.: pessoa recém-cadastrada): não quebra a tela
        const c = resolve(u, m.conv), who = P.user(m.from) || { name: 'Alguém' };
        if (!c) return;
        // conversa trancada com PIN: nada de aviso com texto ou nome na tela
        if (P.chatLock && P.chatLock.hasLock(u, m.conv)) return;
        P.fx.popNotif({ icon: 'message', title: c.dm ? 'Mensagem de ' + who.name : 'Nova mensagem em ' + c.name, text: (c.dm ? '' : P.firstName(who.name) + ': ') + previewText(m.text).slice(0, 120) }, { onClick: () => { st().conv = m.conv; P.go('comunicacao'); } });
      });
      if (S().route.page === 'comunicacao') keepScroll();
    }, 30);
  };
  window.addEventListener('storage', ev => { if (!P.isLive && ev.key === 'prumo.db.v3') onExternal(); });
  window.addEventListener('prumo:remote', onExternal);
})(window.P);
