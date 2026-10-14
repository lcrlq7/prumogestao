/*
 * Prumo — integração com o Supabase (modo 'supabase' em js/config.js)
 *
 * Como funciona
 *  - O app continua trabalhando com a mesma base em memória (P.store.db). Este módulo:
 *      1. carrega do Supabase só o que cada pessoa pode ver (as regras RLS do banco filtram);
 *      2. a cada P.store.save(), envia apenas o que mudou (inclusões, alterações e exclusões por tabela);
 *      3. recebe em tempo real (Realtime) notificações, mensagens, férias, eventos, tarefas e lançamentos.
 *  - Cada coleção vira uma tabela com (id, doc jsonb). Campos sensíveis ficam em tabelas "_private"
 *    com regras de leitura mais restritas (ex.: motivo de desligamento, comentário das férias).
 *  - Login, nova senha e convite usam o Supabase Auth; criar e bloquear acessos passa pela Edge Function
 *    "admin-users" (usa a chave secreta só no servidor).
 * A segurança de verdade está no banco (supabase/schema.sql): o que o app esconde, o banco também bloqueia.
 */
'use strict';
(function (P) {
  if (!P.isLive) return;
  const CFG = P.CONFIG;
  if (!window.supabase || !CFG.supabaseUrl || !CFG.supabaseAnonKey) {
    console.error('Prumo: configure supabaseUrl e supabaseAnonKey em js/config.js');
    P.backendError = 'O sistema ainda não foi configurado (js/config.js). Fale com o administrador.';
    return;
  }
  const sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' }
  });
  const site = (CFG.siteUrl || location.origin + location.pathname).replace(/\/$/, '');

  // compara documentos sem depender da ordem dos campos (o banco reordena as chaves do JSON)
  const sortKeys = v => Array.isArray(v) ? v.map(sortKeys) : v && typeof v === 'object' ? Object.keys(v).sort().reduce((o, k) => { if (v[k] !== undefined) o[k] = sortKeys(v[k]); return o; }, {}) : v;
  const sj = v => JSON.stringify(sortKeys(v));

  /* ---------- Mapa coleção → tabela ---------- */
  const COLLECTIONS = [
    { key: 'users', table: 'profiles', priv: { table: 'profiles_private', fields: ['capacity', 'weeklyGoal', 'hours', 'roleHistory', 'dismissals', 'dashLayout', 'tourDone', 'profile', 'photoOrig', 'photoCrop'] }, strip: ['password'] },
    { key: 'departments', table: 'departments' },
    { key: 'activities', table: 'activities' },
    { key: 'weightHistory', table: 'weight_history' },
    { key: 'entries', table: 'entries' },
    { key: 'tasks', table: 'tasks' },
    { key: 'clientAssignments', table: 'client_assignments' },
    { key: 'goals', table: 'goals' },
    { key: 'events', table: 'events' },
    { key: 'notes', table: 'notes' },
    { key: 'audit', table: 'audit_log', appendOnly: true, limit: 3000 },
    { key: 'deptHistory', table: 'dept_history' },
    { key: 'companies', table: 'companies' },
    { key: 'vacations', table: 'vacations', priv: { table: 'vacations_private', fields: ['comment'] } },
    { key: 'recognitions', table: 'recognitions' },
    { key: 'notifications', table: 'notifications' },
    { key: 'messages', table: 'messages' },
    { key: 'reportSchedules', table: 'report_schedules' },
    { key: 'importLogs', table: 'import_logs' },
    { key: 'finProfiles', table: 'fin_profiles' },
    { key: 'finRecurrences', table: 'fin_recurrences' },
    { key: 'finEntries', table: 'fin_entries' },
    { key: 'finClosings', table: 'fin_closings' },
    { key: 'purchases', table: 'purchase_requests' },
    { key: 'alertsRead', table: 'alerts_read', map: true },
    { key: 'chatReads', table: 'chat_reads', map: true },
    { key: 'settings', table: 'app_settings', single: true }
  ];
  const byTable = Object.fromEntries(COLLECTIONS.flatMap(c => [[c.table, c]].concat(c.priv ? [[c.priv.table, c]] : [])));
  const PAGE = 1000;

  const split = (c, doc) => {
    const pub = Object.assign({}, doc);
    (c.strip || []).forEach(f => delete pub[f]);
    if (!c.priv) return { pub, priv: null };
    const priv = {};
    c.priv.fields.forEach(f => { if (f in pub) { priv[f] = pub[f]; delete pub[f]; } });
    return { pub, priv };
  };
  // Converte a coleção em memória para linhas {id, doc}
  const rowsOf = c => {
    const v = P.store.db[c.key];
    if (c.single) return [{ id: 'settings', doc: v || {} }];
    if (c.map) return Object.entries(v || {}).map(([id, doc]) => ({ id, doc: Array.isArray(doc) ? { ids: doc } : doc }));
    return (v || []).filter(x => x && x.id).map(x => ({ id: String(x.id), doc: x }));
  };
  const fromRows = (c, rows) => {
    if (c.single) return rows[0] ? rows[0].doc : null;
    if (c.map) return Object.fromEntries(rows.map(r => [r.id, r.doc && Array.isArray(r.doc.ids) ? r.doc.ids : r.doc]));
    return rows.map(r => r.doc);
  };

  /* ---------- Leitura ---------- */
  const fetchAll = async (table, opts = {}) => {
    const out = [];
    for (let from = 0; ; from += PAGE) {
      let q = sb.from(table).select('id, doc');
      if (opts.limit) q = q.order('updated_at', { ascending: false });
      q = q.range(from, from + PAGE - 1);
      const { data, error } = await q;
      if (error) throw new Error(table + ': ' + error.message);
      out.push(...data);
      if (data.length < PAGE || (opts.limit && out.length >= opts.limit)) break;
    }
    return out;
  };
  let snap = {}, privSnap = {};
  const remember = (c, rows, privRows) => {
    snap[c.key] = new Map(rows.map(r => [r.id, sj(c.single || c.map ? r.doc : split(c, r.doc).pub)]));
    if (c.priv) privSnap[c.key] = new Map((privRows || []).map(r => [r.id, sj(r.doc)]));
  };
  async function loadAll() {
    const db = P.emptyDb();
    await Promise.all(COLLECTIONS.map(async c => {
      const rows = await fetchAll(c.table, { limit: c.limit });
      let privRows = [];
      if (c.priv) {
        privRows = await fetchAll(c.priv.table);
        const pm = new Map(privRows.map(r => [r.id, r.doc]));
        rows.forEach(r => { const p = pm.get(r.id); if (p) r.doc = Object.assign({}, r.doc, p); });
      }
      const val = fromRows(c, rows);
      if (c.single) { if (val) db.settings = Object.assign(db.settings, val); }
      else db[c.key] = val;
      // o snapshot guarda o que veio do servidor, para enviar depois só as diferenças
      remember(c, c.single ? rows : rows.map(r => ({ id: r.id, doc: r.doc })), privRows);
    }));
    if (db.audit) db.audit.sort((a, b) => (a.at || '') < (b.at || '') ? -1 : 1);
    P.store.db = db; P.reindex();
    return db;
  }

  /* ---------- Gravação (somente diferenças) ---------- */
  let timer = null, saving = null, again = false;
  const chunk = (arr, n) => { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; };
  async function writeTable(table, ins, upd, del, ups = []) {
    for (const part of chunk(ins, 500)) { const { error } = await sb.from(table).insert(part); if (error) throw new Error(table + ': ' + error.message); }
    // registros da própria pessoa que nascem no primeiro uso (leituras do chat, alertas lidos, configurações): criar ou atualizar
    for (const part of chunk(ups, 500)) { const { error } = await sb.from(table).upsert(part); if (error) throw new Error(table + ': ' + error.message); }
    // Alterações usam UPDATE (não upsert): o upsert também exige permissão de INSERT, que perfis e férias de outras pessoas não têm
    for (const part of chunk(upd, 10)) {
      await Promise.all(part.map(async r => {
        const { id, ...fields } = r;
        const { data, error } = await sb.from(table).update(fields).eq('id', id).select('id');
        if (error) throw new Error(table + ': ' + error.message);
        if (!data || !data.length) throw new Error(table + ': sem permissão para alterar este registro.');
      }));
    }
    for (const part of chunk(del, 200)) { const { error } = await sb.from(table).delete().in('id', part); if (error) throw new Error(table + ': ' + error.message); }
  }
  async function flush() {
    if (!session || !P.store.db || !P.store.db.live) return;
    const me = P.state && P.state.user;
    for (const c of COLLECTIONS) {
      // configurações gerais: só gerente e diretoria gravam
      if (c.single && !P.isGlobal(me)) continue;
      const rows = rowsOf(c), old = snap[c.key] || new Map(), oldP = privSnap[c.key] || new Map();
      const ins = [], upd = [], insP = [], updP = [], seen = new Set();
      rows.forEach(r => {
        seen.add(r.id);
        const { pub, priv } = c.single || c.map ? { pub: r.doc, priv: null } : split(c, r.doc);
        const js = sj(pub);
        if (!old.has(r.id)) ins.push({ id: r.id, doc: pub });
        else if (old.get(r.id) !== js) upd.push({ id: r.id, doc: pub });
        if (c.priv) {
          const pj = sj(priv);
          if (!oldP.has(r.id)) { if (Object.keys(priv).length) insP.push({ id: r.id, doc: priv }); }
          else if (oldP.get(r.id) !== pj) updP.push({ id: r.id, doc: priv });
        }
      });
      const del = c.appendOnly || c.single ? [] : [...old.keys()].filter(id => !seen.has(id));
      if (!ins.length && !upd.length && !del.length && !insP.length && !updP.length) continue;
      // tabela principal primeiro (a privada referencia o mesmo id)
      const own = c.map || c.single;
      await writeTable(c.table, own ? [] : ins, own ? [] : upd, del, own ? ins.concat(upd) : []);
      if (c.priv) await writeTable(c.priv.table, insP, updP, []);
      ins.concat(upd).forEach(r => old.set(r.id, sj(r.doc)));
      del.forEach(id => old.delete(id));
      insP.concat(updP).forEach(r => oldP.set(r.id, sj(r.doc)));
      snap[c.key] = old; if (c.priv) privSnap[c.key] = oldP;
    }
  }
  const setSync = st => { document.documentElement.dataset.sync = st; };
  async function runSave() {
    if (saving) { again = true; return; }
    setSync('saving');
    saving = flush().then(() => setSync('ok')).catch(async err => {
      console.error(err); setSync('error');
      P.toast && P.toast('Não foi possível salvar no servidor: ' + friendly(err) + ' Os dados foram recarregados.', 'err');
      // volta a refletir o servidor para não ficar com dados que o banco recusou
      try { await loadAll(); refreshUser(); P.render && P.render(); } catch (e) { console.error(e); }
    }).finally(() => { saving = null; if (again) { again = false; runSave(); } });
  }
  const friendly = err => {
    const m = String(err && err.message || err);
    if (/row-level security|permission denied|violates row-level/i.test(m)) return 'você não tem permissão para esta alteração.';
    if (/Failed to fetch|NetworkError|network/i.test(m)) return 'sem conexão com a internet.';
    if (/JWT|token/i.test(m)) return 'sua sessão expirou; entre novamente.';
    return m.replace(/^[a-z_]+: /, '') + '.';
  };
  window.addEventListener('beforeunload', ev => { if (timer || saving) { ev.preventDefault(); ev.returnValue = ''; } });

  /* ---------- Tempo real ---------- */
  const LIVE = ['notifications', 'messages', 'vacations', 'events', 'tasks', 'entries', 'recognitions', 'chat_reads'];
  let channel = null, pending = {}, rtTimer = null;
  function subscribe() {
    unsubscribe();
    channel = sb.channel('prumo-live');
    LIVE.forEach(table => channel.on('postgres_changes', { event: '*', schema: 'public', table }, payload => {
      const id = (payload.new && payload.new.id) || (payload.old && payload.old.id);
      if (!id) return;
      (pending[table] = pending[table] || new Set()).add(id);
      clearTimeout(rtTimer); rtTimer = setTimeout(applyRemote, 250);
    }));
    channel.subscribe();
  }
  function unsubscribe() { if (channel) { sb.removeChannel(channel); channel = null; } }
  async function applyRemote() {
    const work = pending; pending = {};
    const added = { notifications: [], messages: [] };
    for (const [table, idsSet] of Object.entries(work)) {
      const c = byTable[table]; if (!c) continue;
      const ids = [...idsSet];
      const { data, error } = await sb.from(c.table).select('id, doc').in('id', ids);
      if (error) { console.warn(error); continue; }
      let privMap = new Map();
      if (c.priv) { const r = await sb.from(c.priv.table).select('id, doc').in('id', ids); if (!r.error) privMap = new Map(r.data.map(x => [x.id, x.doc])); }
      const got = new Map(data.map(r => [r.id, c.priv && privMap.get(r.id) ? Object.assign({}, r.doc, privMap.get(r.id)) : r.doc]));
      const s = snap[c.key] = snap[c.key] || new Map();
      if (c.map) {
        const obj = P.store.db[c.key] = P.store.db[c.key] || {};
        ids.forEach(id => { if (got.has(id)) { const d = got.get(id); obj[id] = Array.isArray(d.ids) ? d.ids : d; s.set(id, sj(d)); } });
        continue;
      }
      const list = P.store.db[c.key] = P.store.db[c.key] || [];
      ids.forEach(id => {
        const i = list.findIndex(x => String(x.id) === id);
        if (got.has(id)) {
          const doc = got.get(id);
          if (i >= 0) list[i] = doc; else { list.push(doc); if (added[c.key]) added[c.key].push(doc); }
          s.set(id, sj(split(c, doc).pub));
          if (c.priv) { (privSnap[c.key] = privSnap[c.key] || new Map()).set(id, sj(split(c, doc).priv)); }
        } else if (i >= 0) { list.splice(i, 1); s.delete(id); }
      });
    }
    P.reindex(); refreshUser();
    // chegou registro de alguém que este navegador ainda não conhece (ex.: cadastro novo): busca os perfis
    const db = P.store.db, missing = ['vacations', 'entries', 'tasks', 'clientAssignments'].some(k => (db[k] || []).some(x => x.userId && !P.user(x.userId)));
    if (missing) { const r = await sb.from('profiles').select('id, doc'); if (!r.error) { const have = new Set(db.users.map(x => x.id)); r.data.forEach(row => { if (!have.has(row.id)) { db.users.push(row.doc); (snap.users = snap.users || new Map()).set(row.id, sj(row.doc)); } }); P.reindex(); } }
    window.dispatchEvent(new CustomEvent('prumo:remote', { detail: { added } }));
  }
  // mantém P.state.user apontando para o objeto atualizado da base
  const refreshUser = () => { const S = P.state; if (S && S.user && session) { const me = P.user(session.user.id); if (me) S.user = me; } };

  /* ---------- Autenticação ---------- */
  let session = null;
  const toUser = async () => {
    await loadAll();
    const me = P.user(session.user.id);
    if (!me) { await signOutQuiet(); throw new Error('Seu acesso ainda não foi liberado. Peça ao seu gestor para concluir o cadastro.'); }
    if (me.active === false) { await signOutQuiet(); throw new Error('Este acesso está desativado. Fale com a diretoria.'); }
    subscribe();
    return me;
  };
  const signOutQuiet = async () => { unsubscribe(); try { await sb.auth.signOut(); } catch (e) { } session = null; P.store.db = P.emptyDb(); snap = {}; privSnap = {}; P.reindex(); };
  // Links de convite e de recuperação: guardados antes de o Supabase limpar o endereço
  const urlFlow = /type=invite|[?&]convite=1/.test(location.href) ? 'invite' : /type=recovery|[?&]recuperar=1/.test(location.href) ? 'recovery' : null;

  P.backend = {
    client: sb,
    flow: urlFlow,
    queueSave() { clearTimeout(timer); timer = setTimeout(() => { timer = null; runSave(); }, 350); },
    flushNow() { clearTimeout(timer); timer = null; return runSave(); },
    async signIn(email, password) {
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw new Error(/Invalid login/i.test(error.message) ? 'E-mail ou senha inválidos. Confira os dados e tente de novo.' : /Email not confirmed/i.test(error.message) ? 'Confirme o seu e-mail pelo link que você recebeu.' : error.message);
      session = data.session;
      return toUser();
    },
    async restore() {
      const { data } = await sb.auth.getSession();
      session = data.session;
      if (!session) return null;
      return toUser();
    },
    async signOut() { if (timer || saving) { await this.flushNow(); await saving; } await signOutQuiet(); },
    async resetPassword(email) {
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: site + '/?recuperar=1' });
      if (error && !/rate limit/i.test(error.message)) throw new Error(error.message);
    },
    async updatePassword(password) {
      const { error } = await sb.auth.updateUser({ password });
      if (error) throw new Error(/should be different/i.test(error.message) ? 'A nova senha precisa ser diferente da anterior.' : /at least/i.test(error.message) ? 'A senha precisa ter pelo menos 8 caracteres.' : error.message);
      const { data } = await sb.auth.getSession(); session = data.session;
      return session ? toUser() : null;
    },
    // Convite de novo usuário (Edge Function com a chave secreta no servidor)
    async invite(data) {
      const { data: res, error } = await sb.functions.invoke('admin-users', { body: Object.assign({ action: 'invite', redirectTo: site + '/?convite=1' }, data) });
      if (error) { let msg = error.message; try { const b = await error.context.json(); msg = b.error || msg; } catch (e) { } throw new Error(msg); }
      return res;
    },
    // Cadastro com código de convite: o banco valida o código, cria o perfil com a função/departamento e consome o código
    async signUpWithCode({ code, name, email, password }) {
      const { data, error } = await sb.auth.signUp({ email, password, options: { data: { invite_code: code.trim().toUpperCase(), name }, emailRedirectTo: site + '/' } });
      if (error) {
        const m = error.message || '';
        throw new Error(/already registered|already exists/i.test(m) ? 'Este e-mail já tem acesso. Use "Entrar" ou "Esqueci minha senha".'
          : /convite|invite|403/i.test(m) ? 'Código de convite inválido, vencido ou já utilizado.'
          : /password/i.test(m) ? 'A senha precisa ter pelo menos 8 caracteres, com letras e números.'
          : /signups not allowed|disabled/i.test(m) ? 'O cadastro está desativado no Supabase (Authentication → Sign In / Providers → Allow new users to sign up).' : m);
      }
      session = data.session;
      if (!session) {
        // sem sessão: tenta entrar direto (o banco já confirma o e-mail de quem usou código válido)
        const r = await sb.auth.signInWithPassword({ email, password });
        if (r.error) return null;
        session = r.data.session;
      }
      return toUser();
    },
    async createInviteCode(role, deptId, days) {
      const { data, error } = await sb.rpc('create_invite_code', { p_role: role, p_dept: deptId || null, p_days: Number(days) || 7 });
      if (error) throw new Error(error.message);
      return data;
    },
    async listInviteCodes() {
      const { data, error } = await sb.from('invite_codes').select('id, hint, role, dept_id, created_by, created_at, expires_at, used_at, used_name').order('created_at', { ascending: false }).limit(100);
      if (error) throw new Error(error.message);
      return data;
    },
    async revokeInviteCode(id) {
      const { error } = await sb.from('invite_codes').delete().eq('id', id);
      if (error) throw new Error(error.message);
    },
    async setAccess(userId, enabled) {
      const { error } = await sb.functions.invoke('admin-users', { body: { action: enabled ? 'enable' : 'disable', userId } });
      if (error) throw new Error(error.message);
    },
    reload: async () => { await loadAll(); refreshUser(); }
  };
  sb.auth.onAuthStateChange((event, s) => {
    if (event === 'PASSWORD_RECOVERY') { session = s; P.backend.flow = 'recovery'; if (P.state) { P.state.user = null; P.state.authMode = 'newpass'; P.render && P.render(); } }
    else if (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN') session = s || session;
    else if (event === 'SIGNED_OUT') { session = null; }
  });

  /* ---------- Ajustes de regras de negócio para o modo real ---------- */
  const api = P.api;
  // Novo usuário = convite por e-mail (o acesso nasce no Supabase Auth; o perfil é criado pela Edge Function)
  const origSaveUser = api.saveUser;
  api.saveUser = function (u, data) {
    if (data.id) return origSaveUser.call(api, u, data);
    if (!(P.isGlobal(u) || u.role === 'manager')) throw new P.AccessError('Você não tem permissão para gerenciar usuários.');
    if (!(P.assignableRoles(u).includes(data.role) || (u.role === 'manager' && data.role === 'employee'))) throw new P.AccessError('Você não pode cadastrar uma pessoa com a função ' + (P.ROLES[data.role] || data.role) + '.');
    if (u.role === 'manager') data.deptId = u.deptId;
    const email = String(data.email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new P.AccessError('Informe um e-mail válido.');
    if (P.store.db.users.some(x => x.email === email && x.active !== false)) throw new P.AccessError('Já existe um usuário ativo com este e-mail.');
    const worker = data.role === 'employee' || data.role === 'manager';
    const cap = Number(data.capacity) || P.store.db.settings.defaultCapacity;
    P.backend.invite({ email, name: data.name, role: data.role, deptId: data.deptId || null, title: data.title || '', capacity: worker ? cap : null, weeklyGoal: worker ? Math.round(cap * 0.94) : null, hours: worker ? Number(data.hours) || 40 : null })
      .then(async res => {
        await P.backend.reload();
        const x = P.user(res && res.id);
        if (x && worker) api._ensureWorker(x);
        if (x && data.role === 'manager' && data.deptId) api._assignManager(P.dept(data.deptId), x.id);
        P.audit(u, 'Usuário convidado', x ? x.id : email, data.name + ' (' + P.ROLES[data.role] + ')');
        P.store.save();
        P.toast('Convite enviado para ' + email + '. A pessoa cria a própria senha pelo link do e-mail.');
        P.render();
      })
      .catch(err => P.toast('Não foi possível enviar o convite: ' + err.message, 'err'));
    return { id: null, name: data.name, email, role: data.role, pending: true };
  };
  // Desligar / readmitir também bloqueia / libera o login no Supabase Auth
  ['dismissUser', 'readmitUser'].forEach(name => {
    const orig = api[name];
    api[name] = function (u, id, ...rest) {
      const r = orig.call(api, u, id, ...rest);
      P.backend.setAccess(id, name === 'readmitUser').catch(err => P.toast('O cadastro foi atualizado, mas o bloqueio do login falhou: ' + err.message, 'err'));
      return r;
    };
  });
})(window.P);
