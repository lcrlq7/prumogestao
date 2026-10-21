/* Prumo — componentes, dashboards, equipe e perfil do colaborador */
'use strict';
(function (P) {
  const F = P.fmt, D = P.date, esc = P.esc, M = P.M, api = P.api, C = P.charts;
  const V = P.V = {};

  /* ---------- Ícones ---------- */
  const IC = {
    grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    clipboard: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M9 12h6M9 16h6"/>',
    inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
    target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
    bulb: '<path d="M9 18h6M10 22h4"/><path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14"/>',
    rank: '<path d="M3 3v18h18"/><path d="M7 16h8M7 11h12M7 6h5"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    file: '<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>',
    history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>',
    sliders: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
    cog: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
    building: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4M8 6h.01M16 6h.01M12 6h.01M12 10h.01M12 14h.01M16 10h.01M16 14h.01M8 10h.01M8 14h.01"/>',
    userplus: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>',
    scale: '<path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1zM2 16l3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1z"/><path d="M7 21h10M12 3v18M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2"/>',
    bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
    moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"/>',
    monitor: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3z"/><path d="M12 9v4M12 17h.01"/>',
    up: '<path d="m18 15-6-6-6 6"/>',
    down: '<path d="m6 9 6 6 6-6"/>',
    more: '<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    left: '<path d="m15 18-6-6 6-6"/>',
    right: '<path d="m9 18 6-6-6-6"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
    trash: '<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
    wallet: '<path d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0 0 4h14a2 2 0 0 1 2 2v4h-4a2 2 0 0 0 0 4h4v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5"/>',
    cart: '<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>',
    smile: '<circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><path d="M9 9h.01M15 9h.01"/>',
    sticker: '<path d="M15.5 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h9.5L21 14.5V5a2 2 0 0 0-2-2z"/><path d="M15 21v-4a2 2 0 0 1 2-2h4"/><path d="M8 13s1 1.5 3 1.5 3-1.5 3-1.5M9 9h.01M14 9h.01"/>',
    hand: '<path d="M18 11V6a2 2 0 0 0-4 0v5M14 10V4a2 2 0 0 0-4 0v6M10 10.5V6a2 2 0 0 0-4 0v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>',
    heart: '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7z"/>',
    image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/>',
    refresh: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
    trend: '<path d="m22 7-8.5 8.5-5-5L2 17"/><path d="M16 7h6v6"/>',
    medal: '<circle cx="12" cy="8" r="6"/><path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11"/>',
    mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    eyeoff: '<path d="M9.9 4.24A9.1 9.1 0 0 1 12 4c6.5 0 10 8 10 8a17 17 0 0 1-2.2 3.2M6.6 6.6A17 17 0 0 0 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/><path d="m2 2 20 20"/>',
    zap: '<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>',
    megaphone: '<path d="m3 11 15-6v14L3 13z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>',
    help: '<circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
    key: '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6M15.5 7.5l3 3L22 7l-3-3"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    message: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    undo: '<path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/>',
    gauge: '<path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/>',
    toggle: '<rect x="1" y="5" width="22" height="14" rx="7"/><circle cx="16" cy="12" r="3"/>',
    plumb: '<path d="M12 2v6"/><path d="M12 8l5 6.5L12 22l-5-7.5z"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/>',
    userminus: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 11h-6"/>',
    briefcase: '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>',
    palm: '<path d="M12 22V11"/><path d="M12 11c-1.5-3.5-5-4.5-8-3 2.5.2 4.5 1.2 5.5 3"/><path d="M12 11c1.5-3.5 5-4.5 8-3-2.5.2-4.5 1.2-5.5 3"/><path d="M12 11c-.5-3.8 1.5-6.8 5-8-1.8 2-2.6 4.3-2.5 6.5"/><path d="M5 22h14"/>'
  };
  const icon = V.icon = (n, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true">${IC[n] || ''}</svg>`;

  /* ---------- Componentes ---------- */
  V.STATUS = {
    baixa: { label: 'Baixa utilização', icon: 'down', cls: 'st-baixa' },
    saudavel: { label: 'Faixa saudável', icon: 'check', cls: 'st-saudavel' },
    sobrecarga: { label: 'Sobrecarga', icon: 'alert', cls: 'st-sobrecarga' },
    sem: { label: 'Sem dados', icon: 'info', cls: 'st-sem' },
    ferias: { label: 'De férias', icon: 'palm', cls: 'st-ferias' }
  };
  V.ENTRY = {
    pendente: { label: 'Pendente de aprovação', short: 'Pendente', icon: 'clock', cls: 'es-pendente' },
    aprovado: { label: 'Aprovado', short: 'Aprovado', icon: 'check', cls: 'es-aprovado' },
    recusado: { label: 'Recusado', short: 'Recusado', icon: 'x', cls: 'es-recusado' },
    correcao: { label: 'Correção solicitada', short: 'Correção', icon: 'undo', cls: 'es-correcao' }
  };
  V.badge = st => { const s = V.STATUS[st] || V.STATUS.sem; return `<span class="badge ${s.cls}">${icon(s.icon)}${s.label}</span>`; };
  V.ebadge = st => { const s = V.ENTRY[st]; return `<span class="badge ${s.cls}">${icon(s.icon)}${s.short}</span>`; };
  V.roleBadge = r => `<span class="badge role-${r}">${icon(r === 'admin' ? 'shield' : r === 'office' ? 'building' : r === 'manager' ? 'users' : 'user')}${esc(P.ROLES[r] || r)}</span>`;
  /* Quadro da hierarquia: quem está em cada nível, do topo para a base */
  V.hierarchyChart = () => {
    const users = P.store.db.users.filter(x => x.active !== false);
    const by = r => users.filter(x => x.role === r).sort((a, b) => a.name.localeCompare(b.name));
    const names = l => l.map(x => esc(P.firstName(x.name) + (x.name.split(' ').length > 1 ? ' ' + x.name.split(' ').slice(-1)[0] : ''))).join(' · ') || '<span class="muted">Vago</span>';
    // Gestores: inclui os diretores que também respondem pela gestão de um departamento
    const mgrs = by('manager').map(m => [m, P.dept(m.deptId), false]).concat(by('admin').filter(x => P.ledDept(x)).map(x => [x, P.ledDept(x), true]));
    return `<div class="hier">
      <div class="hier-l l4"><span class="hier-k">Diretoria</span><b>${names(by('admin'))}</b><small>Altera todos abaixo · aprovação final de férias (basta um diretor)</small></div>
      <div class="hier-l l3"><span class="hier-k">Gerente do escritório</span><b>${names(by('office'))}</b><small>Visão de todos os departamentos · altera gestores e funcionários · aprova férias antes da diretoria</small></div>
      <div class="hier-l l2"><span class="hier-k">Gestores</span><b>${mgrs.map(([m, d, dir]) => esc(P.firstName(m.name)) + (d ? ' <small class="muted">(' + esc(d.code) + (dir ? ' · diretor' : '') + ')</small>' : '')).join(' · ') || '<span class="muted">Nenhum</span>'}</b><small>O próprio departamento · altera dados dos funcionários e os pesos do departamento · 1ª aprovação de férias</small></div>
      <div class="hier-l l1"><span class="hier-k">Funcionários</span><b>${by('employee').length} pessoas</b><small>Os próprios dados · registram atividades e solicitam férias</small></div>
    </div>`;
  };
  V.avatar = (u, size = '') => {
    // pessoa removida do sistema ou ainda não carregada: mostra um marcador em vez de quebrar a tela
    if (!u || !u.id) u = { id: '?', name: (u && u.name) || '?' };
    const ini = (u.name || '?').split(' ').filter(Boolean).map(x => x[0]).slice(0, 2).join('').toUpperCase();
    const hue = [...u.id].reduce((a, c) => a + c.charCodeAt(0), 0) % 5 + 1;
    // Foto de perfil, se houver; senão, as iniciais
    if (u.photo && /^data:image\/(jpeg|png|webp);base64,/.test(u.photo)) return `<span class="avatar has-photo ${size}" aria-hidden="true"><img src="${u.photo}" alt=""></span>`;
    return `<span class="avatar a${hue} ${size}" aria-hidden="true">${ini}</span>`;
  };
  /* Gestor(a) responsável pelo departamento da pessoa (gestor ou diretor que acumula a gestão) */
  V.deptManager = deptId => { const d = P.dept(deptId), m = d && d.managerId && P.user(d.managerId); return m && m.active !== false ? m : null; };
  V.managerCard = emp => {
    const d = P.dept(emp.deptId); if (!d) return '';
    const m = V.deptManager(emp.deptId);
    if (m && m.id === emp.id) return '';
    return `<div class="mgr-card">${m ? V.avatar(m) : `<span class="avatar a1" aria-hidden="true">${icon('users')}</span>`}
      <div class="mgr-t"><small>Gestor(a) responsável · ${esc(d.name)}</small>
        ${m ? `<b>${esc(m.name)}</b><span>${m.role === 'admin' ? 'Diretor(a) e gestor(a) do departamento · ' : ''}<a href="mailto:${esc(m.email)}">${esc(m.email)}</a></span>` : '<b>Departamento sem gestor no momento</b><span>Enquanto isso, procure o gerente do escritório.</span>'}
      </div></div>`;
  };
  V.person = (u, sub) => (u = u || { id: '?', name: 'Pessoa removida' }, `<span class="person">${V.avatar(u)}<span><b>${esc(u.name)}</b>${sub !== false ? `<small>${esc(sub || u.title || '')}</small>` : ''}</span></span>`);
  V.kpi = (label, value, o = {}) => `
    <div class="kpi${o.hero ? ' hero' : ''}${o.go ? ' clickable' : ''}" ${o.go ? `data-go="${o.go}" role="link" tabindex="0"` : ''}>
      <div class="kpi-top"><span class="kpi-label">${label}</span>${o.icon ? icon(o.icon, 'kpi-ic') : ''}</div>
      <div class="kpi-value ${o.tone || ''}">${value}${o.unit ? `<span class="unit">${o.unit}</span>` : ''}</div>
      ${o.sub || o.delta != null ? `<div class="kpi-sub">${o.delta != null ? V.delta(o.delta, o.deltaPts) : ''}${o.sub ? `<span>${o.sub}</span>` : ''}</div>` : ''}
      ${o.bar != null ? V.progress(o.bar, { status: o.status, marks: o.marks }) : ''}
    </div>`;
  V.delta = (v, pts) => {
    if (v == null || !isFinite(v)) return '';
    const cls = v > 0.05 ? 'pos' : v < -0.05 ? 'neg' : 'flat';
    const txt = pts ? (v > 0 ? '+' : v < 0 ? '−' : '') + F.n1(Math.abs(v)) + ' p.p.' : F.delta(v);
    return `<span class="delta ${cls}">${icon(v > 0 ? 'up' : v < 0 ? 'down' : 'right')}${txt}</span>`;
  };
  V.progress = (pct, o = {}) => {
    const st = P.store.db.settings;
    const cap = o.max || 125;
    const w = Math.max(0, Math.min(100, (pct || 0) / cap * 100));
    const cls = o.status ? 'st-' + o.status : (o.cls || 'acc');
    const marks = o.marks === false ? '' : `<i class="mark" style="left:${st.lowThreshold / cap * 100}%"></i><i class="mark strong" style="left:${st.highThreshold / cap * 100}%"></i>`;
    const pace = o.pace != null ? `<i class="pace" style="left:${Math.min(100, o.pace / cap * 100)}%" title="Ritmo esperado"></i>` : '';
    return `<div class="progress" role="progressbar" aria-valuenow="${Math.round(pct || 0)}" aria-valuemin="0" aria-valuemax="${cap}"><b class="${cls}" style="width:${w}%"></b>${marks}${pace}</div>`;
  };
  V.card = (title, body, o = {}) => `
    <section class="card ${o.cls || ''}">
      ${title ? `<header class="card-h"><div><h3>${title}</h3>${o.sub ? `<p>${o.sub}</p>` : ''}</div>${o.actions ? `<div class="card-actions">${o.actions}</div>` : ''}</header>` : ''}
      <div class="card-b">${body}</div>
    </section>`;
  // menu "⋯" de uma linha: recebe os botões (HTML) que antes ficavam espalhados na linha
  V.rowMenu = btns => btns ? `<details class="row-menu"><summary class="ibtn" aria-label="Ações" title="Ações">${icon('more')}</summary><div class="row-menu-pop">${btns}</div></details>` : '';
  V.empty = (msg, ic = 'info') => `<div class="empty">${icon(ic)}<p>${msg}</p></div>`;
  V.pageHead = (title, sub, actions) => `
    <div class="page-head"><div><h1>${title}</h1>${sub ? `<p class="lede">${sub}</p>` : ''}</div>${actions ? `<div class="head-actions">${actions}</div>` : ''}</div>`;
  V.btn = (label, o = {}) => `<button type="button" class="btn ${o.cls || ''}" ${o.act ? `data-act="${o.act}"` : ''} ${o.go ? `data-go="${o.go}"` : ''} ${o.attrs || ''}>${o.icon ? icon(o.icon) : ''}<span>${label}</span></button>`;
  V.ibtn = (ic, label, o = {}) => `<button type="button" class="ibtn ${o.cls || ''}" aria-label="${esc(label)}" title="${esc(label)}" ${o.act ? `data-act="${o.act}"` : ''} ${o.attrs || ''}>${icon(ic)}</button>`;

  V.periodBar = (keys = ['hoje', 'semana', 'mes', 'custom']) => {
    const S = P.state, labels = { hoje: 'Hoje', semana: 'Esta semana', mes: 'Este mês', custom: 'Personalizado', semana_ant: 'Semana anterior', mes_ant: 'Mês anterior' };
    return `<div class="periodbar">
      <div class="seg" role="group" aria-label="Período">${keys.map(k => `<button type="button" class="${S.period.key === k ? 'on' : ''}" data-act="period" data-key="${k}" aria-pressed="${S.period.key === k}">${labels[k]}</button>`).join('')}</div>
      ${S.period.key === 'custom' ? `<div class="daterange"><input type="date" id="pc-start" value="${S.period.custom.start}" data-set="period.custom.start" aria-label="Início"><span>até</span><input type="date" id="pc-end" value="${S.period.custom.end}" data-set="period.custom.end" aria-label="Fim"></div>` : ''}
    </div>`;
  };
  V.deptPicker = (u, allowAll = true, key = 'dept') => {
    if (!P.isGlobal(u)) return '';
    const S = P.state;
    return `<label class="picker">${icon('building')}<select id="pick-${key}" data-set="${key}" aria-label="Departamento">
      ${allowAll ? `<option value="">Todos os departamentos</option>` : ''}
      ${api.departments(u).map(d => `<option value="${d.id}" ${S[key] === d.id ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}
    </select></label>`;
  };
  V.scopeDept = u => P.isGlobal(u) ? (P.state.dept || null) : u.deptId;
  V.team = u => api.workers(u, V.scopeDept(u) || undefined);
  V.curPeriod = () => P.period(P.state.period.key, P.state.period.custom);

  /* Lista de insights */
  V.insightList = (list, o = {}) => {
    if (!list.length) return V.empty('Nenhum ponto de atenção identificado para o recorte selecionado.', 'check');
    const ic = { crit: 'alert', warn: 'alert', info: 'info', pos: 'trend', rec: 'medal' };
    const lbl = { crit: 'Atenção', warn: 'Acompanhar', info: 'Informativo', pos: 'Positivo', rec: 'Reconhecimento' };
    return `<ul class="insights">${list.map(i => `
      <li class="ins ins-${i.level}">
        <span class="ins-ic">${icon(ic[i.level])}</span>
        <div class="ins-body">
          <div class="ins-meta"><span class="ins-tag">${lbl[i.level]}</span>${i.dept ? `<span class="ins-dept">${esc(i.dept)}</span>` : ''}<span class="ins-title">${esc(i.title)}</span></div>
          <p>${esc(i.text)}</p>
          ${i.emp && (o.links !== false || i.level === 'rec') ? `<div class="ins-acts">${o.links !== false ? `<button type="button" class="link" data-go="funcionario/${i.emp}">Ver colaborador ${icon('right')}</button>` : ''}${i.level === 'rec' && P.state.user && api.canRecognize(P.state.user, P.user(i.emp)) ? V.btn('Registrar reconhecimento', { act: 'recognize', cls: 'sm ghost', icon: 'medal', attrs: `data-id="${i.emp}" data-cat="${i.cat || 'outro'}" data-text="${esc(i.recText || '')}"` }) : ''}</div>` : ''}
        </div>
      </li>`).join('')}</ul>`;
  };

  /* Tabela de lançamentos */
  V.entryTable = (list, o = {}) => {
    if (!list.length) return V.empty(o.emptyMsg || 'Nenhum lançamento encontrado.');
    return `<div class="table-wrap"><table class="tbl">
      <thead><tr>${o.select ? '<th class="w-check"><input type="checkbox" data-act="selectAll" aria-label="Selecionar todos"></th>' : ''}<th>Data</th>${o.who !== false ? '<th>Funcionário</th>' : ''}<th>Atividade</th><th>Cliente</th><th class="num">Qtd.</th><th class="num">Peso</th><th class="num">Pontos</th><th>Status</th>${o.actions ? '<th class="actions-col">Ações</th>' : ''}</tr></thead>
      <tbody>${list.map(e => {
        const a = P.act(e.activityId) || { name: '—' }, u = P.user(e.userId) || { name: '—', id: 'x' };
        return `<tr>
          ${o.select ? `<td class="w-check"><input type="checkbox" class="sel" value="${e.id}" aria-label="Selecionar lançamento"></td>` : ''}
          <td class="nowrap">${D.fmt(e.date)}</td>
          ${o.who !== false ? `<td>${V.person(u, false)}</td>` : ''}
          <td><span class="cell-main">${esc(a.name)}</span>${e.obs ? `<small class="obs">${icon('message')}${esc(e.obs)}</small>` : ''}</td>
          <td>${esc(e.client || '—')}</td>
          <td class="num">${F.n(e.qty, 2)}</td><td class="num">${F.n(e.weight, 2)}</td><td class="num strong">${F.n(e.points, 2)}</td>
          <td>${V.ebadge(e.status)}</td>
          ${o.actions ? `<td class="actions-col">${o.actions(e)}</td>` : ''}
        </tr>`;
      }).join('')}</tbody></table></div>`;
  };

  /* Tabela da equipe */
  V.teamTable = (rows, o = {}) => {
    if (!rows.length) return V.empty('Nenhum colaborador ativo neste recorte.');
    return `<div class="table-wrap"><table class="tbl team">
      <thead><tr><th>Funcionário</th>${o.dept ? '<th>Departamento</th>' : ''}<th class="num">Pontos</th><th class="num">Capacidade</th><th class="util-col">Utilização</th><th class="num">Tarefas</th><th class="hide-sm">Tendência (8 sem.)</th><th>Status</th></tr></thead>
      <tbody>${rows.map(r => {
        const spark = M.weekly([r.user], 8, false).map(w => w.points);
        return `<tr class="clickable" data-go="funcionario/${r.user.id}" tabindex="0" role="link">
          <td>${V.person(r.user)}</td>
          ${o.dept ? `<td>${esc((P.dept(r.user.deptId) || { name: '—' }).name)}</td>` : ''}
          <td class="num strong">${F.n(r.points)}</td>
          <td class="num">${F.n(r.capacity)}</td>
          <td class="util-col"><div class="util-cell"><span class="num">${F.pct(r.util)}</span>${V.progress(r.util, { status: r.status })}</div></td>
          <td class="num">${F.n(r.tasks)}</td>
          <td class="hide-sm">${C.spark(spark)}</td>
          <td>${V.badge(r.status)}</td>
        </tr>`;
      }).join('')}</tbody></table></div>`;
  };

  /* ---------- Dashboard ---------- */
  V.dashboard = u => P.isSupport(u) && V.supportHome ? V.supportHome(u) : P.isGlobal(u) ? V.dashAdmin(u) : u.role === 'manager' ? V.dashManager(u) : V.dashEmployee(u, u, true);

  /*
   * Dashboards em blocos: cada bloco tem id, título, tamanho (full, wide, half, third) e o HTML (calculado só se
   * o bloco estiver visível). A ordem e os blocos ocultos ficam salvos por usuário (Personalizar).
   */
  V.DASH_SIZES = { full: 'b-full', wide: 'b-wide', half: 'b-half', third: 'b-third' };
  V.dashLayout = (u, blocks) => {
    const ids = blocks.map(b => b.id), lay = u.dashLayout || {};
    const order = (lay.order || []).filter(id => ids.includes(id)).concat(ids.filter(id => !(lay.order || []).includes(id)));
    const hidden = new Set(lay.hidden || []);
    return order.map(id => blocks.find(b => b.id === id)).filter(b => !hidden.has(b.id));
  };
  V.dashRender = (u, head, blocks) => {
    P.state._dashBlocks = blocks.map(b => ({ id: b.id, title: b.title }));
    const shown = V.dashLayout(u, blocks);
    const one = b => `<div class="dblock ${V.DASH_SIZES[b.size]}" data-block="${b.id}">${b.html()}</div>`;
    const main = shown.filter(b => !b.more), more = shown.filter(b => b.more);
    // painéis secundários ficam recolhidos para a tela inicial não ficar poluída
    return `${head}<div class="dash">${main.map(one).join('') || (more.length ? '' : V.card('', V.empty('Todos os blocos estão ocultos. Use "Personalizar" para escolher o que aparece.', 'grid')))}</div>
      ${more.length ? `<details class="more-box" data-more="dash"><summary>${icon('down')}<span>Ver mais painéis (${more.length})</span></summary><div class="dash">${more.map(one).join('')}</div></details>` : ''}`;
  };
  V.dashTools = () => V.btn('Personalizar', { act: 'customizeDash', icon: 'sliders', cls: 'ghost' }) + V.btn('Apresentar', { act: 'presentMode', icon: 'monitor', cls: 'ghost' });

  V.dashAdmin = u => {
    const p = V.curPeriod();
    const depts = api.departments(u);
    const all = api.workers(u);
    const tm = M.team(all, p);
    const rows = depts.map((d, i) => ({ d, i, emps: api.workers(u, d.id) })).map(r => Object.assign(r, { tm: M.team(r.emps, p) }));
    const pend = P.store.db.entries.filter(e => e.status === 'pendente').length;
    const head = V.pageHead('Visão Geral da Operação', `${esc(P.store.db.settings.companyName)} · ${p.label} · ${P.elapsedWorkdays(p)} dias úteis`, V.periodBar(['semana', 'mes', 'mes_ant', 'custom']) + V.dashTools());
    return V.dashRender(u, head, [
      { id: 'resumo', title: 'Resumo da semana', size: 'full', html: () => V.weeklySummary(u) },
      { id: 'kpis', title: 'Indicadores principais', size: 'full', html: () => `<div class="kpis k6">
        ${V.kpi('Pessoas com produção', all.length, { icon: 'users', go: 'equipe' })}
        ${V.kpi('Departamentos', depts.length, { icon: 'building', go: 'departamentos' })}
        ${V.kpi('Pontos produzidos', F.n(tm.points, 0), { icon: 'gauge', sub: 'de ' + F.n(tm.capacity, 0) + ' de capacidade' })}
        ${V.kpi('Utilização média', F.pct0(tm.util), { icon: 'trend', bar: tm.util, status: M.classify(tm.util) })}
        ${V.kpi('Sobrecarga', tm.over, { icon: 'alert', tone: tm.over ? 't-crit' : '', sub: 'acima de ' + P.store.db.settings.highThreshold + '%', go: 'equipe' })}
        ${V.kpi('Baixa utilização', tm.low, { icon: 'down', tone: tm.low ? 't-warn' : '', sub: 'abaixo de ' + P.store.db.settings.lowThreshold + '%', go: 'equipe' })}
      </div>` },
      { more: true, id: 'evolucao', title: 'Evolução mensal de pontos', size: 'wide', html: () => { const months = M.monthly(all, 6, false); const series = rows.map((r, i) => ({ name: r.d.name, cls: 's' + (i + 1), values: M.monthly(r.emps, 6, false).map(m => m.points) })); return V.card('Evolução mensal de pontos', C.legend(series) + C.slot({ type: 'line', labels: months.map(m => m.label), tipLabels: months.map(m => D.monthLabel(m.start, true)), series, height: 260, aria: 'Pontos por departamento nos últimos 6 meses' }), { sub: 'Últimos 6 meses fechados, por departamento.' }); } },
      { more: true, id: 'utilDept', title: 'Utilização por departamento', size: 'third', html: () => V.card('Utilização por departamento', C.load(rows.map(r => ({ name: r.d.name, util: r.tm.util, status: M.classify(r.tm.util), points: r.tm.points, capacity: r.tm.capacity, go: 'equipe?dept=' + r.d.id }))), { sub: p.label + ' · pontos ÷ capacidade proporcional' }) },
      { more: true, id: 'comparacao', title: 'Comparação entre departamentos', size: 'full', html: () => V.card('Comparação entre departamentos', V.deptCompareTable(rows), { sub: 'Visível somente para gerência e diretoria.', actions: V.btn('Detalhar', { go: 'departamentos', icon: 'right', cls: 'ghost sm' }) }) },
      { more: true, id: 'produtividade', title: 'Produtividade por departamento', size: 'third', html: () => V.card('Produtividade por departamento', C.slot({ type: 'bars', data: rows.map(r => ({ label: r.d.code, value: r.tm.points, cls: 's1', tip: `${r.d.name}: ${F.n(r.tm.points)} pts · meta ${F.n(r.tm.goal)} · produtividade ${F.pct0(r.tm.prod)}` })), ref: null, height: 220, aria: 'Pontos por departamento' }), { sub: 'Pontos entregues no período' }) },
      { more: true, id: 'rankingDept', title: 'Ranking dos departamentos', size: 'third', html: () => { const ranked = rows.slice().sort((a, b) => (b.tm.points / (b.emps.length || 1)) - (a.tm.points / (a.emps.length || 1))); return V.card('Ranking dos departamentos', `<ol class="rank-list">${ranked.map((r, i) => `<li><span class="rk-pos">${i + 1}</span><span class="rk-name">${esc(r.d.name)}<small>${r.emps.length} pessoas · ${F.pct0(r.tm.util)} de utilização</small></span><span class="rk-val">${F.n(r.tm.points / (r.emps.length || 1))}<small>pts/pessoa</small></span></li>`).join('')}</ol>`, { sub: 'Pontos por pessoa, para comparar equipes de tamanhos diferentes' }); } },
      { more: true, id: 'mesXmes', title: 'Este mês × mês anterior', size: 'third', html: () => { const cmp = M.compare(all, 'mes'); return V.card('Este mês × mês anterior', V.compareBody(cmp), { sub: cmp.labelB }); } },
      { id: 'insights', title: 'Insights da operação', size: 'wide', html: () => V.card('Insights da operação', V.insightList(P.insights(u).slice(0, 4)), { actions: V.btn('Todos os insights', { go: 'insights', cls: 'ghost sm', icon: 'right' }) }) },
      { id: 'pendencias', title: 'Pendências', size: 'third', html: () => V.card('Pendências', `
          <div class="mini-stats">
            <button type="button" class="mini" data-go="lancamentos"><b>${pend}</b><span>lançamentos aguardando aprovação</span></button>
            <button type="button" class="mini" data-go="alertas"><b>${P.alerts(u).filter(a => !a.read).length}</b><span>alertas não lidos</span></button>
            <button type="button" class="mini" data-go="pesos"><b>${P.store.db.weightHistory.length}</b><span>calibrações de peso registradas</span></button>
          </div>`) }
    ]);
  };
  V.deptCompareTable = rows => `<div class="table-wrap"><table class="tbl">
    <thead><tr><th>Departamento</th><th>Gestor(a)</th><th class="num">Pessoas</th><th class="num">Pontos</th><th class="num">Pts/pessoa</th><th class="util-col">Utilização</th><th class="num">Tarefas</th><th class="num">Sobrecarga</th><th class="num">Baixa util.</th></tr></thead>
    <tbody>${rows.map(r => `<tr class="clickable" data-go="equipe?dept=${r.d.id}" tabindex="0" role="link">
      <td><b>${esc(r.d.name)}</b></td><td>${esc((P.user(r.d.managerId) || {}).name || '—')}</td>
      <td class="num">${r.emps.length}</td><td class="num strong">${F.n(r.tm.points)}</td><td class="num">${F.n(r.tm.avg)}</td>
      <td class="util-col"><div class="util-cell"><span class="num">${F.pct(r.tm.util)}</span>${V.progress(r.tm.util, { status: M.classify(r.tm.util) })}</div></td>
      <td class="num">${F.n(r.tm.tasks)}</td><td class="num">${r.tm.over || '—'}</td><td class="num">${r.tm.low || '—'}</td></tr>`).join('')}
    </tbody></table></div>`;

  V.compareBody = c => `
    <div class="cmp">
      <div class="cmp-hero">${V.delta(c.dPoints)}<span>pontos em relação ao período anterior</span></div>
      <dl class="cmp-grid">
        <div><dt>Pontos</dt><dd>${F.n(c.a.points)}<small>${F.n(c.b.points)}</small></dd><dd class="d">${V.delta(c.dPoints)}</dd></div>
        <div><dt>Tarefas</dt><dd>${F.n(c.a.tasks)}<small>${F.n(c.b.tasks)}</small></dd><dd class="d">${V.delta(c.dTasks)}</dd></div>
        <div><dt>Produtividade</dt><dd>${F.pct0(c.a.prod)}<small>${F.pct0(c.b.prod)}</small></dd><dd class="d">${V.delta(c.dProd, true)}</dd></div>
        <div><dt>Capacidade utilizada</dt><dd>${F.pct0(c.a.util)}<small>${F.pct0(c.b.util)}</small></dd><dd class="d">${V.delta(c.dUtil, true)}</dd></div>
      </dl>
      <p class="fine">Valor atual em destaque; período de comparação abaixo, em cinza.</p>
    </div>`;

  V.dashManager = u => {
    const p = V.curPeriod(), S = P.state;
    const dept = P.dept(u.deptId);
    const emps = api.workers(u);
    const tm = M.team(emps, p);
    const tasksIn = per => M.team(emps, P.period(per)).tasks;
    const goal = P.store.db.goals.find(g => g.scope === 'department' && g.refId === u.deptId && g.period === 'mensal');
    const head = V.pageHead(esc(dept.name), `Gestão: ${esc(u.name)} · ${emps.length} pessoas com produção · ${p.label}`, V.periodBar() + V.btn('Meu desempenho', { go: 'funcionario/' + u.id, icon: 'user', cls: 'ghost' }) + V.dashTools());
    return V.dashRender(u, head, [
      { id: 'resumo', title: 'Resumo da semana', size: 'full', html: () => V.weeklySummary(u) },
      { id: 'kpis', title: 'Indicadores principais', size: 'full', html: () => `<div class="kpis k4">
        ${V.kpi('Produtividade da equipe', F.pct0(tm.prod), { hero: true, sub: 'pontos ÷ meta do período (' + F.n(tm.goal) + ' pts)', bar: tm.prod, cls: 'acc', marks: false })}
        ${V.kpi('Pontos entregues', F.n(tm.points), { hero: true, unit: 'pts', sub: 'média de ' + F.n(tm.avg) + ' por pessoa' })}
        ${V.kpi('Capacidade utilizada', F.pct0(tm.util), { hero: true, sub: F.n(tm.points) + ' de ' + F.n(tm.capacity) + ' pts disponíveis', bar: tm.util, status: M.classify(tm.util) })}
        ${V.kpi('Tarefas concluídas', F.n(tm.tasks), { hero: true, sub: tm.pending ? tm.pending + ' lançamentos pendentes de aprovação' : 'todos os lançamentos revisados' })}
      </div>` },
      { more: true, id: 'numeros', title: 'Números da equipe', size: 'full', html: () => `<div class="strip">
        <div><span>Pessoas com produção</span><b>${emps.length}</b></div>
        <div><span>Tarefas hoje</span><b>${F.n(tasksIn('hoje'))}</b></div>
        <div><span>Tarefas na semana</span><b>${F.n(tasksIn('semana'))}</b></div>
        <div><span>Tarefas no mês</span><b>${F.n(tasksIn('mes'))}</b></div>
        <div><span>Média pts/funcionário</span><b>${F.n(tm.avg)}</b></div>
        <div class="${tm.over ? 't-crit' : ''}"><span>Sobrecarregados</span><b>${tm.over}</b></div>
        <div class="${tm.low ? 't-warn' : ''}"><span>Baixa utilização</span><b>${tm.low}</b></div>
      </div>` },
      { id: 'carga', title: 'Distribuição de carga', size: 'half', html: () => { const sorted = tm.rows.slice().sort((a, b) => (b.util || 0) - (a.util || 0)); return V.card('Distribuição de carga', C.load(sorted.map(r => ({ name: r.user.name, util: r.util, status: r.status, points: r.points, capacity: r.capacity, go: 'funcionario/' + r.user.id }))), { sub: 'Quem está sobrecarregado e quem tem capacidade disponível · ' + p.label, actions: V.btn('Minha equipe', { go: 'equipe', cls: 'ghost sm', icon: 'right' }) }); } },
      { more: true, id: 'semanal', title: 'Evolução semanal da equipe', size: 'half', html: () => { const weeks = M.weekly(emps, 12); return V.card('Evolução semanal da equipe', C.slot({ type: 'bars', data: weeks.map(w => ({ label: w.label, value: w.points, partial: w.partial, tip: `Semana de ${w.label}${w.partial ? ' (em andamento)' : ''}: ${F.n(w.points)} pts · ${F.pct0(w.util)} da capacidade` })), ref: { values: weeks.map(w => w.capacity), label: 'Capacidade' }, height: 250, aria: 'Pontos por semana' }), { sub: 'Pontos por semana nas últimas 12 semanas; a linha tracejada é a capacidade da equipe.' }); } },
      { id: 'insights', title: 'Insights do Gestor', size: 'wide', html: () => V.card('Insights do Gestor', V.insightList(P.insights(u).slice(0, 4)), { actions: V.btn('Ver todos', { go: 'insights', cls: 'ghost sm', icon: 'right' }) }) },
      { more: true, id: 'comparacao', title: 'Comparação entre períodos', size: 'third', html: () => { const cmp = M.compare(emps, S.cmp); return V.card('Comparação entre períodos', `
          <div class="seg sm" role="group">${[['semana', 'Semana'], ['mes', 'Mês'], ['3m', '3 meses'], ['6m', '6 meses']].map(([k, l]) => `<button type="button" class="${S.cmp === k ? 'on' : ''}" data-act="cmp" data-key="${k}">${l}</button>`).join('')}</div>
          ${V.compareBody(cmp)}`, { sub: cmp.labelA + ' × ' + cmp.labelB }); } },
      { more: true, id: 'atividades', title: 'Distribuição das atividades', size: 'half', html: () => { const acts = M.byActivity(emps, p); return V.card('Distribuição das atividades', acts.rows.length ? C.hbars(acts.rows.slice(0, 8).map(r => ({ label: r.act.name, value: r.points, valueLabel: F.n(r.points) + ' pts · ' + F.pct0(r.share), tip: `${r.act.name}: ${F.n(r.qty, 2)} ${r.act.unit} × ${F.n(r.act.weight, 2)} = ${F.n(r.points)} pts` }))) : V.empty('Sem lançamentos no período.'), { sub: 'Onde o esforço da equipe está concentrado · ' + p.label }); } },
      { id: 'aprovacoes', title: 'Aprovações pendentes', size: 'half', html: () => { const pend = api.entries(u, { status: 'pendente' }).filter(e => e.userId !== u.id).slice(-5).reverse(); return V.card('Aprovações pendentes', pend.length ? `<ul class="plist">${pend.map(e => `<li>${V.avatar(P.user(e.userId))}<div><b>${esc((P.user(e.userId) || { name: '—' }).name)}</b><small>${esc((P.act(e.activityId) || { name: '—' }).name)} · ${F.n(e.qty, 2)} × ${F.n(e.weight, 2)} = <b>${F.n(e.points, 2)} pts</b> · ${D.relative(e.date)}</small></div><div class="row-actions">${V.ibtn('check', 'Aprovar', { act: 'review', attrs: `data-id="${e.id}" data-op="aprovar"`, cls: 'ok' })}</div></li>`).join('')}</ul>` : V.empty('Nenhum lançamento aguardando aprovação.', 'check'), { actions: V.btn('Abrir fila', { go: 'lancamentos', cls: 'ghost sm', icon: 'right' }), sub: goal ? 'Meta mensal do departamento: ' + F.n(goal.target) + ' pts' : '' }); } }
    ]);
  };
  /* Painel individual: usado em "Meu desempenho" e no perfil do colaborador */
  V.dashEmployee = (viewer, emp, own) => {
    const pw = P.period('semana'), pm = P.period('mes'), ph = P.period('hoje');
    const sw = M.stats(emp, pw), sm = M.stats(emp, pm), sh = M.stats(emp, ph);
    const weeks = M.weekly([emp], 12);
    const p = V.curPeriod();
    const acts = M.byActivity([emp], p);
    const tasks = api.tasks(viewer, { userId: emp.id });
    const pendTasks = tasks.filter(t => t.status === 'pendente');
    const recent = (P.idx.byUser.get(emp.id) || []).slice(-8).reverse();
    const goals = P.store.db.goals.filter(g => g.scope === 'employee' && g.refId === emp.id);
    const st = M.overloadStreak(emp);
    const ins = own ? [] : P.insights(viewer, emp.deptId).filter(i => i.emp === emp.id);
    // diretoria e gerência não têm departamento: usa o nome do perfil no lugar
    const dept = P.dept(emp.deptId) || { id: null, name: P.ROLES[emp.role] || '—', code: '' };
    // Capacidade, utilização e status de carga: só gestores, gerente e diretoria
    const load = P.seesLoad(viewer);

    const head = own
      ? V.pageHead('Meu desempenho', `${esc(emp.name)} · ${esc(dept.name)}${load ? ' · capacidade de referência ' + F.n(emp.capacity) + ' pts/semana' : ''}`, emp.role === 'manager' ? V.btn('Minhas tarefas', { go: 'atividades', icon: 'clipboard', cls: 'ghost' }) + V.btn('Registrar atividade', { act: 'newOwnEntry', icon: 'plus', cls: 'primary' }) : V.btn('Registrar atividade', { go: 'lancamentos', icon: 'plus', cls: 'primary' }))
      : `<div class="crumbs"><button type="button" class="link" data-go="equipe">${icon('left')}Minha equipe</button></div>
         <div class="profile-head">
           ${V.avatar(emp, 'lg')}
           <div class="ph-main"><h1>${esc(emp.name)}</h1><p class="lede">${esc(emp.title || '')} · ${esc(dept.name)} · jornada de ${emp.hours || 40}h · ${esc(emp.email)}${V.deptManager(emp.deptId) && V.deptManager(emp.deptId).id !== emp.id ? ' · gestor(a): ' + esc(V.deptManager(emp.deptId).name) : ''}</p></div>
           <div class="head-actions">${V.badge(sw.status)}${viewer.role !== 'employee' ? (P.canManageUser(viewer, emp) ? V.btn('Capacidade', { act: 'editCapacity', icon: 'gauge', cls: 'ghost', attrs: `data-id="${emp.id}"` }) + V.btn('Observação', { act: 'addNote', icon: 'message', cls: 'ghost', attrs: `data-id="${emp.id}"` }) : '') + V.btn('Relatório', { act: 'reportFor', icon: 'file', cls: 'ghost', attrs: `data-id="${emp.id}"` }) : ''}</div>
         </div>`;

    return `
      ${head}
      ${own ? V.managerCard(emp) : ''}
      ${own && api.recognitions(viewer, { userId: emp.id }).some(r => r.visible) ? V.card('Reconhecimentos recebidos', V.recList(viewer, api.recognitions(viewer, { userId: emp.id }).filter(r => r.visible).slice(0, 5), { self: true }), { cls: 'flush-b rec-recv', sub: 'Mensagens de reconhecimento da sua gestão' }) : ''}
      ${viewer.role !== 'employee' && st.streak >= P.store.db.settings.recurringWeeks ? `<div class="banner crit">${icon('alert')}<div><b>Possível sobrecarga recorrente.</b> ${own ? 'Você ficou' : esc(P.firstName(emp.name)) + ' ficou'} acima de ${P.store.db.settings.highThreshold}% da capacidade por ${st.streak} semanas seguidas. Avaliar redistribuição de atividades.</div></div>` : ''}
      <div class="kpis ${load ? 'k7' : 'k5'}">
        ${V.kpi('Pontos hoje', F.n(sh.points))}
        ${V.kpi('Pontos nesta semana', F.n(sw.points), load ? { sub: 'de ' + F.n(emp.capacity) + ' na semana' } : {})}
        ${V.kpi('Pontos no mês', F.n(sm.points))}
        ${load ? V.kpi('Capacidade semanal', F.n(emp.capacity), { unit: 'pts', sub: '≈ ' + Math.round(emp.capacity / (emp.hours || 40) * 100) + '% da jornada' }) : ''}
        ${load ? V.kpi('Utilização da semana', F.pct0(sw.util), { bar: sw.util, status: sw.status, sub: V.STATUS[sw.status].label }) : ''}
        ${V.kpi('Tarefas concluídas', F.n(sm.tasks), { sub: 'no mês' })}
        ${V.kpi('Tarefas pendentes', pendTasks.length, { sub: pendTasks.filter(t => t.due && t.due < D.iso(P.today())).length + ' em atraso', go: own ? 'atividades' : null })}
      </div>
      <details class="more-box" data-more="emp"><summary>${icon('down')}<span>Gráficos, metas e detalhes</span></summary>
      <div class="grid g-2-1">
        ${V.card('Pontos produzidos por semana', C.slot({ type: 'bars', data: weeks.map(w => ({ label: w.label, value: w.points, partial: w.partial, tip: `Semana de ${w.label}${w.partial ? ' (em andamento)' : ''}: ${F.n(w.points)} pts${load ? ' · ' + F.pct0(w.util) : ''}` })), ref: load ? { values: weeks.map(w => w.capacity), label: 'Capacidade' } : null, height: 250, aria: 'Pontos por semana' }), { sub: 'Últimas 12 semanas · a semana atual é parcial' })}
        ${V.card('Distribuição das atividades', acts.rows.length ? C.hbars(acts.rows.slice(0, 7).map(r => ({ label: r.act.name, value: r.points, valueLabel: F.n(r.points) + ' pts', tip: `${r.act.name}: ${F.n(r.qty, 2)} × ${F.n(r.act.weight, 2)}` }))) : V.empty('Sem lançamentos no período.'), { sub: p.label + ' · ' + F.n(acts.total) + ' pts' })}
      </div>
      <div class="grid ${load ? 'g-1-1' : ''}">
        ${!load ? '' : V.card('Evolução da utilização', C.slot({ type: 'line', area: true, pct: true, labels: weeks.map(w => w.label), series: [{ name: 'Utilização', cls: 's1', values: weeks.map(w => w.util == null ? null : Math.round(w.util * 10) / 10) }], ref: { value: 100, label: '100%' }, fmt: v => F.pct(v), height: 220, aria: 'Utilização semanal' }), { sub: 'Faixa saudável entre ' + P.store.db.settings.lowThreshold + '% e ' + P.store.db.settings.highThreshold + '%' })}
        ${V.card('Metas', goals.map(g => V.goalBlock(g, emp)).join('') || V.empty('Sem metas configuradas.'), { actions: V.btn('Metas', { go: 'metas', cls: 'ghost sm', icon: 'right' }) })}
      </div></details>
      ${!own && ins.length ? V.card('Insights sobre ' + esc(P.firstName(emp.name)), V.insightList(ins, { links: false })) : ''}
      ${!own ? V.card('Observações do gestor', V.notesList(viewer, emp)) : ''}
      ${!own && viewer.role !== 'employee' ? V.card('Reconhecimentos', V.recList(viewer, api.recognitions(viewer, { userId: emp.id }), { empty: 'Nenhum reconhecimento registrado para ' + esc(P.firstName(emp.name)) + '.' }), { cls: 'flush-b', actions: api.canRecognize(viewer, emp) ? V.btn('Reconhecer', { act: 'recognize', cls: 'sm ghost', icon: 'medal', attrs: `data-id="${emp.id}"` }) : '' }) : ''}
      ${own ? V.wallPreview(viewer) : ''}
      ${V.card(own ? 'Histórico recente' : 'Atividades recentes', V.entryTable(recent, { who: false }), { actions: V.btn('Histórico completo', { act: 'historyFor', icon: 'history', cls: 'ghost sm', attrs: `data-id="${emp.id}"` }) })}`;
  };

  V.goalBlock = (g, emp) => {
    const p = P.period(g.period === 'semanal' ? 'semana' : 'mes');
    const real = emp ? M.stats(emp, p).points : M.team(api.workers(P.state.user, g.refId), p).points;
    const total = g.period === 'semanal' ? D.workdays(p.start, D.add(p.start, 6)) : D.workdays(p.start, D.monthEnd(p.start));
    const pace = total ? P.elapsedWorkdays(p) / total * 100 : 0;
    const pr = g.target ? real / g.target * 100 : 0;
    return `<div class="goal">
      <div class="goal-top"><span class="goal-name">Meta ${g.period}</span><span class="goal-pct ${pr >= 100 ? 't-good' : ''}">${F.pct(pr)}</span></div>
      ${V.progress(pr, { max: 100, cls: pr >= 100 ? 'st-saudavel' : 'acc', marks: false, pace })}
      <div class="goal-foot"><span>Realizado <b>${F.n(real)}</b></span><span>Meta <b>${F.n(g.target)}</b></span><span class="muted">ritmo esperado ${F.pct0(pace)}</span></div>
    </div>`;
  };

  V.notesList = (viewer, emp) => {
    const notes = api.notes(viewer, emp.id);
    return `${notes.length ? `<ul class="notes">${notes.map(n => `<li><div class="note-meta"><b>${esc((P.user(n.by) || {}).name || '—')}</b><span>${esc(n.at)}</span></div><p>${esc(n.text)}</p></li>`).join('')}</ul>` : V.empty('Nenhuma observação registrada.')}
      ${V.btn('Adicionar observação', { act: 'addNote', icon: 'plus', cls: 'ghost sm', attrs: `data-id="${emp.id}"` })}`;
  };

  /* ---------- Minha equipe ---------- */
  V.equipe = u => {
    const p = V.curPeriod();
    const emps = V.team(u);
    const tm = M.team(emps, p);
    const S = P.state;
    const sort = S.teamSort || 'util';
    const rows = tm.rows.slice().sort((a, b) => sort === 'name' ? a.user.name.localeCompare(b.user.name) : sort === 'points' ? b.points - a.points : (b.util || 0) - (a.util || 0));
    const dname = V.scopeDept(u) ? P.dept(V.scopeDept(u)).name : 'Todos os departamentos';
    return `
      ${V.pageHead('Minha equipe', `${esc(dname)} · ${p.label} · capacidade proporcional a ${P.elapsedWorkdays(p)} dia(s) útil(eis)`, V.deptPicker(u) + V.periodBar())}
      <div class="strip">
        <div><span>Colaboradores</span><b>${emps.length}</b></div>
        <div><span>Pontos</span><b>${F.n(tm.points)}</b></div>
        <div><span>Capacidade</span><b>${F.n(tm.capacity)}</b></div>
        <div><span>Utilização</span><b>${F.pct(tm.util)}</b></div>
        <div><span>Tarefas</span><b>${F.n(tm.tasks)}</b></div>
        <div class="${tm.over ? 't-crit' : ''}"><span>Sobrecarga</span><b>${tm.over}</b></div>
        <div class="${tm.low ? 't-warn' : ''}"><span>Baixa utilização</span><b>${tm.low}</b></div>
      </div>
      ${V.card('Equipe', V.teamTable(rows, { dept: !V.scopeDept(u) }), {
        sub: 'Clique em um colaborador para ver atividades, evolução e insights.',
        actions: `<label class="picker sm">Ordenar<select id="team-sort" data-set="teamSort"><option value="util" ${sort === 'util' ? 'selected' : ''}>Utilização</option><option value="points" ${sort === 'points' ? 'selected' : ''}>Pontos</option><option value="name" ${sort === 'name' ? 'selected' : ''}>Nome</option></select></label>`
      })}
      <div class="grid g-2-1">
        ${V.card('Distribuição de carga', C.load(rows.map(r => ({ name: r.user.name, util: r.util, status: r.status, points: r.points, capacity: r.capacity, go: 'funcionario/' + r.user.id }))), { sub: 'Marcos em ' + P.store.db.settings.lowThreshold + '% e ' + P.store.db.settings.highThreshold + '% da capacidade' })}
        ${V.card('Leitura da carga', V.loadReading(rows))}
      </div>`;
  };
  V.loadReading = rows => {
    const over = rows.filter(r => r.status === 'sobrecarga'), low = rows.filter(r => r.status === 'baixa'), ok = rows.filter(r => r.status === 'saudavel');
    const names = l => l.length ? l.map(r => `<button type="button" class="chip" data-go="funcionario/${r.user.id}">${esc(P.firstName(r.user.name))} · ${F.pct0(r.util)}</button>`).join('') : '<span class="muted">Ninguém</span>';
    return `<dl class="reading">
      <div><dt>${V.badge('sobrecarga')}</dt><dd>${names(over)}</dd></div>
      <div><dt>${V.badge('saudavel')}</dt><dd>${names(ok)}</dd></div>
      <div><dt>${V.badge('baixa')}</dt><dd>${names(low)}</dd></div>
    </dl>
    <p class="fine">As faixas servem para identificar carga, capacidade e necessidade de apoio. Não são uma avaliação de desempenho.</p>`;
  };

  V.funcionario = (u, id) => {
    const emp = api.employee(u, id);
    // diretoria, gerência e departamento de apoio não têm produção individual (pontos/capacidade)
    if (P.isGlobal(emp) || P.isSupport(emp)) return `${V.pageHead(esc(emp.name), esc(P.ROLES[emp.role]) + (P.dept(emp.deptId) ? ' · ' + esc(P.dept(emp.deptId).name) : ''))}
      ${V.card('', V.empty(P.isSupport(emp) ? 'Departamento de apoio: fora dos indicadores de produção.' : 'Diretoria e gerência não têm painel de produção individual. Veja os números da equipe no Dashboard.', 'info') + `<div style="text-align:center;padding-bottom:16px">${V.btn('Ir para o Dashboard', { go: 'dashboard', icon: 'grid', cls: 'sm' })}</div>`)}`;
    return V.dashEmployee(u, emp, u.id === emp.id);
  };

})(window.P);
