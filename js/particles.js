/* Prumo — esfera de partículas (tela inicial da Comunicação).
 * As partículas chegam espalhadas, se juntam numa esfera que gira devagar e se afastam do cursor.
 * Canvas 2D puro, sem bibliotecas. Para sozinha quando o canvas sai da tela. Respeita "reduzir movimento". */
'use strict';
(function (P) {
  const reduce = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ease = t => 1 - Math.pow(1 - t, 3);

  function mount(canvas) {
    if (!canvas || canvas._pt) return;
    canvas._pt = true;
    const ctx = canvas.getContext('2d');
    const host = canvas.parentElement;
    let W = 0, H = 0, R = 0, dpr = 1, pts = [], mouse = null, start = performance.now();

    // pontos distribuídos na superfície (espiral de Fibonacci) com um pouco de "poeira" para dentro, como no vídeo
    const build = () => {
      const n = Math.round(Math.min(3400, Math.max(1200, (W * H) / 150)));
      const golden = Math.PI * (3 - Math.sqrt(5));
      pts = Array.from({ length: n }, (_, i) => {
        const y = 1 - (i / (n - 1)) * 2, r = Math.sqrt(1 - y * y), th = golden * i;
        const depth = 0.82 + Math.random() * 0.22; // espessura da casca
        return {
          x: Math.cos(th) * r * depth, y: y * depth, z: Math.sin(th) * r * depth,
          // ponto de partida: espalhado bem longe, para a animação de "montar" a esfera
          sx: (Math.random() - 0.5) * 6, sy: (Math.random() - 0.5) * 6, sz: (Math.random() - 0.5) * 6,
          tw: Math.random() * Math.PI * 2, delay: Math.random() * 0.35
        };
      });
    };
    const resize = () => {
      const b = host.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = Math.max(1, b.width); H = Math.max(1, b.height);
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
      R = Math.min(W * 0.36, H * 0.3);
      build();
      if (typeof draw === 'function') draw(performance.now()); // redesenha já (sem depender do próximo quadro; vale também para "reduzir movimento")
    };
    const color = () => {
      const cs = getComputedStyle(document.documentElement);
      return (cs.getPropertyValue('--side-on') || '#ffffff').trim() || '#ffffff';
    };
    let ink = color();

    var draw = now => {
      const t = (now - start) / 1000;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const cx = W / 2, cy = H * 0.47, rotY = t * 0.18, rotX = 0.35 + Math.sin(t * 0.25) * 0.12;
      const cY = Math.cos(rotY), sY = Math.sin(rotY), cX = Math.cos(rotX), sX = Math.sin(rotX);
      const breathe = 1 + Math.sin(t * 0.9) * 0.015;
      ctx.fillStyle = ink;
      for (const p of pts) {
        const k = reduce() ? 1 : ease(Math.min(1, Math.max(0, (t - p.delay) / 1.8)));
        let x = p.sx + (p.x - p.sx) * k, y = p.sy + (p.y - p.sy) * k, z = p.sz + (p.z - p.sz) * k;
        // gira em Y e inclina em X
        const x1 = x * cY - z * sY, z1 = x * sY + z * cY;
        const y2 = y * cX - z1 * sX, z2 = y * sX + z1 * cX;
        const persp = 2.4 / (2.4 + z2);
        let px = cx + x1 * R * persp * breathe, py = cy + y2 * R * persp * breathe;
        // o cursor empurra as partículas próximas
        if (mouse) {
          const dx = px - mouse.x, dy = py - mouse.y, d2 = dx * dx + dy * dy, rad = R * 0.45;
          if (d2 < rad * rad) { const d = Math.sqrt(d2) || 1, f = (1 - d / rad) * 26; px += dx / d * f; py += dy / d * f; }
        }
        const front = (z2 + 1) / 2; // 0 = atrás, 1 = na frente
        const a = (0.32 + front * 0.68) * (0.8 + Math.sin(t * 2 + p.tw) * 0.2);
        const s = 0.8 + front * 1.3;
        ctx.globalAlpha = Math.max(0, Math.min(1, a));
        ctx.fillRect(px, py, s, s);
      }
      ctx.globalAlpha = 1;
    };

    let raf = 0;
    const loop = now => {
      if (!canvas.isConnected) { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); return; }
      draw(now);
      if (!reduce()) raf = requestAnimationFrame(loop);
    };
    host.addEventListener('pointermove', e => { const b = canvas.getBoundingClientRect(); mouse = { x: e.clientX - b.left, y: e.clientY - b.top }; });
    host.addEventListener('pointerleave', () => { mouse = null; });
    window.addEventListener('resize', resize);
    // tema claro/escuro ou cores personalizadas mudaram: atualiza a cor das partículas
    new MutationObserver(() => { ink = color(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'style'] });
    resize();
    raf = requestAnimationFrame(loop);
  }

  P.particles = { mount };
})(window.P);
