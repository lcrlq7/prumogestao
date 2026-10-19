/* Prumo — Mural: curtidas e comentários de todos nos elogios, e seletor de emojis para escrever.
 * Curtidas e comentários ficam na coleção "muralReactions" (tabela mural_reactions): cada pessoa grava só os próprios,
 * porque o registro do elogio só pode ser alterado por quem o criou. */
'use strict';
(function (P) {
  const D = P.date, esc = P.esc, V = P.V, A = P.actions, api = P.api;
  const db = () => P.store.db, U = () => P.state.user, S = () => P.state;
  const reacts = () => (db().muralReactions = db().muralReactions || []);
  // em produção, se a tabela ainda não existe no banco, a parte de curtir e comentar fica escondida
  const available = () => !(P.isLive && P.muralMissing);
  const when = at => at ? D.fmt(String(at).slice(0, 10)) + ' ' + String(at).slice(11, 16) : '';
  const names = ids => ids.map(id => (P.user(id) || {}).name || '—');
  const canSee = id => !!U() && api.teamWall(U()).some(x => x.id === id);
  const notify = (ids, o) => { const to = [...new Set(ids)].filter(id => id && U() && id !== U().id); if (to.length && P.notify) P.notify(to, Object.assign({ type: 'mural', icon: 'medal', link: 'mural' }, o)); };

  /* ---------- Curtidas e comentários ---------- */
  const thread = (r, cms, me) => `<div class="wr-thread">
    ${cms.length ? `<ul class="wr-list">${cms.map(c => { const x = P.user(c.userId) || { id: '?', name: 'Pessoa removida' };
      return `<li>${V.avatar(x, 'sm')}<div class="wr-c"><div class="wr-ch"><b>${esc(x.name)}</b><small class="muted">${esc(when(c.at))}</small>${c.userId === me.id || P.isGlobal(me) ? V.ibtn('trash', 'Excluir comentário', { act: 'muralDel', cls: 'wr-del', attrs: `data-id="${esc(c.id)}"` }) : ''}</div><p>${esc(c.text).replace(/\n/g, '<br>')}</p></div></li>`; }).join('')}</ul>` : '<p class="fine">Seja o primeiro a comentar.</p>'}
    <div class="wr-form"><input type="text" id="mc-${esc(r.id)}" data-mc="${esc(r.id)}" maxlength="400" placeholder="Escreva um comentário…" autocomplete="off" aria-label="Comentário">
      <button type="button" class="emoji-btn" data-act="emojiPick" data-target="mc-${esc(r.id)}" aria-label="Inserir emoji">😀</button>${V.btn('Enviar', { act: 'muralSend', cls: 'sm primary', icon: 'right', attrs: `data-id="${esc(r.id)}"` })}</div></div>`;

  P.mural = {
    footer(r) {
      const me = U(); if (!me || !available()) return '';
      const rs = reacts().filter(x => x.rcId === r.id), likes = rs.filter(x => x.type === 'like');
      const cms = rs.filter(x => x.type === 'comment').sort((a, b) => String(a.at).localeCompare(String(b.at)));
      const liked = likes.some(x => x.userId === me.id), open = S().muralOpen === r.id;
      const first = names(likes.slice(0, 3).map(l => l.userId)).map(n => P.firstName(n)).join(', ');
      const who = likes.length ? `<small class="muted wr-who" title="${esc(names(likes.map(l => l.userId)).join(', '))}">${esc(first)}${likes.length > 3 ? ' e mais ' + (likes.length - 3) : ''} curtiu</small>` : '';
      return `<div class="wall-react"><button type="button" class="rbtn ${liked ? 'on' : ''}" data-act="muralLike" data-id="${esc(r.id)}" aria-pressed="${liked}">${liked ? '❤️' : '🤍'} Curtir${likes.length ? ' · ' + likes.length : ''}</button>
        <button type="button" class="rbtn ${open ? 'on' : ''}" data-act="muralToggle" data-id="${esc(r.id)}" aria-expanded="${open}">💬 Comentar${cms.length ? ' · ' + cms.length : ''}</button>${who}</div>${open ? thread(r, cms, me) : ''}`;
    },
    available,
    attachEmoji(sel) {
      const t = document.querySelector(sel); if (!t || !t.id || t.parentNode.querySelector('.emoji-btn')) return;
      t.insertAdjacentHTML('afterend', `<button type="button" class="emoji-btn txt" data-act="emojiPick" data-target="${esc(t.id)}">😀 Inserir emoji</button>`);
    }
  };

  A.muralToggle = el => { S().muralOpen = S().muralOpen === el.dataset.id ? null : el.dataset.id; P.render(); };
  A.muralLike = el => P.ui.guard(() => {
    const me = U(), id = el.dataset.id; if (!canSee(id)) return;
    const key = 'lk_' + id + '_' + me.id, cur = reacts().find(x => x.id === key);
    if (cur) db().muralReactions = reacts().filter(x => x.id !== key);
    else {
      reacts().push({ id: key, rcId: id, userId: me.id, type: 'like', at: D.stamp() });
      const rc = (db().recognitions || []).find(x => x.id === id); if (rc) notify([rc.userId, rc.by], { title: 'Curtiram um elogio', text: `${me.name} curtiu o elogio a ${(P.user(rc.userId) || { name: '—' }).name}.` });
    }
    P.store.save(); P.render();
  });
  A.muralSend = el => P.ui.guard(() => {
    const me = U(), id = el.dataset.id, inp = document.getElementById('mc-' + id); if (!inp || !canSee(id)) return;
    const text = inp.value.trim(); if (!text) return P.toast('Escreva o comentário.', 'err');
    reacts().push({ id: P.uid('mc'), rcId: id, userId: me.id, type: 'comment', text: text.slice(0, 400), at: D.stamp() });
    const rc = (db().recognitions || []).find(x => x.id === id);
    if (rc) notify([rc.userId, rc.by], { icon: 'message', title: 'Novo comentário em um elogio', text: `${me.name}: ${text.slice(0, 100)}` });
    P.store.save(); S().muralOpen = id; P.render();
    setTimeout(() => { const n = document.getElementById('mc-' + id); if (n) n.focus(); }, 0);
  });
  A.muralDel = el => P.ui.guard(() => {
    const me = U(), c = reacts().find(x => x.id === el.dataset.id);
    if (!c || !(c.userId === me.id || P.isGlobal(me))) return P.toast('Você só exclui os próprios comentários.', 'err');
    db().muralReactions = reacts().filter(x => x.id !== c.id); P.store.save(); P.render();
  });
  document.addEventListener('keydown', ev => {
    const t = ev.target;
    if (ev.key === 'Enter' && !ev.shiftKey && t && t.matches && t.matches('[data-mc]')) { ev.preventDefault(); A.muralSend({ dataset: { id: t.dataset.mc } }); }
  });
  // chegou curtida ou comentário de outra pessoa: atualiza o mural, sem atrapalhar quem está digitando
  window.addEventListener('prumo:remote', () => {
    const a = document.activeElement;
    if (P.state.route && P.state.route.page === 'mural' && !(a && a.matches && a.matches('[data-mc]') && a.value)) P.render();
  });

  /* ---------- Seletor de emojis (campos de texto) ---------- */
  const closePop = () => { const p = document.querySelector('.emoji-pop'); if (p) p.remove(); };
  A.emojiPick = el => {
    const had = document.querySelector('.emoji-pop'); closePop(); if (had && had.dataset.target === el.dataset.target) return;
    const cats = (P.chat && P.chat.EMOJI) || [['Rostos', 'smile', '😀 😃 😄 😁 😊 🙂 😉 😍 🥰 🤩 😎 🥳 🙏 👏 🙌 👍 💪 🎉 🌟 ⭐ ✨ 🏆 🚀 🔥 💯 ❤️ ✅']];
    const pop = document.createElement('div'); pop.className = 'emoji-pop'; pop.dataset.target = el.dataset.target; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', 'Emojis');
    pop.innerHTML = cats.map(c => `<div class="ep-cat"><small>${esc(c[0])}</small><div class="ep-grid">${c[2].split(' ').filter(Boolean).map(e => `<button type="button" class="ep-e" data-act="emojiPut" data-e="${e}" data-target="${esc(el.dataset.target)}">${e}</button>`).join('')}</div></div>`).join('');
    document.body.appendChild(pop);
    const r = el.getBoundingClientRect(), w = pop.offsetWidth || 320, h = pop.offsetHeight || 260;
    pop.style.left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8)) + 'px';
    pop.style.top = (r.bottom + h + 12 > window.innerHeight ? Math.max(8, r.top - h - 6) : r.bottom + 6) + 'px';
  };
  A.emojiPut = el => {
    const t = document.getElementById(el.dataset.target); if (!t) return closePop();
    const e = el.dataset.e, s = t.selectionStart == null ? t.value.length : t.selectionStart, f = t.selectionEnd == null ? s : t.selectionEnd;
    if (t.maxLength > 0 && t.value.length - (f - s) + e.length > t.maxLength) return;
    t.value = t.value.slice(0, s) + e + t.value.slice(f); t.focus(); t.setSelectionRange(s + e.length, s + e.length);
    t.dispatchEvent(new Event('input', { bubbles: true }));
  };
  document.addEventListener('click', ev => { if (!ev.target.closest('.emoji-pop, .emoji-btn')) closePop(); }, true);
  document.addEventListener('keydown', ev => { if (ev.key === 'Escape') closePop(); });
})(window.P);
