/* Prumo — Comunicação: trancar conversa com PIN (como o "bloquear conversa" do WhatsApp).
 * O PIN fica só neste navegador (guardado de forma embaralhada) e vale para a sua conta: esconde a conversa e a prévia dela para quem olhar a tela.
 * Não é criptografia: serve para privacidade no computador, não protege contra quem tem acesso ao seu usuário. */
'use strict';
(function (P) {
  const V = P.V, A = P.actions, icon = V.icon;
  const S = () => P.state, st = () => (S().chat = S().chat || { conv: null, q: '', drafts: {} });
  const ls = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) { } } };
  const hashPin = (u, conv, pin) => {
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57; const str = 'prumo|' + u.id + '|' + conv + '|' + pin;
    for (let i = 0; i < str.length; i++) { const c = str.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
  };
  const lockKey = u => 'prumo.chatlock.' + u.id;
  const locks = u => { try { return JSON.parse(ls.get(lockKey(u)) || '{}'); } catch (e) { return {}; } };
  const saveLocks = (u, o) => ls.set(lockKey(u), JSON.stringify(o));
  const unlocked = new Set(); // conversas já destrancadas nesta sessão (some ao recarregar ou sair)
  const isLocked = (u, conv) => !!conv && !!locks(u)[conv] && !unlocked.has(conv);
  const hasLock = (u, conv) => !!conv && !!locks(u)[conv];

  const origCom = V.comunicacao;
  V.comunicacao = function (u) {
    let html = origCom.apply(this, arguments);
    const conv = st().conv, mine = locks(u);
    if (conv && isLocked(u, conv)) {
      const i = html.indexOf('<section class="chat-main'), j = html.lastIndexOf('</section>') + '</section>'.length;
      if (i >= 0 && j > i) html = html.slice(0, i) + `<section class="chat-main empty chat-locked"><div class="lk-box">${icon('lock')}<b>Conversa trancada</b><p>Digite o PIN para abrir.</p>
        <form id="lk-form" autocomplete="off"><input type="password" id="lk-pin" inputmode="numeric" maxlength="12" placeholder="PIN" autocomplete="off" aria-label="PIN da conversa"><button type="submit" class="btn primary">${icon('check')}<span>Abrir</span></button></form>
        <p class="lk-err" id="lk-err" hidden></p><button type="button" class="link" data-act="chatLockForgot">Esqueci o PIN</button></div></section>` + html.slice(j);
    } else if (conv) {
      const btn = hasLock(u, conv) ? V.ibtn('lock', 'Trancar de novo agora', { act: 'chatRelock', cls: 'chat-lock-btn on' }) + V.ibtn('x', 'Remover a tranca', { act: 'chatLockOff', cls: 'chat-lock-btn' })
        : V.ibtn('lock', 'Trancar esta conversa com PIN', { act: 'chatLockOn', cls: 'chat-lock-btn' });
      html = html.replace(/<\/header>/, btn + '</header>');
    }
    setTimeout(() => {
      // prévia e horário das conversas trancadas ficam escondidos na lista
      document.querySelectorAll('.chat-side .cv[data-id]').forEach(el => {
        if (!mine[el.dataset.id]) return;
        const sm = el.querySelector('.cv-t small'); if (sm) sm.textContent = 'Conversa trancada';
        const tm = el.querySelector('.cv-time'); if (tm) tm.remove();
        const b = el.querySelector('.cv-t b'); if (b && !b.querySelector('.ic')) b.insertAdjacentHTML('beforeend', ' ' + icon('lock'));
      });
      const pin = document.getElementById('lk-pin'); if (pin) pin.focus();
    }, 0);
    return html;
  };
  document.addEventListener('submit', ev => {
    if (!ev.target || ev.target.id !== 'lk-form') return;
    ev.preventDefault();
    const u = S().user, conv = st().conv, input = document.getElementById('lk-pin'), err = document.getElementById('lk-err');
    if (u && conv && locks(u)[conv] === hashPin(u, conv, input.value.trim())) { unlocked.add(conv); P.render(); return; }
    err.textContent = 'PIN incorreto.'; err.hidden = false; input.value = ''; input.focus();
  });
  A.chatLockOn = () => {
    const u = S().user, conv = st().conv; if (!u || !conv) return;
    P.ui.modal({
      title: 'Trancar conversa', submit: 'Trancar',
      body: `<p class="prose">A conversa fica escondida atrás de um PIN. Vale só para você, neste navegador, e a prévia some da lista.</p>
        <div class="fgrid"><label class="field"><span>PIN (4 a 12 números)</span><input type="password" id="lk-n1" inputmode="numeric" maxlength="12" autocomplete="off"></label>
        <label class="field"><span>Repita o PIN</span><input type="password" id="lk-n2" inputmode="numeric" maxlength="12" autocomplete="off"></label></div>`,
      onSubmit: () => {
        const a = document.getElementById('lk-n1').value.trim(), b = document.getElementById('lk-n2').value.trim();
        if (!/^\d{4,12}$/.test(a)) throw new Error('Use de 4 a 12 números.');
        if (a !== b) throw new Error('Os dois PINs precisam ser iguais.');
        const o = locks(u); o[conv] = hashPin(u, conv, a); saveLocks(u, o); unlocked.delete(conv);
        P.toast('Conversa trancada.'); setTimeout(() => P.render(), 0);
      }
    });
  };
  A.chatRelock = () => { unlocked.delete(st().conv); P.render(); };
  A.chatLockOff = () => {
    const u = S().user, conv = st().conv; if (!u || !conv || !confirm('Remover a tranca desta conversa?')) return;
    const o = locks(u); delete o[conv]; saveLocks(u, o); unlocked.delete(conv); P.toast('Tranca removida.'); P.render();
  };
  // esqueceu o PIN: só remove a tranca confirmando a senha da conta
  A.chatLockForgot = () => {
    const u = S().user, conv = st().conv; if (!u || !conv) return;
    P.ui.modal({
      title: 'Esqueci o PIN', submit: 'Remover a tranca',
      body: `<p class="prose">Para remover a tranca sem o PIN, confirme a senha da sua conta.</p><label class="field"><span>Senha da conta</span><input type="password" id="lk-pw" autocomplete="current-password"></label>`,
      onSubmit: () => {
        const pw = document.getElementById('lk-pw').value; if (!pw) throw new Error('Digite a senha.');
        const done = () => { const o = locks(u); delete o[conv]; saveLocks(u, o); unlocked.delete(conv); P.toast('Tranca removida.'); P.render(); };
        if (P.isLive && P.backend && P.backend.client) {
          P.backend.client.auth.signInWithPassword({ email: u.email, password: pw }).then(r => { if (r.error) P.toast('Senha incorreta.', 'err'); else done(); });
        } else if (pw === u.password) done(); else throw new Error('Senha incorreta.');
      }
    });
  };
  P.chatLock = { isLocked, hasLock };
})(window.P);
