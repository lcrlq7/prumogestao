/* Prumo — aplicação: estado, rotas, layout, ações, modais e exportação */
'use strict';
(function (P) {
  const F = P.fmt, D = P.date, esc = P.esc, api = P.api, V = P.V, M = P.M;
  const icon = V.icon;
  const $ = (s, r = document) => r.querySelector(s);
  const ls = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) { } }
  };

  P.store.load();
  const today = P.today();
  const S = P.state = {
    user: null, route: { page: 'dashboard', id: null },
    period: { key: 'mes', custom: { start: D.iso(D.add(today, -29)), end: D.iso(today) } },
    dept: '', cmp: 'mes', lancTab: 'pendente', taskTab: 'pendente', taskUser: '', teamSort: 'util',
    hist: { userId: '', activityId: '', client: '', deptId: '', s: D.iso(D.add(today, -30)), e: D.iso(today), status: '', page: 1 },
    cal: { month: D.monthStart(today), userId: '', sel: D.iso(today) },
    rep: { type: 'departamento', deptId: '', userId: '', period: 'mes_ant', custom: { start: D.iso(D.add(today, -29)), end: D.iso(today) } },
    insFilter: 'all', hlPeriod: 'mes_ant', hlAll: false, recAll: false, rankPeriod: 'semana', pesoDept: 'd1', empFilter: { q: '', dept: '', status: '' }, alertFilter: 'all',
    comp: { q: '', regime: '', dept: '', status: 'ativas', limit: '50' }, compPage: 1, vac: { month: D.monthStart(today), sel: null, tab: 'fila' },
    theme: ls.get('prumo.theme') || 'system', navOpen: false, navCollapsed: ls.get('prumo.nav') === 'min'
  };

  /* ---------- Tema ---------- */
  function applyTheme() {
    const r = document.documentElement;
    if (S.theme === 'system') r.removeAttribute('data-theme'); else r.setAttribute('data-theme', S.theme);
  }
  const effectiveDark = () => S.theme === 'dark' || (S.theme === 'system' && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
  applyTheme();

  /* ---------- Rotas ---------- */
  const PAGE_LABEL = {
    dashboard: 'Dashboard', equipe: 'Minha Equipe', funcionario: 'Colaborador', atividades: 'Atividades', lancamentos: 'Lançamentos', metas: 'Metas',
    insights: 'Insights', ranking: 'Ranking', calendario: 'Calendário', relatorios: 'Relatórios', historico: 'Histórico', alertas: 'Alertas',
    configuracoes: 'Configurações', departamentos: 'Departamentos', funcionarios: 'Funcionários', gestores: 'Gestores e diretoria', pesos: 'Pesos das Atividades', gerais: 'Configurações Gerais', ferias: 'Férias', mural: 'Mural de reconhecimentos', comunicacao: 'Comunicação', empresas: 'Empresas'
  };
  function parse(path) {
    path = String(path || '').replace(/^#?\/?/, '');
    const [p, qs] = path.split('?');
    const [page, id] = p.split('/');
    const q = {}; (qs || '').split('&').filter(Boolean).forEach(kv => { const [k, v] = kv.split('='); q[k] = decodeURIComponent(v || ''); });
    return { page: page || 'dashboard', id: id || null, q };
  }
  P.go = function (path) {
    const r = parse(path);
    if (r.q.dept && S.user && P.isGlobal(S.user)) S.dept = r.q.dept;
    S.route = r; S.navOpen = false;
    const h = '#/' + r.page + (r.id ? '/' + r.id : '');
    try { if (location.hash !== h) history.replaceState(null, '', h); } catch (e) { }
    render(true);
  };
  window.addEventListener('hashchange', () => { if (S.user) { S.route = parse(location.hash); render(true); } });

  /* ---------- Layout ---------- */
  function navItems(u) {
    const emp = u.role === 'employee';
    const pendCount = emp ? (P.idx.byUser.get(u.id) || []).filter(e => e.status === 'correcao').length
      : P.store.db.entries.filter(e => ((e.status === 'pendente' && e.userId !== u.id) || (u.role === 'manager' && e.status === 'correcao' && e.userId === u.id)) && (P.isGlobal(u) || e.deptId === u.deptId)).length;
    const vacs = P.store.db.vacations || [];
    const vacCount = vacs.filter(v => api.canReviewVacation(u, v)).length;
    const main = [
      ['dashboard', emp ? 'Meu desempenho' : 'Dashboard', 'grid'],
      ['comunicacao', 'Comunicação', 'message', P.chat ? P.chat.unread(u) : 0],
      ['equipe', 'Minha Equipe', 'users'],
      ['atividades', emp ? 'Minhas tarefas' : 'Atividades', 'clipboard'],
      ['lancamentos', 'Lançamentos', 'inbox', pendCount],
      ['metas', 'Metas', 'target'],
      ['insights', 'Insights', 'bulb'],
      ['ranking', 'Ranking', 'rank'],
      ['calendario', 'Calendário', 'calendar'],
      ['ferias', 'Férias', 'palm', vacCount],
      ['mural', 'Mural', 'medal'],
      ['empresas', 'Empresas', 'briefcase'],
      ['relatorios', 'Relatórios', 'file'],
      ['historico', 'Histórico', 'history'],
      ['configuracoes', 'Configurações', 'cog']
    ].filter(([k]) => P.PAGES[k].includes(u.role));
    // Administração conforme o nível: gerente e diretoria veem tudo; o gestor cuida dos funcionários e dos pesos do departamento
    const admin = P.isGlobal(u) ? [
      ['departamentos', 'Departamentos', 'building'], ['funcionarios', 'Funcionários', 'userplus'], ['gestores', 'Gestores e diretoria', 'shield'],
      ['pesos', 'Pesos das Atividades', 'scale'], ['gerais', 'Configurações Gerais', 'sliders']
    ] : u.role === 'manager' ? [['funcionarios', 'Funcionários', 'userplus'], ['pesos', 'Pesos das Atividades', 'scale']] : [];
    return { main, admin };
  }
  function navLink([k, label, ic, count]) {
    const ownPerformance = S.route.page === 'funcionario' && S.route.id === S.user.id;
    const cur = S.route.page === k || (k === 'equipe' && S.route.page === 'funcionario' && S.user.role !== 'employee' && !ownPerformance) || (k === 'dashboard' && ownPerformance);
    return `<a href="#/${k}" class="nav-a ${cur ? 'on' : ''}" data-go="${k}" title="${label}${count ? ' (' + count + ')' : ''}" ${cur ? 'aria-current="page"' : ''}>${icon(ic)}<span>${label}</span>${count ? `<em class="nav-count">${count}</em>` : ''}</a>`;
  }
  function shell(content) {
    const u = S.user, n = navItems(u);
    const unread = P.alerts(u).filter(a => !a.read).length + (P.fx ? P.fx.unreadNotifs(u) : 0);
    const dept = u.deptId ? P.dept(u.deptId) : null;
    return `
    <div class="app ${S.navOpen ? 'nav-open' : ''} ${S.navCollapsed ? 'nav-min' : ''} ${S.justLogged ? 'enter' : ''} ${S.present ? 'present' : ''}">
      <aside class="side" aria-label="Navegação principal">
        <div class="brand">${icon('plumb', 'brand-ic')}<div><b>Prumo</b><small>Carga, capacidade e desempenho</small></div></div>
        <nav class="nav">${n.main.map(navLink).join('')}
          ${n.admin.length ? `<div class="nav-sep">Administração</div>${n.admin.map(navLink).join('')}` : ''}
        </nav>
        <div class="side-foot"><span class="org">${esc(P.store.db.settings.companyName)}</span><span>${dept ? esc(dept.name) : 'Acesso global'}</span></div>
      </aside>
      <button type="button" class="scrim" data-act="toggleNav" aria-label="Fechar menu"></button>
      <div class="main">
        <header class="top">
          <button type="button" class="ibtn menu-btn" data-act="toggleNav" aria-label="${S.navCollapsed ? 'Expandir menu' : 'Recolher menu'}" title="${S.navCollapsed ? 'Expandir menu' : 'Recolher menu'}" aria-expanded="${!S.navCollapsed}">${icon('menu')}</button>
          <div class="top-title"><span>${PAGE_LABEL[S.route.page] || ''}</span>${dept ? `<em class="chip-dept">${esc(dept.name)}</em>` : P.isGlobal(u) ? '<em class="chip-dept">Todos os departamentos</em>' : ''}</div>
          <div class="top-actions">
            <button type="button" class="search-btn" data-act="openSearch" title="Buscar (Ctrl+K ou /)">${icon('search')}<span>Buscar</span><kbd>Ctrl K</kbd></button>
            <button type="button" class="ibtn bell" data-act="toggleNotif" aria-label="Notificações e alertas (${unread} não lidos)" title="Notificações e alertas" aria-haspopup="true">${icon('bell')}${unread ? `<em>${unread > 99 ? '99+' : unread}</em>` : ''}</button>
            <button type="button" class="ibtn" data-act="toggleTheme" aria-label="Alternar tema" title="Alternar tema">${icon(effectiveDark() ? 'sun' : 'moon')}</button>
            <button type="button" class="me" data-go="configuracoes" title="Meu perfil: alterar nome e foto">${V.avatar(u)}<span class="me-txt"><b>${esc(u.name)}</b><small>${P.ROLES[u.role]}</small></span></button>
            <button type="button" class="ibtn" data-act="logout" aria-label="Sair" title="Sair">${icon('logout')}</button>
          </div>
        </header>
        <main class="view" id="view">${content}</main>
        ${S.present ? `<button type="button" class="present-exit" data-act="presentMode">${icon('x')}<span>Sair da apresentação</span></button>` : ''}
      </div>
    </div>
    <div class="tip" id="tip" role="tooltip" hidden></div>`;
  }

  /*
   * Acesso rápido: atalho TEMPORÁRIO para entrar por perfil enquanto os usuários reais não estão no banco.
   * Para desligar, troque para false (o botão some da tela de login).
   */
  const QUICK_ACCESS = !P.isLive; // em produção (Supabase) o acesso rápido nunca aparece

  /* Tela de entrada: e-mail, senha, "esqueci minha senha" e (temporário) acesso rápido. Nenhum dado de usuário aparece aqui. */
  function loginView(err) {
    const mode = S.authMode || 'login';
    const company = esc(P.store.db.settings.companyName);
    const r = (d, html) => `<div class="rise" style="--d:${d}">${html}</div>`;
    const logo = `<div class="auth-logo rise" style="--d:0">${icon('plumb')}<div><b>Prumo</b><small class="muted" style="display:block;font-size:12px">${company}</small></div></div>`;
    let card;
    if (mode === 'newpass') {
      // Convite (primeiro acesso) ou link de recuperação: a pessoa define a própria senha
      const invite = P.backend && P.backend.flow === 'invite';
      card = `${logo}${r(1, `<h2>${invite ? 'Crie sua senha' : 'Defina uma nova senha'}</h2><p class="lede">${invite ? 'Bem-vindo(a) ao Prumo! Escolha uma senha para os próximos acessos.' : 'Escolha uma nova senha para a sua conta.'}</p>`)}
        <form class="auth-form" id="newpass-form" novalidate>
          ${r(2, `<label class="field"><span>Nova senha</span><span class="in-ic pass">${icon('lock')}<input type="password" name="password" id="np-pass" autocomplete="new-password" minlength="8" placeholder="Mínimo de 8 caracteres" required></span></label>`)}
          ${r(3, `<label class="field"><span>Confirme a senha</span><span class="in-ic pass">${icon('lock')}<input type="password" name="confirm" id="np-confirm" autocomplete="new-password" required></span></label>`)}
          ${err ? `<div class="auth-msg err shake" role="alert">${icon('alert')}<span>${esc(err)}</span></div>` : ''}
          ${r(4, `<button type="submit" class="btn primary block lg" ${S.authBusy ? 'disabled' : ''}>${icon('check')}<span>${S.authBusy ? 'Salvando…' : 'Salvar senha e entrar'}</span></button>`)}
        </form>`;
    } else if (mode === 'forgot' || mode === 'sent') {
      card = mode === 'sent'
        ? `${logo}${r(1, `<h2>Verifique seu e-mail</h2><p class="lede">Se houver uma conta com <b>${esc(S.forgotEmail || '')}</b>, você vai receber um link para criar uma nova senha em alguns minutos.</p>`)}
           ${r(2, `<div class="auth-msg ok">${icon('check')}<span>Confira também a caixa de spam. O link vale por 1 hora.</span></div>`)}
           ${r(3, `<button type="button" class="btn primary block lg" data-act="authMode" data-mode="login">${icon('left')}<span>Voltar para o login</span></button>`)}
           ${r(4, `<p class="auth-help">Não recebeu? Fale com o administrador do sistema.</p>`)}`
        : `${logo}${r(1, `<h2>Esqueceu a senha?</h2><p class="lede">Informe o e-mail cadastrado e enviaremos um link para você criar uma nova senha.</p>`)}
           <form class="auth-form" id="forgot-form" novalidate>
             ${r(2, `<label class="field"><span>E-mail</span><span class="in-ic">${icon('mail')}<input type="email" name="email" id="forgot-email" autocomplete="username" placeholder="nome@empresa.com.br" value="${esc(S.loginEmail || '')}" required></span></label>`)}
             ${err ? `<div class="auth-msg err shake" role="alert">${icon('alert')}<span>${esc(err)}</span></div>` : ''}
             ${r(3, `<button type="submit" class="btn primary block lg" ${S.authBusy ? 'disabled' : ''}>${icon('mail')}<span>${S.authBusy ? 'Enviando…' : 'Enviar link de recuperação'}</span></button>`)}
           </form>
           ${r(4, `<div class="auth-back"><button type="button" class="link" data-act="authMode" data-mode="login">${icon('left')} Voltar para o login</button></div>`)}`;
    } else {
      const remembered = ls.get('prumo.lastEmail') || '';
      card = `${logo}${r(1, `<h2>Bem-vindo(a)</h2><p class="lede">Entre com o seu e-mail e senha.</p>`)}
        <form class="auth-form" id="login-form" novalidate>
          ${r(2, `<label class="field"><span>E-mail</span><span class="in-ic">${icon('mail')}<input type="email" id="login-email" name="email" autocomplete="username" placeholder="nome@empresa.com.br" value="${esc(S.loginEmail || remembered)}" required></span></label>`)}
          ${r(3, `<label class="field"><span>Senha</span><span class="in-ic pass">${icon('lock')}<input type="${S.showPass ? 'text' : 'password'}" id="login-pass" name="password" autocomplete="current-password" placeholder="Sua senha" required><button type="button" class="eye" data-act="togglePass" aria-label="${S.showPass ? 'Ocultar senha' : 'Mostrar senha'}" title="${S.showPass ? 'Ocultar senha' : 'Mostrar senha'}">${icon(S.showPass ? 'eyeoff' : 'eye')}</button></span></label>`)}
          ${r(4, `<div class="auth-row"><label><input type="checkbox" name="remember" ${remembered ? 'checked' : ''}>Lembrar meu e-mail</label><button type="button" class="link" data-act="authMode" data-mode="forgot">Esqueci minha senha</button></div>`)}
          ${err ? `<div class="auth-msg err shake" role="alert">${icon('alert')}<span>${esc(err)}</span></div>` : ''}
          ${r(5, `<button type="submit" class="btn primary block lg" ${S.authBusy ? 'disabled' : ''}>${icon('right')}<span>${S.authBusy ? 'Entrando…' : 'Entrar'}</span></button>`)}
        </form>
        ${QUICK_ACCESS ? r(6, `<div class="auth-or">ou</div><button type="button" class="btn quick-btn" data-act="quickAccess">${icon('zap')}<span>Acesso rápido</span><span class="quick-tag">temporário</span></button>`) : ''}`;
    }
    return `
    <div class="auth ${S.authSeen ? 'static' : ''}">
      <section class="auth-brand">
        <div class="auth-deco" aria-hidden="true"><span class="orb o1"></span><span class="orb o2"></span><span class="fio"></span></div>
        ${r(0, `<div class="brand lg">${icon('plumb', 'brand-ic')}<div><b>Prumo</b><small>${company}</small></div></div>`)}
        ${r(1, `<h1>Carga de trabalho, capacidade e evolução de cada equipe, <em>no prumo.</em></h1>`)}
        <ul class="props">
          ${r(2, `<li>${icon('scale')}<span><b>Pontos por atividade.</b> 1 ponto ≈ 1 hora média, com pesos calibráveis por departamento.</span></li>`)}
          ${r(3, `<li>${icon('gauge')}<span><b>Capacidade, não pressão.</b> Mostra quem precisa de apoio e quem tem espaço para novas demandas.</span></li>`)}
          ${r(4, `<li>${icon('lock')}<span><b>Acesso por hierarquia.</b> Cada pessoa vê somente o que o seu perfil permite.</span></li>`)}
        </ul>
        <p class="auth-foot rise" style="--d:5">© ${P.today().getFullYear()} ${company}</p>
      </section>
      <section class="auth-panel"><div class="auth-card">${card}</div></section>
    </div>`;
  }
  /* ---------- Render ---------- */
  const root = () => $('#app');
  function render(scrollTop, opts = {}) {
    const focusId = document.activeElement && document.activeElement.id;
    const sel = document.activeElement && 'selectionStart' in document.activeElement ? document.activeElement.selectionStart : null;
    P.charts.reset();
    const u = S.user;
    if (!u) { root().innerHTML = loginView(S.loginErr); S.authSeen = true; return; }
    let page = S.route.page;
    if (!P.PAGES[page]) page = S.route.page = 'dashboard';
    // Páginas mais pesadas aparecem primeiro como esqueleto e são calculadas no quadro seguinte
    if (scrollTop && !opts.now && P.fx && P.fx.heavy(page)) {
      root().innerHTML = shell(P.fx.skeleton(page));
      // dois quadros de animação (ou 80 ms, se a aba estiver em segundo plano)
      let done = false; const go = () => { if (!done) { done = true; render(true, { now: true }); } };
      requestAnimationFrame(() => requestAnimationFrame(go)); setTimeout(go, 80);
      return;
    }
    let html;
    try {
      if (!P.PAGES[page].includes(u.role)) throw new P.AccessError('Seu perfil (' + P.ROLES[u.role] + ') não tem acesso a "' + (PAGE_LABEL[page] || page) + '".');
      if (page === 'funcionario' && !S.route.id) throw new P.AccessError('Colaborador não informado.');
      html = page === 'funcionario' ? V.funcionario(u, S.route.id) : V[page](u);
    } catch (e) {
      if (!(e instanceof P.AccessError)) { console.error(e); html = V.forbidden('Não foi possível carregar esta página: ' + e.message); }
      else { P.audit(u, 'Acesso negado', page + (S.route.id ? '/' + S.route.id : ''), e.message); P.store.save(); html = V.forbidden(e.message); }
    }
    root().innerHTML = shell(html);
    S.justLogged = false;
    if (P.fx) P.fx.afterRender(!!scrollTop);
    P.charts.hydrate();
    if (scrollTop) window.scrollTo(0, 0);
    if (focusId) { const el = document.getElementById(focusId); if (el) { el.focus(); try { if (sel != null) el.setSelectionRange(sel, sel); } catch (e) { } } }
  }
  P.render = render;

  /* ---------- Sessão ---------- */
  function login(user) {
    S.user = user; S.loginErr = null; S.authMode = 'login'; S.showPass = false; S.justLogged = true;
    ls.set('prumo.session', user.id);
    S.dept = ''; S.rep.deptId = P.isGlobal(user) ? '' : user.deptId; S.rep.type = user.role === 'employee' ? 'individual' : 'departamento';
    S.hist.userId = ''; S.hist.deptId = ''; S.cal.userId = ''; S.taskUser = '';
    P.go('dashboard');
    if (P.fx) setTimeout(() => P.fx.onLogin(user), 450);
  }
  function logout() {
    S.authSeen = false; S.user = null; ls.set('prumo.session', null); try { history.replaceState(null, '', '#'); } catch (e) { }
    if (P.isLive && P.backend) { S.authBusy = true; render(true); P.backend.signOut().catch(() => { }).finally(() => { S.authBusy = false; render(true); }); return; }
    render(true);
  }

  /* ---------- Toast e modal ---------- */
  function toast(msg, tone = 'ok') {
    let box = $('#toasts');
    const t = document.createElement('div');
    t.className = 'toast ' + tone; t.setAttribute('role', 'status');
    t.innerHTML = icon(tone === 'err' ? 'alert' : 'check') + '<span></span>';
    t.querySelector('span').textContent = msg;
    box.appendChild(t);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, 3200);
  }
  P.toast = toast;
  // Utilitários de interface usados pelo js/extras.js
  P.ui = { modal: o => modal(o), closeModal: () => closeModal(), modalErr: m => modalErr(m), guard: fn => guard(fn), login: u => login(u), ls };
  let modalHandler = null;
  function modal({ title, body, submit = 'Salvar', danger = false, wide = false, onSubmit, cancel = 'Cancelar' }) {
    const m = $('#modal-root');
    m.innerHTML = `<div class="modal-back" data-act="closeModal"></div>
      <div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-labelledby="m-title">
        <header><h2 id="m-title">${title}</h2>${V.ibtn('x', 'Fechar', { act: 'closeModal' })}</header>
        <div class="modal-b">${body}<p class="form-err" id="m-err" role="alert" hidden></p></div>
        <footer>${cancel ? `<button type="button" class="btn ghost" data-act="closeModal">${cancel}</button>` : ''}${onSubmit ? `<button type="button" class="btn ${danger ? 'danger-solid' : 'primary'}" data-act="modalSubmit">${icon('check')}<span>${submit}</span></button>` : ''}</footer>
      </div>`;
    m.hidden = false;
    modalHandler = onSubmit || null;
    const f = m.querySelector('input:not([type=hidden]):not([readonly]):not([disabled]), select:not([disabled]), textarea');
    if (f) setTimeout(() => f.focus(), 30);
  }
  function closeModal() { const m = $('#modal-root'); m.hidden = true; m.innerHTML = ''; modalHandler = null; }
  function modalErr(msg) { const e = $('#m-err'); if (e) { e.textContent = msg; e.hidden = false; } }

  /* ---------- Helpers de formulário ---------- */
  const val = (form, name) => { const el = form.elements.namedItem(name); return el ? (el.type === 'checkbox' ? el.checked : el.value) : undefined; };
  function readEntryForm(form) {
    return {
      date: val(form, 'date'), deptId: val(form, 'deptId'), userId: val(form, 'userId'), activityId: val(form, 'activityId'),
      client: val(form, 'client'), qty: Number(val(form, 'qty')), obs: val(form, 'obs'), taskId: val(form, 'taskId')
    };
  }
  function validateEntry(d) {
    if (!d.date) return 'Informe a data.';
    if (d.date > D.iso(P.today())) return 'A data não pode estar no futuro.';
    if (!d.activityId) return 'Selecione a atividade.';
    if (!(d.qty > 0)) return 'Informe uma quantidade maior que zero.';
    if (d.qty > 200) return 'Quantidade muito alta para um único lançamento. Divida em mais registros.';
    return null;
  }
  function updateCalc(form) {
    const sel = form.elements.namedItem('activityId');
    const opt = sel && sel.selectedOptions[0];
    const w = opt ? Number(opt.dataset.w) : 0;
    const q = Number(val(form, 'qty')) || 0;
    const wEl = form.querySelector('[data-weight]'); if (wEl) wEl.value = F.n(w, 2);
    const u = form.querySelector('[data-unit]'); if (u && opt) u.textContent = '(' + opt.dataset.unit + ')';
    const out = form.querySelector('[data-calc]'); if (out) out.innerHTML = `${F.n(q, 2)} × ${F.n(w, 2)} = <b>${F.n(P.round2(q * w), 2)} pontos</b>`;
  }

  /* ---------- Exportação ---------- */
  const scripts = {};
  /* Carrega uma biblioteca sob demanda; considera pronta quando o global esperado existir */
  function loadScript(src, ready) {
    if (ready()) return Promise.resolve();
    if (!scripts[src]) scripts[src] = new Promise((res, rej) => {
      const fail = () => { delete scripts[src]; rej(new Error('Não foi possível carregar a biblioteca de exportação. Verifique a conexão e tente novamente.')); };
      const s = document.createElement('script'); s.src = src; s.async = true; s.onerror = fail;
      document.head.appendChild(s);
      const t0 = Date.now();
      (function poll() { if (ready()) return res(); if (Date.now() - t0 > 20000) return fail(); setTimeout(poll, 100); })();
    });
    return scripts[src];
  }
  async function saveFile(filename, blob) {
    let dl = null;
    try { dl = window.claude && window.claude.use ? await window.claude.use('downloads') : null; } catch (e) { dl = null; }
    if (dl) {
      try { await dl.save({ filename, data: blob }); toast('Arquivo pronto: ' + filename); }
      catch (e) { if (e && e.code !== 'declined') toast('Não foi possível salvar o arquivo (' + (e.code || e.message) + ').', 'err'); }
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    toast('Download iniciado: ' + filename);
  }
  const fileSlug = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
  const XLSX_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
  const JSPDF_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
  const AUTOTABLE_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js';

  function entryRows(list) {
    return list.map(e => ({
      Data: D.fmt(e.date), 'Funcionário': (P.user(e.userId) || {}).name, Departamento: (P.dept(e.deptId) || {}).name, Atividade: (P.act(e.activityId) || {}).name,
      Cliente: e.client, Quantidade: e.qty, Peso: e.weight, Pontos: e.points, Status: V.ENTRY[e.status].label, 'Observação': e.obs || ''
    }));
  }
  async function toXlsx(sheets, filename) {
    try {
      await loadScript(XLSX_SRC, () => window.XLSX && window.XLSX.utils);
      const wb = window.XLSX.utils.book_new();
      sheets.forEach(([name, rows]) => {
        const ws = Array.isArray(rows[0]) ? window.XLSX.utils.aoa_to_sheet(rows) : window.XLSX.utils.json_to_sheet(rows.length ? rows : [{ '': 'Sem dados' }]);
        window.XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
      });
      const buf = window.XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      await saveFile(filename + '.xlsx', new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    } catch (err) {
      // Sem a biblioteca: CSV compatível com Excel em português (separador ;)
      const rows = sheets.find(s => !Array.isArray(s[1][0]))?.[1] || [];
      const cols = rows.length ? Object.keys(rows[0]) : [];
      const csv = '﻿' + [cols.join(';')].concat(rows.map(r => cols.map(c => '"' + String(r[c] == null ? '' : r[c]).replace(/"/g, '""') + '"').join(';'))).join('\r\n');
      await saveFile(filename + '.csv', new Blob([csv], { type: 'text/csv' }));
    }
  }
  function reportSheets(rep) {
    const resumo = [[rep.title], [rep.subject], []].concat(rep.meta).concat([[]]).concat(rep.summary.map(([k, v]) => [k, String(v)]));
    const sheets = [['Resumo', resumo]];
    if (rep.team) sheets.push(['Equipe', rep.team.map(r => ({ 'Funcionário': r.user.name, Pontos: r.points, Capacidade: r.capacity, 'Utilização (%)': r.util == null ? '' : P.round2(r.util), Tarefas: r.tasks, 'Classificação': V.STATUS[r.status].label }))]);
    sheets.push(['Atividades', rep.acts.rows.map(r => ({ Atividade: r.act.name, Unidade: r.act.unit, Quantidade: r.qty, Pontos: r.points, 'Participação (%)': P.round2(r.share) }))]);
    sheets.push(['Evolução mensal', rep.evo.map(m => Object.assign({ 'Mês': D.monthLabel(m.start, true) + (m.partial ? ' (parcial)' : ''), Pontos: m.points }, rep.load ? { Capacidade: P.round2(m.capacity), 'Utilização (%)': m.util == null ? '' : P.round2(m.util) } : {}, { Tarefas: m.tasks }))]);
    if (rep.insights.length) sheets.push(['Insights', rep.insights.map(i => ({ Tipo: i.title, Insight: i.text }))]);
    sheets.push(['Lançamentos', entryRows(rep.entries)]);
    return sheets;
  }
  const pdfSafe = s => String(s == null ? '' : s).replace(/−/g, '-').replace(/→/g, '->').replace(/≈/g, '~').replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[^\x00-\xFF—–·×…•]/g, '');
  async function toPdf(rep) {
    await loadScript(JSPDF_SRC, () => window.jspdf && window.jspdf.jsPDF); await loadScript(AUTOTABLE_SRC, () => window.jspdf && window.jspdf.jsPDF.API && window.jspdf.jsPDF.API.autoTable);
    const doc = new window.jspdf.jsPDF({ unit: 'pt', format: 'a4' });
    const W = doc.internal.pageSize.getWidth(), ink = [20, 34, 48], muted = [98, 112, 128], accent = [24, 86, 120];
    doc.setFillColor(...accent); doc.rect(0, 0, W, 64, 'F');
    doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.text('Prumo', 40, 38);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.text(pdfSafe(P.store.db.settings.companyName), W - 40, 38, { align: 'right' });
    doc.setTextColor(...ink); doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.text(pdfSafe(rep.title), 40, 98);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(11); doc.setTextColor(...muted); doc.text(pdfSafe(rep.subject + ' · gerado em ' + D.fmt(D.iso(P.today()))), 40, 116);
    const tbl = (head, body, startY, opts = {}) => doc.autoTable(Object.assign({ head: head ? [head.map(pdfSafe)] : undefined, body: body.map(r => r.map(pdfSafe)), startY, margin: { left: 40, right: 40 }, styles: { fontSize: 9, cellPadding: 5, textColor: ink, lineColor: [226, 232, 238], lineWidth: 0.5 }, headStyles: { fillColor: [238, 243, 247], textColor: ink, fontStyle: 'bold' }, theme: 'grid' }, opts));
    const y = () => doc.lastAutoTable.finalY + 22;
    const h = (t, yy) => { doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(...ink); doc.text(pdfSafe(t), 40, yy); return yy + 8; };
    tbl(null, rep.meta, 132, { theme: 'plain', styles: { fontSize: 9.5, cellPadding: 3, textColor: ink }, columnStyles: { 0: { fontStyle: 'bold', cellWidth: 140 } } });
    tbl(['Indicador', 'Valor'], rep.summary.map(([k, v]) => [k, String(v)]), h('Resumo', y()), { columnStyles: { 1: { halign: 'right' } } });
    if (rep.team) tbl(['Funcionário', 'Pontos', 'Capacidade', 'Utilização', 'Tarefas', 'Classificação'], rep.team.map(r => [r.user.name, F.n(r.points), F.n(r.capacity), F.pct(r.util), F.n(r.tasks), V.STATUS[r.status].label]), h('Carga por colaborador', y()), { columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } } });
    tbl(['Atividade', 'Qtd.', 'Pontos', '%'], rep.acts.rows.map(r => [r.act.name, F.n(r.qty, 2), F.n(r.points), F.pct0(r.share)]), h('Atividades no período', y()), { columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } } });
    if (rep.load) tbl(['Mês', 'Pontos', 'Capacidade', 'Utilização'], rep.evo.map(m => [D.monthLabel(m.start, true) + (m.partial ? ' (parcial)' : ''), F.n(m.points), F.n(m.capacity), F.pct(m.util)]), h('Evolução mensal', y()), { columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } } });
    else tbl(['Mês', 'Pontos'], rep.evo.map(m => [D.monthLabel(m.start, true) + (m.partial ? ' (parcial)' : ''), F.n(m.points)]), h('Evolução mensal', y()), { columnStyles: { 1: { halign: 'right' } } });
    if (rep.insights.length) tbl(['Insight', ''], rep.insights.slice(0, 12).map(i => [i.title, i.text]), h('Insights', y()), { columnStyles: { 0: { cellWidth: 140, fontStyle: 'bold' } } });
    const pages = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pages; i++) { doc.setPage(i); doc.setFontSize(8); doc.setTextColor(...muted); doc.text(pdfSafe('Métricas para gestão de carga e capacidade, não para avaliação isolada de desempenho.'), 40, doc.internal.pageSize.getHeight() - 24); doc.text(i + '/' + pages, W - 40, doc.internal.pageSize.getHeight() - 24, { align: 'right' }); }
    await saveFile(fileSlug(rep.title + ' ' + rep.subject + ' ' + rep.p.label) + '.pdf', doc.output('blob'));
  }

  /* ---------- Ações ---------- */
  const U = () => S.user;
  const guard = fn => { try { fn(); } catch (e) { if (e instanceof P.AccessError) toast(e.message, 'err'); else { console.error(e); toast(e.message, 'err'); } } };
  const A = P.actions = {
    /* No computador recolhe/expande o menu (só ícones); em telas pequenas abre/fecha a gaveta */
    toggleNav(el) {
      const app = document.querySelector('.app');
      if (window.innerWidth > 1020 && !(el && el.classList.contains('scrim'))) {
        S.navCollapsed = !S.navCollapsed;
        ls.set('prumo.nav', S.navCollapsed ? 'min' : null);
        app.classList.toggle('nav-min', S.navCollapsed);
        const b = document.querySelector('.menu-btn');
        if (b) { const t = S.navCollapsed ? 'Expandir menu' : 'Recolher menu'; b.title = t; b.setAttribute('aria-label', t); b.setAttribute('aria-expanded', String(!S.navCollapsed)); }
        P.charts.hydrate(); // gráficos se ajustam à nova largura
        return;
      }
      S.navOpen = !S.navOpen; app.classList.toggle('nav-open', S.navOpen);
    },
    toggleTheme() { S.theme = effectiveDark() ? 'light' : 'dark'; ls.set('prumo.theme', S.theme); applyTheme(); render(); },
    theme(el) { S.theme = el.dataset.key; ls.set('prumo.theme', S.theme); applyTheme(); render(); },
    logout,
    quickLogin(el) { login(P.user(el.dataset.id)); },
    authMode(el) { S.authMode = el.dataset.mode; S.loginErr = null; S.authSeen = false; render(); const f = $('#forgot-email') || $('#login-email'); if (f) f.focus(); },
    togglePass() { const p = $('#login-pass'), v = p ? p.value : '', em = $('#login-email'); if (em) S.loginEmail = em.value; S.showPass = !S.showPass; render(); const np = $('#login-pass'); if (np) { np.value = v; np.focus(); } },
    /* Acesso rápido (temporário): escolhe o perfil, sem listar nomes de usuários */
    quickAccess() {
      if (!QUICK_ACCESS) return;
      const depts = P.store.db.departments.filter(d => d.active !== false);
      const ROLES_QA = [['admin', 'Diretoria', 'shield', 'Acesso total e aprovação final.'], ['office', 'Gerente do escritório', 'building', 'Todos os departamentos.'], ['manager', 'Gestor(a)', 'users', 'A equipe de um departamento.'], ['employee', 'Funcionário(a)', 'user', 'Os próprios dados.']];
      modal({
        title: 'Acesso rápido', cancel: 'Fechar',
        body: `<p class="prose">Atalho temporário para testar o sistema por perfil, enquanto os usuários não são cadastrados no banco de dados.</p>
          <label class="field"><span>Departamento <small>(para gestor e funcionário)</small></span><select id="qa-dept">${depts.map(d => `<option value="${d.id}">${esc(d.name)}</option>`).join('')}</select></label>
          <div class="qa-roles">${ROLES_QA.map(([k, l, ic, d]) => `<button type="button" class="qa-role" data-act="quickAccessGo" data-role="${k}">${icon(ic)}<b>${l}</b><small>${d}</small></button>`).join('')}</div>`
      });
    },
    quickAccessGo(el) {
      const role = el.dataset.role, deptId = ($('#qa-dept') || {}).value;
      const act = P.store.db.users.filter(x => x.active !== false && x.role === role);
      let user = act[0];
      if (role === 'manager') { const d = P.dept(deptId), m = d && P.user(d.managerId); user = m && m.active !== false && m.role === 'manager' ? m : act.find(x => x.deptId === deptId) || act[0]; }
      if (role === 'employee') user = act.find(x => x.deptId === deptId) || act[0];
      if (!user) return toast('Não há usuário ativo com esse perfil' + (role === 'manager' || role === 'employee' ? ' nesse departamento.' : '.'), 'err');
      closeModal(); login(user);
    },
    period(el) { S.period.key = el.dataset.key; render(); },
    cmp(el) { S.cmp = el.dataset.key; render(); },
    setState(el) { setPath(el.dataset.key, el.dataset.val); render(); },
    toggleHlAll() { S.hlAll = !S.hlAll; render(); },
    toggleRecAll() { S.recAll = !S.recAll; render(); },
    /* Registrar reconhecimento: o número sugere, o gestor decide e justifica */
    recognize(el) {
      const people = api.workers(U()).filter(x => api.canRecognize(U(), x)).sort((a, b) => a.name.localeCompare(b.name));
      if (!people.length) return toast('Não há ninguém abaixo de você para reconhecer.', 'err');
      const pre = el.dataset.id || '', cat = P.REC_CATEGORIES[el.dataset.cat] ? el.dataset.cat : 'outro';
      modal({
        title: 'Registrar reconhecimento', submit: 'Registrar',
        body: `<form id="rec-form" class="form" novalidate><div class="fgrid">
          <label class="field span2"><span>Colaborador(a)</span><select id="rc-user">${people.map(x => `<option value="${x.id}" ${x.id === pre ? 'selected' : ''}>${esc(x.name)} · ${esc(P.dept(x.deptId) ? P.dept(x.deptId).name : '')}</option>`).join('')}</select></label>
          <label class="field"><span>Categoria</span><select id="rc-cat">${Object.entries(P.REC_CATEGORIES).map(([k, l]) => `<option value="${k}" ${k === cat ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          <label class="field span3"><span>Justificativa <small>(o que a pessoa fez e por que importa)</small></span><textarea id="rc-text" rows="4" maxlength="600" placeholder="Ex.: assumiu o fechamento de dois clientes durante as férias da colega, sem atrasos e sem retrabalho.">${esc(el.dataset.text || '')}</textarea></label>
          <label class="field check span3"><input type="checkbox" id="rc-visible" checked><span>Mostrar ao colaborador (ele vê a mensagem no próprio painel e recebe um alerta)</span></label>
          <label class="field check span3"><input type="checkbox" id="rc-shared"><span>Compartilhar com a equipe (aparece no Mural do departamento, sem notas nem números)</span></label>
        </div><p class="fine">Os números servem de apoio. Colaboração, iniciativa e atendimento ao cliente só aparecem nos destaques por meio destas indicações.</p></form>`,
        onSubmit: m => {
          const r = api.addRecognition(U(), { userId: $('#rc-user', m).value, category: $('#rc-cat', m).value, text: $('#rc-text', m).value, visible: $('#rc-visible', m).checked, shared: $('#rc-shared', m).checked, source: el.dataset.id ? 'sugestao' : 'manual' });
          toast('Reconhecimento registrado para ' + P.user(r.userId).name + (r.shared ? ' e compartilhado no mural da equipe.' : '.')); render();
        }
      });
    },
    shareRecognition(el) {
      guard(() => { const r = api.shareRecognition(U(), el.dataset.id, el.dataset.on === '1'); toast(r.shared ? 'Compartilhado no mural da equipe.' : 'Retirado do mural da equipe.'); render(); });
    },
    removeRecognition(el) {
      modal({ title: 'Remover reconhecimento', submit: 'Remover', danger: true, body: '<p class="prose">O reconhecimento deixa de aparecer para a gestão e para o colaborador. A remoção fica registrada na auditoria.</p>',
        onSubmit: () => { api.removeRecognition(U(), el.dataset.id); toast('Reconhecimento removido.'); render(); } });
    },
    setComp(el) { S.comp[el.dataset.key] = el.dataset.val; render(); },
    closeModal,
    modalSubmit() {
      if (!modalHandler) return closeModal();
      try { const r = modalHandler($('#modal-root .modal')); if (r !== false) closeModal(); }
      catch (e) { modalErr(e.message); }
    },
    review(el) { guard(() => { api.reviewEntry(U(), el.dataset.id, el.dataset.op); toast('Lançamento aprovado.'); render(); }); },
    reviewNote(el) {
      const op = el.dataset.op, e = P.idx.byId.get(el.dataset.id);
      const title = op === 'recusar' ? 'Recusar lançamento' : 'Solicitar correção';
      modal({
        title, submit: op === 'recusar' ? 'Recusar' : 'Enviar solicitação', danger: op === 'recusar',
        body: `<p class="prose">${esc(P.user(e.userId).name)} · ${esc(P.act(e.activityId).name)} · ${F.n(e.qty, 2)} × ${F.n(e.weight, 2)} = <b>${F.n(e.points, 2)} pts</b> em ${D.fmt(e.date)}</p>
          <label class="field"><span>Origem do problema</span><select id="rv-cause">${Object.entries(P.REWORK_CAUSES).map(([k, l]) => `<option value="${k}">${l}${k === 'colaborador' ? ' (conta na qualidade)' : ' (não conta na qualidade)'}</option>`).join('')}</select></label>
          <label class="field"><span>${op === 'recusar' ? 'Motivo da recusa' : 'O que precisa ser corrigido?'}</span><textarea id="rv-note" rows="3" placeholder="${op === 'recusar' ? 'Ex.: lançamento duplicado' : 'Ex.: confirmar o cliente e a quantidade'}"></textarea></label>`,
        onSubmit: m => {
          const note = $('#rv-note', m).value.trim();
          if (note.length < 3) throw new Error('Escreva uma orientação para o colaborador.');
          api.reviewEntry(U(), e.id, op, { note, cause: $('#rv-cause', m).value }); toast(op === 'recusar' ? 'Lançamento recusado.' : 'Correção solicitada ao colaborador.'); render();
        }
      });
    },
    editEntry(el) {
      const e = P.idx.byId.get(el.dataset.id);
      modal({
        title: 'Editar lançamento', wide: true, submit: 'Salvar e aprovar',
        body: V.entryForm(U(), { entryId: e.id, deptId: e.deptId, userId: e.userId, activityId: e.activityId, qty: e.qty, date: e.date, client: e.client, obs: e.obs }, { id: 'edit-form', noSubmit: true }) +
          `<label class="field"><span>Nota da edição (fica no histórico)</span><input type="text" id="ed-note" placeholder="Ex.: quantidade ajustada conforme relatório do cliente"></label>`,
        onSubmit: m => {
          const d = readEntryForm($('#edit-form', m)); const er = validateEntry(d); if (er) throw new Error(er);
          api.reviewEntry(U(), e.id, 'editar', { patch: d, note: $('#ed-note', m).value.trim() }); toast('Lançamento editado e aprovado.'); render();
        }
      });
    },
    fixEntry(el) {
      const e = P.idx.byId.get(el.dataset.id);
      const last = (e.history || []).slice().reverse().find(h => h.action === 'Correção solicitada');
      modal({
        title: 'Corrigir lançamento', wide: true, submit: 'Reenviar para aprovação',
        body: (last ? `<div class="banner warn">${icon('undo')}<div><b>Orientação do gestor:</b> ${esc(last.note)}</div></div>` : '') +
          V.entryForm(U(), { entryId: e.id, deptId: e.deptId, userId: e.userId, own: e.userId === U().id, activityId: e.activityId, qty: e.qty, date: e.date, client: e.client, obs: e.obs }, { id: 'fix-form', noSubmit: true }),
        onSubmit: m => { const d = readEntryForm($('#fix-form', m)); const er = validateEntry(d); if (er) throw new Error(er); api.resubmitEntry(U(), e.id, d); toast('Lançamento reenviado.'); render(); }
      });
    },
    entryHistory(el) {
      const e = P.idx.byId.get(el.dataset.id);
      const hist = (e.history && e.history.length ? e.history : [{ at: e.date, by: e.userId, action: 'Criado', note: '' }]);
      modal({
        title: 'Histórico do lançamento', cancel: 'Fechar',
        body: `<p class="prose"><b>${esc(P.act(e.activityId).name)}</b> · ${esc(P.user(e.userId).name)} · ${D.fmt(e.date)} · ${F.n(e.qty, 2)} × ${F.n(e.weight, 2)} = <b>${F.n(e.points, 2)} pts</b> ${V.ebadge(e.status)}</p>
        <ol class="timeline">${hist.map(h => `<li><b>${esc(h.action)}</b><span>${esc((P.user(h.by) || {}).name || '—')} · ${esc(h.at)}</span>${h.note ? `<p>${esc(h.note)}</p>` : ''}</li>`).join('')}</ol>`
      });
    },
    selectAll(el) { document.querySelectorAll('.sel').forEach(c => { c.checked = el.checked; }); },
    bulkApprove() {
      const ids = [...document.querySelectorAll('.sel:checked')].map(c => c.value);
      if (!ids.length) return toast('Selecione ao menos um lançamento.', 'err');
      guard(() => { ids.forEach(id => api.reviewEntry(U(), id, 'aprovar', { note: 'Aprovação em lote' })); toast(ids.length + ' lançamentos aprovados.'); render(); });
    },
    submitEntry(el) {
      const form = el.closest('form');
      const d = readEntryForm(form); const er = validateEntry(d);
      if (er) return toast(er, 'err');
      guard(() => {
        const e = api.createEntry(U(), d);
        toast(`Registrado: ${F.n(e.points, 2)} pontos${e.status === 'pendente' ? ' · aguardando aprovação' : ''}.`);
        render();
      });
    },
    newEntry() {
      modal({
        title: 'Registrar atividade para colaborador', wide: true, submit: 'Registrar',
        body: V.entryForm(U(), {}, { id: 'new-form', noSubmit: true }),
        onSubmit: m => { const d = readEntryForm($('#new-form', m)); const er = validateEntry(d); if (er) throw new Error(er); const e = api.createEntry(U(), d); toast(`Registrado: ${F.n(e.points, 2)} pontos para ${P.user(e.userId).name}.`); render(); }
      });
    },
    newOwnEntry() {
      const u = U();
      modal({
        title: 'Registrar minha atividade', wide: true, submit: 'Registrar',
        body: V.entryForm(u, { userId: u.id, own: true }, { id: 'own-form', noSubmit: true }),
        onSubmit: m => { const d = readEntryForm($('#own-form', m)); const er = validateEntry(d); if (er) throw new Error(er); const e = api.createEntry(u, d); toast(`Registrado: ${F.n(e.points, 2)} pontos · aguardando revisão do administrador.`); render(); }
      });
    },
    completeTask(el) {
      const t = P.store.db.tasks.find(x => x.id === el.dataset.id);
      modal({
        title: 'Concluir tarefa', wide: true, submit: 'Concluir e registrar',
        body: `<p class="prose">${esc(t.title)}</p>` + V.entryForm(U(), { taskId: t.id, userId: t.userId, own: t.userId === U().id, activityId: t.activityId, client: t.client }, { id: 'task-form', noSubmit: true }),
        onSubmit: m => { const d = readEntryForm($('#task-form', m)); const er = validateEntry(d); if (er) throw new Error(er); const e = api.createEntry(U(), d); toast(`Tarefa concluída: ${F.n(e.points, 2)} pontos registrados.`); render(); }
      });
    },
    newTask() {
      const u = U(), team = V.team(u);
      if (!team.length) return toast('Selecione um departamento com colaboradores.', 'err');
      const deptId = P.isGlobal(u) ? (S.dept || team[0].deptId) : u.deptId;
      const emps = team.filter(person => person.deptId === deptId);
      const acts = api.activities(u, deptId);
      const taskOwnerId = emps[0].id;
      const clients = api.clientsFor(u, taskOwnerId);
      modal({
        title: 'Atribuir tarefa',
        body: `<div class="fgrid">
          <label class="field span3"><span>Responsável</span><select id="nt-user">${emps.map(e => `<option value="${e.id}">${esc(e.name)}${P.isGlobal(u) && !S.dept ? ' · ' + esc(P.dept(e.deptId).name) : ''}</option>`).join('')}</select></label>
          <label class="field span3"><span>Atividade</span><select id="nt-act">${acts.map(a => `<option value="${a.id}" data-dept="${a.deptId}">${esc(a.name)} · ${F.n(a.weight, 2)} pt</option>`).join('')}</select></label>
          <label class="field span2"><span>Empresa da carteira</span><select id="nt-client"><option value="">${clients.length ? 'Sem empresa vinculada' : 'Nenhuma empresa vinculada'}</option>${clients.map(client => `<option value="${esc(client)}">${esc(client)}</option>`).join('')}</select></label>
          <div class="field"><span>&nbsp;</span><button type="button" class="link" data-act="manageClientAssignments">Gerenciar carteira</button></div>
          <p class="fine span3" id="nt-client-help">${clients.length ? `${clients.length} empresa(s) vinculada(s) a ${esc(emps[0].name)}.` : `Nenhuma empresa vinculada a ${esc(emps[0].name)}. A tarefa pode ser geral ou você pode cadastrar uma empresa na carteira.`}</p>
          <label class="field"><span>Prazo</span><input type="date" id="nt-due" value="${D.iso(D.add(P.today(), 3))}"></label>
          <label class="field span3"><span>Título (opcional)</span><input type="text" id="nt-title" placeholder="Gerado a partir da atividade e do cliente"></label></div>`,
        onSubmit: m => {
          const userId = $('#nt-user', m).value, a = P.act($('#nt-act', m).value), client = $('#nt-client', m).value.trim(), due = $('#nt-due', m).value;
          if (!due) throw new Error('Informe o prazo.');
          if (a.deptId !== P.user(userId).deptId) throw new Error('A atividade escolhida é de outro departamento.');
          api.saveTask(U(), { userId, activityId: a.id, client, due, title: $('#nt-title', m).value.trim() || a.name + (client ? ' — ' + client : '') });
          toast('Tarefa atribuída a ' + P.user(userId).name + '.'); render();
        }
      });
    },
    updateTaskClients(el) {
      const clients = api.clientsFor(U(), el.value), select = $('#nt-client'), help = $('#nt-client-help');
      select.innerHTML = `<option value="">${clients.length ? 'Sem empresa vinculada' : 'Nenhuma empresa vinculada'}</option>` + clients.map(client => `<option value="${esc(client)}">${esc(client)}</option>`).join('');
      help.textContent = clients.length ? `${clients.length} empresa(s) vinculada(s) a ${P.user(el.value).name}.` : `Nenhuma empresa vinculada a ${P.user(el.value).name}. A tarefa pode ser geral ou você pode cadastrar uma empresa na carteira.`;
    },
    manageClientAssignments() {
      const u = U(), depts = api.departments(u);
      const deptId = P.isGlobal(u) ? (S.clientAssignmentDept || S.dept || (depts[0] || {}).id) : u.deptId;
      if (!deptId) return toast('Selecione um departamento primeiro.', 'err');
      const people = api.workers(u, deptId), assignments = api.clientAssignments(u, deptId);
      const rows = assignments.slice().sort((a, b) => a.client.localeCompare(b.client)).map(item => `<tr><td>${esc(item.client)}</td><td>${esc((P.user(item.userId) || {}).name || '—')}</td><td class="actions-col">${V.ibtn('trash', 'Remover da carteira', { act: 'removeClientAssignment', cls: 'danger', attrs: `data-id="${item.id}"` })}</td></tr>`).join('');
      modal({
        title: 'Carteira de empresas · ' + esc(P.dept(deptId).name), submit: 'Salvar responsável', wide: true,
        body: `${P.isGlobal(u) ? `<label class="field"><span>Departamento</span><select id="ca-dept">${depts.map(d => `<option value="${d.id}" ${d.id === deptId ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</select></label>` : ''}
          <div class="fgrid"><label class="field span2"><span>Empresa</span><input type="search" id="ca-client" list="ca-client-options" placeholder="Buscar empresa"><datalist id="ca-client-options">${P.catalog().map(client => `<option value="${esc(client)}">`).join('')}</datalist></label>
          <label class="field"><span>Pessoa responsável</span><select id="ca-user">${people.map(person => `<option value="${person.id}">${esc(person.name)}${person.role === 'manager' ? ' · Gestor(a)' : ''}</option>`).join('')}</select></label></div>
          <p class="fine">Cada empresa pode ter uma pessoa responsável por departamento. Salvar uma empresa já cadastrada transfere a responsabilidade.</p>
          ${assignments.length ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>Empresa</th><th>Pessoa responsável</th><th class="actions-col"></th></tr></thead><tbody>${rows}</tbody></table></div>` : V.empty('Nenhuma empresa vinculada neste departamento.')}`,
        onSubmit: () => {
          const client = $('#ca-client').value, userId = $('#ca-user').value;
          if (!client) throw new Error('Selecione uma empresa.');
          if (!userId) throw new Error('Selecione a pessoa responsável.');
          api.assignClient(u, { client, userId });
          toast('Carteira atualizada.');
          A.manageClientAssignments();
          return false;
        }
      });
    },
    removeClientAssignment(el) {
      guard(() => { api.removeClientAssignment(U(), el.dataset.id); toast('Empresa removida da carteira.'); A.manageClientAssignments(); });
    },
    assignmentDept(el) { S.clientAssignmentDept = el.value; A.manageClientAssignments(); },
    editGoal(el) {
      const g = P.store.db.goals.find(x => x.id === el.dataset.id);
      const ref = g.scope === 'department' ? P.dept(g.refId).name : P.user(g.refId).name;
      modal({
        title: 'Meta ' + g.period + ' · ' + esc(ref),
        body: `<label class="field"><span>Meta em pontos</span><input type="number" id="goal-v" value="${g.target}" min="1" step="0.5"></label><p class="fine">Referência: ${g.period === 'semanal' ? '30 a 32 pontos para jornada de 40h' : 'cerca de 4 semanas de capacidade'}.</p>`,
        onSubmit: m => { const v = Number($('#goal-v', m).value); if (!(v > 0)) throw new Error('Informe um valor maior que zero.'); api.saveGoal(U(), g.id, v); toast('Meta atualizada.'); render(); }
      });
    },
    addNote(el) {
      const emp = P.user(el.dataset.id);
      modal({
        title: 'Observação sobre ' + esc(emp.name),
        body: `<label class="field"><span>Observação (visível para gestores e administração)</span><textarea id="note-t" rows="4" placeholder="Ex.: assumiu carteira adicional durante férias de colega"></textarea></label>`,
        onSubmit: m => { const t = $('#note-t', m).value.trim(); if (t.length < 3) throw new Error('Escreva a observação.'); api.addNote(U(), emp.id, t); toast('Observação registrada.'); render(); }
      });
    },
    editCapacity(el) {
      const emp = P.user(el.dataset.id);
      modal({
        title: 'Capacidade de ' + esc(emp.name),
        body: `<label class="field"><span>Capacidade semanal (pontos)</span><input type="number" id="cap-v" value="${emp.capacity}" min="1" max="60" step="0.5"></label><p class="fine">Referência: 30 a 32 pontos para 40h semanais (75% a 80% do tempo). Ajuste para jornadas reduzidas, períodos de treinamento ou funções com mais reuniões.</p>`,
        onSubmit: m => { const v = Number($('#cap-v', m).value); if (!(v > 0)) throw new Error('Informe um valor maior que zero.'); api.setCapacity(U(), emp.id, v); toast('Capacidade atualizada.'); render(); }
      });
    },
    reportFor(el) { const e = P.user(el.dataset.id); S.rep.type = 'individual'; S.rep.userId = e.id; S.rep.deptId = e.deptId; S.rep.period = 'mes'; P.go('relatorios'); },
    historyFor(el) { const e = P.user(el.dataset.id); if (U().role !== 'employee') S.hist.userId = e.id; S.hist.deptId = P.isGlobal(U()) ? e.deptId : ''; S.hist.page = 1; P.go('historico'); },
    calSel(el) { S.cal.sel = el.dataset.date; const d = D.parse(el.dataset.date); if (d.getMonth() !== S.cal.month.getMonth()) S.cal.month = D.monthStart(d); render(); },
    calMove(el) { S.cal.month = D.addMonths(S.cal.month, Number(el.dataset.d)); render(); },
    histPage(el) { S.hist.page += Number(el.dataset.d); render(); },
    clearHist() { Object.assign(S.hist, { userId: '', activityId: '', client: '', deptId: '', s: D.iso(D.add(P.today(), -30)), e: D.iso(P.today()), status: '', page: 1 }); render(); },
    readAlert(el) { const id = el.dataset.id; const r = P.store.db.alertsRead; (r[U().id] = r[U().id] || []).push(id); P.store.save(); render(); },
    readAll() { const r = P.store.db.alertsRead; r[U().id] = P.alerts(U()).map(a => a.id); P.store.save(); toast('Alertas marcados como lidos.'); render(); },
    resetDemo() {
      modal({ title: 'Restaurar dados de demonstração', submit: 'Restaurar', danger: true, body: '<p class="prose">As alterações feitas neste navegador serão descartadas e a base de exemplo será gerada novamente.</p>',
        onSubmit: () => { const id = U().id; P.store.reset(); S.user = P.user(id) || null; toast('Dados de demonstração restaurados.'); render(true); } });
    },
    editDept(el) {
      const d = el.dataset.id ? P.dept(el.dataset.id) : { name: '', code: '', description: '', managerId: '' };
      const mgrs = P.store.db.users.filter(x => x.role === 'manager');
      // Um diretor também pode ser o gestor responsável (continua diretor e aprova a 1ª etapa das férias da equipe)
      const dirs = P.store.db.users.filter(x => x.role === 'admin' && x.active !== false);
      const opt = m => { const cur = m.role === 'admin' ? P.ledDept(m) : (m.deptId && P.dept(m.deptId)); return `<option value="${m.id}" ${d.managerId === m.id ? 'selected' : ''}>${esc(m.name)}${cur && cur.id !== d.id ? ' (hoje ' + (m.role === 'admin' ? 'gere ' : 'em ') + esc(cur.name) + ')' : ''}</option>`; };
      modal({
        title: el.dataset.id ? 'Editar departamento' : 'Novo departamento',
        body: `<div class="fgrid"><label class="field span2"><span>Nome</span><input type="text" id="dp-name" value="${esc(d.name)}"></label><label class="field"><span>Sigla</span><input type="text" id="dp-code" value="${esc(d.code)}" maxlength="5"></label>
          <label class="field span3"><span>Gestor(a) responsável</span><select id="dp-mgr"><option value="">Sem gestor</option><optgroup label="Gestores">${mgrs.map(opt).join('')}</optgroup><optgroup label="Diretores (acumulam a gestão)">${dirs.map(opt).join('')}</optgroup></select></label>
          <label class="field span3"><span>Descrição</span><textarea id="dp-desc" rows="2">${esc(d.description || '')}</textarea></label></div>`,
        onSubmit: m => {
          const name = $('#dp-name', m).value.trim(), code = $('#dp-code', m).value.trim().toUpperCase();
          if (!name || !code) throw new Error('Informe nome e sigla.');
          const nd = api.saveDept(U(), { id: el.dataset.id, name, code, description: $('#dp-desc', m).value.trim(), managerId: $('#dp-mgr', m).value || null });
          if (!el.dataset.id) P.store.db.activities.length; // novas tabelas de peso são criadas em "Pesos das Atividades"
          toast('Departamento salvo: ' + nd.name + '.'); render();
        }
      });
    },
    editUser(el) {
      const x = el.dataset.id ? P.user(el.dataset.id) : { role: el.dataset.role, name: '', email: '', title: '', deptId: '', capacity: P.store.db.settings.defaultCapacity, hours: 40, active: true };
      const isEmp = x.role === 'employee';
      const isWorker = isEmp || x.role === 'manager';
      const global = x.role === 'admin' || x.role === 'office'; // diretoria e gerência não têm departamento
      const depts = api.departments(U());
      const deptLocked = U().role === 'manager'; // o gestor só cadastra no próprio departamento
      const label = { employee: 'funcionário', manager: 'gestor', office: 'gerente do escritório', admin: 'diretor' }[x.role];
      modal({
        title: (el.dataset.id ? 'Editar ' : 'Novo ') + label,
        body: `<div class="fgrid">
          <label class="field span2"><span>Nome completo</span><input type="text" id="us-name" value="${esc(x.name)}"></label>
          <label class="field"><span>Cargo</span><input type="text" id="us-title" value="${esc(x.title || '')}"></label>
          <label class="field span2"><span>E-mail de acesso</span><input type="email" id="us-email" value="${esc(x.email)}"></label>
          ${global ? '<span></span>' : `<label class="field"><span>Departamento</span><select id="us-dept" ${deptLocked ? 'disabled' : ''}><option value="">—</option>${depts.map(d => `<option value="${d.id}" ${(x.deptId || (deptLocked ? U().deptId : '')) === d.id ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</select></label>`}
          ${isWorker ? `<label class="field"><span>Jornada semanal (h)</span><input type="number" id="us-hours" value="${x.hours || 40}" min="4" max="44"></label>
          <label class="field"><span>Capacidade (pts/semana)</span><input type="number" id="us-cap" value="${x.capacity || P.store.db.settings.defaultCapacity}" min="1" step="0.5"></label>
          ${isEmp ? `<label class="field check"><input type="checkbox" id="us-active" ${x.active !== false ? 'checked' : ''}><span>Ativo</span></label>` : ''}` : ''}
        </div>${!el.dataset.id ? '<p class="fine">A senha inicial de demonstração é <code>demo123</code>. Na versão com banco de dados, o convite é enviado por e-mail.</p>' : ''}`,
        onSubmit: m => {
          const data = { id: el.dataset.id, role: x.role, name: $('#us-name', m).value.trim(), title: $('#us-title', m).value.trim(), email: $('#us-email', m).value.trim(), deptId: global ? null : $('#us-dept', m).value };
          if (!data.name) throw new Error('Informe o nome.');
          if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(data.email)) throw new Error('Informe um e-mail válido.');
          if (isWorker) { if (isEmp && !data.deptId) throw new Error('Selecione o departamento.'); data.hours = $('#us-hours', m).value; data.capacity = $('#us-cap', m).value; if (isEmp) data.active = $('#us-active', m).checked; }
          const r = api.saveUser(U(), data); toast(label[0].toUpperCase() + label.slice(1) + ' salvo: ' + r.name + '.'); render();
        }
      });
    },
    editActivity(el) {
      const a = el.dataset.id ? P.act(el.dataset.id) : { name: '', unit: '', weight: 1, deptId: S.pesoDept };
      modal({
        title: el.dataset.id ? 'Editar atividade' : 'Nova atividade',
        body: `<div class="fgrid">
          <label class="field span3"><span>Departamento</span><select id="ac-dept">${api.departments(U()).map(d => `<option value="${d.id}" ${a.deptId === d.id ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</select></label>
          <label class="field span3"><span>Atividade</span><input type="text" id="ac-name" value="${esc(a.name)}" placeholder="Ex.: Conciliação bancária"></label>
          <label class="field span2"><span>Unidade</span><input type="text" id="ac-unit" value="${esc(a.unit)}" placeholder="Ex.: cliente/mês"></label>
          <label class="field"><span>Peso (pontos)</span><input type="number" id="ac-w" value="${a.weight}" min="0.05" step="0.05"></label>
          <label class="field span3"><span>Motivo ${el.dataset.id ? '(obrigatório se o peso mudar)' : '(opcional)'}</span><input type="text" id="ac-reason" placeholder="Ex.: mediana de 2 semanas de medição: 1h30"></label></div>
          <p class="fine">O novo peso vale para lançamentos futuros. Lançamentos existentes mantêm o peso da época.</p>`,
        onSubmit: m => {
          const d = { id: el.dataset.id, deptId: $('#ac-dept', m).value, name: $('#ac-name', m).value.trim(), unit: $('#ac-unit', m).value.trim(), weight: $('#ac-w', m).value, reason: $('#ac-reason', m).value };
          if (!d.name || !d.unit) throw new Error('Informe atividade e unidade.');
          api.saveActivity(U(), d); S.pesoDept = d.deptId; toast('Atividade salva.'); render();
        }
      });
    },
    toggleActivity(el) { guard(() => { api.toggleActivity(U(), el.dataset.id); render(); }); },
    deleteActivity(el) {
      const a = P.act(el.dataset.id);
      modal({ title: 'Excluir atividade', submit: 'Excluir', danger: true, body: `<p class="prose">Excluir <b>${esc(a.name)}</b> do banco de atividades? Atividades com lançamentos não podem ser excluídas; nesse caso, desative.</p>`,
        onSubmit: () => { api.deleteActivity(U(), a.id); toast('Atividade excluída.'); render(); } });
    },
    saveSettings() {
      const f = $('#settings-form');
      const s = { companyName: val(f, 'companyName').trim(), defaultCapacity: Number(val(f, 'defaultCapacity')), lowThreshold: Number(val(f, 'lowThreshold')), highThreshold: Number(val(f, 'highThreshold')), recurringWeeks: Number(val(f, 'recurringWeeks')), inactivityDays: Number(val(f, 'inactivityDays')), countPending: val(f, 'countPending'), optionalDaysOff: val(f, 'optionalDaysOff') };
      if (!(s.lowThreshold < s.highThreshold)) return toast('O limite de baixa utilização deve ser menor que o de sobrecarga.', 'err');
      guard(() => { api.saveSettings(U(), s); toast('Configurações salvas.'); render(); });
    },
    /* Consulta o CNPJ digitado no formulário e preenche os campos com os dados públicos */
    async lookupCnpj() {
      const input = $('#co-cnpj'), panel = $('#co-receita'), btn = $('[data-act=lookupCnpj]');
      if (!input || !panel) return;
      const digits = P.cnpj.digits(input.value);
      if (!P.cnpj.valid(digits)) { modalErr('CNPJ inválido. Confira os 14 dígitos.'); return; }
      A._lookingUp = digits;
      btn.disabled = true; btn.querySelector('span').textContent = 'Consultando…';
      panel.innerHTML = `<p class="fine rec-loading">${icon('clock')}Consultando os dados públicos na Receita…</p>`;
      const err = $('#m-err'); if (err) err.hidden = true;
      try {
        const info = await P.receita.lookup(digits);
        if (A._lookingUp !== digits || !$('#co-receita')) return; // o usuário mudou o CNPJ ou fechou o formulário
        A._receita = info;
        const filled = [];
        const setVal = (sel, v, label) => { const f = $(sel); if (f && v && f.value !== v) { f.value = v; filled.push(label); } };
        setVal('#co-name', info.name, 'razão social');
        setVal('#co-trade', info.tradeName, 'nome fantasia');
        if (info.suggestion && info.suggestion.regime) setVal('#co-reg', info.suggestion.regime, 'regime tributário');
        // "Cliente desde" é dado interno do escritório: não vem da Receita
        $('#co-receita').innerHTML = V.receitaPanel(info, { filled });
        if (!P.receita.hasRegimeSource(info)) A.autoRegime(digits); else A._autoToken = null;
      } catch (e) {
        if ($('#co-receita')) $('#co-receita').innerHTML = `<div class="banner warn sm">${icon('alert')}<div>${esc(e.message)}</div></div>`;
      } finally {
        const b = $('[data-act=lookupCnpj]'); if (b) { b.disabled = false; b.querySelector('span').textContent = 'Receita'; }
      }
    },
    /* Aplica no formulário aberto os dados completos (com forma de tributação) que chegaram depois */
    _applyRegime(full) {
      const panel = $('#co-receita');
      if (!panel || !A._receita || P.cnpj.digits(A._receita.cnpj) !== P.cnpj.digits(full.cnpj)) return false;
      A._receita = full;
      const filled = [];
      const reg = $('#co-reg');
      if (full.suggestion && full.suggestion.regime && reg && reg.value !== full.suggestion.regime) { reg.value = full.suggestion.regime; filled.push('regime tributário'); }
      panel.innerHTML = V.receitaPanel(full, { filled });
      return true;
    },
    _regimeStatus(text) { const s = $('[data-regime-status]'); if (s) s.textContent = text; },
    /* Dados vieram da CNPJá (sem Lucro Real/Presumido): o sistema tenta de novo sozinho, com intervalos crescentes */
    async autoRegime(cnpj) {
      const d = P.cnpj.digits(cnpj), token = A._autoToken = Symbol('regime');
      const waits = [5000, 20000, 60000];
      for (let i = 0; i < waits.length; i++) {
        A._regimeStatus(`Nova tentativa automática em ${Math.round(waits[i] / 1000)} s (${i + 1} de ${waits.length})…`);
        await new Promise(r => setTimeout(r, waits[i]));
        if (A._autoToken !== token || !$('#co-receita')) return; // formulário fechado ou outro CNPJ
        A._regimeStatus(`Buscando o regime (tentativa ${i + 1} de ${waits.length})…`);
        try {
          const full = await P.receita.regime(d);
          if (A._autoToken === token) A._applyRegime(full);
          return;
        } catch (e) { /* continua tentando */ }
      }
      if (A._autoToken === token) A._regimeStatus('Os serviços continuam fora do ar. Tente o botão mais tarde ou informe o regime manualmente; a empresa fica marcada para a próxima atualização pela Receita.');
    },
    async retryRegime(el) {
      const info = A._receita;
      if (!info || !$('#co-receita')) return;
      A._autoToken = null; // a busca manual substitui a automática
      el.disabled = true; el.querySelector('span').textContent = 'Buscando… (até 1 min)';
      try {
        A._applyRegime(await P.receita.regime(info.cnpj));
      } catch (e) {
        el.disabled = false; el.querySelector('span').textContent = 'Buscar regime de novo';
        A._regimeStatus(e.message);
      }
    },
    /* ---------- Importação de empresas por planilha ---------- */
    importCompanies() {
      A._imp = null; S.impFilter = 'todas';
      modal({
        title: 'Importar empresas por planilha', wide: true, submit: 'Importar',
        body: V.importStart(),
        onSubmit: () => {
          const imp = A._imp;
          if (!imp) throw new Error('Escolha a planilha para ver a prévia antes de importar.');
          const ok = imp.plan.novas + imp.plan.atualizar;
          if (!ok) throw new Error(imp.plan.iguais ? 'Nada a importar: as empresas da planilha já estão iguais no cadastro.' : 'Nenhuma linha válida para importar. Corrija os erros na planilha.');
          const withReceita = $('#imp-receita') && $('#imp-receita').checked;
          const { touched, report } = api.applyCompanyImport(U(), imp.plan, imp.name);
          A._imp = null; S.comp.status = ''; render();
          if (withReceita) {
            const ids = touched.filter(id => { const c = P.idx.companies.get(id); return c && c.cnpj; });
            if (ids.length) A.bulkReceita(null, null, ids);
          }
          A.showImportReport(report, report.falhas ? 'falha' : 'todas', true); // abre a relação no lugar da janela de importação
          return false;
        }
      });
      A._setImportButton();
    },
    /* ---------- Alterar a função (perfil de acesso) de uma pessoa ---------- */
    changeRole(el) {
      const x = P.user(el.dataset.id);
      if (!x) return;
      if (x.id === U().id) return toast('Você não pode alterar a sua própria função.', 'err');
      const depts = api.departments(U());
      if (!P.canChangeRole(U(), x)) return toast('Você só altera a função de quem está abaixo de você na hierarquia.', 'err');
      const ROLE_DESC = {
        employee: 'Registra as próprias atividades e vê só os próprios dados.',
        manager: 'Vê e aprova a equipe de um departamento. Altera dados dos funcionários e os pesos do departamento.',
        office: 'Vê todos os departamentos. Altera gestores e funcionários, configurações gerais e aprova férias antes da diretoria.',
        admin: 'Topo da hierarquia: acesso total e aprovação final de férias.'
      };
      const allowed = P.assignableRoles(U());
      const hist = (x.roleHistory || []).slice(0, 5);
      modal({
        title: 'Promover ou rebaixar · ' + esc(x.name), submit: 'Confirmar',
        body: `<form id="role-form" class="form" novalidate>
          <p class="prose">Função atual: <b>${P.ROLES[x.role]}</b>${x.deptId && P.dept(x.deptId) ? ' · ' + esc(P.dept(x.deptId).name) : ''}</p>
          <fieldset class="field roles"><legend>Nova função</legend>
            ${P.ROLE_ORDER.map(k => { const off = k === x.role || !allowed.includes(k); return `<label class="role-opt ${off ? 'cur' : ''}"><input type="radio" name="role" value="${k}" ${off ? 'disabled' : ''}><span><b>${P.ROLES[k]}${k === x.role ? ' (atual)' : !allowed.includes(k) ? ' · acima do seu nível' : P.LEVEL[k] > P.LEVEL[x.role] ? ' <i class="role-dir up">Promoção</i>' : ' <i class="role-dir down">Rebaixamento</i>'}</b><small>${ROLE_DESC[k]}</small></span></label>`; }).join('')}
          </fieldset>
          <label class="field" id="role-dept-f" hidden><span>Departamento</span><select id="role-dept">${depts.map(d => `<option value="${d.id}" ${d.id === x.deptId ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</select></label>
          <fieldset class="field roles" id="role-prev-f" hidden><legend id="role-prev-l"></legend>
            <label class="role-opt"><input type="radio" name="prev" value="employee" checked><span><b>Passa a ser funcionário(a) do departamento</b><small>Mantém o histórico e continua registrando atividades.</small></span></label>
            <label class="role-opt"><input type="radio" name="prev" value="none"><span><b>Continua gestor(a), sem departamento</b><small>Fica sem equipe até você vinculá-lo(a) a outro departamento.</small></span></label>
          </fieldset>
          ${P.ledDept(x) ? `<label class="field check" id="role-keep-f" hidden><input type="checkbox" id="role-keep" checked><span>Continuar como gestor(a) de ${esc(P.ledDept(x).name)} (diretor e gestor ao mesmo tempo)</span></label>` : ''}
          <div id="role-warn"></div>
          <label class="field"><span>Motivo <small>(opcional, fica no histórico)</small></span><input type="text" id="role-reason" placeholder="Ex.: promoção a gestora do Fiscal"></label>
          ${hist.length ? `<h4 class="sub-h">Histórico de funções</h4><ul class="day-list">${hist.map(h => `<li><span>${P.ROLES[h.from]} → ${P.ROLES[h.to]}${h.reason ? `<small>${esc(h.reason)}</small>` : ''}</span><b>${esc(h.at.slice(0, 10).split('-').reverse().join('/'))}</b></li>`).join('')}</ul>` : ''}
        </form>`,
        onSubmit: m => {
          const role = (m.querySelector('input[name=role]:checked') || {}).value;
          if (!role) throw new Error('Escolha a nova função.');
          const r = api.changeRole(U(), x.id, role, { deptId: $('#role-dept', m).value, prevManager: (m.querySelector('input[name=prev]:checked') || {}).value, keepManagement: !!($('#role-keep', m) || {}).checked, reason: $('#role-reason', m).value });
          toast(`${P.LEVEL[role] > P.LEVEL[r.user.roleHistory[0].from] ? 'Promoção registrada' : 'Rebaixamento registrado'}: ${x.name} agora é ${P.ROLES[role].toLowerCase()}${r.notes.length ? ' (' + r.notes.join('; ') + ')' : ''}.`);
          render();
        }
      });
      A._roleUser = x.id; A._roleUpdate();
    },
    /* Mostra os campos e avisos conforme a função escolhida */
    _roleUpdate() {
      const f = $('#role-form'); if (!f) return;
      const x = P.user(A._roleUser);
      const role = (f.querySelector('input[name=role]:checked') || {}).value;
      const deptSel = $('#role-dept'), d = P.dept(deptSel.value);
      $('#role-dept-f').hidden = !role || role === 'admin' || role === 'office';
      const cur = role === 'manager' && d && d.managerId && d.managerId !== x.id ? P.user(d.managerId) : null;
      $('#role-prev-f').hidden = !cur;
      if (cur) $('#role-prev-l').textContent = d.name + ' já tem gestor(a): ' + cur.name + '. O que acontece com ' + P.firstName(cur.name) + '?';
      const w = [], led = P.ledDept(x), keepF = $('#role-keep-f'), keep = role === 'admin' && keepF && $('#role-keep').checked;
      if (keepF) keepF.hidden = role !== 'admin';
      if (led && role && !keep && !(role === 'manager' && d && d.id === led.id)) w.push(`${led.name} ficará sem gestor(a). Defina outra pessoa em seguida.`);
      if (keep) w.push(`${P.firstName(x.name)} continuará aprovando a 1ª etapa das férias da equipe de ${led.name}.`);
      if (x.role === 'admin' && role) w.push(`${P.firstName(x.name)} sairá da diretoria e perderá o acesso de diretor.`);
      const stageLevel = { gestor: 2, gerente: 3 };
      const pend = role ? (P.store.db.vacations || []).filter(v => v.userId === x.id && stageLevel[v.status] && stageLevel[v.status] <= P.LEVEL[role]).length : 0;
      if (pend) w.push(`${pend} pedido${pend > 1 ? 's' : ''} de férias de ${P.firstName(x.name)} ${pend > 1 ? 'subirão' : 'subirá'} para a próxima etapa, porque ninguém aprova as próprias férias.`);
      if (role === 'manager') w.push(`${P.firstName(x.name)} passará a ver e aprovar os lançamentos e as férias da equipe de ${d ? d.name : 'departamento escolhido'}.`);
      if (role === 'office') {
        const other = P.store.db.users.filter(o => o.role === 'office' && o.id !== x.id && o.active !== false);
        if (other.length) w.push(`Já existe gerente do escritório (${other.map(o => o.name).join(', ')}). Os dois passarão a aprovar a mesma etapa.`);
        w.push(`${P.firstName(x.name)} verá todos os departamentos, alterará gestores e funcionários e aprovará férias antes da diretoria. Deixará de aparecer nas métricas de equipe.`);
      }
      if (role === 'admin') w.push(`${P.firstName(x.name)} entrará na diretoria: acesso total e aprovação final de férias. Deixará de aparecer nas métricas de equipe.`);
      if (role === 'employee' && x.role !== 'employee') w.push(`${P.firstName(x.name)} perderá o acesso aos dados da equipe e verá só os próprios.`);
      $('#role-warn').innerHTML = w.length ? `<div class="banner warn sm">${icon('alert')}<div>${w.map(esc).join('<br>')}</div></div>` : '';
    },
    /* ---------- Meu perfil: nome e foto ---------- */
    saveProfileName() {
      const v = ($('#pf-name') || {}).value;
      try { const me = api.updateProfile(U(), { name: v }); S.user = me; toast('Nome atualizado: ' + me.name + '.'); render(); }
      catch (e) { toast(e.message, 'err'); }
    },
    removePhoto() {
      modal({ title: 'Remover foto de perfil', submit: 'Remover', danger: true, body: '<p class="prose">A foto será substituída pelas iniciais do seu nome.</p>',
        onSubmit: () => { api.updateProfile(U(), { photo: '' }); toast('Foto removida.'); render(); } });
    },
    /* Recorta a imagem em quadrado (centro) e reduz para 256×256 px antes de salvar */
    async uploadPhoto(file) {
      if (!file) return;
      if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return toast('Use uma imagem JPG, PNG ou WEBP.', 'err');
      if (file.size > 15 * 1024 * 1024) return toast('A imagem tem mais de 15 MB. Escolha uma menor.', 'err');
      try {
        const url = URL.createObjectURL(file);
        const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Não foi possível ler a imagem.')); i.src = url; });
        const side = Math.min(img.naturalWidth, img.naturalHeight), size = 256;
        const cv = document.createElement('canvas'); cv.width = size; cv.height = size;
        const ctx = cv.getContext('2d');
        ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, size, size);
        ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, size, size);
        URL.revokeObjectURL(url);
        api.updateProfile(U(), { photo: cv.toDataURL('image/jpeg', 0.85) });
        toast('Foto de perfil atualizada.'); render();
      } catch (e) { toast(e.message, 'err'); }
    },
    /* ---------- Desligamento (demissão) e readmissão: só diretoria ---------- */
    dismissUser(el) {
      const x = P.user(el.dataset.id);
      if (!x) return;
      if (U().role !== 'admin') return toast('Somente a diretoria pode desligar pessoas.', 'err');
      const imp = api.dismissImpact(x.id);
      if (imp.lastDirector) return toast('Não é possível desligar o último diretor ativo.', 'err');
      const d = P.dept(x.deptId);
      const peers = d ? P.store.db.users.filter(o => o.id !== x.id && o.active !== false && o.deptId === x.deptId && (o.role === 'employee' || o.role === 'manager')).sort((a, b) => a.name.localeCompare(b.name)) : [];
      const hasWork = imp.assignments || imp.tasks;
      const items = [];
      if (imp.dept) items.push(`<b>${esc(imp.dept)}</b> ficará sem gestor(a). Defina outra pessoa depois em Gestores.`);
      if (imp.waiting) items.push(`<b>${imp.waiting}</b> pedido${imp.waiting > 1 ? 's' : ''} de férias que aguardava${imp.waiting > 1 ? 'm' : ''} a aprovação de ${esc(P.firstName(x.name))} seguirá${imp.waiting > 1 ? 'ão' : ''} para a próxima etapa.`);
      if (imp.ownVacations) items.push(`<b>${imp.ownVacations}</b> pedido${imp.ownVacations > 1 ? 's' : ''} de férias de ${esc(P.firstName(x.name))} (em aprovação ou futuras) ${imp.ownVacations > 1 ? 'serão cancelados' : 'será cancelado'}.`);
      if (hasWork) items.push(`<b>${imp.assignments}</b> empresa${imp.assignments === 1 ? '' : 's'} da carteira e <b>${imp.tasks}</b> tarefa${imp.tasks === 1 ? '' : 's'} pendente${imp.tasks === 1 ? '' : 's'}: escolha abaixo para quem transferir.`);
      items.push('O acesso ao sistema é bloqueado na hora. Lançamentos, metas e auditoria são preservados, e a pessoa pode ser readmitida.');
      modal({
        title: 'Desligar ' + esc(x.name), submit: 'Desligar', danger: true,
        body: `<p class="prose">${V.roleBadge(x.role)} ${d ? '· ' + esc(d.name) : ''} · ${esc(x.email)}</p>
          <ul class="del-impact">${items.map(i => `<li>${i}</li>`).join('')}</ul>
          <div class="fgrid">
            <label class="field"><span>Data do desligamento</span><input type="date" id="dm-date" value="${D.iso(P.today())}"></label>
            ${hasWork ? `<label class="field span2"><span>Transferir carteira e tarefas para</span><select id="dm-to"><option value="">Não transferir (carteira liberada, tarefas mantidas)</option>${peers.map(o => `<option value="${o.id}">${esc(o.name)}${o.role === 'manager' ? ' · Gestor(a)' : ''}</option>`).join('')}</select></label>` : '<span></span>'}
            <label class="field span3"><span>Motivo</span><input type="text" id="dm-reason" placeholder="Ex.: pedido de demissão; fim de contrato; reestruturação"></label>
          </div>
          <label class="field check"><input type="checkbox" id="dm-ok"><span>Confirmo o desligamento de ${esc(x.name)}</span></label>`,
        onSubmit: m => {
          if (!$('#dm-ok', m).checked) throw new Error('Marque a confirmação para desligar.');
          const r = api.dismissUser(U(), x.id, { date: $('#dm-date', m).value, reason: $('#dm-reason', m).value, transferTo: ($('#dm-to', m) || {}).value });
          toast(`${x.name} foi desligado(a)${r.notes.length ? '. ' + r.notes.join('; ') : ''}.`);
          render();
        }
      });
    },
    readmitUser(el) {
      const x = P.user(el.dataset.id);
      const dm = (x.dismissals || [])[0];
      modal({
        title: 'Readmitir ' + esc(x.name), submit: 'Readmitir',
        body: `<p class="prose">${esc(x.name)} foi desligado(a) em ${dm ? D.fmt(dm.at) : '—'}${dm && dm.reason ? ` (motivo: ${esc(dm.reason)})` : ''}. Ao readmitir, o acesso volta com a função ${esc(P.ROLES[x.role])}.${x.role === 'manager' ? ' Se o departamento já tiver outro gestor, a pessoa volta como funcionária.' : ''}</p>`,
        onSubmit: () => { const r = api.readmitUser(U(), x.id); toast(`${x.name} foi readmitido(a)${r.notes.length ? '. ' + r.notes.join('; ') : ''}.`); render(); }
      });
    },
    /* ---------- Empresas: seleção e ações em lote ---------- */
    compSel(el) { const s = S.compSel = S.compSel || new Set(); if (el.checked) s.add(el.dataset.id); else s.delete(el.dataset.id); render(); },
    compPage(el) { S.compPage = (S.compPage || 1) + Number(el.dataset.d); render(); },
    compSelAll(el) {
      const s = S.compSel = S.compSel || new Set();
      (A._compVisible || []).forEach(id => { if (el.checked) s.add(id); else s.delete(id); });
      render();
    },
    compSelClear() { S.compSel = new Set(); render(); },
    _selectedCompanies() { return [...(S.compSel || [])].map(id => P.idx.companies.get(id)).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name)); },
    _companyListHtml(list) {
      const show = list.slice(0, 12);
      return `<ul class="del-list">${show.map(c => `<li><span class="mono">${esc(c.code || '—')}</span> ${esc(c.name)}${c.cnpj ? ` <small class="muted">${esc(c.cnpj)}</small>` : ''}</li>`).join('')}${list.length > show.length ? `<li class="muted">… e mais ${list.length - show.length}</li>` : ''}</ul>`;
    },
    compBulkInactivate() {
      const list = A._selectedCompanies();
      if (!list.length) return toast('Selecione ao menos uma empresa.', 'err');
      const n = list.filter(c => c.active).length;
      modal({
        title: `Inativar ${list.length} empresa${list.length > 1 ? 's' : ''}`, submit: 'Inativar',
        body: `<p class="prose">As empresas saem da lista de ativas, mas o cadastro, a carteira e o histórico são mantidos. Dá para reativar depois.${n < list.length ? ` ${list.length - n} já estão inativas.` : ''}</p>${A._companyListHtml(list)}`,
        onSubmit: () => { const k = api.setCompaniesActive(U(), list.map(c => c.id), false); S.compSel = new Set(); toast(`${k} empresa${k === 1 ? '' : 's'} inativada${k === 1 ? '' : 's'}.`); render(); }
      });
    },
    compBulkDelete() {
      const list = A._selectedCompanies();
      if (!list.length) return toast('Selecione ao menos uma empresa.', 'err');
      const imp = api.companyDeleteImpact(list.map(c => c.id));
      const n = list.length;
      modal({
        title: `Apagar ${n} empresa${n > 1 ? 's' : ''}`, submit: `Apagar ${n} empresa${n > 1 ? 's' : ''}`, danger: true,
        body: `<div class="banner crit sm">${icon('alert')}<div><b>Esta ação não pode ser desfeita.</b> Se a empresa só deixou de ser cliente, prefira inativar: o histórico fica preservado.</div></div>
          ${A._companyListHtml(list)}
          <ul class="del-impact">
            <li>${imp.assignments ? `<b>${imp.assignments}</b> vínculo${imp.assignments > 1 ? 's' : ''} de carteira (responsável por empresa) ${imp.assignments > 1 ? 'serão removidos' : 'será removido'}.` : 'Nenhum vínculo de carteira será afetado.'}</li>
            <li>${imp.entries ? `<b>${imp.entries}</b> lançamento${imp.entries > 1 ? 's' : ''} e ${imp.tasks} tarefa${imp.tasks === 1 ? '' : 's'} pendente${imp.tasks === 1 ? '' : 's'} com o nome dessas empresas são mantidos, com o nome como texto.` : 'Não há lançamentos com o nome dessas empresas.'}</li>
            <li>A exclusão fica registrada na auditoria, com a lista de empresas.</li>
          </ul>
          <label class="field check"><input type="checkbox" id="del-ok"><span>Entendo que as ${n} empresa${n > 1 ? 's' : ''} ${n > 1 ? 'serão apagadas' : 'será apagada'} definitivamente</span></label>`,
        onSubmit: m => {
          if (!$('#del-ok', m).checked) throw new Error('Marque a confirmação para apagar.');
          const r = api.deleteCompanies(U(), list.map(c => c.id));
          S.compSel = new Set();
          toast(`${r.count} empresa${r.count === 1 ? '' : 's'} apagada${r.count === 1 ? '' : 's'}${r.assignments ? ` e ${r.assignments} vínculo${r.assignments === 1 ? '' : 's'} de carteira removido${r.assignments === 1 ? '' : 's'}` : ''}.`);
          render();
        }
      });
    },
    /* Relação da importação (ao final da importação ou pelo histórico) */
    showImportReport(rep, filter, justImported) {
      A._rep = rep; A._repFilter = filter || 'todas';
      const ok = rep.criadas + rep.atualizadas;
      modal({
        title: 'Relação da importação', wide: true, cancel: 'Fechar', submit: 'Baixar relação (Excel)',
        body: `<div id="rep-box">${V.importReport(rep, A._repFilter)}</div>`,
        onSubmit: () => { A.exportImportReport(rep); return false; }
      });
      if (justImported) toast(`Importação concluída: ${ok} empresa${ok === 1 ? '' : 's'} importada${ok === 1 ? '' : 's'} com sucesso, ${rep.falhas} falha${rep.falhas === 1 ? '' : 's'}.`, rep.falhas ? 'err' : 'ok');
    },
    repFilter(el) { A._repFilter = el.dataset.key; const b = $('#rep-box'); if (b && A._rep) b.innerHTML = V.importReport(A._rep, A._repFilter); },
    openImportReport(el) { const r = api.importLogs(U()).find(x => x.id === el.dataset.id); if (r) A.showImportReport(r, r.falhas ? 'falha' : 'todas'); },
    importHistory() {
      modal({ title: 'Importações de empresas', cancel: 'Fechar', body: `<p class="fine">As 20 importações mais recentes. Clique em uma para ver a relação de empresas importadas e falhas.</p>${V.importHistory(api.importLogs(U()))}` });
    },
    exportImportReport(rep) {
      const label = { criada: 'Importada (nova)', atualizada: 'Importada (atualizada)', igual: 'Sem alteração', falha: 'Falha' };
      const map = l => ({ 'Linha da planilha': l.row, 'Resultado': label[l.status], 'Código': l.code, 'Nome da empresa': l.name, 'CNPJ': l.cnpj, 'Regime tributário': l.regime, 'Detalhes / motivo': l.detail });
      const resumo = [['Relação da importação de empresas'], ['Arquivo', rep.file], ['Data', rep.at.slice(0, 10).split('-').reverse().join('/') + ' ' + rep.at.slice(11)], ['Responsável', (P.user(rep.by) || {}).name || '—'], [],
        ['Importadas com sucesso', rep.criadas + rep.atualizadas], ['  Novas', rep.criadas], ['  Atualizadas', rep.atualizadas], ['Sem alteração', rep.iguais], ['Falhas', rep.falhas], ['Total de linhas', rep.total]];
      const ok = rep.rows.filter(l => l.status === 'criada' || l.status === 'atualizada').map(map);
      const fail = rep.rows.filter(l => l.status === 'falha').map(map);
      const same = rep.rows.filter(l => l.status === 'igual').map(map);
      const sheets = [['Resumo', resumo], ['Importadas com sucesso', ok.length ? ok : [{ 'Resultado': 'Nenhuma' }]], ['Falhas', fail.length ? fail : [{ 'Resultado': 'Nenhuma falha' }]]];
      if (same.length) sheets.push(['Sem alteração', same]);
      toXlsx(sheets, 'relacao-importacao-' + fileSlug(rep.file.replace(/\.[^.]+$/, '')) + '-' + rep.at.slice(0, 10));
    },
    _setImportButton() {
      const b = $('#modal-root [data-act=modalSubmit]'); if (!b) return;
      const n = A._imp ? A._imp.plan.novas + A._imp.plan.atualizar : 0;
      b.disabled = !n; b.querySelector('span').textContent = n ? `Importar ${n} empresa${n > 1 ? 's' : ''}` : 'Importar';
    },
    impFilter(el) {
      S.impFilter = el.dataset.key;
      if (A._imp && $('#imp-preview')) $('#imp-preview').innerHTML = V.importPreview(A._imp.plan, A._imp.name);
    },
    /* Lê .xlsx (pela biblioteca SheetJS) ou .csv e monta a prévia */
    async readImportFile(file) {
      const box = $('#imp-preview'); if (!box) return;
      box.innerHTML = `<p class="fine rec-loading">${icon('clock')}Lendo ${esc(file.name)}…</p>`;
      try {
        const table = await A._readSheet(file);
        const rows = A._mapImportRows(table);
        if (!rows.length) throw new Error('Não encontrei linhas preenchidas. Confira se os dados estão na aba "Clientes", a partir da linha 2.');
        const plan = api.planCompanyImport(U(), rows);
        A._imp = { plan, name: file.name };
        S.impFilter = plan.erros ? 'erro' : 'todas';
        box.innerHTML = V.importPreview(plan, file.name);
      } catch (e) {
        A._imp = null;
        box.innerHTML = `<div class="banner crit sm">${icon('alert')}<div>${esc(e.message)}</div></div>`;
      }
      A._setImportButton();
    },
    async _readSheet(file) {
      const isCsv = /\.csv$/i.test(file.name);
      if (isCsv) {
        const text = await file.text();
        const sep = (text.split(/\r?\n/)[0].match(/;/g) || []).length >= (text.split(/\r?\n/)[0].match(/,/g) || []).length ? ';' : ',';
        return A._parseCsv(text.replace(/^﻿/, ''), sep);
      }
      try { await loadScript(XLSX_SRC, () => window.XLSX && window.XLSX.utils); }
      catch (e) { throw new Error('Para ler arquivos .xlsx o sistema precisa de internet (biblioteca de planilhas). Sem internet, salve a planilha como CSV e importe o .csv.'); }
      const wb = window.XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const name = wb.SheetNames.find(n => /^clientes$/i.test(n.trim())) || wb.SheetNames[0];
      return window.XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: false, defval: '' });
    },
    _parseCsv(text, sep) {
      const out = []; let row = [], cell = '', q = false;
      for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
        else if (ch === '"') q = true;
        else if (ch === sep) { row.push(cell); cell = ''; }
        else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); out.push(row); row = []; cell = ''; }
        else cell += ch;
      }
      if (cell || row.length) { row.push(cell); out.push(row); }
      return out;
    },
    /* Encontra o cabeçalho (Código, Nome da empresa, CNPJ, Regime tributário) e devolve as linhas preenchidas */
    _mapImportRows(table) {
      const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
      let h = table.findIndex(r => r.some(c => norm(c).startsWith('codigo')) && r.some(c => norm(c).includes('nome') || norm(c).includes('empresa')));
      let idx = { code: 0, name: 1, cnpj: 2, regime: 3 };
      if (h >= 0) {
        const hdr = table[h].map(norm);
        const find = (test, def) => { const i = hdr.findIndex(test); return i >= 0 ? i : def; };
        idx = { code: find(c => c.startsWith('codigo'), 0), name: find(c => c.includes('nome') || c === 'empresa' || c.includes('razao'), 1), cnpj: find(c => c.includes('cnpj'), 2), regime: find(c => c.includes('regime'), 3) };
      } else h = -1;
      const rows = [];
      for (let i = h + 1; i < table.length; i++) {
        const r = table[i] || [];
        const cells = [r[idx.code], r[idx.name], r[idx.cnpj], r[idx.regime]].map(v => String(v == null ? '' : v).trim());
        if (!cells.some(Boolean)) continue;
        rows.push({ row: i + 1, code: cells[0], name: cells[1], cnpj: cells[2], regime: cells[3] });
      }
      return rows;
    },
    async bulkReceita(el, ev, onlyIds) {
      const u = U();
      if (S.receitaJob && S.receitaJob.running) return toast('Já há uma atualização pela Receita em andamento.', 'err');
      const only = onlyIds ? new Set(onlyIds) : null;
      const list = api.companies(u).filter(c => c.active && c.cnpj && P.cnpj.valid(c.cnpj) && (!only || only.has(c.id)));
      if (!list.length) return toast('Nenhuma empresa ativa tem CNPJ informado. Cadastre os CNPJs para atualizar pela Receita.', 'err');
      const job = S.receitaJob = { running: true, total: list.length, done: 0, ok: 0, changed: 0, errors: [], stop: false };
      render();
      const wait = ms => new Promise(r => setTimeout(r, ms));
      for (const c of list) {
        if (job.stop) break;
        let tries = 0;
        while (true) {
          try {
            const info = await P.receita.lookup(c.cnpj);
            const ch = api.applyReceita(u, c.id, info);
            job.ok++; if (ch.length) job.changed++;
            if (!P.REGIMES[api.company(u, c.id).regime] && !P.receita.hasRegimeSource(api.company(u, c.id).receita)) job.pendingRegime = (job.pendingRegime || 0) + 1;
            break;
          } catch (e) {
            if (/Muitas consultas/.test(e.message) && tries++ < 2 && !job.stop) { await wait(30000); continue; }
            job.errors.push(c.name + ': ' + e.message);
            if (/Detalhe técnico/.test(e.message)) job.stop = true; // nenhum serviço acessível: não adianta continuar
            break;
          }
        }
        job.done++;
        if (S.route.page === 'empresas') render();
        await wait(1200);
      }
      job.running = false;
      if (S.route.page === 'empresas') render();
      toast(`Receita: ${job.ok} de ${job.total} empresas atualizadas.`, job.errors.length ? 'err' : 'ok');
    },
    stopReceita() { if (S.receitaJob) S.receitaJob.stop = true; },
    clearReceitaJob() { S.receitaJob = null; render(); },
    editCompany(el) {
      const c = el.dataset.id ? api.company(U(), el.dataset.id) : { regime: '', depts: U().role === 'manager' ? [U().deptId] : [] };
      A._receita = null; A._lookingUp = null; A._autoToken = null;
      modal({
        title: el.dataset.id ? 'Editar empresa' : 'Nova empresa', wide: true,
        body: V.companyForm(c),
        onSubmit: m => {
          const r = api.saveCompany(U(), {
            id: el.dataset.id, code: $('#co-code', m).value, name: $('#co-name', m).value, tradeName: $('#co-trade', m).value, cnpj: $('#co-cnpj', m).value,
            regime: $('#co-reg', m).value, regimeNote: ($('#co-regnote', m) || {}).value, since: $('#co-since', m).value,
            depts: [...m.querySelectorAll('input[name=co-dept]:checked')].map(x => x.value), notes: $('#co-notes', m).value,
            receita: A._receita
          });
          toast('Empresa salva: ' + r.name + ' · ' + P.REGIMES[r.regime].label + '.'); render();
        }
      });
    },
    toggleCompany(el) { guard(() => { api.toggleCompany(U(), el.dataset.id); render(); }); },
    requestVacation(el) {
      const f = el.closest('.card, .modal').querySelector('[data-vac-form]');
      try {
        const v = api.requestVacation(U(), { start: val(f, 'start'), end: val(f, 'end'), comment: val(f, 'comment'), abono: val(f, 'abono'), adiant13: val(f, 'adiant13') });
        toast('Solicitação enviada. Etapa atual: ' + P.VAC[v.status].label.toLowerCase() + '.'); render();
      } catch (e) { toast(e.message, 'err'); }
    },
    newVacation() {
      modal({
        title: 'Solicitar minhas férias', wide: true, submit: 'Enviar solicitação',
        body: V.vacForm(U(), 'vac-modal') + `<p class="fine">Ninguém aprova as próprias férias: a sua solicitação começa na etapa "${P.VAC[api._nextStage(P.LEVEL[U().role], U().deptId)].short}".</p>`,
        onSubmit: m => { const f = $('[data-vac-form]', m); const v = api.requestVacation(U(), { start: val(f, 'start'), end: val(f, 'end'), comment: val(f, 'comment'), abono: val(f, 'abono'), adiant13: val(f, 'adiant13') }); toast('Solicitação enviada para a etapa "' + P.VAC[v.status].short + '".'); render(); }
      });
    },
    reviewVacation(el) {
      const v = (P.store.db.vacations || []).find(x => x.id === el.dataset.id), op = el.dataset.op, who = P.user(v.userId);
      const stage = v.status;
      const conflicts = api.vacationConflicts(v);
      modal({
        title: (op === 'aprovar' ? 'Aprovar' : 'Recusar') + ' férias de ' + esc(who.name), danger: op === 'recusar', submit: op === 'aprovar' ? (stage === 'diretoria' ? 'Aprovar e publicar no calendário' : 'Aprovar e enviar à próxima etapa') : 'Recusar',
        body: `<p class="prose"><b>${D.fmt(v.start)} a ${D.fmt(v.end)}</b> · ${v.days} dias corridos${v.abono ? ' · abono pecuniário' : ''}${v.adiant13 ? ' · adiantamento do 13º' : ''}</p>
          ${v.comment ? `<blockquote class="vac-comment">${icon('message')}<span>${esc(v.comment)}</span></blockquote>` : ''}
          ${conflicts.length ? `<div class="banner warn sm">${icon('users')}<div>No mesmo período: ${conflicts.map(c => esc(P.user(c.userId).name) + ' (' + P.VAC[c.status].short.toLowerCase() + ')').join(', ')}.</div></div>` : ''}
          <label class="field"><span>${op === 'aprovar' ? 'Observação (opcional)' : 'Motivo da recusa'}</span><textarea id="vr-note" rows="3" placeholder="${op === 'aprovar' ? 'Ex.: carteira fica com a Amanda durante o período' : 'Ex.: período coincide com o fechamento anual; sugerir outra data'}"></textarea></label>`,
        onSubmit: m => {
          const r = api.reviewVacation(U(), v.id, op, $('#vr-note', m).value);
          toast(r.status === 'aprovada' ? 'Férias aprovadas e publicadas no calendário.' : r.status === 'recusada' ? 'Solicitação recusada.' : 'Aprovada. Seguiu para a etapa: ' + P.VAC[r.status].short.toLowerCase() + '.'); render();
        }
      });
    },
    cancelVacation(el) {
      modal({ title: 'Cancelar solicitação de férias', submit: 'Cancelar solicitação', cancel: 'Voltar', danger: true, body: '<p class="prose">A solicitação sai da fila de aprovação. Você pode enviar outra depois.</p>',
        onSubmit: () => { api.cancelVacation(U(), el.dataset.id); toast('Solicitação cancelada.'); render(); } });
    },
    vacSel(el) { S.vac.sel = el.dataset.date; const d = D.parse(el.dataset.date); if (d.getMonth() !== S.vac.month.getMonth()) S.vac.month = D.monthStart(d); render(); },
    vacMove(el) { S.vac.month = D.addMonths(S.vac.month, Number(el.dataset.d)); render(); },
    exportPdf() {
      let rep; try { rep = P.buildReport(U(), S.rep); } catch (e) { return toast(e.message, 'err'); }
      toast('Gerando PDF…');
      toPdf(rep).catch(e => toast(e.message, 'err'));
    },
    exportXlsx() {
      let rep; try { rep = P.buildReport(U(), S.rep); } catch (e) { return toast(e.message, 'err'); }
      toXlsx(reportSheets(rep), fileSlug(rep.title + ' ' + rep.subject + ' ' + rep.p.label));
    },
    exportHist() {
      const u = U(), h = S.hist;
      const list = api.entries(u, { deptId: P.isGlobal(u) ? (h.deptId || undefined) : undefined, userId: h.userId || undefined, activityId: h.activityId || undefined, client: h.client || undefined, status: h.status || undefined, s: h.s || undefined, e: h.e || undefined });
      toXlsx([['Histórico', entryRows(list)]], 'historico-atividades-' + D.iso(P.today()));
    }
  };

  /* ---------- Eventos ---------- */
  document.addEventListener('click', ev => {
    const act = ev.target.closest('[data-act]');
    if (act && !(act.tagName === 'INPUT' && act.type !== 'checkbox')) {
      if (act.disabled) return;
      if (act.tagName === 'A') ev.preventDefault();
      const fn = A[act.dataset.act];
      if (fn) { if (act.type !== 'checkbox') ev.preventDefault(); fn(act, ev); }
      return;
    }
    const go = ev.target.closest('[data-go]');
    if (go) { ev.preventDefault(); P.go(go.dataset.go); }
  });
  document.addEventListener('keydown', ev => {
    if (ev.key === 'Escape' && !$('#modal-root').hidden) closeModal();
    if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.matches('[data-go][tabindex]')) { ev.preventDefault(); P.go(ev.target.dataset.go); }
  });
  document.addEventListener('submit', ev => {
    ev.preventDefault();
    if (ev.target.id === 'login-form') {
      const email = ev.target.email.value.trim().toLowerCase(), pass = ev.target.password.value;
      S.loginEmail = email;
      if (!email || !pass) { S.loginErr = 'Informe o e-mail e a senha.'; render(); return; }
      if (P.isLive) {
        // Produção: login no Supabase Auth e carga dos dados que a pessoa pode ver
        if (!P.backend) { S.loginErr = P.backendError || 'Sistema indisponível.'; render(); return; }
        const remember = ev.target.remember.checked;
        S.authBusy = true; S.loginErr = null; render();
        P.backend.signIn(email, pass).then(user => { S.authBusy = false; ls.set('prumo.lastEmail', remember ? email : null); login(user); })
          .catch(err => { S.authBusy = false; S.loginErr = err.message; render(); });
        return;
      }
      const user = P.store.db.users.find(x => x.email === email && x.password === pass && x.active !== false);
      if (!user) { S.loginErr = 'E-mail ou senha inválidos. Confira os dados e tente de novo.'; render(); $('#login-pass') && $('#login-pass').focus(); return; }
      ls.set('prumo.lastEmail', ev.target.remember.checked ? email : null);
      login(user);
    }
    if (ev.target.id === 'forgot-form') {
      const email = ev.target.email.value.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { S.loginErr = 'Informe um e-mail válido.'; render(); return; }
      // Resposta igual exista ou não a conta (não revela quem está cadastrado). O envio real fica a cargo do Supabase Auth.
      if (P.isLive && P.backend) {
        S.authBusy = true; render();
        P.backend.resetPassword(email).then(() => { S.authBusy = false; S.forgotEmail = email; S.loginErr = null; S.authMode = 'sent'; render(); })
          .catch(err => { S.authBusy = false; S.loginErr = 'Não foi possível enviar agora: ' + err.message; render(); });
        return;
      }
      S.forgotEmail = email; S.loginErr = null; S.authMode = 'sent'; render();
    }
    if (ev.target.id === 'newpass-form') {
      const pw = ev.target.password.value, cf = ev.target.confirm.value;
      if (pw.length < 8) { S.loginErr = 'A senha precisa ter pelo menos 8 caracteres.'; render(); return; }
      if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) { S.loginErr = 'Use letras e números na senha.'; render(); return; }
      if (pw !== cf) { S.loginErr = 'As senhas não conferem.'; render(); return; }
      S.authBusy = true; S.loginErr = null; render();
      P.backend.updatePassword(pw).then(user => {
        S.authBusy = false; S.authMode = 'login'; P.backend.flow = null;
        try { history.replaceState(null, '', location.pathname); } catch (e) { }
        if (user) { toast('Senha definida com sucesso.'); login(user); } else render();
      }).catch(err => { S.authBusy = false; S.loginErr = err.message; render(); });
    }
  });
  function setPath(path, value) {
    const parts = path.split('.'); let o = S;
    for (let i = 0; i < parts.length - 1; i++) o = o[parts[i]];
    o[parts[parts.length - 1]] = value;
    if (path.startsWith('hist.') && path !== 'hist.page') S.hist.page = 1;
    if (path === 'dept') { S.taskUser = ''; S.cal.userId = ''; }
    if (path === 'rep.deptId') S.rep.userId = '';
  }
  let liveTimer;
  document.addEventListener('input', ev => {
    const t = ev.target;
    const form = t.closest('[data-entry-form]');
    if (form && (t.dataset.ef === 'qty' || t.dataset.ef === 'act')) updateCalc(form);
    const vf = t.closest('[data-vac-form]');
    if (vf && t.matches('[data-vf]')) { const out = vf.querySelector('[data-vac-calc]'); if (out) out.innerHTML = V.vacCalcText(val(vf, 'start'), val(vf, 'end')); }
    if (t.dataset.mask === 'cnpj') {
      const d = P.cnpj.digits(t.value).slice(0, 14);
      t.value = d.replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d)/, '$1-$2');
      // CNPJ completo e válido: consulta a Receita automaticamente (uma vez por número)
      if (t.matches('[data-lookup]') && d.length === 14 && P.cnpj.valid(d) && A._lookingUp !== d) A.lookupCnpj();
    }
    if (t.matches('[data-set][data-live]')) { clearTimeout(liveTimer); liveTimer = setTimeout(() => { setPath(t.dataset.set, t.value); render(); }, 220); }
  });
  document.addEventListener('change', ev => {
    const t = ev.target;
    if (t.id === 'nt-user') { A.updateTaskClients(t); return; }
    if (t.id === 'ca-dept') { A.assignmentDept(t); return; }
    if (t.closest && t.closest('#role-form')) { A._roleUpdate(); return; }
    if (t.id === 'pf-photo') { if (t.files && t.files[0]) A.uploadPhoto(t.files[0]); return; }
    if (t.id === 'imp-file') { if (t.files && t.files[0]) A.readImportFile(t.files[0]); return; }
    const form = t.closest('[data-entry-form]');
    if (form && t.dataset.ef === 'dept') {
      const holder = document.createElement('div');
      holder.innerHTML = V.entryForm(S.user, { deptId: t.value, date: val(form, 'date'), qty: val(form, 'qty'), obs: val(form, 'obs') }, { id: form.id === 'entry-form' ? undefined : form.id, noSubmit: !form.querySelector('[data-act=submitEntry]') });
      form.replaceWith(holder.firstElementChild);
      return;
    }
    if (form && t.dataset.ef === 'act') updateCalc(form);
    if (t.matches('[data-set]') && !t.matches('[data-live]')) { setPath(t.dataset.set, t.type === 'checkbox' ? t.checked : t.value); render(); }
  });

  /* Arrastar e soltar a planilha na área de importação */
  document.addEventListener('dragover', ev => { const z = ev.target.closest && ev.target.closest('.drop'); if (z) { ev.preventDefault(); z.classList.add('over'); } });
  document.addEventListener('dragleave', ev => { const z = ev.target.closest && ev.target.closest('.drop'); if (z) z.classList.remove('over'); });
  document.addEventListener('drop', ev => {
    const z = ev.target.closest && ev.target.closest('.drop');
    if (!z) return;
    ev.preventDefault(); z.classList.remove('over');
    const f = ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files[0];
    if (f) A.readImportFile(f);
  });

  /* Dica flutuante */
  document.addEventListener('mouseover', ev => {
    const el = ev.target.closest('[data-tip]'), tip = $('#tip');
    if (!tip) return;
    if (!el) { tip.hidden = true; return; }
    if (el.dataset.html) tip.innerHTML = el.dataset.tip; else tip.textContent = el.dataset.tip;
    tip.hidden = false;
  });
  document.addEventListener('mousemove', ev => {
    const tip = $('#tip'); if (!tip || tip.hidden) return;
    const pad = 14, w = tip.offsetWidth, h = tip.offsetHeight;
    let x = ev.clientX + pad, y = ev.clientY + pad;
    if (x + w > innerWidth - 8) x = ev.clientX - w - pad;
    if (y + h > innerHeight - 8) y = ev.clientY - h - pad;
    tip.style.transform = `translate(${Math.max(8, x)}px, ${Math.max(8, y)}px)`;
  });
  let rz; window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => P.charts.hydrate(), 120); });
  if (window.matchMedia) matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => { if (S.user) render(); });

  // Ações do js/extras.js (busca, notificações, lote, obrigações, tour, apresentação...)
  Object.assign(A, (P.ext && P.ext.actions) || {});

  /* ---------- Início ---------- */
  // Abertura animada: some depois que o app desenhou a primeira tela (mais rápido para quem prefere menos movimento)
  const splash = document.getElementById('splash');
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const hideSplash = () => { if (!splash) return; splash.classList.add('out'); document.body.classList.remove('booting'); setTimeout(() => splash.remove(), 600); };
  const enterAs = (su, delay) => {
    S.user = su;
    S.rep.deptId = P.isGlobal(su) ? '' : su.deptId; S.rep.type = su.role === 'employee' ? 'individual' : 'departamento';
    const h = location.hash || '';
    S.route = parse(/access_token|type=/.test(h) ? '#/dashboard' : h || '#/dashboard');
    if (P.fx) setTimeout(() => P.fx.onLogin(S.user, true), delay);
  };
  if (P.isLive) {
    // Produção: a sessão do Supabase decide se a pessoa já está logada; a abertura fica até os dados chegarem
    const wait = new Promise(r => setTimeout(r, reduce ? 150 : 1200));
    const start = P.backend ? P.backend.restore() : Promise.reject(new Error(P.backendError || 'Sistema indisponível.'));
    Promise.all([start, wait]).then(([su]) => {
      if (P.backend.flow) { S.authMode = 'newpass'; }
      else if (su) { enterAs(su, 400); try { if (/access_token|type=|code=/.test(location.href)) history.replaceState(null, '', location.pathname + '#/dashboard'); } catch (e) { } }
    }).catch(err => { S.loginErr = err.message; })
      .finally(() => { render(true); hideSplash(); });
  } else {
    const sid = ls.get('prumo.session');
    const su = sid && P.user(sid);
    if (su && su.active !== false) enterAs(su, 1900);
    render(true);
    setTimeout(hideSplash, reduce ? 150 : 1700);
  }
})(window.P);
