/* Prumo — Comunicação: barra de conversas que encolhe e se redimensiona (como no WhatsApp) e aviso de "digitando…".
 * O aviso usa um canal de broadcast do Supabase (nada é gravado no banco); sem banco (demonstração) usa só as abas do mesmo navegador. */
'use strict';
(function (P) {
  const V = P.V, A = P.actions, icon = V.icon, esc = P.esc;
  const S = () => P.state, st = () => (S().chat = S().chat || { conv: null, q: '', drafts: {} });
  const ls = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) { } } };
  const MIN_W = 240, MAX_W = 520, ICON_W = 76, DEF_W = 330;
  let sideW = Number(ls.get('prumo.chatside')) || DEF_W;
  const clampW = w => w <= 150 ? ICON_W : Math.max(MIN_W, Math.min(MAX_W, w));
  sideW = clampW(sideW);
  const isMin = () => sideW <= ICON_W;

  /* ---------- Barra lateral ---------- */
  const orig = V.comunicacao;
  V.comunicacao = function (u) {
    let html = orig.apply(this, arguments);
    const tgl = (extra) => `<button type="button" class="ibtn chat-side-toggle ${extra || ''}" data-act="chatSideToggle" aria-label="${isMin() ? 'Expandir a lista de conversas' : 'Recolher a lista de conversas'}" title="${isMin() ? 'Expandir a lista de conversas' : 'Recolher a lista de conversas'}">${icon('menu')}</button>`;
    html = html.replace(/<div class="chat ([^"]*)">/, (m, c) => `<div class="chat ${c} ${isMin() ? 'side-min' : ''}" style="--cw:${sideW}px">`);
    html = html.replace('<div class="chat-side-h">', '<div class="chat-side-h">' + tgl('in-side'));
    html = html.replace('<header class="chat-h">', '<header class="chat-h">' + tgl('in-head'));
    // alça para arrastar e mudar a largura da lista
    html = html.replace(/(<div class="chat [^>]*>)/, '$1<div class="chat-resize" role="separator" aria-orientation="vertical" aria-label="Arraste para mudar a largura da lista de conversas" title="Arraste para mudar a largura"></div>');
    // aviso de digitando, logo acima do campo de mensagem
    html = html.replace('<div class="chat-in">', '<div class="chat-typing" id="chat-typing" hidden></div><div class="chat-in">');
    setTimeout(showTyping, 0);
    return html;
  };
  const applyW = () => { const c = document.querySelector('.chat'); if (!c) return; c.style.setProperty('--cw', sideW + 'px'); c.classList.toggle('side-min', isMin()); };
  A.chatSideToggle = () => { sideW = isMin() ? DEF_W : ICON_W; ls.set('prumo.chatside', String(sideW)); P.render(); };
  document.addEventListener('pointerdown', ev => {
    const h = ev.target.closest && ev.target.closest('.chat-resize'); if (!h) return;
    ev.preventDefault();
    const chat = h.closest('.chat'), left = chat.getBoundingClientRect().left + 12;
    document.body.classList.add('chat-resizing');
    const move = e => { sideW = Math.max(ICON_W, Math.min(MAX_W, Math.round(e.clientX - left))); applyW(); };
    const up = () => {
      document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up); document.body.classList.remove('chat-resizing');
      sideW = clampW(sideW); ls.set('prumo.chatside', String(sideW)); P.render();
    };
    document.addEventListener('pointermove', move); document.addEventListener('pointerup', up);
  });

  /* ---------- "Fulano está digitando…" ---------- */
  const typing = {}; // 'conversa|pessoa' -> { at, name }
  const TTL = 4000;
  let tch = null, bc = null, sentAt = 0;
  const me = () => S().user;
  const ensure = () => {
    if (!me()) return;
    if (P.isLive && P.backend && P.backend.client) {
      if (tch) return;
      try { tch = P.backend.client.channel('prumo-typing', { config: { broadcast: { self: false } } }); tch.on('broadcast', { event: 'typing' }, m => onTyping(m.payload)).subscribe(); } catch (e) { tch = null; }
    } else if (!bc && window.BroadcastChannel) { bc = new BroadcastChannel('prumo-typing'); bc.onmessage = m => onTyping(m.data); }
  };
  setInterval(ensure, 3000);
  const send = payload => { try { if (tch) tch.send({ type: 'broadcast', event: 'typing', payload }); else if (bc) bc.postMessage(payload); } catch (e) { } };
  document.addEventListener('input', ev => {
    if (!ev.target || ev.target.id !== 'chat-text' || !me() || !st().conv) return;
    ensure();
    const now = Date.now(); if (!ev.target.value.trim() || now - sentAt < 2500) return;
    sentAt = now; send({ conv: st().conv, uid: me().id, name: P.firstName(me().name) });
  });
  function onTyping(p) {
    if (!p || !me() || p.uid === me().id) return;
    typing[p.conv + '|' + p.uid] = { at: Date.now(), name: p.name || 'Alguém' };
    showTyping(); setTimeout(showTyping, TTL + 100);
  }
  function showTyping() {
    const el = document.getElementById('chat-typing'); if (!el) return;
    const conv = st().conv, now = Date.now();
    const who = Object.entries(typing).filter(([k, v]) => k.startsWith(conv + '|') && now - v.at < TTL).map(([, v]) => v.name);
    if (!who.length) { el.hidden = true; return; }
    const t = who.length === 1 ? who[0] + ' está digitando' : who.length === 2 ? who[0] + ' e ' + who[1] + ' estão digitando' : 'Várias pessoas estão digitando';
    el.innerHTML = '<i></i><i></i><i></i><span>' + esc(t) + '…</span>'; el.hidden = false;
  }
  P.chatTyping = { _test: onTyping };
})(window.P);
