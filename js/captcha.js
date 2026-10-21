/* Prumo — hCaptcha nas telas de acesso (login, esqueci a senha, cadastro por convite).
 * Liga só quando PRUMO_CONFIG.hcaptchaSiteKey está preenchida. O token vai para o Supabase Auth,
 * que confere com a Secret Key configurada em Authentication → Attack Protection. */
'use strict';
(function (P) {
  const key = ((window.PRUMO_CONFIG || {}).hcaptchaSiteKey || '').trim();
  let loading = null, widget = null, token = null;
  const theme = () => document.documentElement.dataset.theme === 'dark' || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
  const load = () => loading || (loading = new Promise((ok, no) => {
    window.__prumoHc = ok;
    const s = document.createElement('script');
    s.src = 'https://js.hcaptcha.com/1/api.js?render=explicit&onload=__prumoHc&hl=pt-BR';
    s.async = true; s.onerror = () => { loading = null; no(new Error('Não foi possível carregar o captcha. Confira a conexão e recarregue a página.')); };
    document.head.appendChild(s);
  }));
  function mount() {
    const slot = document.querySelector('.captcha-slot:not([data-on])');
    if (!slot) return;
    slot.dataset.on = '1';
    load().then(() => {
      if (!document.body.contains(slot)) return;
      widget = window.hcaptcha.render(slot, { sitekey: key, theme: theme(), callback: t => { token = t; }, 'expired-callback': () => { token = null; }, 'error-callback': () => { token = null; } });
    }).catch(e => { slot.textContent = e.message; slot.classList.add('captcha-err'); });
  }
  P.captcha = {
    enabled: !!key,
    slot: () => key ? '<div class="captcha-slot" aria-label="Verificação de segurança"></div>' : '',
    // devolve o token ou avisa que falta marcar
    token() {
      if (!key) return undefined;
      if (!token) throw new Error('Confirme a verificação "Sou humano" antes de continuar.');
      return token;
    },
    reset() { token = null; try { if (window.hcaptcha && widget != null) window.hcaptcha.reset(widget); } catch (e) { } }
  };
  // começa a baixar o hCaptcha já na abertura da página (antes só começava quando a tela de login terminava de montar)
  if (key) { load().catch(() => { }); new MutationObserver(mount).observe(document.documentElement, { childList: true, subtree: true }); }
})(window.P);
