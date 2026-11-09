/* Prumo Gestão — tela de manutenção
 * Liga e desliga pelo arquivo maintenance.json (sem mexer no banco):
 *   { "on": true, "msg": "Estamos melhorando o Prumo.", "volta": "por volta das 15h" }
 * Enquanto "on" for true, quem abre o site vê esta tela, com um joguinho, em vez do sistema.
 * Para a equipe técnica entrar mesmo assim: abra o site com  ?manut=ok  (vale neste navegador)
 * e  ?manut=off  para voltar a ver a tela como os demais.
 * Quando a manutenção termina (on:false), a tela some sozinha e a página recarrega.
 */
(function () {
  'use strict';
  var KEY = 'prumo.manutOk', shown = false, timer = null;
  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { } return null; }
  try {
    var q = new URLSearchParams(location.search).get('manut');
    if (q === 'ok') store(KEY, '1'); else if (q === 'off') store(KEY, null);
  } catch (e) { }
  var bypass = store(KEY) === '1';

  function check() {
    fetch('maintenance.json?t=' + Date.now(), { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (c) {
      var on = !!(c && c.on) && !bypass;
      if (on && !shown) show(c);
      else if (on && shown) { var m = document.getElementById('mt-msg'); if (m) m.textContent = c.msg || ''; }
      else if (!on && shown) location.reload(); // manutenção terminou: volta ao sistema
    }).catch(function () { /* sem o arquivo ou sem rede: segue normal */ });
  }

  function show(c) {
    shown = true;
    var el = document.createElement('div');
    el.className = 'mt'; el.id = 'maint'; el.setAttribute('role', 'alert');
    var h = document.createElement('div'); h.className = 'mt-card';
    h.innerHTML = '<div class="mt-ico">🛠️</div><h1>Estamos em manutenção</h1><p id="mt-msg"></p><p class="mt-back"></p>' +
      '<div class="mt-game"><div class="mt-hud"><span>Pontos <b id="mt-s">0</b></span><span id="mt-l">❤️❤️❤️</span><span>Recorde <b id="mt-b">0</b></span></div>' +
      '<canvas id="mt-c" width="360" height="420" aria-label="Joguinho: pegue os documentos e desvie dos bugs"></canvas>' +
      '<input type="text" id="mt-n" class="mt-n" maxlength="20" placeholder="Seu nome para o ranking" autocomplete="off">' +
      '<button type="button" class="mt-btn" id="mt-go">Jogar enquanto espera</button>' +
      '<small>Mouse, dedo ou setas ← → para mover. Pegue 📄🧾💰 e desvie dos 🐛.</small></div>' +
      '<div class="mt-rank"><b>🏆 Ranking</b><ol id="mt-r"><li>carregando…</li></ol></div>';
    el.appendChild(h); document.body.appendChild(el);
    document.getElementById('mt-msg').textContent = (c && c.msg) || 'Estamos fazendo melhorias no Prumo.';
    h.querySelector('.mt-back').textContent = c && c.volta ? 'Previsão de volta: ' + c.volta : 'Assim que terminar, esta tela some sozinha.';
    game(); loadRank();
  }

  // ranking compartilhado (funções fechadas no banco: modelos/ranking-manutencao.sql)
  function rpc(fn, body) {
    var c = window.PRUMO_CONFIG || {};
    return fetch(c.supabaseUrl + '/rest/v1/rpc/' + fn, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: c.supabaseAnonKey, Authorization: 'Bearer ' + c.supabaseAnonKey }, body: JSON.stringify(body || {}) })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.status === 204 ? null : r.json().catch(function () { return null; }); });
  }
  function loadRank() {
    var ol = document.getElementById('mt-r'); if (!ol) return;
    rpc('maint_rank_top').then(function (rows) {
      ol.innerHTML = '';
      if (!rows || !rows.length) { var e = document.createElement('li'); e.textContent = 'Ninguém pontuou ainda. Seja o primeiro!'; ol.appendChild(e); return; }
      rows.forEach(function (r) { var li = document.createElement('li'); var n = document.createElement('span'); n.textContent = r.name; var b = document.createElement('b'); b.textContent = r.score; li.appendChild(n); li.appendChild(b); ol.appendChild(li); });
    }).catch(function () { ol.innerHTML = '<li>Ranking indisponível no momento.</li>'; });
  }
  function game() {
    var cv = document.getElementById('mt-c'), x = cv.getContext('2d'), W = cv.width, H = cv.height;
    var sEl = document.getElementById('mt-s'), lEl = document.getElementById('mt-l'), bEl = document.getElementById('mt-b'), btn = document.getElementById('mt-go');
    var best = parseInt(store('prumo.manutBest') || '0', 10) || 0; bEl.textContent = best;
    var nEl = document.getElementById('mt-n'); nEl.value = store('prumo.manutName') || '';
    var p, items, score, lives, t, run = false, raf = 0, last = 0, keys = { l: false, r: false };
    function reset() { p = { x: W / 2, w: 64 }; items = []; score = 0; lives = 3; t = 0; sEl.textContent = 0; lEl.textContent = '❤️❤️❤️'; }
    function spawn() {
      var bug = Math.random() < 0.28;
      items.push({ x: 20 + Math.random() * (W - 40), y: -20, v: 110 + Math.random() * 90 + score * 2.2, e: bug ? '🐛' : ['📄', '🧾', '💰', '📊'][Math.floor(Math.random() * 4)], bug: bug });
    }
    function draw() {
      x.clearRect(0, 0, W, H);
      x.textAlign = 'center'; x.textBaseline = 'middle';
      x.font = '30px serif'; items.forEach(function (i) { x.fillText(i.e, i.x, i.y); });
      x.font = '44px serif'; x.fillText('🧺', p.x, H - 34);
      if (!run) { x.fillStyle = 'rgba(0,0,0,.45)'; x.fillRect(0, 0, W, H); x.fillStyle = '#fff'; x.font = '700 18px sans-serif'; x.fillText(lives <= 0 ? 'Fim de jogo! ' + score + ' pontos' : 'Pronto para jogar?', W / 2, H / 2); }
    }
    function end() {
      run = false; cancelAnimationFrame(raf);
      if (score > best) { best = score; store('prumo.manutBest', String(best)); bEl.textContent = best; }
      btn.textContent = 'Jogar de novo'; btn.hidden = false; draw();
      var nm = nEl.value.trim(); if (nm) store('prumo.manutName', nm);
      if (nm && score > 0) rpc('maint_rank_submit', { p_name: nm, p_score: score }).then(loadRank).catch(function () { });
    }
    function tick(ts) {
      if (!run) return;
      var dt = Math.min(0.05, (ts - last) / 1000 || 0); last = ts; t += dt;
      if (keys.l) p.x -= 340 * dt; if (keys.r) p.x += 340 * dt;
      p.x = Math.max(p.w / 2, Math.min(W - p.w / 2, p.x));
      if (t > 0.7 - Math.min(0.4, score / 120)) { t = 0; spawn(); }
      for (var k = items.length - 1; k >= 0; k--) {
        var i = items[k]; i.y += i.v * dt;
        var hit = i.y > H - 58 && i.y < H - 12 && Math.abs(i.x - p.x) < p.w / 2 + 6;
        if (hit) {
          items.splice(k, 1);
          if (i.bug) { lives--; lEl.textContent = lives > 0 ? new Array(lives + 1).join('❤️') : '💔'; if (lives <= 0) { end(); return; } }
          else { score++; sEl.textContent = score; }
        } else if (i.y > H + 20) {
          items.splice(k, 1); // documento que caiu no chão não tira vida
        }
      }
      draw(); raf = requestAnimationFrame(tick);
    }
    function start() { reset(); run = true; btn.hidden = true; last = performance.now(); raf = requestAnimationFrame(tick); }
    function moveTo(cx) { var r = cv.getBoundingClientRect(); p.x = Math.max(p.w / 2, Math.min(W - p.w / 2, (cx - r.left) * W / r.width)); }
    cv.addEventListener('pointermove', function (e) { if (run) moveTo(e.clientX); });
    cv.addEventListener('pointerdown', function (e) { if (run) moveTo(e.clientX); });
    cv.style.touchAction = 'none';
    document.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft') { keys.l = true; if (run) e.preventDefault(); } else if (e.key === 'ArrowRight') { keys.r = true; if (run) e.preventDefault(); }
    });
    document.addEventListener('keyup', function (e) { if (e.key === 'ArrowLeft') keys.l = false; else if (e.key === 'ArrowRight') keys.r = false; });
    btn.addEventListener('click', start);
    reset(); draw();
  }

  function boot() { check(); timer = setInterval(check, 30000); }
  if (document.body) boot(); else document.addEventListener('DOMContentLoaded', boot);
})();
