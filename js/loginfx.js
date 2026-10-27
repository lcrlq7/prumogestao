/* Prumo — tela de login interativa.
 * Rede de pontos que reage ao mouse e ao que a pessoa digita, prumo (fio dourado) que balança como pêndulo,
 * cartão de vidro que inclina com o cursor, frases que se alternam e aviso de Caps Lock.
 * Canvas 2D puro. Para quando a tela de login sai do ar ou a aba fica em segundo plano; respeita "reduzir movimento" e celulares. */
'use strict';
(function (P) {
  const reduce = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const small = () => window.innerWidth < 760;
  const TIPS = [
    'Pontos por atividade: 1 ponto ≈ 1 hora média de trabalho.',
    'Capacidade, não pressão: mostra quem precisa de apoio.',
    'Cada pessoa vê somente o que o seu perfil permite.',
    'Tarefas recorrentes e prazos, tudo no mesmo lugar.'
  ];

  function mount(root) {
    if (root._lg) return; root._lg = true;
    const canvas = root.querySelector('.lg-canvas'), card = root.querySelector('.auth-card'), bob = root.querySelector('.lg-bob'), tip = root.querySelector('.lg-tip');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let W = 0, H = 0, dpr = 1, nodes = [], mouse = { x: -999, y: -999, in: false }, energy = 0, last = 0;
    let ang = 0, vel = 0, tx = 0, ty = 0, rx = 0, ry = 0;

    const build = () => {
      const n = Math.round(Math.min(small() ? 45 : 105, Math.max(30, (W * H) / 15000)));
      nodes = Array.from({ length: n }, () => ({ x: Math.random() * W, y: Math.random() * H, vx: (Math.random() - .5) * .28, vy: (Math.random() - .5) * .28, r: .8 + Math.random() * 1.6 }));
    };
    const resize = () => {
      const b = root.getBoundingClientRect(); dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = Math.max(1, b.width); H = Math.max(1, b.height);
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
      build(); placeBob(); frame(performance.now(), true);
    };
    // o fio do prumo desce do alto da tela até o cartão
    const placeBob = () => { if (!bob || !card) return; const c = card.getBoundingClientRect(), r = root.getBoundingClientRect(); bob.style.setProperty('--bh', Math.max(40, c.top - r.top - 14) + 'px'); };

    const frame = (now, once) => {
      if (!root.isConnected) { window.removeEventListener('resize', resize); return; }
      const dt = Math.min(48, now - (last || now)); last = now;
      const k = dt / 16.7;
      energy *= Math.pow(.96, k);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
      const link = 125 + energy * 40, still = once || reduce();
      for (const p of nodes) {
        if (!still) {
          p.x += p.vx * k * (1 + energy * 2.2); p.y += p.vy * k * (1 + energy * 2.2);
          if (p.x < -10) p.x = W + 10; else if (p.x > W + 10) p.x = -10;
          if (p.y < -10) p.y = H + 10; else if (p.y > H + 10) p.y = -10;
          // o mouse afasta os pontos de perto, devagar
          if (mouse.in) { const dx = p.x - mouse.x, dy = p.y - mouse.y, d2 = dx * dx + dy * dy; if (d2 < 150 * 150 && d2 > 1) { const d = Math.sqrt(d2), f = (1 - d / 150) * .9 * k; p.x += dx / d * f; p.y += dy / d * f; } }
        }
      }
      ctx.lineWidth = 1;
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j], dx = a.x - b.x, dy = a.y - b.y, d2 = dx * dx + dy * dy;
          if (d2 < link * link) { ctx.strokeStyle = 'rgba(143,184,214,' + ((1 - Math.sqrt(d2) / link) * (.22 + energy * .35)).toFixed(3) + ')'; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
        }
        if (mouse.in) { const dx = a.x - mouse.x, dy = a.y - mouse.y, d2 = dx * dx + dy * dy; if (d2 < 190 * 190) { ctx.strokeStyle = 'rgba(224,166,58,' + ((1 - Math.sqrt(d2) / 190) * .55).toFixed(3) + ')'; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(mouse.x, mouse.y); ctx.stroke(); } }
      }
      for (const p of nodes) { ctx.fillStyle = 'rgba(190,215,235,' + (.55 + energy * .4).toFixed(2) + ')'; ctx.beginPath(); ctx.arc(p.x, p.y, p.r + energy * .8, 0, 6.2832); ctx.fill(); }
      // prumo: pêndulo que tende ao lado do mouse e leva um empurrão a cada tecla
      if (bob && !still) {
        const target = mouse.in ? Math.max(-1, Math.min(1, (mouse.x - W / 2) / (W / 2))) * 9 : 0;
        vel += (target - ang) * .02 * k; vel *= Math.pow(.955, k); ang += vel * k;
        bob.style.setProperty('--sw', ang.toFixed(2) + 'deg');
      }
      // cartão de vidro inclina para o cursor
      if (card && !still && !small()) {
        rx += (ty - rx) * .08 * k; ry += (tx - ry) * .08 * k;
        card.style.setProperty('--rx', rx.toFixed(2) + 'deg'); card.style.setProperty('--ry', ry.toFixed(2) + 'deg');
      }
      if (!once && !document.hidden) requestAnimationFrame(t => frame(t)); else if (!once) setTimeout(() => requestAnimationFrame(t => frame(t)), 400);
    };

    root.addEventListener('pointermove', e => {
      const b = root.getBoundingClientRect(); mouse.x = e.clientX - b.left; mouse.y = e.clientY - b.top; mouse.in = true;
      if (card) {
        const c = card.getBoundingClientRect();
        tx = Math.max(-1, Math.min(1, (e.clientX - (c.left + c.width / 2)) / (W / 2))) * 5;
        ty = -Math.max(-1, Math.min(1, (e.clientY - (c.top + c.height / 2)) / (H / 2))) * 4;
        card.style.setProperty('--gx', ((e.clientX - c.left) / c.width * 100).toFixed(1) + '%'); card.style.setProperty('--gy', ((e.clientY - c.top) / c.height * 100).toFixed(1) + '%');
      }
    });
    root.addEventListener('pointerleave', () => { mouse.in = false; tx = ty = 0; });
    // digitar acende a rede e balança o prumo; enviar o formulário dá um impulso maior
    root.addEventListener('keydown', e => { if (e.target && e.target.tagName === 'INPUT') { energy = Math.min(1, energy + .22); vel += (Math.random() < .5 ? -1 : 1) * .35; } });
    root.addEventListener('submit', () => { energy = 1; vel += 2.2; });
    window.addEventListener('resize', resize);

    // frases que se alternam
    if (tip) { let i = 0; const tick = () => { if (!root.isConnected) return; tip.classList.add('out'); setTimeout(() => { i = (i + 1) % TIPS.length; tip.textContent = TIPS[i]; tip.classList.remove('out'); }, 450); setTimeout(tick, 5200); }; tip.textContent = TIPS[0]; setTimeout(tick, 5200); }

    resize();
    if (!reduce()) requestAnimationFrame(t => frame(t));
  }

  // aviso de Caps Lock nos campos de senha
  const caps = e => {
    const t = e.target; if (!t || t.tagName !== 'INPUT' || t.type !== 'password' && t.type !== 'text' || !t.closest('.auth-card') || !t.closest('.pass')) return;
    const on = !!(e.getModifierState && e.getModifierState('CapsLock')), lab = t.closest('.field'); if (!lab) return;
    let el = lab.querySelector('.lg-caps');
    if (on && !el) { el = document.createElement('small'); el.className = 'lg-caps'; el.textContent = 'Caps Lock está ligado'; lab.appendChild(el); }
    else if (!on && el) el.remove();
  };
  document.addEventListener('keydown', caps); document.addEventListener('keyup', caps);

  // a tela de login é redesenhada a cada erro ou troca de modo: monta de novo sempre que o fundo aparece
  const scan = () => { const r = document.querySelector('.auth.v2'); if (r) mount(r); };
  new MutationObserver(scan).observe(document.documentElement, { childList: true, subtree: true });
  scan();
})(window.P);
