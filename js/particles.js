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
          tw: Math.random() * Math.PI * 2, delay: Math.random() * 0.35,
          // física do "flutuar": deslocamento e velocidade próprios, e uma oscilação leve mesmo com o mouse parado
          ox: 0, oy: 0, vx: 0, vy: 0, fr: Math.random() * Math.PI * 2, fa: 0.5 + Math.random() * 1.3
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

    let last = performance.now(), burst = null;
    var draw = now => {
      const t = (now - start) / 1000, still = reduce();
      const step = Math.min(2.5, Math.max(0.25, (now - last) / 16.67)); last = now; // passo da física independente da taxa de quadros
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
        if (!still) {
          // mouse: empurra, faz girar em volta do cursor e arrasta no sentido do movimento (como mexer na água)
          if (mouse) {
            const qx = px + p.ox - mouse.x, qy = py + p.oy - mouse.y, d2 = qx * qx + qy * qy, rad = R * 0.62;
            if (d2 < rad * rad) {
              const d = Math.sqrt(d2) || 1, nx = qx / d, ny = qy / d, f = Math.pow(1 - d / rad, 2) * 2.4 * step;
              p.vx += nx * f - ny * f * 0.75 + mouse.vx * 0.05 * f;
              p.vy += ny * f + nx * f * 0.75 + mouse.vy * 0.05 * f;
            }
          }
          // clique: uma onda que espalha as partículas
          if (burst) {
            const qx = px + p.ox - burst.x, qy = py + p.oy - burst.y, d = Math.sqrt(qx * qx + qy * qy) || 1, rad = R * 1.25;
            if (d < rad) { const f = (1 - d / rad) * 16; p.vx += qx / d * f; p.vy += qy / d * f; }
          }
          // mola que traz de volta + atrito, e a oscilação leve de flutuar
          p.vx += -p.ox * 0.03 * step; p.vy += -p.oy * 0.03 * step;
          const damp = Math.pow(0.9, step); p.vx *= damp; p.vy *= damp;
          p.ox += p.vx * step; p.oy += p.vy * step;
          px += p.ox + Math.sin(t * 0.9 + p.fr) * p.fa;
          py += p.oy + Math.cos(t * 0.75 + p.fr * 1.3) * p.fa;
        }
        const front = (z2 + 1) / 2; // 0 = atrás, 1 = na frente
        const a = (0.32 + front * 0.68) * (0.8 + Math.sin(t * 2 + p.tw) * 0.2);
        const s = 0.8 + front * 1.3;
        ctx.globalAlpha = Math.max(0, Math.min(1, a));
        ctx.fillRect(px, py, s, s);
      }
      ctx.globalAlpha = 1;
      burst = null;
      if (mouse) { mouse.vx *= 0.8; mouse.vy *= 0.8; } // o "rastro" do mouse some aos poucos quando ele para
    };

    let raf = 0;
    const loop = now => {
      if (!canvas.isConnected) { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); return; }
      draw(now);
      if (!reduce()) raf = requestAnimationFrame(loop);
    };
    const pos = e => { const b = canvas.getBoundingClientRect(); return { x: e.clientX - b.left, y: e.clientY - b.top }; };
    host.addEventListener('pointermove', e => {
      const q = pos(e), vx = mouse ? q.x - mouse.x : 0, vy = mouse ? q.y - mouse.y : 0;
      mouse = { x: q.x, y: q.y, vx: Math.max(-40, Math.min(40, vx)), vy: Math.max(-40, Math.min(40, vy)) };
    });
    host.addEventListener('pointerleave', () => { mouse = null; });
    // clique no fundo (fora de botões e links): solta a onda
    host.addEventListener('pointerdown', e => { if (!e.target.closest('button, a, input, textarea, select, label')) burst = pos(e); });
    canvas._ptFrame = () => draw(performance.now()); // permite desenhar um quadro sob demanda (testes)
    window.addEventListener('resize', resize);
    // tema claro/escuro ou cores personalizadas mudaram: atualiza a cor das partículas
    new MutationObserver(() => { ink = color(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'style'] });
    resize();
    raf = requestAnimationFrame(loop);
  }

  P.particles = { mount };
})(window.P);
