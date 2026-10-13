/*
 * Prumo — recursos extras
 *  1. Notificações dentro do app (em tempo real entre abas abertas)
 *  2. Busca global (Ctrl+K) e atalhos de teclado
 *  3. Movimento: contagem dos números, esqueleto de carregamento, transições, confete e confirmação
 *  4. Lançamento em lote
 *  5. Calendário de obrigações fiscais (com alerta para o responsável pela carteira)
 *  6. Relatórios agendados (avisam no app quando ficam prontos)
 *  7. Resumo semanal do gestor, dashboard personalizável e modo apresentação
 *  8. Tour de boas-vindas, quadro de tarefas com arrastar e soltar e modo compacto das tabelas
 * Carregado antes do app.js: as ações entram em P.actions pelo P.ext.actions.
 */
'use strict';
(function (P) {
  const D = P.date, F = P.fmt, esc = P.esc, api = P.api, V = P.V, M = P.M, icon = V.icon;
  const db = () => P.store.db;
  const S = () => P.state;
  const ui = () => P.ui;
  const $ = (s, r = document) => r.querySelector(s);
  const reduceMotion = () => !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const first = name => P.firstName(name || '');
  const deny = msg => { throw new P.AccessError(msg); };
  const A = {};
  P.ext = { actions: A };
  const fx = P.fx = {};

  /* ======================================================================
   * 1. Notificações no app
   * ==================================================================== */
  const notifs = () => (db().notifications = db().notifications || []);
  P.notify = (userIds, n) => {
    const at = D.stamp(), ts = Date.now();
    [...new Set((userIds || []).filter(Boolean))].forEach(uid => notifs().push({ id: P.uid('n'), userId: uid, at, ts, read: false, type: n.type || 'info', icon: n.icon || 'bell', title: n.title, text: n.text || '', link: n.link || '', sched: n.sched || null }));
    if (notifs().length > 3000) notifs().splice(0, notifs().length - 3000);
  };
  fx.unreadNotifs = u => notifs().filter(n => n.userId === u.id && !n.read).length;
  const myNotifs = u => notifs().filter(n => n.userId === u.id).sort((a, b) => b.ts - a.ts);
  const relTime = ts => {
    const s = Math.round((Date.now() - ts) / 1000);
    if (s < 60) return 'agora';
    if (s < 3600) return 'há ' + Math.round(s / 60) + ' min';
    if (s < 86400) return 'há ' + Math.round(s / 3600) + ' h';
    if (s < 172800) return 'ontem';
    return new Date(ts).toLocaleDateString('pt-BR');
  };
  const vacApprovers = v => db().users.filter(x => x.active !== false && api.canReviewVacation(x, v)).map(x => x.id);
  const teamOf = deptId => db().users.filter(x => x.active !== false && x.deptId === deptId).map(x => x.id);

  // Cada ação relevante gera notificação para quem precisa saber
  const wrap = (name, after) => {
    const orig = api[name]; if (!orig) return;
    api[name] = function (...args) { const r = orig.apply(api, args); try { after(r, ...args); P.store.save(); } catch (e) { console.warn('notificação', e); } return r; };
  };
  wrap('requestVacation', (v, u) => P.notify(vacApprovers(v), { type: 'ferias', icon: 'palm', title: 'Novo pedido de férias', text: `${u.name} pediu férias de ${D.fmt(v.start)} a ${D.fmt(v.end)}.`, link: 'ferias' }));
  wrap('reviewVacation', (v, u) => {
    const who = P.user(v.userId), per = D.fmt(v.start) + ' a ' + D.fmt(v.end);
    if (v.status === 'aprovada') { P.notify([v.userId], { type: 'ferias', icon: 'check', title: 'Férias aprovadas', text: `Suas férias de ${per} foram aprovadas por ${u.name} e já estão no calendário.`, link: 'ferias' }); fx.success(); }
    else if (v.status === 'recusada') P.notify([v.userId], { type: 'ferias', icon: 'x', title: 'Férias recusadas', text: `${u.name} recusou o pedido de ${per}. Veja o motivo na página de férias.`, link: 'ferias' });
    else {
      P.notify([v.userId], { type: 'ferias', icon: 'right', title: 'Pedido de férias avançou', text: `${u.name} aprovou o seu pedido de ${per}. Agora ele segue para ${P.VAC[v.status].short.toLowerCase()}.`, link: 'ferias' });
      P.notify(vacApprovers(v), { type: 'ferias', icon: 'palm', title: 'Férias aguardando você', text: `Pedido de ${who.name} (${per}) aprovado por ${u.name}.`, link: 'ferias' });
      fx.success();
    }
  });
  wrap('reviewEntry', (r, u, id, action, opts = {}) => {
    const e = P.idx.byId.get(id); if (!e || e.userId === u.id) return;
    const lbl = { aprovar: 'aprovado', recusar: 'recusado', correcao: 'precisa de correção', editar: 'ajustado e aprovado' }[action];
    P.notify([e.userId], { type: 'lancamento', icon: action === 'recusar' ? 'x' : action === 'correcao' ? 'undo' : 'check', title: 'Lançamento ' + lbl, text: `${P.act(e.activityId).name} de ${D.fmt(e.date)}${e.client ? ' · ' + e.client : ''}${opts.note ? ': ' + opts.note : ''}`, link: 'lancamentos' });
    if (action === 'aprovar' || action === 'editar') fx.success();
  });
  wrap('addRecognition', (r, u) => {
    if (r.visible) P.notify([r.userId], { type: 'reconhecimento', icon: 'medal', title: 'Você recebeu um reconhecimento', text: `${u.name}: ${r.text}`, link: 'dashboard' });
    if (r.shared) P.notify(teamOf(r.deptId).filter(id => id !== r.userId && id !== u.id), { type: 'mural', icon: 'medal', title: 'Novo reconhecimento no mural', text: `${P.user(r.userId).name} foi reconhecido(a) em ${P.REC_CATEGORIES[r.category]}.`, link: 'mural' });
  });
  wrap('shareRecognition', (r, u) => { if (r.shared) P.notify(teamOf(r.deptId).filter(id => id !== r.userId && id !== u.id), { type: 'mural', icon: 'medal', title: 'Novo reconhecimento no mural', text: `${P.user(r.userId).name} foi reconhecido(a) em ${P.REC_CATEGORIES[r.category]}.`, link: 'mural' }); });
  wrap('saveTask', (t, u) => { if (t.userId !== u.id) P.notify([t.userId], { type: 'tarefa', icon: 'clipboard', title: 'Nova tarefa para você', text: `${t.title} · prazo ${D.fmt(t.due)} (atribuída por ${u.name}).`, link: 'atividades' }); });

  // Pop-up de notificação (canto da tela) e sino que balança
  const popBox = () => { let b = $('#notif-pop'); if (!b) { b = document.createElement('div'); b.id = 'notif-pop'; b.setAttribute('aria-live', 'polite'); document.body.appendChild(b); } return b; };
  fx.popNotif = (n, opts = {}) => {
    const el = document.createElement('button');
    el.type = 'button'; el.className = 'npop';
    el.innerHTML = `<span class="npop-ic">${icon(n.icon || 'bell')}</span><span class="npop-t"><b>${esc(n.title)}</b><small>${esc(n.text || '')}</small></span>`;
    el.addEventListener('click', () => { if (n.id) openNotif(n.id); else if (opts.onClick) opts.onClick(); el.remove(); });
    popBox().appendChild(el);
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 400); }, opts.ms || 6500);
  };
  fx.shakeBell = () => { const b = $('.top .bell'); if (!b || reduceMotion()) return; b.classList.remove('ring'); void b.offsetWidth; b.classList.add('ring'); };

  // Painel do sino: notificações + atalho para a central de alertas.
  // Notificação vista some: as que apareceram no painel são apagadas quando ele fecha; a que foi clicada, na hora.
  const seen = new Set();
  const dropNotifs = ids => {
    if (!ids.size) return false;
    const before = notifs().length;
    db().notifications = notifs().filter(n => !ids.has(n.id));
    ids.clear();
    if (notifs().length === before) return false;
    P.store.save(); return true;
  };
  const closeNotif = () => {
    const p = $('#notif-panel'); if (!p) return;
    p.remove();
    if (dropNotifs(seen) && S().user) P.render();
  };
  const openNotif = id => {
    const n = notifs().find(x => x.id === id); if (!n) return;
    seen.add(n.id);
    const p = $('#notif-panel'); if (p) p.remove();
    dropNotifs(seen);
    if (n.sched) { const sc = (db().reportSchedules || []).find(x => x.id === n.sched); if (sc) Object.assign(S().rep, JSON.parse(JSON.stringify(sc.cfg))); }
    if (n.link) P.go(n.link); else P.render();
  };
  const renderNotifPanel = () => {
    const u = S().user; if (!u) return;
    const list = myNotifs(u).slice(0, 25);
    list.forEach(n => seen.add(n.id));
    const alertsUnread = P.alerts(u).filter(a => !a.read).length;
    let p = $('#notif-panel');
    if (!p) { p = document.createElement('div'); p.id = 'notif-panel'; p.setAttribute('role', 'dialog'); p.setAttribute('aria-label', 'Notificações'); document.body.appendChild(p); }
    const bell = $('.top .bell'), r = bell ? bell.getBoundingClientRect() : { right: innerWidth - 16, bottom: 60 };
    p.style.top = Math.round(r.bottom + 8) + 'px';
    // alinhado ao sino, sem sair da tela (no celular ocupa a largura toda)
    const pw = Math.min(380, innerWidth - 16);
    p.style.left = 'auto';
    p.style.right = Math.max(8, Math.min(Math.round(innerWidth - r.right - 8), innerWidth - pw - 8)) + 'px';
    p.innerHTML = `<header><b>Notificações</b>${list.length ? '<button type="button" class="link" data-act="notifClear">Limpar todas</button>' : ''}</header>
      <div class="np-list">${list.length ? list.map(n => `<button type="button" class="np-item ${n.read ? '' : 'unread'}" data-act="notifOpen" data-id="${n.id}"><span class="np-ic t-${n.type}">${icon(n.icon || 'bell')}</span><span class="np-t"><b>${esc(n.title)}</b><small>${esc(n.text)}</small><em>${relTime(n.ts)}</em></span></button>`).join('') : `<div class="np-empty">${icon('check')}<p>Você está em dia.<br>Aprovações, férias, tarefas e reconhecimentos aparecem aqui.</p></div>`}</div>
      ${list.length ? '<p class="np-hint">As notificações somem depois de vistas.</p>' : ''}
      <footer><button type="button" class="link" data-act="notifAlerts">${icon('alert')} Central de alertas${alertsUnread ? ' (' + alertsUnread + ' não lidos)' : ''}</button></footer>`;
  };
  A.toggleNotif = () => { if ($('#notif-panel')) closeNotif(); else renderNotifPanel(); };
  A.notifOpen = el => openNotif(el.dataset.id);
  A.notifClear = () => { const u = S().user; myNotifs(u).forEach(n => seen.add(n.id)); const p = $('#notif-panel'); if (p) p.remove(); dropNotifs(seen); P.render(); renderNotifPanel(); };
  A.notifAlerts = () => { closeNotif(); P.go('alertas'); };
  document.addEventListener('click', ev => { const p = $('#notif-panel'); if (p && !p.contains(ev.target) && !ev.target.closest('.bell')) closeNotif(); }, true);

  // Tempo real: outra aba (ou outro usuário no mesmo navegador) gravou algo → recarrega e avisa
  const afterExternal = fresh => {
    if (!$('#modal-root') || $('#modal-root').hidden) P.render();
    fresh.slice(-3).forEach(n => fx.popNotif(n));
    if (fresh.length) fx.shakeBell();
    if ($('#notif-panel')) renderNotifPanel();
  };
  window.addEventListener('storage', ev => {
    if (P.isLive || ev.key !== 'prumo.db.v3' || !S().user) return;
    const uid = S().user.id;
    const before = new Set(notifs().filter(n => n.userId === uid).map(n => n.id));
    P.store.load();
    const me = P.user(uid);
    if (!me || me.active === false) return;
    S().user = me;
    afterExternal(notifs().filter(n => n.userId === uid && !before.has(n.id)));
  });
  // Produção (Supabase Realtime): o js/backend.js já aplicou as mudanças e informa o que chegou de novo
  window.addEventListener('prumo:remote', ev => {
    const u = S().user; if (!u) return;
    afterExternal(((ev.detail && ev.detail.added && ev.detail.added.notifications) || []).filter(n => n.userId === u.id));
  });

  /* ======================================================================
   * 2. Busca global (Ctrl+K) e atalhos de teclado
   * ==================================================================== */
  const PAGE_LIST = [['dashboard', 'Início', 'grid'], ['equipe', 'Minha Equipe', 'users'], ['atividades', 'Atividades e tarefas', 'clipboard'], ['lancamentos', 'Lançamentos', 'inbox'], ['metas', 'Metas', 'target'], ['insights', 'Insights', 'bulb'], ['ranking', 'Ranking', 'rank'], ['calendario', 'Calendário', 'calendar'], ['ferias', 'Férias', 'palm'], ['mural', 'Mural de reconhecimentos', 'medal'], ['empresas', 'Empresas', 'briefcase'], ['relatorios', 'Relatórios', 'file'], ['historico', 'Histórico', 'history'], ['alertas', 'Central de alertas', 'bell'], ['configuracoes', 'Configurações e meu perfil', 'cog'], ['departamentos', 'Departamentos', 'building'], ['funcionarios', 'Funcionários', 'userplus'], ['gestores', 'Gestores e diretoria', 'shield'], ['pesos', 'Pesos das atividades', 'scale'], ['gerais', 'Configurações gerais', 'sliders']];
  const commands = u => {
    const emp = u.role === 'employee', act = n => P.actions[n];
    const list = [
      ['Registrar atividade', 'plus', () => emp ? P.go('lancamentos') : u.role === 'manager' ? act('newOwnEntry')({ dataset: {} }) : act('newEntry')({ dataset: {} }), 'N'],
      ['Lançamento em lote', 'inbox', () => A.batchEntry(), 'L'],
      ['Solicitar férias', 'palm', () => emp ? P.go('ferias') : act('newVacation')({ dataset: {} }), 'F']
    ];
    if (!emp) list.push(['Atribuir tarefa', 'clipboard', () => act('newTask')({ dataset: {} })], ['Nova empresa', 'briefcase', () => act('editCompany')({ dataset: {} })], ['Registrar reconhecimento', 'medal', () => act('recognize')({ dataset: {} })], ['Modo apresentação', 'monitor', () => A.presentMode()]);
    list.push(['Agendar relatório', 'clock', () => A.scheduleReport()], ['Alternar tema claro/escuro', 'moon', () => act('toggleTheme')({ dataset: {} })], ['Tabelas compactas (liga/desliga)', 'menu', () => A.toggleDense()], ['Atalhos de teclado', 'help', () => A.shortcuts(), '?'], ['Rever o tour de boas-vindas', 'zap', () => A.startTour()], ['Sair', 'logout', () => act('logout')({ dataset: {} })]);
    return list;
  };
  let pal = null;
  const buildResults = q => {
    const u = S().user, nq = norm(q.trim());
    const match = s => !nq || norm(s).includes(nq);
    const score = s => { const n = norm(s); return !nq ? 1 : n.startsWith(nq) ? 3 : n.split(/\s+/).some(w => w.startsWith(nq)) ? 2 : n.includes(nq) ? 1 : 0; };
    const groups = [];
    const pages = PAGE_LIST.filter(([k, l]) => P.PAGES[k] && P.PAGES[k].includes(u.role) && match(l)).map(([k, l, ic]) => ({ label: l, icon: ic, sub: 'Página', run: () => P.go(k), s: score(l) }));
    const cmds = commands(u).filter(([l]) => match(l)).map(([l, ic, run, key]) => ({ label: l, icon: ic, sub: 'Ação', key, run, s: score(l) }));
    if (cmds.length) groups.push(['Ações', cmds.sort((a, b) => b.s - a.s).slice(0, nq ? 6 : 4)]);
    if (pages.length) groups.push(['Páginas', pages.sort((a, b) => b.s - a.s).slice(0, nq ? 6 : 8)]);
    if (nq.length >= 2) {
      const digits = q.replace(/\D/g, '');
      const comps = api.companies(u).filter(c => match(c.name) || match(c.tradeName) || (c.code && norm(c.code) === nq) || (digits.length >= 3 && P.cnpj.digits(c.cnpj).includes(digits)))
        .map(c => ({ label: c.name, icon: 'briefcase', sub: [c.code ? 'Cód. ' + c.code : '', c.cnpj, P.REGIMES[c.regime] ? P.REGIMES[c.regime].short : ''].filter(Boolean).join(' · '), run: () => { S().comp.q = c.name; S().comp.status = ''; P.go('empresas'); }, s: score(c.name) }))
        .sort((a, b) => b.s - a.s).slice(0, 6);
      if (u.role !== 'employee') {
        const people = api.workers(u).filter(x => match(x.name) || match(x.email)).map(x => ({ label: x.name, icon: 'user', avatar: x, sub: (P.dept(x.deptId) ? P.dept(x.deptId).name + ' · ' : '') + (x.title || ''), run: () => P.go('funcionario/' + x.id), s: score(x.name) })).sort((a, b) => b.s - a.s).slice(0, 6);
        if (people.length) groups.push(['Pessoas', people]);
      }
      if (comps.length) groups.push(['Empresas', comps]);
    }
    return groups;
  };
  const paintPalette = () => {
    if (!pal) return;
    const groups = buildResults(pal.input.value);
    pal.items = groups.flatMap(g => g[1]);
    pal.sel = Math.min(pal.sel, Math.max(0, pal.items.length - 1));
    let i = 0;
    pal.list.innerHTML = groups.length ? groups.map(([g, items]) => `<div class="ck-g">${g}</div>${items.map(it => { const k = i++; return `<button type="button" class="ck-i ${k === pal.sel ? 'on' : ''}" data-k="${k}">${it.avatar ? V.avatar(it.avatar) : `<span class="ck-ic">${icon(it.icon)}</span>`}<span class="ck-t"><b>${esc(it.label)}</b>${it.sub ? `<small>${esc(it.sub)}</small>` : ''}</span>${it.key ? `<kbd>${it.key}</kbd>` : ''}</button>`; }).join('')}`).join('')
      : `<div class="ck-empty">Nada encontrado para “${esc(pal.input.value)}”.</div>`;
    const on = pal.list.querySelector('.ck-i.on'); if (on) on.scrollIntoView({ block: 'nearest' });
  };
  const closePalette = () => { if (pal) { pal.root.remove(); pal = null; } };
  const runPalette = k => { const it = pal && pal.items[k]; if (!it) return; closePalette(); ui().guard(() => it.run()); };
  A.openSearch = () => {
    if (!S().user || pal) return;
    closeNotif();
    const root = document.createElement('div');
    root.className = 'ck-root';
    root.innerHTML = `<div class="ck-back"></div><div class="ck" role="dialog" aria-label="Busca global"><label class="ck-in">${icon('search')}<input type="search" placeholder="Buscar páginas, empresas, pessoas ou ações…" aria-label="Buscar" autocomplete="off"><kbd>Esc</kbd></label><div class="ck-list" role="listbox"></div><div class="ck-foot"><span><kbd>↑</kbd><kbd>↓</kbd> navegar</span><span><kbd>Enter</kbd> abrir</span><span><kbd>Esc</kbd> fechar</span></div></div>`;
    document.body.appendChild(root);
    pal = { root, input: root.querySelector('input'), list: root.querySelector('.ck-list'), sel: 0, items: [] };
    pal.input.addEventListener('input', () => { pal.sel = 0; paintPalette(); });
    pal.input.addEventListener('keydown', ev => {
      if (ev.key === 'ArrowDown') { ev.preventDefault(); pal.sel = Math.min(pal.sel + 1, pal.items.length - 1); paintPalette(); }
      else if (ev.key === 'ArrowUp') { ev.preventDefault(); pal.sel = Math.max(pal.sel - 1, 0); paintPalette(); }
      else if (ev.key === 'Enter') { ev.preventDefault(); runPalette(pal.sel); }
      else if (ev.key === 'Escape') { ev.preventDefault(); closePalette(); }
    });
    root.querySelector('.ck-back').addEventListener('click', closePalette);
    pal.list.addEventListener('click', ev => { const b = ev.target.closest('.ck-i'); if (b) runPalette(Number(b.dataset.k)); });
    paintPalette();
    setTimeout(() => pal && pal.input.focus(), 10);
  };
  A.shortcuts = () => ui().modal({
    title: 'Atalhos de teclado', cancel: 'Fechar',
    body: `<dl class="kbd-list">${[['Ctrl + K ou /', 'Busca global'], ['N', 'Registrar atividade'], ['L', 'Lançamento em lote'], ['F', 'Férias'], ['H', 'Início (dashboard)'], ['M', 'Mural de reconhecimentos'], ['B', 'Notificações'], ['?', 'Esta lista de atalhos'], ['Esc', 'Fechar janelas, busca e apresentação']].map(([k, d]) => `<div><dt>${k.split(' ou ').map(x => x.split(' + ').map(y => `<kbd>${y}</kbd>`).join(' + ')).join(' ou ')}</dt><dd>${d}</dd></div>`).join('')}</dl><p class="fine">Os atalhos de uma letra não funcionam enquanto você digita em um campo.</p>`
  });
  document.addEventListener('keydown', ev => {
    if (!S().user) return;
    const k = ev.key || '', typing = ev.target && ev.target.closest ? ev.target.closest('input, textarea, select, [contenteditable="true"]') : null;
    if ((ev.ctrlKey || ev.metaKey) && (k === 'k' || k === 'K')) { ev.preventDefault(); pal ? closePalette() : A.openSearch(); return; }
    if (k === 'Escape') { closeNotif(); if (pal) closePalette(); if (S().present) A.presentMode(); if (tour) endTour(false); return; }
    if (typing || ev.ctrlKey || ev.metaKey || ev.altKey || pal || tour) return;
    if ($('#modal-root') && !$('#modal-root').hidden) return;
    const map = { '/': () => A.openSearch(), n: () => commands(S().user)[0][2](), l: () => A.batchEntry(), f: () => P.go('ferias'), h: () => P.go('dashboard'), m: () => P.go('mural'), b: () => A.toggleNotif(), '?': () => A.shortcuts() };
    const fn = map[k.toLowerCase()] || map[k];
    if (fn) { ev.preventDefault(); ui().guard(fn); }
  });

  /* ======================================================================
   * 3. Movimento
   * ==================================================================== */
  const HEAVY = new Set(['dashboard', 'insights', 'ranking', 'relatorios', 'equipe', 'empresas', 'calendario', 'historico', 'funcionario']);
  fx.heavy = page => HEAVY.has(page) && !reduceMotion();
  // Esqueleto genérico; também serve para quando os dados vierem do banco (Supabase)
  fx.skeleton = () => `<div class="sk-page" aria-busy="true" aria-label="Carregando">
      <div class="sk sk-title"></div><div class="sk sk-sub"></div>
      <div class="sk-row">${'<div class="sk sk-kpi"></div>'.repeat(4)}</div>
      <div class="sk-grid"><div class="sk sk-card"></div><div class="sk sk-card"></div></div>
      <div class="sk sk-wide"></div>
    </div>`;
  const parseNum = txt => {
    const m = String(txt).match(/^(\s*[^\d\-−]*)(-?[\d.]*\d(?:,\d+)?)(.*)$/s);
    if (!m) return null;
    const raw = m[2], dec = raw.includes(',') ? raw.split(',')[1].length : 0;
    const val = Number(raw.replace(/\./g, '').replace(',', '.'));
    return isFinite(val) ? { pre: m[1], val, dec, suf: m[3] } : null;
  };
  fx.countUp = root => {
    if (reduceMotion()) return;
    root.querySelectorAll('.kpi-value, .strip b, .mini b, .ws-num, .present-big').forEach(el => {
      const node = [...el.childNodes].find(n => n.nodeType === 3 && /\d/.test(n.nodeValue));
      if (!node) return;
      const p = parseNum(node.nodeValue); if (!p || p.val === 0 || p.val > 1e7) return;
      const t0 = performance.now(), dur = 750;
      const fmt = v => p.pre + v.toLocaleString('pt-BR', { minimumFractionDigits: p.dec, maximumFractionDigits: p.dec }) + p.suf;
      const step = now => { const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3); node.nodeValue = fmt(p.val * e); if (k < 1) requestAnimationFrame(step); else node.nodeValue = fmt(p.val); };
      node.nodeValue = fmt(0); requestAnimationFrame(step);
    });
  };
  let lastUnread = null;
  fx.afterRender = routeChanged => {
    const u = S().user, view = $('#view');
    document.body.classList.toggle('dense', ui().ls.get('prumo.dense') === '1');
    if (!u || !view) return;
    if (routeChanged && !reduceMotion()) { view.classList.add('anim'); fx.countUp(view); setTimeout(() => view.classList.remove('anim'), 1300); }
    const unread = fx.unreadNotifs(u) + P.alerts(u).filter(a => !a.read).length;
    if (lastUnread != null && unread > lastUnread) fx.shakeBell();
    lastUnread = unread;
    if ($('#notif-panel')) renderNotifPanel();
  };
  // Confete discreto (meta atingida, reconhecimento recebido)
  fx.confetti = () => {
    if (reduceMotion()) return;
    const cv = document.createElement('canvas'); cv.className = 'confetti'; document.body.appendChild(cv);
    const ctx = cv.getContext('2d'), W = cv.width = innerWidth, H = cv.height = innerHeight;
    const colors = ['#e0a63a', '#2a78d6', '#1baf7a', '#eb6834', '#e87ba4', '#ffffff'];
    const parts = Array.from({ length: 140 }, () => ({ x: W / 2 + (Math.random() - .5) * W * .3, y: H * .35, vx: (Math.random() - .5) * 14, vy: -Math.random() * 13 - 4, s: 5 + Math.random() * 5, r: Math.random() * 6, vr: (Math.random() - .5) * .3, c: colors[Math.floor(Math.random() * colors.length)] }));
    const t0 = performance.now();
    const tick = now => {
      const t = now - t0; ctx.clearRect(0, 0, W, H);
      parts.forEach(p => { p.vy += .35; p.vx *= .99; p.x += p.vx; p.y += p.vy; p.r += p.vr; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.globalAlpha = Math.max(0, 1 - t / 2200); ctx.fillStyle = p.c; ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); ctx.restore(); });
      if (t < 2200) requestAnimationFrame(tick); else cv.remove();
    };
    requestAnimationFrame(tick);
  };
  // Confirmação animada (aprovações)
  fx.success = () => {
    if (reduceMotion()) return;
    const el = document.createElement('div'); el.className = 'ok-burst'; el.setAttribute('aria-hidden', 'true');
    el.innerHTML = '<svg viewBox="0 0 52 52"><circle cx="26" cy="26" r="24"/><path d="M15 27l7 7 15-16"/></svg>';
    document.body.appendChild(el); setTimeout(() => el.remove(), 900);
  };
  // Botões principais "pulsam" ao serem acionados
  document.addEventListener('click', ev => { const b = ev.target.closest('.btn.primary, [data-act=modalSubmit]'); if (b && !reduceMotion()) { b.classList.remove('pulse'); void b.offsetWidth; b.classList.add('pulse'); } }, true);

  // Ao entrar: avisa notificações novas, celebra conquistas e abre o tour na primeira vez
  fx.onLogin = (user, boot) => {
    const u = P.user(user.id); if (!u || !S().user || S().user.id !== u.id) return;
    // descarta avisos que eram de quem estava logado antes
    const pb = $('#notif-pop'); if (pb) pb.innerHTML = '';
    closeNotif();
    runSchedules(u);
    const unread = myNotifs(u).filter(n => !n.read);
    if (unread.length === 1) fx.popNotif(unread[0]);
    else if (unread.length > 1) fx.popNotif({ icon: 'bell', title: `Você tem ${unread.length} notificações novas`, text: unread.slice(0, 2).map(n => n.title).join(' · ') + (unread.length > 2 ? '…' : '') }, { onClick: () => renderNotifPanel() });
    if (unread.length) fx.shakeBell();
    const key = 'prumo.celebrated.' + u.id, done = new Set(JSON.parse(ui().ls.get(key) || '[]'));
    const wins = [];
    api.recognitions(u, { userId: u.id }).filter(r => r.visible && !done.has('rec-' + r.id)).forEach(r => wins.push('rec-' + r.id));
    P.alerts(u).filter(a => a.id.startsWith('goal-' + u.id)).forEach(a => { if (!done.has(a.id)) wins.push(a.id); });
    if (wins.length) { setTimeout(fx.confetti, boot ? 300 : 700); wins.forEach(w => done.add(w)); ui().ls.set(key, JSON.stringify([...done].slice(-200))); }
    if (!u.tourDone) setTimeout(() => A.startTour(), wins.length ? 2600 : 900);
  };

  /* ======================================================================
   * 4. Lançamento em lote
   * ==================================================================== */
  const batchPeople = u => u.role === 'employee' ? [u] : (u.role === 'manager' ? [u] : []).concat(api.workers(u).filter(x => x.id !== u.id && (P.isGlobal(u) || x.role === 'employee')));
  const batchState = { all: false };
  const paintBatch = () => {
    const m = $('#batch-form'); if (!m) return;
    const u = S().user, uid = $('#be-user', m).value, person = P.user(uid);
    const actSel = $('#be-act', m), prevAct = actSel.value;
    const acts = api.activities(u, person.deptId, false).filter(a => a.active);
    actSel.innerHTML = acts.map(a => `<option value="${a.id}" data-w="${a.weight}" data-unit="${esc(a.unit)}" ${a.id === prevAct ? 'selected' : ''}>${esc(a.name)} · ${F.n(a.weight, 2)} pt/${esc(a.unit)}</option>`).join('');
    const carteira = new Set(api.clientsFor(u, uid));
    const q = norm($('#be-q', m).value);
    const checked = new Set([...m.querySelectorAll('.be-co input:checked')].map(i => i.value));
    let comps = api.companies(u).filter(c => c.active);
    if (!batchState.all) comps = comps.filter(c => carteira.has(c.name));
    if (q) comps = comps.filter(c => norm(c.name).includes(q) || norm(c.code).includes(q));
    comps.sort((a, b) => (carteira.has(b.name) - carteira.has(a.name)) || a.name.localeCompare(b.name));
    $('#be-list', m).innerHTML = comps.length ? comps.slice(0, 300).map(c => `<label class="be-co"><input type="checkbox" value="${esc(c.name)}" ${checked.has(c.name) ? 'checked' : ''}><span>${esc(c.name)}${c.code ? ` <small class="muted">${esc(c.code)}</small>` : ''}</span>${carteira.has(c.name) ? '<em>carteira</em>' : ''}</label>`).join('')
      : `<p class="muted be-none">${batchState.all ? 'Nenhuma empresa encontrada.' : 'Nenhuma empresa na carteira desta pessoa. Marque "Mostrar todas as empresas".'}</p>`;
    // empresas marcadas que saíram do filtro continuam marcadas
    checked.forEach(n => { if (!comps.some(c => c.name === n)) $('#be-list', m).insertAdjacentHTML('afterbegin', `<label class="be-co"><input type="checkbox" value="${esc(n)}" checked><span>${esc(n)}</span><em>selecionada</em></label>`); });
    paintBatchCalc();
  };
  const paintBatchCalc = () => {
    const m = $('#batch-form'); if (!m) return;
    const n = m.querySelectorAll('.be-co input:checked').length, opt = $('#be-act', m).selectedOptions[0];
    const w = opt ? Number(opt.dataset.w) : 0, q = Number($('#be-qty', m).value) || 0;
    $('#be-calc', m).innerHTML = `<b>${n}</b> empresa${n === 1 ? '' : 's'} × ${F.n(q, 2)} × ${F.n(w, 2)} = <b>${F.n(P.round2(n * q * w), 2)} pontos</b>`;
  };
  A.batchEntry = () => {
    const u = S().user, people = batchPeople(u);
    if (!people.length) return P.toast('Não há colaboradores no seu escopo para registrar em lote.', 'err');
    batchState.all = false;
    ui().modal({
      title: 'Lançamento em lote', wide: true, submit: 'Registrar lançamentos',
      body: `<form id="batch-form" class="form" novalidate><div class="fgrid">
        <label class="field"><span>Colaborador(a)</span><select id="be-user" ${people.length === 1 ? 'disabled' : ''}>${people.map(x => `<option value="${x.id}">${esc(x.name)}${x.id === u.id ? ' (eu)' : ''}</option>`).join('')}</select></label>
        <label class="field span2"><span>Atividade</span><select id="be-act"></select></label>
        <label class="field"><span>Data</span><input type="date" id="be-date" value="${D.iso(P.today())}" max="${D.iso(P.today())}"></label>
        <label class="field"><span>Quantidade por empresa</span><input type="number" id="be-qty" value="1" min="0.25" step="0.25"></label>
        <label class="field"><span>Observação <small>(opcional)</small></span><input type="text" id="be-obs" placeholder="Vale para todos os lançamentos"></label>
      </div>
      <div class="be-tools"><label class="in-ic">${icon('search')}<input type="search" id="be-q" placeholder="Filtrar empresas"></label>
        <label class="check-inline"><input type="checkbox" id="be-all"> Mostrar todas as empresas</label>
        <button type="button" class="link" data-act="batchAll">Marcar todas da lista</button><button type="button" class="link" data-act="batchNone">Desmarcar</button></div>
      <div class="be-list" id="be-list"></div>
      <p class="be-calc" id="be-calc"></p>
      <p class="fine">Um lançamento é criado para cada empresa marcada. ${u.role === 'employee' ? 'Eles entram como pendentes até a aprovação do gestor.' : ''}</p></form>`,
      onSubmit: m => {
        const userId = $('#be-user', m).value, activityId = $('#be-act', m).value, date = $('#be-date', m).value, qty = Number($('#be-qty', m).value), obs = $('#be-obs', m).value.trim();
        const names = [...m.querySelectorAll('.be-co input:checked')].map(i => i.value);
        if (!activityId) throw new Error('Selecione a atividade.');
        if (!date || date > D.iso(P.today())) throw new Error('Informe uma data até hoje.');
        if (!(qty > 0) || qty > 200) throw new Error('Informe uma quantidade entre 0,25 e 200.');
        if (!names.length) throw new Error('Marque pelo menos uma empresa.');
        if (names.length > 150) throw new Error('Marque no máximo 150 empresas por lote.');
        let pts = 0;
        names.forEach(client => { const e = api.createEntry(u, { userId, activityId, date, qty, client, obs }); pts += e.points; });
        P.toast(`${names.length} lançamento${names.length > 1 ? 's' : ''} registrado${names.length > 1 ? 's' : ''} (${F.n(P.round2(pts), 2)} pts).`);
        fx.success(); P.render();
      }
    });
    paintBatch();
  };
  A.batchAll = () => { document.querySelectorAll('#be-list .be-co input').forEach(i => { i.checked = true; }); paintBatchCalc(); };
  A.batchNone = () => { document.querySelectorAll('#be-list .be-co input').forEach(i => { i.checked = false; }); paintBatchCalc(); };
  document.addEventListener('change', ev => {
    if (!ev.target.closest('#batch-form')) return;
    if (ev.target.id === 'be-all') { batchState.all = ev.target.checked; paintBatch(); }
    else if (ev.target.id === 'be-user') paintBatch();
    else paintBatchCalc();
  });
  document.addEventListener('input', ev => {
    if (ev.target.id === 'be-q') paintBatch();
    else if (ev.target.id === 'be-qty') paintBatchCalc();
  });

  /* ======================================================================
   * 5. Obrigações fiscais
   * Datas de REFERÊNCIA: confira a legislação e os calendários oficiais (prorrogações acontecem).
   * shift: 'antes' antecipa para o dia útil anterior; 'depois' prorroga para o próximo dia útil.
   * ==================================================================== */
  const COMMON = ['simples', 'presumido', 'real'], LUCRO = ['presumido', 'real'];
  P.OBRIGACOES = [
    { id: 'esocial', name: 'eSocial (eventos periódicos)', short: 'eSocial', dept: 'd3', regimes: COMMON, day: 15 },
    { id: 'dctfweb', name: 'DCTFWeb', short: 'DCTFWeb', dept: 'd3', regimes: COMMON, day: 15 },
    { id: 'reinf', name: 'EFD-Reinf', short: 'Reinf', dept: 'd2', regimes: LUCRO, day: 15 },
    { id: 'das', name: 'DAS (Simples Nacional)', short: 'DAS', dept: 'd2', regimes: ['simples'], day: 20, shift: 'depois' },
    { id: 'dasmei', name: 'DAS-MEI', short: 'DAS-MEI', dept: 'd2', regimes: ['mei'], day: 20, shift: 'depois' },
    { id: 'fgts', name: 'FGTS Digital', short: 'FGTS', dept: 'd3', regimes: COMMON, day: 20 },
    { id: 'darfprev', name: 'DARF previdenciário (DCTFWeb)', short: 'DARF INSS', dept: 'd3', regimes: COMMON, day: 20 },
    { id: 'piscofins', name: 'PIS/COFINS', short: 'PIS/COFINS', dept: 'd2', regimes: LUCRO, day: 25 },
    { id: 'efdcontrib', name: 'EFD-Contribuições', short: 'EFD-Contrib.', dept: 'd2', regimes: LUCRO, nth: 10 },
    { id: 'irpj', name: 'IRPJ/CSLL trimestral (1ª quota ou única)', short: 'IRPJ/CSLL', dept: 'd2', regimes: LUCRO, last: true, months: [1, 4, 7, 10] },
    { id: 'defis', name: 'DEFIS (anual)', short: 'DEFIS', dept: 'd2', regimes: ['simples'], day: 31, months: [3] },
    { id: 'dasnsimei', name: 'DASN-SIMEI (anual)', short: 'DASN-SIMEI', dept: 'd2', regimes: ['mei'], day: 31, months: [5] },
    { id: 'ecd', name: 'ECD (anual)', short: 'ECD', dept: 'd1', regimes: LUCRO, last: true, months: [6] },
    { id: 'ecf', name: 'ECF (anual)', short: 'ECF', dept: 'd1', regimes: LUCRO, last: true, months: [7] }
  ];
  const shiftDay = (d, dir) => { let x = new Date(d); let k = 0; while (!D.isWorkday(x) && k++ < 15) x = D.add(x, dir === 'depois' ? 1 : -1); return x; };
  const nthWorkday = (y, m, n) => { let x = new Date(y, m, 1), k = 0; for (let i = 0; i < 40; i++) { if (D.isWorkday(x) && ++k === n) return x; x = D.add(x, 1); } return x; };
  P.obligationsIn = (y, m) => P.OBRIGACOES.filter(o => !o.months || o.months.includes(m + 1)).map(o => {
    let d;
    if (o.last) d = shiftDay(new Date(y, m + 1, 0), 'antes');
    else if (o.nth) d = nthWorkday(y, m, o.nth);
    else d = shiftDay(new Date(y, m, Math.min(o.day, new Date(y, m + 1, 0).getDate())), o.shift || 'antes');
    return Object.assign({}, o, { date: D.iso(d) });
  });
  // Empresas ativas atingidas por uma obrigação (todas e as da carteira de quem consulta)
  P.obligationScope = (u, o) => {
    const comps = db().companies.filter(c => c.active && o.regimes.includes(c.regime));
    const mine = new Set(db().clientAssignments.filter(a => a.userId === u.id && a.deptId === o.dept).map(a => a.client));
    return { total: comps.length, mine: comps.filter(c => mine.has(c.name)).length };
  };
  // Obrigações visíveis para a pessoa: do próprio departamento (gerência e diretoria veem todas)
  P.obligationsFor = (u, y, m, deptId) => P.obligationsIn(y, m).filter(o => (P.isGlobal(u) ? (!deptId || o.dept === deptId) : o.dept === u.deptId)).map(o => Object.assign(o, P.obligationScope(u, o)));

  // Alerta para quem tem empresas da carteira com obrigação vencendo em até 5 dias
  V.ALERT.purple = ['Obrigações fiscais', 'calendar'];
  const origAlerts = P.alerts;
  P.alerts = function (u) {
    const out = origAlerts(u);
    try {
      if (!u || P.isGlobal(u)) return out;
      const t = P.today(), lim = D.iso(D.add(t, 5)), today = D.iso(t);
      const read = new Set(db().alertsRead[u.id] || []);
      const list = P.obligationsFor(u, t.getFullYear(), t.getMonth()).concat(t.getDate() > 24 ? P.obligationsFor(u, D.addMonths(t, 1).getFullYear(), D.addMonths(t, 1).getMonth()) : []);
      list.filter(o => o.date >= today && o.date <= lim && (o.mine > 0 || (u.role === 'manager' && o.total > 0))).forEach(o => {
        const id = 'obr-' + o.id + '-' + o.date;
        out.push({ id, color: 'purple', date: today, link: 'calendario', read: read.has(id), title: o.short + ' vence em ' + D.fmt(o.date),
          text: `${o.name}: ${o.total} empresa${o.total > 1 ? 's' : ''} do escritório${o.mine ? `, ${o.mine} na sua carteira` : ''}. Vencimento ${o.date === today ? 'hoje' : 'em ' + D.WEEKDAYS_L[D.parse(o.date).getDay()] + ', ' + D.fmt(o.date)}.` });
      });
    } catch (e) { console.warn(e); }
    return out;
  };
  // Usado pelo calendário (views2)
  V.obligationsCard = (u, m, deptId) => {
    const list = P.obligationsFor(u, m.getFullYear(), m.getMonth(), deptId).sort((a, b) => a.date < b.date ? -1 : 1);
    const today = D.iso(P.today());
    return V.card('Obrigações fiscais do mês', list.length ? `<ul class="obr-list">${list.map(o => `<li class="${o.date < today ? 'past' : o.date <= D.iso(D.add(P.today(), 5)) ? 'soon' : ''}"><button type="button" class="link" data-act="calSel" data-date="${o.date}">${D.fmt(o.date)}</button><span><b>${esc(o.name)}</b><small>${esc(P.dept(o.dept) ? P.dept(o.dept).name : '')} · ${o.total ? o.total + ' empresa' + (o.total > 1 ? 's' : '') : 'nenhuma empresa com esse regime cadastrado'}${o.mine ? ' · ' + o.mine + ' na sua carteira' : ''}</small></span></li>`).join('')}</ul><p class="fine obr-note">Datas de referência, ajustadas para dia útil. Confira prorrogações e mudanças na legislação.</p>` : V.empty('Nenhuma obrigação para o seu departamento neste mês.', 'calendar'), { cls: 'flush-b' });
  };
  V.obligationTags = (u, iso, deptId) => {
    const d = D.parse(iso);
    return P.obligationsFor(u, d.getFullYear(), d.getMonth(), deptId).filter(o => o.date === iso).map(o => `<i class="tag obr" title="${esc(o.name)} · ${o.total} empresas">${esc(o.short)}</i>`).join('');
  };

  /* ======================================================================
   * 6. Relatórios agendados (aviso dentro do app)
   * ==================================================================== */
  const scheds = () => (db().reportSchedules = db().reportSchedules || []);
  const WEEKDAY = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
  const lastDue = sc => {
    const t = P.today();
    if (sc.freq === 'mensal') return D.iso(new Date(t.getFullYear(), t.getMonth(), 1));
    let d = new Date(t); while (d.getDay() !== sc.weekday) d = D.add(d, -1); return D.iso(d);
  };
  const schedLabel = sc => {
    const c = sc.cfg, per = { semana: 'esta semana', semana_ant: 'semana anterior', mes: 'este mês', mes_ant: 'mês anterior', '3m': 'últimos 3 meses', '6m': 'últimos 6 meses' }[c.period] || c.period;
    const subj = c.type === 'individual' ? (P.user(c.userId) || {}).name || 'individual' : (P.dept(c.deptId) || {}).name || 'departamento';
    return `${c.type === 'individual' ? 'Individual' : 'Departamento'} · ${subj} · ${per}`;
  };
  const runSchedules = u => {
    let changed = false;
    scheds().filter(sc => sc.userId === u.id).forEach(sc => {
      const due = lastDue(sc);
      if (!sc.lastRun || sc.lastRun < due) {
        if (sc.lastRun || due === D.iso(P.today())) P.notify([u.id], { type: 'relatorio', icon: 'file', title: 'Relatório pronto', text: schedLabel(sc) + '. Clique para abrir e exportar em PDF ou Excel.', link: 'relatorios', sched: sc.id });
        sc.lastRun = due; changed = true;
      }
    });
    if (changed) P.store.save();
  };
  A.scheduleReport = () => {
    const u = S().user, r = S().rep;
    const mine = scheds().filter(sc => sc.userId === u.id);
    ui().modal({
      title: 'Agendar relatório', submit: 'Agendar',
      body: `<p class="prose">O relatório configurado na página Relatórios (<b>${esc(schedLabel({ cfg: r }))}</b>) fica pronto na data escolhida e você recebe uma notificação aqui no Prumo para abrir e exportar.</p>
        <div class="fgrid"><label class="field"><span>Frequência</span><select id="sc-freq"><option value="semanal">Toda semana</option><option value="mensal">Todo mês (dia 1)</option></select></label>
        <label class="field"><span>Dia da semana</span><select id="sc-wd">${[1, 2, 3, 4, 5].map(d => `<option value="${d}">${WEEKDAY[d]}-feira</option>`).join('')}</select></label></div>
        ${mine.length ? `<h4 class="sub-h">Seus agendamentos</h4><ul class="day-list">${mine.map(sc => `<li><span>${esc(schedLabel(sc))}<small>${sc.freq === 'mensal' ? 'todo dia 1' : 'toda ' + WEEKDAY[sc.weekday] + '-feira'}</small></span>${V.ibtn('trash', 'Remover agendamento', { act: 'unschedule', attrs: `data-id="${sc.id}"` })}</li>`).join('')}</ul>` : ''}`,
      onSubmit: m => {
        const freq = $('#sc-freq', m).value;
        scheds().push({ id: P.uid('rs'), userId: u.id, cfg: JSON.parse(JSON.stringify({ type: r.type, deptId: r.deptId, userId: r.userId, period: r.period === 'custom' ? 'mes_ant' : r.period, custom: r.custom })), freq, weekday: Number($('#sc-wd', m).value), lastRun: D.iso(P.today()), createdAt: D.stamp() });
        P.audit(u, 'Relatório agendado', u.id, freq); P.store.save();
        P.toast('Relatório agendado. Você será avisado(a) aqui no Prumo quando ele estiver pronto.');
      }
    });
  };
  A.unschedule = el => { db().reportSchedules = scheds().filter(sc => sc.id !== el.dataset.id); P.store.save(); ui().closeModal(); A.scheduleReport(); };

  /* ======================================================================
   * 7. Resumo semanal, dashboard personalizável e modo apresentação
   * ==================================================================== */
  V.weeklySummary = u => {
    const s = db().settings, t = P.today(), ws = D.weekStart(t), we = D.add(ws, 4), today = D.iso(t);
    const emps = api.workers(u).filter(x => x.id !== u.id || u.role === 'manager');
    const cur = M.team(emps, P.period('semana')), prev = M.team(emps, P.period('semana_ant')), prev2 = M.team(emps, P.range(D.add(ws, -14), D.add(ws, -8)));
    const delta = prev2.points ? (prev.points - prev2.points) / prev2.points * 100 : null;
    const over = cur.rows.filter(r => r.status === 'sobrecarga').map(r => r.user);
    const recurring = emps.filter(e => M.overloadStreak(e).streak >= s.recurringWeeks);
    const stars = prev.rows.filter(r => r.status === 'saudavel').sort((a, b) => b.points - a.points).slice(0, 2).map(r => r.user);
    const ids = new Set(emps.map(e => e.id));
    const vacs = api.vacations(u).filter(v => v.status === 'aprovada' && ids.has(v.userId) && !(v.end < D.iso(ws) || v.start > D.iso(we)));
    const pendEntries = api.entries(u, { status: 'pendente' }).filter(e => e.userId !== u.id).length;
    const vacWaiting = (db().vacations || []).filter(v => api.canReviewVacation(u, v)).length;
    const late = api.tasks(u).filter(x => x.status === 'pendente' && x.due < today && ids.has(x.userId)).length;
    const obr = P.obligationsFor(u, t.getFullYear(), t.getMonth(), P.isGlobal(u) ? (S().dept || undefined) : undefined).filter(o => o.date >= D.iso(ws) && o.date <= D.iso(D.add(ws, 6)));
    const h = new Date().getHours(), hi = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
    const names = l => { const n = l.map(x => esc(first(x.name))); return n.length > 1 ? n.slice(0, -1).join(', ') + ' e ' + n[n.length - 1] : n.join(''); };
    const items = [
      ['trend', `Na semana passada a ${P.isGlobal(u) ? 'operação' : 'equipe'} entregou <b class="ws-num">${F.n(prev.points, 0)}</b> pontos${delta != null ? ` (${delta >= 0 ? '+' : '−'}${F.n(Math.abs(delta), 0)}% em relação à semana anterior)` : ''}.`, 'equipe'],
      stars.length ? ['medal', `Destaque${stars.length > 1 ? 's' : ''}: ${names(stars)} ${stars.length > 1 ? 'fecharam' : 'fechou'} a semana passada com mais entregas e sem sobrecarga.`, 'insights'] : null,
      over.length ? ['alert', `Atenção: ${over.length} pessoa${over.length > 1 ? 's estão' : ' está'} acima da capacidade nesta semana (${names(over.slice(0, 4))}${over.length > 4 ? '…' : ''})${recurring.length ? `; ${recurring.length} há ${s.recurringWeeks} semanas ou mais` : ''}.`, 'equipe', 'crit']
        : ['check', 'Ninguém está acima da capacidade nesta semana.', null, 'ok'],
      ['palm', vacs.length ? `De férias nesta semana: ${vacs.map(v => esc(first(P.user(v.userId).name)) + ' (até ' + D.short(v.end) + ')').join(', ')}.` : 'Ninguém da equipe está de férias nesta semana.', 'ferias'],
      ['inbox', pendEntries || vacWaiting || late ? `Pendências: ${[pendEntries ? `<b class="ws-num">${pendEntries}</b> lançamento${pendEntries > 1 ? 's' : ''} para aprovar` : '', vacWaiting ? `${vacWaiting} pedido${vacWaiting > 1 ? 's' : ''} de férias aguardando você` : '', late ? `${late} tarefa${late > 1 ? 's' : ''} em atraso` : ''].filter(Boolean).join(', ')}.` : 'Sem pendências de aprovação nem tarefas atrasadas. 👏', pendEntries ? 'lancamentos' : vacWaiting ? 'ferias' : 'atividades', pendEntries || vacWaiting || late ? 'warn' : 'ok'],
      obr.length ? ['calendar', `Obrigações da semana: ${obr.map(o => esc(o.short) + ' (' + D.short(o.date) + ')').join(', ')}.`, 'calendario'] : null
    ].filter(Boolean);
    return `<section class="card wsum"><div class="wsum-h"><div><h3>${hi}, ${esc(first(u.name))}!</h3><p>Resumo da semana de ${D.fmt(D.iso(ws))} a ${D.fmt(D.iso(we))}</p></div>${icon('sun', 'wsum-ic')}</div>
      <ul class="wsum-l">${items.map(([ic, txt, go, tone]) => `<li class="${tone ? 't-' + tone : ''}">${icon(ic)}<span>${txt}</span>${go ? `<button type="button" class="link" data-go="${go}">Ver ${icon('right')}</button>` : ''}</li>`).join('')}</ul></section>`;
  };

  A.customizeDash = () => {
    const u = S().user, blocks = S()._dashBlocks || [];
    const lay = u.dashLayout || {}, hidden = new Set(lay.hidden || []);
    const order = (lay.order || []).filter(id => blocks.some(b => b.id === id)).concat(blocks.map(b => b.id).filter(id => !(lay.order || []).includes(id)));
    ui().modal({
      title: 'Personalizar o dashboard', submit: 'Salvar',
      body: `<p class="prose">Marque os blocos que quer ver e arraste (ou use as setas) para mudar a ordem.</p>
        <ul class="dz-list" id="dz-list">${order.map(id => { const b = blocks.find(x => x.id === id); return `<li draggable="true" data-id="${id}"><span class="dz-grip">${icon('menu')}</span><label><input type="checkbox" ${hidden.has(id) ? '' : 'checked'}> ${esc(b.title)}</label><span class="dz-mv">${V.ibtn('up', 'Subir', { act: 'dzMove', attrs: 'data-d="-1"' })}${V.ibtn('down', 'Descer', { act: 'dzMove', attrs: 'data-d="1"' })}</span></li>`; }).join('')}</ul>
        <button type="button" class="link" data-act="dzReset">Restaurar o padrão</button>`,
      onSubmit: m => {
        const li = [...m.querySelectorAll('#dz-list li')];
        P.user(u.id).dashLayout = { order: li.map(x => x.dataset.id), hidden: li.filter(x => !x.querySelector('input').checked).map(x => x.dataset.id) };
        P.store.save(); P.toast('Dashboard personalizado.'); P.render(true);
      }
    });
  };
  A.dzMove = el => { const li = el.closest('li'), d = Number(el.dataset.d); if (d < 0 && li.previousElementSibling) li.parentNode.insertBefore(li, li.previousElementSibling); if (d > 0 && li.nextElementSibling) li.parentNode.insertBefore(li.nextElementSibling, li); };
  A.dzReset = () => { delete P.user(S().user.id).dashLayout; P.store.save(); ui().closeModal(); P.toast('Dashboard restaurado para o padrão.'); P.render(true); };
  // arrastar dentro da lista de personalização
  let dzDrag = null;
  document.addEventListener('dragstart', ev => { const li = ev.target.closest && ev.target.closest('#dz-list li'); if (li) { dzDrag = li; li.classList.add('dragging'); ev.dataTransfer.effectAllowed = 'move'; } });
  document.addEventListener('dragover', ev => { const li = ev.target.closest && ev.target.closest('#dz-list li'); if (dzDrag && li && li !== dzDrag) { ev.preventDefault(); const r = li.getBoundingClientRect(); li.parentNode.insertBefore(dzDrag, ev.clientY < r.top + r.height / 2 ? li : li.nextSibling); } });
  document.addEventListener('dragend', () => { if (dzDrag) { dzDrag.classList.remove('dragging'); dzDrag = null; } });

  A.presentMode = () => {
    const st = S();
    if (st.present) {
      st.present = false;
      if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => { });
      P.render(true); return;
    }
    if (st.user.role === 'employee') return;
    st.present = true; st.navOpen = false;
    if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => { });
    if (st.route.page !== 'dashboard') P.go('dashboard'); else P.render(true);
  };
  document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && S().present) { S().present = false; P.render(true); } });

  /* ======================================================================
   * 8. Tour, quadro de tarefas e modo compacto
   * ==================================================================== */
  let tour = null;
  const TOUR = u => {
    const steps = [
      ['.side .nav', 'Menu', 'Aqui ficam todas as áreas do Prumo. No computador, o botão ☰ recolhe o menu; no celular, ele abre a gaveta.'],
      ['.search-btn', 'Busca global', 'Encontre páginas, empresas, pessoas e ações de qualquer lugar. Atalho: Ctrl+K ou /.'],
      ['.top .bell', 'Notificações', 'Aprovações, férias, tarefas, reconhecimentos e relatórios agendados chegam aqui na hora.']
    ];
    if (u.role === 'employee') steps.push(['.nav-a[data-go=lancamentos]', 'Registrar atividades', 'Registre o que fez para gerar os pontos. Para várias empresas de uma vez, use o Lançamento em lote (tecla L).'], ['.nav-a[data-go=ferias]', 'Férias', 'Solicite férias e acompanhe cada etapa de aprovação.'], ['.nav-a[data-go=mural]', 'Mural', 'Reconhecimentos que a gestão compartilha com a equipe.']);
    else steps.push(['.nav-a[data-go=lancamentos]', 'Aprovações', 'Revise os lançamentos da equipe. Ao pedir correção, informe a origem do problema.'], ['.nav-a[data-go=insights]', 'Insights e destaques', 'Sugestões automáticas, destaques do mês e do ano e o registro de reconhecimentos.'], ['[data-act=customizeDash]', 'Seu dashboard', 'Escolha e reorganize os blocos em Personalizar. Em Apresentar, o dashboard ocupa a tela toda para reuniões.']);
    steps.push(['.me', 'Seu perfil', 'Altere o seu nome e a sua foto. Em Configurações você pode rever este tour quando quiser.']);
    return steps;
  };
  const visible = sel => { const el = $(sel); if (!el) return null; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.right > 0 && r.left < innerWidth ? el : null; };
  const paintTour = () => {
    if (!tour) return;
    const steps = tour.steps, [sel, title, text] = steps[tour.i];
    const el = visible(sel);
    const r = el ? el.getBoundingClientRect() : { left: innerWidth / 2 - 1, top: innerHeight / 2 - 1, width: 2, height: 2, right: innerWidth / 2, bottom: innerHeight / 2 };
    const pad = 6;
    tour.spot.style.cssText = `left:${r.left - pad}px;top:${r.top - pad}px;width:${r.width + pad * 2}px;height:${r.height + pad * 2}px`;
    const bw = Math.min(320, innerWidth - 24);
    let x = r.right + 14, y = r.top;
    if (x + bw > innerWidth - 12) { x = Math.max(12, Math.min(r.left, innerWidth - bw - 12)); y = r.bottom + 14; }
    if (y + 180 > innerHeight) y = Math.max(12, r.top - 190);
    tour.box.style.cssText = `left:${x}px;top:${y}px;width:${bw}px`;
    tour.box.innerHTML = `<small>${tour.i + 1} de ${steps.length}</small><b>${esc(title)}</b><p>${esc(text)}</p><div class="tour-b"><button type="button" class="link" data-tour="skip">Pular</button><span>${tour.i ? '<button type="button" class="btn sm ghost" data-tour="prev">Voltar</button>' : ''}<button type="button" class="btn sm primary" data-tour="next">${tour.i === steps.length - 1 ? 'Concluir' : 'Próximo'}</button></span></div>`;
  };
  const endTour = done => {
    if (!tour) return;
    tour.root.remove(); tour = null;
    const u = S().user; if (u) { P.user(u.id).tourDone = true; P.store.save(); }
    if (done) P.toast('Tudo pronto! Use Ctrl+K para encontrar qualquer coisa e ? para ver os atalhos.');
  };
  A.startTour = () => {
    const u = S().user; if (!u || tour) return;
    ui().closeModal(); closePalette(); closeNotif();
    const steps = TOUR(u).filter(([sel]) => visible(sel) || sel === '.side .nav');
    const root = document.createElement('div'); root.className = 'tour';
    root.innerHTML = '<div class="tour-spot"></div><div class="tour-box" role="dialog" aria-live="polite"></div>';
    document.body.appendChild(root);
    tour = { root, spot: root.querySelector('.tour-spot'), box: root.querySelector('.tour-box'), steps, i: 0 };
    root.addEventListener('click', ev => {
      const b = ev.target.closest('[data-tour]'); if (!b) return;
      const k = b.dataset.tour;
      if (k === 'skip') endTour(false);
      else if (k === 'prev') { tour.i--; paintTour(); }
      else if (tour.i >= tour.steps.length - 1) endTour(true);
      else { tour.i++; paintTour(); }
    });
    paintTour();
  };
  window.addEventListener('resize', () => { if (tour) paintTour(); });

  // Quadro de tarefas: colunas por pessoa; arraste o cartão para outra coluna para reatribuir
  api.reassignTask = (u, id, toId) => {
    const t = db().tasks.find(x => x.id === id), to = P.user(toId);
    if (!t || t.status !== 'pendente') deny('Somente tarefas pendentes podem ser reatribuídas.');
    if (!to || to.active === false || !(to.role === 'employee' || to.role === 'manager')) deny('Escolha uma pessoa válida.');
    if (to.deptId !== t.deptId) deny('Reatribua apenas entre pessoas do mesmo departamento.');
    if (!(P.isGlobal(u) || (u.role === 'manager' && t.deptId === u.deptId && (to.role === 'employee' || to.id === u.id)))) deny('Você só reatribui tarefas da sua equipe.');
    if (t.userId === to.id) return t;
    const from = P.user(t.userId);
    t.userId = to.id;
    P.audit(u, 'Tarefa reatribuída', t.id, t.title + ': ' + (from ? from.name : '—') + ' → ' + to.name);
    P.notify([to.id], { type: 'tarefa', icon: 'clipboard', title: 'Tarefa transferida para você', text: `${t.title} · prazo ${D.fmt(t.due)} (por ${u.name}).`, link: 'atividades' });
    P.store.save(); return t;
  };
  V.taskBoard = (u, emps, tasks) => {
    const today = D.iso(P.today());
    if (!emps.length) return V.empty('Escolha um departamento para ver o quadro da equipe.', 'users');
    return `<div class="board" role="list">${emps.map(e => { const mine = tasks.filter(t => t.userId === e.id).sort((a, b) => a.due < b.due ? -1 : 1); return `<section class="bcol" data-col="${e.id}" role="listitem" aria-label="${esc(e.name)}">
        <header>${V.avatar(e)}<b>${esc(first(e.name))}</b><em>${mine.length}</em></header>
        <div class="bcol-b">${mine.map(t => `<article class="bcard ${t.due < today ? 'late' : ''}" draggable="true" data-task="${t.id}"><b>${esc(t.title)}</b><small>${t.due < today ? icon('alert') + 'Atrasada · ' : ''}prazo ${D.fmt(t.due)}</small></article>`).join('') || '<p class="bcol-empty">Solte uma tarefa aqui</p>'}</div>
      </section>`; }).join('')}</div><p class="fine board-note">Arraste um cartão para a coluna de outra pessoa para reatribuir a tarefa. A pessoa recebe uma notificação.</p>`;
  };
  let tDrag = null;
  document.addEventListener('dragstart', ev => { const c = ev.target.closest && ev.target.closest('[data-task]'); if (c) { tDrag = c.dataset.task; c.classList.add('dragging'); ev.dataTransfer.effectAllowed = 'move'; try { ev.dataTransfer.setData('text/plain', tDrag); } catch (e) { } } });
  document.addEventListener('dragover', ev => { const col = tDrag && ev.target.closest && ev.target.closest('[data-col]'); if (col) { ev.preventDefault(); document.querySelectorAll('.bcol.over').forEach(x => x !== col && x.classList.remove('over')); col.classList.add('over'); } });
  document.addEventListener('drop', ev => {
    const col = tDrag && ev.target.closest && ev.target.closest('[data-col]'); if (!col) return;
    ev.preventDefault();
    const id = tDrag; tDrag = null;
    ui().guard(() => { const t = api.reassignTask(S().user, id, col.dataset.col); P.toast('Tarefa reatribuída para ' + P.user(t.userId).name + '.'); P.render(); });
  });
  document.addEventListener('dragend', () => { tDrag = null; document.querySelectorAll('.dragging, .bcol.over').forEach(x => x.classList.remove('dragging', 'over')); });

  A.toggleDense = () => {
    const on = ui().ls.get('prumo.dense') !== '1';
    ui().ls.set('prumo.dense', on ? '1' : null);
    document.body.classList.toggle('dense', on);
    P.toast(on ? 'Tabelas compactas ativadas.' : 'Tabelas no espaçamento normal.');
    P.render();
  };
})(window.P);
