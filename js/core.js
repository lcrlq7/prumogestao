/* Prumo — núcleo: datas, formatação, métricas, permissões (API) e motor de insights/alertas */
'use strict';
window.P = window.P || {};
(function (P) {

  /* ---------- Datas ---------- */
  /*
   * Feriados calculados para qualquer ano: nacionais, estaduais (RJ) e municipais (Volta Redonda).
   * Datas móveis derivam da Páscoa. Pontos facultativos aparecem no calendário, mas só deixam de ser
   * dias úteis se a opção "Considerar pontos facultativos como não trabalhados" estiver ligada.
   */
  const FIXED = [
    ['01-01', 'Confraternização Universal', 'nacional', 'Lei 662/1949'],
    ['04-21', 'Tiradentes', 'nacional', 'Lei 662/1949'],
    ['04-23', 'Dia de São Jorge', 'estadual', 'Lei Estadual RJ 5.198/2008'],
    ['05-01', 'Dia do Trabalho', 'nacional', 'Lei 662/1949'],
    ['07-17', 'Aniversário de Volta Redonda', 'municipal', 'Lei Municipal 5.484/2018'],
    ['09-07', 'Independência do Brasil', 'nacional', 'Lei 662/1949'],
    ['10-12', 'Nossa Senhora Aparecida', 'nacional', 'Lei 6.802/1980'],
    ['11-02', 'Finados', 'nacional', 'Lei 662/1949'],
    ['11-15', 'Proclamação da República', 'nacional', 'Lei 662/1949'],
    ['11-20', 'Dia Nacional de Zumbi e da Consciência Negra', 'nacional', 'Lei 14.759/2023'],
    ['12-25', 'Natal', 'nacional', 'Lei 662/1949']
  ];
  const MOVABLE = [ // dias em relação ao domingo de Páscoa
    [-48, 'Segunda-feira de Carnaval', 'facultativo', 'Ponto facultativo'],
    [-47, 'Terça-feira de Carnaval', 'estadual', 'Lei Estadual RJ 5.243/2008'],
    [-46, 'Quarta-feira de Cinzas', 'facultativo', 'Ponto facultativo (até as 14h)'],
    [-2, 'Sexta-feira Santa (Paixão de Cristo)', 'nacional', 'Lei 9.093/1995'],
    [60, 'Corpus Christi', 'facultativo', 'Ponto facultativo']
  ];
  /* Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher, calendário gregoriano) */
  const easter = y => {
    const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(y, month - 1, day);
  };
  const holidayCache = new Map();
  const holidaysOf = y => {
    if (holidayCache.has(y)) return holidayCache.get(y);
    const map = new Map(), pad = n => String(n).padStart(2, '0');
    const put = (iso, name, type, law) => { const cur = map.get(iso); if (!cur || cur.type === 'facultativo') map.set(iso, { date: iso, name, type, law }); };
    FIXED.forEach(([md, name, type, law]) => put(y + '-' + md, name, type, law));
    const ea = easter(y);
    MOVABLE.forEach(([off, name, type, law]) => { const x = new Date(ea.getFullYear(), ea.getMonth(), ea.getDate() + off); put(x.getFullYear() + '-' + pad(x.getMonth() + 1) + '-' + pad(x.getDate()), name, type, law); });
    holidayCache.set(y, map);
    return map;
  };
  const optionalOff = () => !!(P.store && P.store.db && P.store.db.settings && P.store.db.settings.optionalDaysOff);
  /* Feriado (ou ponto facultativo) da data, ou null */
  const holidayOn = iso => holidaysOf(Number(iso.slice(0, 4))).get(iso) || null;
  /* Dia não trabalhado por feriado: facultativos só contam se a configuração mandar */
  const isHolidayOff = iso => { const h = holidayOn(iso); return !!h && (h.type !== 'facultativo' || optionalOff()); };
  const HOLIDAYS = { has: isHolidayOff };
  P.holidays = {
    of: holidaysOf,
    on: holidayOn,
    isOff: isHolidayOff,
    list: y => [...holidaysOf(y).values()].sort((a, b) => a.date < b.date ? -1 : 1),
    TYPES: { nacional: 'Feriado nacional', estadual: 'Feriado estadual (RJ)', municipal: 'Feriado municipal (Volta Redonda)', facultativo: 'Ponto facultativo' }
  };
  const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const MONTHS_S = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

  const D = P.date = {
    HOLIDAYS, MONTHS, MONTHS_S, WEEKDAYS,
    WEEKDAYS_L: ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'],
    iso(d) {
      return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    },
    parse(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); },
    add(d, n) { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() + n); return x; },
    addMonths(d, n) { return new Date(d.getFullYear(), d.getMonth() + n, 1); },
    weekStart(d) { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; },
    monthStart(d) { return new Date(d.getFullYear(), d.getMonth(), 1); },
    monthEnd(d) { return new Date(d.getFullYear(), d.getMonth() + 1, 0); },
    min(a, b) { return a < b ? a : b; },
    isWorkday(d) { const w = d.getDay(); return w !== 0 && w !== 6 && !HOLIDAYS.has(D.iso(d)); },
    workdays(a, b) { let n = 0; for (let x = new Date(a); x <= b; x = D.add(x, 1)) if (D.isWorkday(x)) n++; return n; },
    fmt(s) { if (!s) return ''; const [y, m, d] = (typeof s === 'string' ? s : D.iso(s)).split('-'); return d + '/' + m + '/' + y; },
    short(s) { const d = typeof s === 'string' ? D.parse(s) : s; return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0'); },
    monthLabel(d, long) { return long ? MONTHS[d.getMonth()] + ' de ' + d.getFullYear() : MONTHS_S[d.getMonth()] + '/' + String(d.getFullYear()).slice(2); },
    relative(s) {
      const diff = Math.round((P.today() - D.parse(s)) / 864e5);
      if (diff === 0) return 'hoje';
      if (diff === 1) return 'ontem';
      if (diff < 7) return 'há ' + diff + ' dias';
      return D.fmt(s);
    },
    stamp() { const n = new Date(); return D.iso(n) + ' ' + String(n.getHours()).padStart(2, '0') + ':' + String(n.getMinutes()).padStart(2, '0'); }
  };
  P.today = () => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); };

  /* ---------- Formatação ---------- */
  const F = P.fmt = {
    n(v, dec = 1) { return (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: dec }); },
    n1(v) { return (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }); },
    pct(v, dec = 1) { return v == null || !isFinite(v) ? '—' : (v).toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec }) + '%'; },
    pct0(v) { return v == null || !isFinite(v) ? '—' : Math.round(v) + '%'; },
    delta(v) { if (v == null || !isFinite(v)) return '—'; const s = v > 0 ? '+' : v < 0 ? '−' : ''; return s + Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%'; },
    pts(v) { return F.n(v, 2) + (Math.abs(v) === 1 ? ' ponto' : ' pontos'); }
  };
  P.esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  P.uid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  P.firstName = n => String(n || '').split(' ')[0];

  /* ---------- Empresas: regimes e CNPJ ---------- */
  P.REGIMES = {
    simples: { label: 'Simples Nacional', short: 'Simples' },
    presumido: { label: 'Lucro Presumido', short: 'Presumido' },
    real: { label: 'Lucro Real', short: 'Real' },
    mei: { label: 'MEI', short: 'MEI' },
    imune: { label: 'Imune / Isenta', short: 'Imune' }
  };
  P.cnpj = {
    digits: s => String(s || '').replace(/\D/g, ''),
    dv(base) {
      const calc = (b, w) => { const r = b.split('').reduce((a, c, i) => a + Number(c) * w[i], 0) % 11; return r < 2 ? 0 : 11 - r; };
      const d1 = calc(base, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
      const d2 = calc(base + d1, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
      return '' + d1 + d2;
    },
    valid(s) { const d = P.cnpj.digits(s); return d.length === 14 && !/^(\d)\1+$/.test(d) && P.cnpj.dv(d.slice(0, 12)) === d.slice(12); },
    format(s) { const d = P.cnpj.digits(s); return d.length === 14 ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : s; }
  };

  /* ---------- Consulta de CNPJ (dados abertos da Receita via BrasilAPI) ---------- */
  const fmtCnae = c => { const s = String(c || '').padStart(7, '0'); return s.slice(0, 4) + '-' + s.slice(4, 5) + '/' + s.slice(5); };
  /* A Receita grava a forma de tributação em texto livre ("IMUNE DE IRPJ", "ISENTO DO IRPJ"…): reconhece por palavra-chave */
  const regimeFromText = t => {
    const s = String(t || '').toUpperCase();
    if (s.includes('PRESUMIDO')) return 'presumido';
    if (s.includes('REAL')) return 'real';
    if (s.includes('IMUN') || s.includes('ISENT')) return 'imune';
    return null; // ex.: lucro arbitrado: mostra o texto, mas não escolhe um regime
  };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  P.receita = {
    /* Serviços gratuitos com dados abertos da Receita, consultados em ordem: se um falhar, tenta o próximo.
       Só a BrasilAPI traz a forma de tributação (Lucro Real/Presumido); por isso ela tem novas tentativas. */
    /* BrasilAPI e Minha Receita trazem a forma de tributação; a BrasilAPI busca no Minha Receita e às vezes
       devolve erro 500 quando ele está lento, por isso o Minha Receita também é consultado direto. */
    providers: [
      // Ordem da consulta inicial: a CNPJá vem antes do Minha Receita porque responde rápido;
      // o regime que faltar é buscado depois, em segundo plano (veja regime()).
      { name: 'BrasilAPI', tries: 3, timeout: 12000, regime: true, url: d => 'https://brasilapi.com.br/api/cnpj/v1/' + d, normalize: r => P.receita.normalize(r) },
      { name: 'CNPJá', tries: 1, timeout: 12000, regime: false, url: d => 'https://open.cnpja.com/office/' + d, normalize: r => P.receita.normalizeCnpja(r) },
      { name: 'Minha Receita', tries: 2, timeout: 25000, regime: true, url: d => 'https://minhareceita.org/' + d, normalize: r => P.receita.normalize(r) }
    ],
    /* Uma consulta a um serviço; devolve { info } ou { fail, kind } */
    async query(pv, d) {
      const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), pv.timeout || 12000);
      try {
        const res = await fetch(pv.url(d), { signal: ctrl.signal, headers: { Accept: 'application/json' }, cache: 'no-store' });
        if (res.status === 404) return { kind: 'notfound', fail: 'CNPJ não encontrado na base deste serviço' };
        if (res.status === 429) return { kind: 'limit', fail: 'limite de consultas atingido (erro 429)' };
        if (!res.ok) return { kind: 'retry', fail: 'serviço respondeu com erro ' + res.status };
        let body;
        try { body = await res.json(); } catch (e) { return { kind: 'retry', fail: 'resposta inválida (não veio no formato esperado)' }; }
        const info = pv.normalize(body);
        info.source = pv.name;
        return { info };
      } catch (e) {
        return { kind: 'retry', fail: e.name === 'AbortError' ? 'sem resposta em ' + Math.round((pv.timeout || 12000) / 1000) + ' s' : 'conexão bloqueada ou recusada (' + e.message + ')' };
      } finally { clearTimeout(timer); }
    },
    /* Tenta um serviço algumas vezes, com espera crescente entre as tentativas */
    async tryProvider(pv, d) {
      let r;
      for (let t = 0; t < pv.tries; t++) {
        r = await P.receita.query(pv, d);
        if (r.info || r.kind === 'notfound') break;
        if (t < pv.tries - 1) await sleep(r.kind === 'limit' ? 4000 : 1500 * (t + 1));
      }
      return r;
    },
    async lookup(cnpj) {
      const d = P.cnpj.digits(cnpj);
      if (!P.cnpj.valid(d)) throw new Error('CNPJ inválido. Confira os 14 dígitos.');
      const fails = [];
      let notFound = 0, limited = 0;
      for (const pv of P.receita.providers) {
        const r = await P.receita.tryProvider(pv, d);
        if (r.info) {
          if (fails.length) r.info.fallbackFrom = fails.slice(); // motivo de não ter vindo da fonte principal
          return r.info;
        }
        if (r.kind === 'notfound') notFound++;
        if (r.kind === 'limit') limited++;
        fails.push(pv.name + ': ' + r.fail);
      }
      if (notFound === P.receita.providers.length) throw new Error('CNPJ não encontrado na base da Receita.');
      if (limited) throw new Error('Muitas consultas seguidas. Aguarde um minuto e tente de novo.');
      throw new Error(P.receita.diagnose() + ' Detalhe técnico: ' + fails.join(' · ') + '.');
    },
    /* Os dados vieram de um serviço que informa Lucro Real/Presumido? */
    hasRegimeSource(info) { const pv = P.receita.providers.find(p => p.name === info.source); return !pv || pv.regime || !!(info.suggestion && info.suggestion.regime); },
    /* Busca de novo só nos serviços que trazem a forma de tributação (usada quando os dados vieram da CNPJá) */
    async regime(cnpj) {
      const d = P.cnpj.digits(cnpj), fails = [];
      for (const pv of P.receita.providers.filter(p => p.regime)) {
        const r = await P.receita.tryProvider(pv, d);
        if (r.info) return r.info;
        fails.push(pv.name + ': ' + r.fail);
      }
      throw new Error('Os serviços com o regime tributário ainda não responderam (' + fails.join(' · ') + '). O sistema continua tentando; você também pode informar o regime manualmente.');
    },
    /* Explica, em linguagem simples, por que o navegador não conseguiu acessar os serviços */
    diagnose() {
      const proto = location.protocol, host = location.hostname;
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'O computador está sem conexão com a internet.';
      if (/claude|anthropic/.test(host)) return 'O link publicado do Claude bloqueia consultas a sites externos. Abra o sistema pelos arquivos (index.html ou serve.ps1).';
      if (!/^(https?|file):$/.test(proto)) return 'Esta pré-visualização (por exemplo, a do VS Code) não permite acessar a internet. Abra o index.html no Chrome ou no Edge.';
      return 'O navegador não conseguiu acessar os serviços de consulta (BrasilAPI, Minha Receita e CNPJá). Costuma ser bloqueio de antivírus, firewall da rede da empresa ou extensão do navegador (bloqueador de anúncios). Teste em outra rede ou libere brasilapi.com.br e open.cnpja.com.';
    },
    /* Formato da CNPJá (sem histórico de ECF: só identifica Simples e MEI) */
    normalizeCnpja(r) {
      const co = r.company || {}, ad = r.address || {};
      const simples = co.simples || {}, mei = co.simei || {};
      let suggestion = null;
      if (mei.optant) suggestion = { regime: 'mei', source: 'Opção pelo MEI' + (mei.since ? ' desde ' + D.fmt(mei.since) : '') };
      else if (simples.optant) suggestion = { regime: 'simples', source: 'Opção pelo Simples Nacional' + (simples.since ? ' desde ' + D.fmt(simples.since) : '') };
      const ph = (r.phones || [])[0];
      return {
        fetchedAt: D.stamp(), cnpj: P.cnpj.format(r.taxId),
        name: co.name || '', tradeName: r.alias || '',
        situation: ((r.status || {}).text || '').toUpperCase(), situationDate: r.statusDate || '', situationReason: (r.reason || {}).text || '',
        openedAt: r.founded || '', nature: (co.nature || {}).text || '', size: (co.size || {}).acronym || '',
        capital: Number(co.equity) || 0, branch: r.head ? 'MATRIZ' : 'FILIAL',
        cnaeMain: r.mainActivity ? { code: fmtCnae(r.mainActivity.id), desc: r.mainActivity.text || '' } : null,
        cnaes: (r.sideActivities || []).map(c => ({ code: fmtCnae(c.id), desc: c.text || '' })),
        address: [ad.street, ad.number, ad.details, ad.district].filter(Boolean).join(', '), city: ad.city || '', uf: ad.state || '',
        cep: ad.zip ? String(ad.zip).replace(/^(\d{5})(\d{3})$/, '$1-$2') : '',
        phone: ph ? ph.area + ph.number : '', email: ((r.emails || [])[0] || {}).address || '',
        partners: (co.members || []).map(m => ({ name: (m.person || {}).name || '', role: (m.role || {}).text || '' })),
        simples: { opt: !!simples.optant, since: simples.since || '', until: '' },
        mei: { opt: !!mei.optant, since: mei.since || '', until: '' },
        regimes: [],
        suggestion: suggestion || { regime: null, label: 'Lucro Real ou Presumido', source: 'Não optante do Simples/MEI. Esta fonte não informa se é Lucro Real ou Presumido: confirme com o cliente.' }
      };
    },
    /* Converte a resposta da API no formato usado pelo sistema */
    normalize(r) {
      const regimes = (r.regime_tributario || []).filter(x => x && x.forma_de_tributacao).sort((a, b) => a.ano - b.ano);
      const last = regimes[regimes.length - 1];
      let suggestion = null;
      if (r.opcao_pelo_mei) suggestion = { regime: 'mei', source: 'Opção pelo MEI' + (r.data_opcao_pelo_mei ? ' desde ' + D.fmt(r.data_opcao_pelo_mei) : '') };
      else if (r.opcao_pelo_simples) suggestion = { regime: 'simples', source: 'Opção pelo Simples Nacional' + (r.data_opcao_pelo_simples ? ' desde ' + D.fmt(r.data_opcao_pelo_simples) : '') };
      else if (last) suggestion = { regime: regimeFromText(last.forma_de_tributacao), label: last.forma_de_tributacao, year: last.ano, source: 'Declarado na escrituração (ECF) de ' + last.ano };
      const addr = [[r.descricao_tipo_de_logradouro, r.logradouro].filter(Boolean).join(' '), r.numero, r.complemento, r.bairro].filter(Boolean).join(', ');
      return {
        fetchedAt: D.stamp(),
        cnpj: P.cnpj.format(r.cnpj),
        name: r.razao_social || '',
        tradeName: r.nome_fantasia || '',
        situation: r.descricao_situacao_cadastral || '',
        situationDate: r.data_situacao_cadastral || '',
        situationReason: r.descricao_motivo_situacao_cadastral && r.descricao_motivo_situacao_cadastral !== 'SEM MOTIVO' ? r.descricao_motivo_situacao_cadastral : '',
        openedAt: r.data_inicio_atividade || '',
        nature: r.natureza_juridica || '',
        size: r.porte || '',
        capital: Number(r.capital_social) || 0,
        branch: r.descricao_identificador_matriz_filial || '',
        cnaeMain: r.cnae_fiscal ? { code: fmtCnae(r.cnae_fiscal), desc: r.cnae_fiscal_descricao || '' } : null,
        cnaes: (r.cnaes_secundarios || []).filter(c => c && c.codigo).map(c => ({ code: fmtCnae(c.codigo), desc: c.descricao || '' })),
        address: addr, city: r.municipio || '', uf: r.uf || '', cep: r.cep ? String(r.cep).replace(/^(\d{5})(\d{3})$/, '$1-$2') : '',
        phone: r.ddd_telefone_1 || '', email: (r.email || '').toLowerCase(),
        partners: (r.qsa || []).map(s => ({ name: s.nome_socio || '', role: s.qualificacao_socio || '' })),
        simples: { opt: !!r.opcao_pelo_simples, since: r.data_opcao_pelo_simples || '', until: r.data_exclusao_do_simples || '' },
        mei: { opt: !!r.opcao_pelo_mei, since: r.data_opcao_pelo_mei || '', until: r.data_exclusao_do_mei || '' },
        regimes: regimes.map(x => ({ year: x.ano, form: x.forma_de_tributacao })),
        suggestion
      };
    }
  };

  /* ---------- Férias: etapas do fluxo ---------- */
  P.VAC = {
    gestor: { label: 'Aguardando gestor', short: 'Gestor', cls: 'es-pendente', icon: 'clock' },
    gerente: { label: 'Aguardando gerente', short: 'Gerente', cls: 'es-pendente', icon: 'clock' },
    diretoria: { label: 'Aguardando diretoria', short: 'Diretoria', cls: 'es-correcao', icon: 'clock' },
    aprovada: { label: 'Aprovada', short: 'Aprovada', cls: 'es-aprovado', icon: 'check' },
    recusada: { label: 'Recusada', short: 'Recusada', cls: 'es-recusado', icon: 'x' },
    cancelada: { label: 'Cancelada', short: 'Cancelada', cls: 'st-sem', icon: 'x' }
  };

  /* ---------- Store ---------- */
  // Modo de execução (js/config.js): 'demo' guarda tudo no navegador; 'supabase' usa o banco (js/backend.js)
  P.CONFIG = window.PRUMO_CONFIG || { mode: 'demo' };
  P.isLive = P.CONFIG.mode === 'supabase';
  // Catálogo de empresas para a carteira: em produção, as empresas ativas cadastradas; na demonstração, a lista de exemplo
  P.catalog = () => { const own = ((P.store && P.store.db && P.store.db.companies) || []).filter(c => c.active).map(c => c.name); return P.isLive || !P.clients ? own : [...new Set(P.clients.concat(own))]; };
  // Base vazia (produção): o js/backend.js preenche com o que vem do Supabase
  P.emptyDb = () => ({
    version: 3, live: true,
    settings: { companyName: P.CONFIG.companyName || 'Prumo', lowThreshold: 70, highThreshold: 100, defaultCapacity: 32, countPending: true, recurringWeeks: 2, inactivityDays: 3 },
    departments: [], users: [], activities: [], weightHistory: [], entries: [], tasks: [], clientAssignments: [], goals: [], events: [], notes: [], audit: [],
    alertsRead: {}, deptHistory: [], companies: [], vacations: [], recognitions: [], notifications: [], messages: [], chatReads: {}, reportSchedules: [], importLogs: [],
    hierarchyV2: true, demoVacationsCleared: true, directorManagers: true, chatSeeded: true
  });
  const KEY = 'prumo.db.v3';
  P.store = {
    db: null,
    load() {
      if (P.isLive) {
        // Produção: nada de dados de demonstração nem migrações; o backend carrega após o login
        if (!this.db) { this.db = P.emptyDb(); P.reindex(); }
        return this.db;
      }
      let db = null;
      try { const raw = localStorage.getItem(KEY); if (raw) db = JSON.parse(raw); } catch (e) { db = null; }
      if (!db || db.version !== 3 || !db.dirty) {
        // Bases de demonstração intocadas são regeneradas para incorporar o seed atual.
        // Assim que alguém altera algo, a base passa a ser preservada.
        db = P.seed();
      }
      let migrated = false;
      if (!Array.isArray(db.clientAssignments)) { db.clientAssignments = []; migrated = true; }
      // Bases salvas antes do cadastro de empresas e do fluxo de férias
      if (!Array.isArray(db.companies)) { db.companies = P.companiesFromClients(P.clients || []); migrated = true; }
      if (!Array.isArray(db.vacations)) { db.vacations = []; migrated = true; }
      if (!Array.isArray(db.recognitions)) { db.recognitions = []; migrated = true; }
      // Remove uma única vez as férias de exemplo da demonstração (ids "v1", "v2"…); as criadas no sistema têm outro formato
      // Nova hierarquia: garante três diretores e o gerente do escritório em bases salvas antes dela
      if (!db.hierarchyV2) {
        const ids = new Set(db.users.map(x => x.id)), emails = new Set(db.users.map(x => x.email));
        const adm = db.users.find(x => x.id === 'adm');
        if (adm && adm.name === 'Administrador do Sistema') { adm.name = 'Diretor(a) 1'; adm.title = 'Diretoria'; }
        P.topUsers().forEach(x => {
          if (ids.has(x.id) || emails.has(x.email)) return;
          if (x.role === 'office' && db.users.some(o => o.role === 'office')) return;
          db.users.push(Object.assign({ password: 'demo123', deptId: null, active: true }, x));
        });
        db.hierarchyV2 = true; migrated = true;
      }
      if (!db.demoVacationsCleared) {
        db.vacations = db.vacations.filter(v => !/^v\d+$/.test(v.id));
        db.demoVacationsCleared = true; migrated = true;
      }
      // Diretores que também são gestores de departamento (Thiago: diretor e gestor da Legalização)
      if (!db.directorManagers) {
        P.applyDirectorManagers(db);
        db.directorManagers = true; migrated = true;
      }
      this.db = db; P.reindex();
      migrated = P.migrateDemoClients ? P.migrateDemoClients(db) || migrated : migrated;
      if (db.settings.companyName === 'Exemplo Contabilidade & BPO') {
        db.settings.companyName = '2S Consultoria e Serviços';
        migrated = true;
      }
      db.users.filter(u => u.role === 'manager').forEach(manager => {
        if (!(manager.capacity > 0)) { manager.capacity = db.settings.defaultCapacity || 32; migrated = true; }
        if (!(manager.weeklyGoal > 0)) { manager.weeklyGoal = Math.round(manager.capacity * 0.94); migrated = true; }
        if (!(manager.hours > 0)) { manager.hours = 40; migrated = true; }
        if (!db.goals.some(g => g.scope === 'employee' && g.refId === manager.id && g.period === 'semanal')) {
          db.goals.push({ id: P.uid('g'), scope: 'employee', refId: manager.id, period: 'semanal', target: manager.weeklyGoal }); migrated = true;
        }
        if (!db.goals.some(g => g.scope === 'employee' && g.refId === manager.id && g.period === 'mensal')) {
          db.goals.push({ id: P.uid('g'), scope: 'employee', refId: manager.id, period: 'mensal', target: manager.capacity * 4 }); migrated = true;
        }
      });
      db.departments.forEach(dept => {
        const workers = db.users.filter(u => u.deptId === dept.id && (u.role === 'employee' || u.role === 'manager'));
        const employees = workers.filter(u => u.role === 'employee');
        const weekly = db.goals.find(g => g.scope === 'department' && g.refId === dept.id && g.period === 'semanal');
        const monthly = db.goals.find(g => g.scope === 'department' && g.refId === dept.id && g.period === 'mensal');
        const oldWeekly = employees.reduce((sum, user) => sum + (user.weeklyGoal || 0), 0);
        const oldMonthly = employees.reduce((sum, user) => sum + (user.capacity || 0) * 4, 0);
        const newWeekly = workers.reduce((sum, user) => sum + (user.weeklyGoal || 0), 0);
        const newMonthly = workers.reduce((sum, user) => sum + (user.capacity || 0) * 4, 0);
        if (weekly && weekly.target === oldWeekly && newWeekly !== oldWeekly) { weekly.target = newWeekly; migrated = true; }
        if (monthly && monthly.target === oldMonthly && newMonthly !== oldMonthly) { monthly.target = newMonthly; migrated = true; }
      });
      if (migrated) this.save();
      return db;
    },
    save() {
      if (P.isLive) { if (P.backend) P.backend.queueSave(); return; }
      this.db.dirty = true; try { localStorage.setItem(KEY, JSON.stringify(this.db)); } catch (e) { /* armazenamento indisponível: segue em memória */ }
    },
    reset() {
      if (P.isLive) return;
      try { localStorage.removeItem(KEY); } catch (e) { } this.db = P.seed(); P.reindex();
    }
  };
  const db = () => P.store.db;

  /* Índices em memória (reconstruídos a cada escrita) */
  P.idx = { byUser: new Map(), byId: new Map(), users: new Map(), acts: new Map(), depts: new Map() };
  P.reindex = function () {
    const d = db(), I = P.idx;
    I.byUser = new Map(); I.byId = new Map(); I.users = new Map(); I.acts = new Map(); I.depts = new Map();
    d.users.forEach(u => I.users.set(u.id, u));
    d.activities.forEach(a => I.acts.set(a.id, a));
    d.departments.forEach(x => I.depts.set(x.id, x));
    d.entries.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
    d.entries.forEach(e => {
      I.byId.set(e.id, e);
      if (!I.byUser.has(e.userId)) I.byUser.set(e.userId, []);
      I.byUser.get(e.userId).push(e);
    });
    I.vac = new Map();
    (d.vacations || []).filter(v => v.status === 'aprovada').forEach(v => {
      if (!I.vac.has(v.userId)) I.vac.set(v.userId, []);
      I.vac.get(v.userId).push(v);
    });
    I.companies = new Map((d.companies || []).map(c => [c.id, c]));
    // O catálogo de empresas passa a vir do cadastro (empresas ativas)
    if ((d.companies || []).length) P.clients = d.companies.filter(c => c.active).map(c => c.name).sort((a, b) => a.localeCompare(b));
  };
  /* Dias úteis de férias aprovadas dentro do período (até hoje), descontados da capacidade */
  P.vacWorkdays = function (userId, p) {
    const list = P.idx.vac.get(userId);
    if (!list) return 0;
    const end = D.iso(D.min(p.end, P.today()));
    let n = 0;
    for (const v of list) {
      const s = v.start > p.s ? v.start : p.s, e = v.end < end ? v.end : end;
      if (s <= e) n += D.workdays(D.parse(s), D.parse(e));
    }
    return n;
  };
  P.onVacation = (userId, iso) => (P.idx.vac.get(userId) || []).find(v => iso >= v.start && iso <= v.end) || null;
  P.user = id => P.idx.users.get(id);
  P.act = id => P.idx.acts.get(id);
  P.dept = id => P.idx.depts.get(id);

  /* ---------- Períodos ---------- */
  P.period = function (key, custom) {
    const t = P.today();
    let s, e, label;
    switch (key) {
      case 'hoje': s = t; e = t; label = 'Hoje'; break;
      case 'semana': s = D.weekStart(t); e = t; label = 'Esta semana'; break;
      case 'semana_ant': s = D.add(D.weekStart(t), -7); e = D.add(s, 6); label = 'Semana anterior'; break;
      case 'mes': s = D.monthStart(t); e = t; label = 'Este mês'; break;
      case 'mes_ant': s = D.addMonths(t, -1); e = D.monthEnd(s); label = 'Mês anterior'; break;
      case '3m': s = D.add(t, -90); e = t; label = 'Últimos 3 meses'; break;
      case '6m': s = D.add(t, -181); e = t; label = 'Últimos 6 meses'; break;
      case 'ano': s = new Date(t.getFullYear(), 0, 1); e = t; label = 'Ano de ' + t.getFullYear(); break;
      case 'custom': {
        s = custom && custom.start ? D.parse(custom.start) : D.add(t, -29);
        e = custom && custom.end ? D.parse(custom.end) : t;
        if (e < s) { const x = s; s = e; e = x; }
        label = D.fmt(D.iso(s)) + ' a ' + D.fmt(D.iso(e)); break;
      }
      default: return P.period('semana');
    }
    return { key, start: s, end: e, s: D.iso(s), e: D.iso(e), label };
  };
  P.range = (start, end, label) => ({ key: 'range', start, end, s: D.iso(start), e: D.iso(end), label: label || D.fmt(D.iso(start)) + ' a ' + D.fmt(D.iso(end)) });
  /* Dias úteis do período até hoje (capacidade é proporcional ao tempo decorrido) */
  P.elapsedWorkdays = p => { const end = D.min(p.end, P.today()); return end < p.start ? 0 : D.workdays(p.start, end); };

  /* ---------- Métricas ---------- */
  const counts = e => e.status !== 'recusado' && (db().settings.countPending || e.status === 'aprovado');
  P.counts = counts;
  /* Motivo de correção/recusa: só o erro no lançamento conta contra a qualidade de quem lançou */
  P.REWORK_CAUSES = { colaborador: 'Erro no lançamento', cliente: 'Pendência ou documento do cliente', escopo: 'Mudança de escopo ou de processo' };
  P.isRework = e => {
    const h = (e.history || []).filter(x => x.action === 'Recusado' || x.action === 'Correção solicitada');
    if (h.length) return h.some(x => !x.cause || x.cause === 'colaborador');
    return e.status === 'recusado' || e.status === 'correcao';
  };

  const M = P.M = {
    entries(userId, p) {
      const list = P.idx.byUser.get(userId) || [];
      if (!p) return list;
      return list.filter(e => e.date >= p.s && e.date <= p.e);
    },
    sum(list) { let pts = 0, tasks = 0, n = 0; for (const e of list) if (counts(e)) { pts += e.points; tasks += e.qty; n++; } return { points: round2(pts), tasks, n }; },
    /* Capacidade e meta proporcionais aos dias úteis decorridos, descontando férias aprovadas */
    workdays(u, p) { return Math.max(0, P.elapsedWorkdays(p) - P.vacWorkdays(u.id, p)); },
    capacity(u, p) { return (u.capacity || 0) / 5 * M.workdays(u, p); },
    goal(u, p) { return (u.weeklyGoal || u.capacity || 0) / 5 * M.workdays(u, p); },
    classify(util) {
      const s = db().settings;
      if (util == null || !isFinite(util)) return 'sem';
      if (util < s.lowThreshold) return 'baixa';
      if (util > s.highThreshold) return 'sobrecarga';
      return 'saudavel';
    },
    stats(u, p) {
      const list = M.entries(u.id, p);
      const sm = M.sum(list);
      const cap = M.capacity(u, p), goal = M.goal(u, p);
      const util = cap > 0 ? sm.points / cap * 100 : null;
      const pending = list.filter(e => e.status === 'pendente').length;
      return { user: u, points: sm.points, tasks: sm.tasks, n: sm.n, capacity: round2(cap), goal: round2(goal), util, prod: goal > 0 ? sm.points / goal * 100 : null, status: cap === 0 && P.vacWorkdays(u.id, p) > 0 ? 'ferias' : M.classify(util), pending };
    },
    team(users, p) {
      const rows = users.map(u => M.stats(u, p));
      const points = round2(rows.reduce((a, r) => a + r.points, 0));
      const cap = rows.reduce((a, r) => a + r.capacity, 0);
      const goal = rows.reduce((a, r) => a + r.goal, 0);
      const tasks = rows.reduce((a, r) => a + r.tasks, 0);
      return {
        rows, points, capacity: round2(cap), tasks, goal,
        util: cap > 0 ? points / cap * 100 : null,
        prod: goal > 0 ? points / goal * 100 : null,
        avg: rows.length ? points / rows.length : 0,
        over: rows.filter(r => r.status === 'sobrecarga').length,
        low: rows.filter(r => r.status === 'baixa').length,
        pending: rows.reduce((a, r) => a + r.pending, 0)
      };
    },
    /* Séries semanais: n semanas terminando na semana atual (parcial) */
    weekly(users, n, includeCurrent = true) {
      const t = P.today(), cur = D.weekStart(t), out = [];
      for (let i = n - (includeCurrent ? 1 : 0); i >= (includeCurrent ? 0 : 1); i--) {
        const s = D.add(cur, -7 * i), e = i === 0 ? t : D.add(s, 6);
        const p = P.range(s, e);
        const tm = M.team(users, p);
        out.push({ start: s, label: D.short(s), points: tm.points, capacity: tm.capacity, util: tm.util, tasks: tm.tasks, partial: i === 0 });
      }
      return out;
    },
    monthly(users, n, includeCurrent = true) {
      const t = P.today(), out = [];
      for (let i = n - (includeCurrent ? 1 : 0); i >= (includeCurrent ? 0 : 1); i--) {
        const s = D.addMonths(t, -i), e = i === 0 ? t : D.monthEnd(s);
        const tm = M.team(users, P.range(s, e));
        out.push({ start: s, label: D.monthLabel(s), points: tm.points, capacity: tm.capacity, util: tm.util, tasks: tm.tasks, prod: tm.prod, partial: i === 0 });
      }
      return out;
    },
    /*
     * Desempenho para reconhecimento (0–100). Não premia volume bruto nem excesso de carga:
     *  - Entrega (45%): pontos ÷ capacidade do período, limitado a 100% (passar da capacidade não soma)
     *  - Qualidade (25%): lançamentos aprovados sem correção nem recusa
     *  - Prazos (20%): tarefas concluídas até o vencimento
     *  - Evolução (10%): variação da utilização em relação ao período anterior
     * Capacidade e férias já são proporcionais, então meio período e férias não penalizam ninguém.
     * Qualidade só conta correções/recusas por erro no lançamento (não as causadas pelo cliente ou por mudança de escopo).
     * Elegível: mínimo de dias úteis trabalhados e de lançamentos no período (min.days, min.entries).
     */
    merit(u, p, prev, min = { days: 10, entries: 20 }) {
      const st = M.stats(u, p);
      const reviewed = M.entries(u.id, p).filter(e => e.status !== 'pendente');
      const rework = reviewed.filter(P.isRework).length;
      // Constância: semanas completas do período na faixa saudável
      const s = db().settings;
      let w0 = D.weekStart(p.start); if (w0 < p.start) w0 = D.add(w0, 7);
      const weeks = [];
      for (let w = w0; D.add(w, 6) <= p.end && D.add(w, 6) < P.today(); w = D.add(w, 7)) { const ws = M.stats(u, P.range(w, D.add(w, 6))); if (ws.capacity > 0) weeks.push(ws.util); }
      const constancy = weeks.length >= 2 ? weeks.filter(x => x >= s.lowThreshold && x <= s.highThreshold).length / weeks.length * 100 : null;
      const days = M.workdays(u, p);
      const quality = reviewed.length ? (1 - rework / reviewed.length) * 100 : null;
      const tasks = db().tasks.filter(t => t.userId === u.id && t.due >= p.s && t.due <= p.e && t.status !== 'dispensada' && (t.status === 'concluida' || t.due < D.iso(P.today())));
      const onTime = tasks.length ? tasks.filter(t => t.status === 'concluida' && (t.doneAt || t.due) <= t.due).length / tasks.length * 100 : null;
      const pv = prev ? M.stats(u, prev) : null;
      const growth = pv && pv.util != null && st.util != null ? st.util - pv.util : null;
      const entrega = st.util == null ? 0 : Math.min(st.util, 100);
      const evo = growth == null ? 50 : Math.max(0, Math.min(100, 50 + growth * 2.5));
      const score = 0.45 * entrega + 0.25 * (quality == null ? 85 : quality) + 0.20 * (onTime == null ? 85 : onTime) + 0.10 * evo;
      return { user: u, points: st.points, util: st.util, capacity: st.capacity, n: st.n, days, quality, rework, reviewed: reviewed.length, onTime, tasks: tasks.length, growth, constancy, weeks: weeks.length, score: round2(score), eligible: st.capacity > 0 && days >= min.days && st.n >= min.entries };
    },
    /* Semanas completas consecutivas acima do limite (da mais recente para trás) */
    overloadStreak(u) {
      const hi = db().settings.highThreshold;
      const ws = M.weekly([u], 8, false);
      let k = 0;
      for (let i = ws.length - 1; i >= 0; i--) { if (ws[i].util != null && ws[i].util > hi) k++; else break; }
      return { streak: k, last: ws[ws.length - 1] };
    },
    byActivity(users, p) {
      const map = new Map();
      for (const u of users) for (const e of M.entries(u.id, p)) {
        if (!counts(e)) continue;
        const r = map.get(e.activityId) || { activityId: e.activityId, points: 0, qty: 0, n: 0 };
        r.points += e.points; r.qty += e.qty; r.n++;
        map.set(e.activityId, r);
      }
      const rows = [...map.values()].sort((a, b) => b.points - a.points);
      const total = rows.reduce((a, r) => a + r.points, 0);
      rows.forEach(r => { r.points = round2(r.points); r.share = total ? r.points / total * 100 : 0; r.act = P.act(r.activityId); });
      return { rows, total: round2(total) };
    },
    compare(users, mode) {
      const t = P.today();
      let A, B, labelA, labelB;
      if (mode === 'semana') {
        const s = D.weekStart(t), days = Math.round((t - s) / 864e5);
        A = P.range(s, t); B = P.range(D.add(s, -7), D.add(s, -7 + days));
        labelA = 'Esta semana'; labelB = 'Semana anterior (mesmos dias)';
      } else if (mode === 'mes') {
        const s = D.monthStart(t), wd = D.workdays(s, t);
        const ps = D.addMonths(t, -1); let pe = ps, k = 0;
        for (let x = new Date(ps); x <= D.monthEnd(ps); x = D.add(x, 1)) { if (D.isWorkday(x)) { k++; pe = x; } if (k >= wd) break; }
        A = P.range(s, t); B = P.range(ps, pe);
        labelA = 'Este mês'; labelB = 'Mês anterior (mesmos dias úteis)';
      } else if (mode === '3m') {
        A = P.range(D.add(t, -90), t); B = P.range(D.add(t, -181), D.add(t, -91));
        labelA = 'Últimos 3 meses'; labelB = '3 meses anteriores';
      } else {
        const last = D.addMonths(t, -1), first = D.addMonths(t, -6);
        A = P.range(last, D.monthEnd(last)); B = P.range(first, D.monthEnd(first));
        labelA = D.monthLabel(last, true); labelB = D.monthLabel(first, true);
      }
      const a = M.team(users, A), b = M.team(users, B);
      const d = (x, y) => (y ? (x - y) / y * 100 : null);
      return {
        labelA, labelB, a, b,
        dPoints: d(a.points, b.points), dTasks: d(a.tasks, b.tasks),
        dProd: a.prod != null && b.prod != null ? a.prod - b.prod : null,
        dUtil: a.util != null && b.util != null ? a.util - b.util : null
      };
    }
  };
  function round2(v) { return Math.round(v * 100) / 100; }
  P.round2 = round2;

  /* ---------- Controle de acesso ---------- */
  class AccessError extends Error { constructor(msg) { super(msg); this.name = 'AccessError'; } }
  P.AccessError = AccessError;
  const assert = (cond, msg) => { if (!cond) throw new AccessError(msg || 'Você não tem permissão para acessar este recurso.'); };

  /*
   * Hierarquia (de cima para baixo): Diretoria (admin) → Gerente do escritório (office) → Gestor (manager) → Funcionário.
   * Diretoria e gerente têm visão global (todos os departamentos). Cada nível altera somente quem está abaixo dele.
   */
  P.ROLES = { admin: 'Diretor', office: 'Gerente do escritório', manager: 'Gestor', employee: 'Funcionário' };
  P.ROLE_ORDER = ['admin', 'office', 'manager', 'employee'];
  P.LEVEL = { employee: 1, manager: 2, office: 3, admin: 4 };
  P.isGlobal = u => !!u && (u.role === 'admin' || u.role === 'office');
  /* Capacidade, utilização e status de carga (sobrecarga, baixa utilização) só para gestores, gerente e diretoria */
  P.seesLoad = u => !!u && u.role !== 'employee';
  /* Departamento do qual a pessoa é a gestora responsável (gestor ou diretor que também gere um departamento) */
  // Departamento de apoio (ex.: Apoio ao Escritório): fora dos indicadores de produção
  P.isSupport = u => !!u && !!u.deptId && !!(P.store.db.departments.find(d => d.id === u.deptId) || {}).support;
  P.ledDept = u => (!!u && P.store.db.departments.find(d => d.managerId === u.id && d.active !== false)) || null;
  /* Quem o usuário pode gerenciar (dados cadastrais): só níveis abaixo; o gestor, só funcionários do seu departamento */
  P.canManageUser = (u, x) => !!u && !!x && u.id !== x.id && P.LEVEL[u.role] > P.LEVEL[x.role] && (P.isGlobal(u) || (u.role === 'manager' && x.role === 'employee' && x.deptId === u.deptId));
  /* Promover ou rebaixar: gerente e diretoria, para quem está abaixo; a diretoria também para outros diretores */
  P.canChangeRole = (u, x) => !!u && !!x && u.id !== x.id && x.active !== false && P.isGlobal(u) && (P.canManageUser(u, x) || (u.role === 'admin' && x.role === 'admin'));
  /* Funções que o usuário pode atribuir: a diretoria atribui qualquer uma; o gerente, gestor e funcionário */
  P.assignableRoles = u => u.role === 'admin' ? ['admin', 'office', 'manager', 'employee'] : u.role === 'office' ? ['manager', 'employee'] : [];
  const ALL = ['admin', 'office', 'manager', 'employee'], GLOBAL = ['admin', 'office'];
  P.PAGES = {
    dashboard: ALL,
    equipe: ['admin', 'office', 'manager'],
    funcionario: ALL,
    atividades: ALL,
    lancamentos: ALL,
    metas: ALL,
    insights: ['admin', 'office', 'manager'],
    ranking: ['admin', 'office', 'manager'],
    calendario: ALL,
    ferias: ALL,
    mural: ALL,
    comunicacao: ALL,
    empresas: ALL,
    relatorios: ALL,
    historico: ALL,
    alertas: ALL,
    configuracoes: ALL,
    departamentos: GLOBAL,
    funcionarios: ['admin', 'office', 'manager'],
    gestores: GLOBAL,
    pesos: ['admin', 'office', 'manager'],
    gerais: GLOBAL
  };

  const audit = (u, action, target, details) => {
    db().audit.unshift({ id: P.uid('a'), at: D.stamp(), by: u ? u.id : null, action, target, details: details || '' });
    if (db().audit.length > 600) db().audit.length = 600;
  };
  P.audit = audit;

  /*
   * API: toda leitura e escrita passa por aqui. O escopo é derivado do usuário
   * autenticado, nunca de parâmetros da URL. Um gestor que pedir um funcionário de
   * outro departamento recebe AccessError, mesmo que digite o endereço manualmente.
   */
  const api = P.api = {
    canSeeDept(u, deptId) { return P.isGlobal(u) || ((u.role === 'manager' || u.role === 'employee') && u.deptId === deptId); },
    canSeeEmployee(u, emp) {
      if (!emp) return false;
      if (P.isGlobal(u)) return true;
      if (u.role === 'manager') return emp.id === u.id || (emp.deptId === u.deptId && emp.role === 'employee');
      return emp.id === u.id;
    },
    canManageDept(u, deptId) { return P.isGlobal(u) || (u.role === 'manager' && u.deptId === deptId); },

    // withSupport: inclui departamentos de apoio (cadastros e filtros); sem ele, só os que entram nos indicadores
    departments(u, withSupport) {
      const all = db().departments.filter(d => d.active !== false && (withSupport || !d.support));
      return P.isGlobal(u) ? all : all.filter(d => d.id === u.deptId);
    },
    department(u, id) { const d = P.dept(id); assert(d && api.canSeeDept(u, id), 'Este departamento não pertence ao seu escopo de acesso.'); return d; },
    employees(u, deptId) {
      // quem é de departamento de apoio não entra nos indicadores (só aparece se o próprio departamento for pedido)
      const all = db().users.filter(x => x.role === 'employee' && x.active !== false && (deptId || x.id === u.id || !P.isSupport(x)));
      if (P.isGlobal(u)) return deptId ? all.filter(x => x.deptId === deptId) : all;
      if (u.role === 'manager') { assert(!deptId || deptId === u.deptId, 'Gestores visualizam apenas o próprio departamento.'); return all.filter(x => x.deptId === u.deptId); }
      assert(!deptId || deptId === u.deptId, 'Acesso restrito.');
      return all.filter(x => x.id === u.id);
    },
    workers(u, deptId) {
      const all = db().users.filter(x => (x.role === 'employee' || x.role === 'manager') && x.active !== false && (deptId || x.id === u.id || !P.isSupport(x)));
      if (P.isGlobal(u)) return deptId ? all.filter(x => x.deptId === deptId) : all;
      if (u.role === 'manager') {
        assert(!deptId || deptId === u.deptId, 'Gestores visualizam apenas o próprio departamento.');
        return all.filter(x => x.id === u.id || (x.role === 'employee' && x.deptId === u.deptId));
      }
      assert(!deptId || deptId === u.deptId, 'Acesso restrito.');
      return all.filter(x => x.id === u.id);
    },
    allEmployees(u) {
      // Gerente e diretoria veem todos os funcionários; o gestor, os do próprio departamento
      assert(P.isGlobal(u) || u.role === 'manager', 'Somente gestores, gerente e diretoria gerenciam o cadastro de funcionários.');
      return db().users.filter(x => x.role === 'employee' && (P.isGlobal(u) || x.deptId === u.deptId));
    },
    employee(u, id) { const e = P.user(id); assert(e && api.canSeeEmployee(u, e), 'Você não tem permissão para visualizar os dados deste colaborador.'); return e; },
    entries(u, f = {}) {
      let list;
      if (u.role === 'employee') list = (P.idx.byUser.get(u.id) || []).slice();
      else if (u.role === 'manager') { assert(!f.deptId || f.deptId === u.deptId, 'Gestores consultam apenas lançamentos do próprio departamento.'); list = db().entries.filter(e => e.deptId === u.deptId); }
      else list = db().entries.slice();
      if (f.userId) { const emp = P.user(f.userId); assert(api.canSeeEmployee(u, emp) || f.userId === u.id, 'Lançamentos fora do seu escopo.'); list = list.filter(e => e.userId === f.userId); }
      if (f.deptId) list = list.filter(e => e.deptId === f.deptId);
      if (f.activityId) list = list.filter(e => e.activityId === f.activityId);
      if (f.status) list = list.filter(e => e.status === f.status);
      if (f.client) { const q = f.client.toLowerCase(); list = list.filter(e => (e.client || '').toLowerCase().includes(q)); }
      if (f.s) list = list.filter(e => e.date >= f.s);
      if (f.e) list = list.filter(e => e.date <= f.e);
      return list;
    },
    activities(u, deptId, includeInactive) {
      const id = deptId || (P.isGlobal(u) ? null : u.deptId);
      if (!P.isGlobal(u)) assert(!deptId || deptId === u.deptId, 'Tabela de pesos de outro departamento.');
      return db().activities.filter(a => (!id || a.deptId === id) && (includeInactive || a.active));
    },
    createEntry(u, data) {
      const emp = P.user(data.userId);
      assert(emp && (emp.role === 'employee' || emp.role === 'manager'), 'Selecione uma pessoa válida.');
      const own = u.id === emp.id;
      assert(own || P.isGlobal(u) || (u.role === 'manager' && emp.role === 'employee' && emp.deptId === u.deptId), 'Você só pode registrar atividades próprias ou da equipe do seu departamento.');
      const a = P.act(data.activityId);
      assert(a && a.active && a.deptId === emp.deptId, 'A atividade não pertence à tabela do departamento.');
      const qty = Math.max(0.25, Number(data.qty) || 0);
      const e = {
        id: P.uid('e'), date: data.date, userId: emp.id, deptId: emp.deptId, activityId: a.id,
        client: (data.client || '').trim(), qty, weight: a.weight, points: round2(qty * a.weight),
        obs: (data.obs || '').trim(), status: own && !P.isGlobal(u) ? 'pendente' : 'aprovado',
        history: [{ at: D.stamp(), by: u.id, action: 'Criado', note: own && !P.isGlobal(u) ? 'Enviado para aprovação' : 'Registrado por ' + P.ROLES[u.role].toLowerCase() }]
      };
      if (data.taskId) {
        const t = db().tasks.find(x => x.id === data.taskId && x.userId === emp.id);
        if (t) { t.status = 'concluida'; t.doneAt = data.date; e.taskId = t.id; }
      }
      db().entries.push(e); P.reindex(); audit(u, 'Lançamento criado', e.id, a.name + ' × ' + qty); P.store.save();
      return e;
    },
    resubmitEntry(u, id, patch) {
      const e = P.idx.byId.get(id);
      assert(e && e.userId === u.id && (e.status === 'correcao' || e.status === 'pendente'), 'Somente lançamentos próprios pendentes ou em correção podem ser editados.');
      api._applyPatch(e, patch);
      e.status = 'pendente';
      e.history.push({ at: D.stamp(), by: u.id, action: 'Corrigido e reenviado', note: patch.note || '' });
      P.reindex(); audit(u, 'Lançamento reenviado', e.id); P.store.save();
    },
    _applyPatch(e, patch) {
      const changes = [];
      if (patch.activityId && patch.activityId !== e.activityId) {
        const a = P.act(patch.activityId); assert(a && a.deptId === e.deptId, 'Atividade inválida.');
        changes.push('atividade: ' + (P.act(e.activityId) || { name: '—' }).name + ' → ' + a.name); e.activityId = a.id; e.weight = a.weight;
      }
      if (patch.qty != null && Number(patch.qty) !== e.qty) { changes.push('quantidade: ' + F.n(e.qty, 2) + ' → ' + F.n(patch.qty, 2)); e.qty = Math.max(0.25, Number(patch.qty)); }
      if (patch.date && patch.date !== e.date) { changes.push('data: ' + D.fmt(e.date) + ' → ' + D.fmt(patch.date)); e.date = patch.date; }
      if (patch.client != null && patch.client !== e.client) { changes.push('cliente: ' + (e.client || '—') + ' → ' + patch.client); e.client = patch.client; }
      if (patch.obs != null && patch.obs !== e.obs) { e.obs = patch.obs; changes.push('observação atualizada'); }
      e.points = round2(e.qty * e.weight);
      return changes;
    },
    reviewEntry(u, id, action, opts = {}) {
      const e = P.idx.byId.get(id);
      const owner = e && P.user(e.userId);
      // Revisa quem está acima do autor na hierarquia (o gestor, só no próprio departamento)
      assert(e && owner && api.canManageDept(u, e.deptId) && P.LEVEL[u.role] > P.LEVEL[owner.role], 'Somente um nível acima do autor (gestor do departamento, gerente ou diretoria) pode revisar este lançamento.');
      let note = opts.note || '';
      if (action === 'aprovar') { e.status = 'aprovado'; }
      else if (action === 'recusar') { e.status = 'recusado'; }
      else if (action === 'correcao') { e.status = 'correcao'; }
      else if (action === 'editar') {
        const ch = api._applyPatch(e, opts.patch || {});
        note = [ch.join('; '), note].filter(Boolean).join(' · ');
        e.status = 'aprovado';
      }
      const labels = { aprovar: 'Aprovado', recusar: 'Recusado', correcao: 'Correção solicitada', editar: 'Editado e aprovado' };
      const h = { at: D.stamp(), by: u.id, action: labels[action], note };
      if (action === 'recusar' || action === 'correcao') h.cause = P.REWORK_CAUSES[opts.cause] ? opts.cause : 'colaborador';
      e.history.push(h);
      P.reindex(); audit(u, 'Lançamento ' + labels[action].toLowerCase(), e.id, [note, h.cause ? 'motivo: ' + P.REWORK_CAUSES[h.cause].toLowerCase() : ''].filter(Boolean).join(' · ')); P.store.save();
    },
    tasks(u, f = {}) {
      let list = db().tasks;
      if (u.role === 'employee') list = list.filter(t => t.userId === u.id);
      else if (u.role === 'manager') list = list.filter(t => t.deptId === u.deptId);
      if (f.deptId) { assert(api.canSeeDept(u, f.deptId), 'Acesso restrito.'); list = list.filter(t => t.deptId === f.deptId); }
      if (f.userId) list = list.filter(t => t.userId === f.userId);
      return list;
    },
    saveTask(u, data) {
      const emp = P.user(data.userId);
      const isWorker = emp && (emp.role === 'employee' || emp.role === 'manager');
      const inManagerScope = u.role === 'manager' && emp && emp.deptId === u.deptId && (emp.role === 'employee' || emp.id === u.id);
      assert(isWorker && (P.isGlobal(u) || inManagerScope), 'Apenas o gestor do departamento, o gerente ou a diretoria podem atribuir tarefas a esta pessoa.');
      if (data.client) assert(db().clientAssignments.some(x => x.deptId === emp.deptId && x.userId === emp.id && x.client === data.client), 'Esta empresa não está na carteira da pessoa selecionada.');
      const t = { id: P.uid('t'), userId: emp.id, deptId: emp.deptId, title: data.title, activityId: data.activityId || null, client: data.client || '', due: data.due, status: 'pendente', createdBy: u.id };
      db().tasks.push(t); audit(u, 'Tarefa atribuída', t.id, emp.name + ': ' + t.title); P.store.save(); return t;
    },
    clientAssignments(u, deptId) {
      if (P.isGlobal(u)) return db().clientAssignments.filter(x => !deptId || x.deptId === deptId);
      if (u.role === 'manager') {
        assert(!deptId || deptId === u.deptId, 'Gestores consultam apenas a carteira do próprio departamento.');
        return db().clientAssignments.filter(x => x.deptId === u.deptId);
      }
      assert(!deptId || deptId === u.deptId, 'Acesso restrito.');
      return db().clientAssignments.filter(x => x.userId === u.id);
    },
    clientsFor(u, userId = u.id) {
      const person = api.employee(u, userId);
      return api.clientAssignments(u, person.deptId).filter(x => x.userId === person.id).map(x => x.client).sort((a, b) => a.localeCompare(b));
    },
    assignClient(u, data) {
      const person = P.user(data.userId), client = String(data.client || '').trim();
      assert(person && (person.role === 'employee' || person.role === 'manager'), 'Selecione uma pessoa válida.');
      assert(P.isGlobal(u) || (u.role === 'manager' && person.deptId === u.deptId && (person.role === 'employee' || person.id === u.id)), 'Você só pode gerenciar a carteira do próprio departamento.');
      assert(P.catalog().includes(client), 'Selecione uma empresa do catálogo.');
      const existing = db().clientAssignments.find(x => x.deptId === person.deptId && x.client === client);
      if (existing) {
        existing.userId = person.id; existing.assignedBy = u.id; existing.updatedAt = D.stamp();
      } else {
        db().clientAssignments.push({ id: P.uid('ca'), deptId: person.deptId, userId: person.id, client, assignedBy: u.id, assignedAt: D.stamp() });
      }
      audit(u, 'Empresa atribuída à carteira', person.id, client);
      P.store.save();
    },
    /*
     * Importação de carteira por responsável: cada linha da planilha (Código, Nome da empresa, CNPJ) é localizada
     * no cadastro de empresas e vinculada à pessoa. O funcionário importa só a própria carteira e não toma
     * empresa de colega; gestor (do departamento), gerente e diretoria podem transferir.
     */
    canImportPortfolio(u, person) {
      if (!person || person.active === false || !(person.role === 'employee' || person.role === 'manager') || !person.deptId) return false;
      return P.isGlobal(u) || person.id === u.id || (u.role === 'manager' && person.deptId === u.deptId && person.role === 'employee');
    },
    planPortfolioImport(u, personId, rows) {
      const person = P.user(personId);
      assert(api.canImportPortfolio(u, person), 'Você não pode importar a carteira desta pessoa.');
      const canTransfer = P.isGlobal(u) || (u.role === 'manager' && person.deptId === u.deptId);
      const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
      const comps = db().companies;
      const byCode = new Map(), byCnpj = new Map(), byName = new Map();
      comps.forEach(c => { if (c.code) byCode.set(norm(c.code), c); if (c.cnpj) byCnpj.set(P.cnpj.digits(c.cnpj), c); byName.set(norm(c.name), c); });
      const owner = new Map(db().clientAssignments.filter(a => a.deptId === person.deptId).map(a => [a.client, a]));
      const seen = new Set();
      const lines = rows.map(r => {
        const l = { row: r.row, code: r.code, name: r.name, cnpj: r.cnpj };
        const d = P.cnpj.digits(r.cnpj);
        const c = (r.code && byCode.get(norm(r.code))) || (d.length === 14 && byCnpj.get(d)) || (r.name && byName.get(norm(r.name))) || null;
        if (!c) return Object.assign(l, { status: 'erro', detail: 'Empresa não encontrada no cadastro (confira código, CNPJ ou nome)' });
        l.company = c.name; l.companyCode = c.code || '';
        if (!c.active) return Object.assign(l, { status: 'erro', detail: 'Empresa inativa no cadastro' });
        if (seen.has(c.id)) return Object.assign(l, { status: 'igual', detail: 'Repetida na planilha' });
        seen.add(c.id);
        const a = owner.get(c.name);
        if (!a) return Object.assign(l, { status: 'nova', detail: 'Será incluída na carteira' });
        if (a.userId === person.id) return Object.assign(l, { status: 'igual', detail: 'Já está na carteira' });
        const other = (P.user(a.userId) || {}).name || 'outra pessoa';
        if (!canTransfer) return Object.assign(l, { status: 'erro', detail: 'Já é da carteira de ' + other + '. Peça ao gestor para transferir' });
        return Object.assign(l, { status: 'transferir', detail: 'Será transferida de ' + other });
      });
      const n = s => lines.filter(l => l.status === s).length;
      return { personId, lines, novas: n('nova'), transferir: n('transferir'), iguais: n('igual'), erros: n('erro') };
    },
    applyPortfolioImport(u, plan, fileName) {
      const person = P.user(plan.personId);
      assert(api.canImportPortfolio(u, person), 'Você não pode importar a carteira desta pessoa.');
      let count = 0;
      plan.lines.forEach(l => {
        if (l.status !== 'nova' && l.status !== 'transferir') return;
        const ex = db().clientAssignments.find(x => x.deptId === person.deptId && x.client === l.company);
        if (ex) { if (l.status !== 'transferir') return; ex.userId = person.id; ex.assignedBy = u.id; ex.updatedAt = D.stamp(); }
        else db().clientAssignments.push({ id: P.uid('ca'), deptId: person.deptId, userId: person.id, client: l.company, assignedBy: u.id, assignedAt: D.stamp() });
        count++;
      });
      audit(u, 'Carteira importada por planilha', person.id, `${count} empresa(s) vinculada(s) a ${person.name}${fileName ? ' · arquivo ' + fileName : ''}`);
      P.store.save();
      return count;
    },
    removeClientAssignment(u, assignmentId) {
      const assignment = db().clientAssignments.find(x => x.id === assignmentId);
      assert(assignment, 'Vínculo de empresa não encontrado.');
      assert(P.isGlobal(u) || (u.role === 'manager' && assignment.deptId === u.deptId), 'Você só pode gerenciar a carteira do próprio departamento.');
      db().clientAssignments = db().clientAssignments.filter(x => x.id !== assignmentId);
      audit(u, 'Empresa removida da carteira', assignment.userId, assignment.client);
      P.store.save();
    },
    goals(u) {
      const g = db().goals;
      if (P.isGlobal(u)) return g;
      if (u.role === 'manager') return g.filter(x => (x.scope === 'department' && x.refId === u.deptId) || (x.scope === 'employee' && (P.user(x.refId) || {}).deptId === u.deptId));
      return g.filter(x => x.scope === 'employee' && x.refId === u.id);
    },
    saveGoal(u, goalId, target) {
      const g = db().goals.find(x => x.id === goalId);
      assert(g, 'Meta não encontrada.');
      const deptId = g.scope === 'department' ? g.refId : (P.user(g.refId) || {}).deptId;
      const ref = g.scope === 'employee' ? P.user(g.refId) : null;
      // Meta de departamento: gestor do departamento, gerente ou diretoria. Meta individual: quem está acima da pessoa (o gestor também ajusta a própria).
      assert(api.canManageDept(u, deptId) && u.role !== 'employee' && (!ref || P.canManageUser(u, ref) || (u.role === 'manager' && ref.id === u.id)), 'Você só altera metas de quem está abaixo de você na hierarquia.');
      const old = g.target; g.target = Number(target);
      if (g.scope === 'employee' && g.period === 'semanal') { const emp = P.user(g.refId); emp.weeklyGoal = g.target; }
      audit(u, 'Meta alterada', g.id, F.n(old) + ' → ' + F.n(g.target)); P.store.save();
    },
    addNote(u, empId, text) {
      const emp = api.employee(u, empId);
      assert(P.canManageUser(u, emp), 'Você só registra observações sobre quem está abaixo de você na hierarquia.');
      db().notes.unshift({ id: P.uid('n'), empId: emp.id, by: u.id, at: D.stamp(), text });
      audit(u, 'Observação registrada', emp.id); P.store.save();
    },
    notes(u, empId) { api.employee(u, empId); return u.role === 'employee' ? [] : db().notes.filter(n => n.empId === empId); },
    setCapacity(u, empId, cap) {
      const emp = api.employee(u, empId);
      assert(P.canManageUser(u, emp), 'Você só ajusta a capacidade de quem está abaixo de você na hierarquia.');
      const old = emp.capacity; emp.capacity = Number(cap);
      audit(u, 'Capacidade ajustada', emp.id, emp.name + ': ' + old + ' → ' + emp.capacity + ' pts/semana'); P.store.save();
    },

    /* Empresas atendidas (cadastro com regime tributário) */
    companies(u) { return db().companies.slice().sort((a, b) => a.name.localeCompare(b.name)); },
    company(u, id) { const c = P.idx.companies.get(id); assert(c, 'Empresa não encontrada.'); return c; },
    saveCompany(u, data) {
      assert(u.role !== 'employee', 'Somente gestores e administradores cadastram empresas.');
      const name = String(data.name || '').trim();
      assert(name.length >= 2, 'Informe a razão social.');
      const digits = P.cnpj.digits(data.cnpj);
      assert(!digits || P.cnpj.valid(digits), 'CNPJ inválido. Confira os 14 dígitos ou deixe em branco.');
      const cnpj = digits ? P.cnpj.format(digits) : '';
      assert(!cnpj || !db().companies.some(c => c.cnpj && P.cnpj.digits(c.cnpj) === digits && c.id !== data.id), 'Já existe uma empresa com este CNPJ.');
      // Mesmo nome só é permitido quando o CNPJ diferencia (matriz e filiais)
      assert(!db().companies.some(c => c.name.toLowerCase() === name.toLowerCase() && c.id !== data.id && (!cnpj || !c.cnpj)), 'Já existe uma empresa com este nome. Para matriz e filial, informe o CNPJ de cada uma.');
      const code = String(data.code || '').trim();
      assert(!code || !db().companies.some(c => c.code && c.code.toLowerCase() === code.toLowerCase() && c.id !== data.id), 'Já existe uma empresa com este código.');
      assert(P.REGIMES[data.regime], 'Selecione o regime tributário.');
      let c = data.id && P.idx.companies.get(data.id);
      const isNew = !c;
      if (!c) { c = { id: P.uid('c'), active: true, since: data.since || D.iso(P.today()), history: [] }; db().companies.push(c); }
      if (!isNew && c.regime && c.regime !== data.regime) {
        (c.history = c.history || []).unshift({ at: D.stamp(), by: u.id, from: c.regime, to: data.regime, note: data.regimeNote || '' });
      }
      if (!isNew) api._renameCompany(c, name);
      Object.assign(c, { code, name, tradeName: (data.tradeName || '').trim() || name, cnpj, regime: data.regime, depts: data.depts || [], since: data.since || c.since, notes: (data.notes || '').trim() });
      if (data.receita && P.cnpj.digits(data.receita.cnpj) === digits) c.receita = data.receita;
      P.reindex(); audit(u, isNew ? 'Empresa cadastrada' : 'Empresa editada', c.id, c.name + ' · ' + P.REGIMES[c.regime].label + (data.receita ? ' · dados da Receita' : '')); P.store.save();
      return c;
    },
    /* Renomear a empresa mantém a carteira e as tarefas pendentes apontando para ela */
    _renameCompany(c, name) {
      if (!c.name || c.name === name) return;
      db().clientAssignments.forEach(x => { if (x.client === c.name) x.client = name; });
      db().tasks.forEach(t => { if (t.status === 'pendente' && t.client === c.name) { t.title = t.title.replace(c.name, name); t.client = name; } });
    },

    /* ---------- Importação de clientes por planilha (Código, Nome da empresa, CNPJ, Regime tributário) ---------- */
    /* Interpreta o texto do regime escrito na planilha (aceita variações e abreviações) */
    parseRegime(t) {
      const s = String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '');
      if (!s) return { regime: null };
      if (s === 'mei' || s.includes('microempreendedor')) return { regime: 'mei' };
      if (s.includes('simples') || s === 'sn') return { regime: 'simples' };
      if (s.includes('presumido') || s === 'lp') return { regime: 'presumido' };
      if (s.includes('real') || s === 'lr') return { regime: 'real' };
      if (s.includes('imune') || s.includes('isent')) return { regime: 'imune' };
      return { regime: null, invalid: true };
    },
    /* Chave de comparação de nomes: sem acentos, pontuação e espaços repetidos */
    nameKey: n => String(n || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim(),
    /* Nome sem o tipo societário no final (LTDA, EIRELI, ME, EPP, S/A…), para comparar com nomes resumidos */
    baseName(n) {
      let k = api.nameKey(n), prev;
      do { prev = k; k = k.replace(/ (LTDA|LIMITADA|EIRELI|ME|EPP|S A|SA|SS|SLU|EI|MEI|SOCIEDADE SIMPLES|SOCIEDADE UNIPESSOAL)$/, '').trim(); } while (k !== prev);
      return k;
    },
    /*
     * Monta a prévia da importação, sem gravar nada. Cada linha vira: nova, atualizar, igual ou erro.
     * A empresa existente é encontrada pelo código; se não houver, pelo CNPJ; se não houver, pelo nome.
     */
    planCompanyImport(u, rows) {
      assert(u.role !== 'employee', 'Somente gestores e administradores importam empresas.');
      const all = db().companies;
      const byCode = new Map(), byCnpj = new Map();
      all.forEach(c => {
        if (c.code) byCode.set(c.code.toLowerCase(), c);
        if (c.cnpj) byCnpj.set(P.cnpj.digits(c.cnpj), c);
      });
      const seenCode = new Map(), seenCnpj = new Map(), seenName = new Map(), usedTarget = new Map(), futureCnpj = new Map();
      /* Empresa existente pelo nome: igual sem o tipo societário (LTDA, EIRELI…) ou, se não houver, um nome
         resumido que seja o começo da razão social. Só vale quando há uma única candidata livre e sem CNPJ diferente. */
      const nameMatch = line => {
        const key = api.baseName(line.name);
        if (!key) return null;
        const free = all.filter(c => !usedTarget.has(c.id) && !(c.code && c.code.toLowerCase() !== line.code.toLowerCase()) && !(c.cnpj && line.cnpj && P.cnpj.digits(c.cnpj) !== P.cnpj.digits(line.cnpj)));
        const exact = free.filter(c => api.baseName(c.name) === key);
        if (exact.length === 1) return { c: exact[0], approx: false };
        if (exact.length > 1) return null;
        const pre = free.filter(c => { const k = api.baseName(c.name); return k.length >= 6 && k.includes(' ') && (key.startsWith(k + ' ') || k.startsWith(key + ' ')); });
        return pre.length === 1 ? { c: pre[0], approx: true } : null;
      };
      const plan = rows.map(r => {
        const line = { row: r.row, code: String(r.code == null ? '' : r.code).trim(), name: String(r.name || '').trim().replace(/\s+/g, ' '), cnpjRaw: String(r.cnpj == null ? '' : r.cnpj).trim(), regimeRaw: String(r.regime || '').trim(), errors: [], warnings: [], changes: [] };
        if (!line.code) line.errors.push('Código não informado');
        if (!line.name) line.errors.push('Nome da empresa não informado');
        let digits = P.cnpj.digits(line.cnpjRaw);
        if (digits && digits.length < 14 && digits.length >= 11) digits = digits.padStart(14, '0'); // o Excel costuma apagar zeros à esquerda
        if (line.cnpjRaw && !P.cnpj.valid(digits)) line.errors.push('CNPJ inválido');
        line.cnpj = digits && P.cnpj.valid(digits) ? P.cnpj.format(digits) : '';
        const reg = api.parseRegime(line.regimeRaw);
        if (reg.invalid) line.errors.push('Regime "' + line.regimeRaw + '" não reconhecido');
        line.regime = reg.regime;
        if (line.code) { const k = line.code.toLowerCase(); if (seenCode.has(k)) line.errors.push('Código repetido na planilha (linha ' + seenCode.get(k) + ')'); else seenCode.set(k, r.row); }
        if (line.cnpj) { const k = P.cnpj.digits(line.cnpj); if (seenCnpj.has(k)) line.errors.push('CNPJ repetido na planilha (linha ' + seenCnpj.get(k) + ')'); else seenCnpj.set(k, r.row); }
        // Mesma razão social é permitida (matriz e filiais), desde que o CNPJ diferencie
        if (line.name) {
          const k = api.nameKey(line.name), prev = seenName.get(k);
          if (prev && (!prev.cnpj || !line.cnpj)) line.errors.push('Nome repetido na planilha (linha ' + prev.row + ') sem CNPJ para diferenciar');
          if (!prev) seenName.set(k, { row: r.row, cnpj: line.cnpj });
        }
        // Empresa correspondente no cadastro: código, depois CNPJ, depois nome
        let target = (line.code && byCode.get(line.code.toLowerCase())) || (line.cnpj && byCnpj.get(P.cnpj.digits(line.cnpj))) || null;
        if (target) {
          line.matchBy = line.code && target.code && target.code.toLowerCase() === line.code.toLowerCase() ? 'código' : 'CNPJ';
          if (usedTarget.has(target.id)) line.errors.push('Corresponde à mesma empresa da linha ' + usedTarget.get(target.id));
        } else if (line.name && !line.errors.length) {
          const nm = nameMatch(line);
          if (nm) {
            target = nm.c; line.matchBy = nm.approx ? 'nome aproximado' : 'nome';
            if (nm.approx) line.warnings.push('Encontrada pelo nome aproximado ("' + nm.c.name + '"): confira');
          }
        }
        if (target && !line.errors.length) { usedTarget.set(target.id, r.row); if (line.cnpj) futureCnpj.set(target.id, line.cnpj); }
        // Conflitos com outras empresas do cadastro
        if (line.code) { const o = byCode.get(line.code.toLowerCase()); if (o && target && o.id !== target.id) line.errors.push('Código já usado por ' + o.name); }
        if (line.cnpj) { const o = byCnpj.get(P.cnpj.digits(line.cnpj)); if (o && (!target || o.id !== target.id)) line.errors.push('CNPJ já cadastrado em ' + o.name); }
        if (line.name) {
          const k = api.nameKey(line.name);
          const o = all.find(c => c !== target && api.nameKey(c.name) === k && !(line.cnpj && (futureCnpj.get(c.id) || c.cnpj) && P.cnpj.digits(futureCnpj.get(c.id) || c.cnpj) !== P.cnpj.digits(line.cnpj)));
          if (o) line.errors.push('Já existe empresa com este nome sem CNPJ para diferenciar (' + o.name + ')');
        }
        line.targetId = target ? target.id : null;
        if (target) {
          if (line.code !== (target.code || '')) line.changes.push(['Código', target.code || '—', line.code]);
          if (line.name && line.name !== target.name) line.changes.push(['Nome', target.name, line.name]);
          if (line.cnpj && line.cnpj !== (target.cnpj || '')) line.changes.push(['CNPJ', target.cnpj || '—', line.cnpj]);
          if (!line.cnpj && target.cnpj) line.warnings.push('CNPJ em branco na planilha: o CNPJ atual é mantido');
          if (line.regime && line.regime !== target.regime) line.changes.push(['Regime', P.REGIMES[target.regime] ? P.REGIMES[target.regime].label : 'Não informado', P.REGIMES[line.regime].label]);
          if (!line.regime && target.regime) line.warnings.push('Regime em branco na planilha: o regime atual é mantido');
          if (!target.active) line.warnings.push('A empresa está inativa no cadastro e será reativada');
        }
        if (!line.regime && !(target && target.regime)) line.warnings.push('Sem regime: entra como cadastro incompleto');
        line.status = line.errors.length ? 'erro' : !target ? 'nova' : line.changes.length || !target.active ? 'atualizar' : 'igual';
        return line;
      });
      const count = s => plan.filter(l => l.status === s).length;
      return { rows: plan, total: plan.length, novas: count('nova'), atualizar: count('atualizar'), iguais: count('igual'), erros: count('erro') };
    },
    /*
     * Grava a importação (só as linhas sem erro), registra na auditoria e devolve a relação da importação:
     * cada linha da planilha com o resultado (criada, atualizada, sem alteração ou falha) e o motivo.
     * A relação fica guardada no histórico de importações para consulta posterior.
     */
    applyCompanyImport(u, plan, fileName) {
      assert(u.role !== 'employee', 'Somente gestores e administradores importam empresas.');
      const touched = [], result = [];
      for (const l of plan.rows) {
        const base = { row: l.row, code: l.code, name: l.name, cnpj: l.cnpj || l.cnpjRaw, regime: l.regime ? P.REGIMES[l.regime].label : l.regimeRaw };
        if (l.status === 'erro') { result.push(Object.assign(base, { status: 'falha', detail: l.errors.join('; ') })); continue; }
        if (l.status === 'igual') { result.push(Object.assign(base, { status: 'igual', detail: 'Já estava igual no cadastro (encontrada pelo ' + l.matchBy + ')' })); continue; }
        result.push(Object.assign(base, {
          status: l.targetId ? 'atualizada' : 'criada',
          detail: l.targetId ? l.changes.map(c => c[0] + ': ' + c[1] + ' → ' + c[2]).join('; ') + (l.matchBy ? ' (encontrada pelo ' + l.matchBy + ')' : '') : 'Nova empresa' + (l.regime ? '' : ' (sem regime: cadastro incompleto)')
        }));
        let c = l.targetId && P.idx.companies.get(l.targetId);
        if (!c) {
          c = { id: P.uid('c'), active: true, since: D.iso(P.today()), history: [], depts: [], notes: '', tradeName: l.name, name: l.name, cnpj: '', regime: null };
          db().companies.push(c);
        } else {
          api._renameCompany(c, l.name);
          if (l.regime && c.regime && c.regime !== l.regime) (c.history = c.history || []).unshift({ at: D.stamp(), by: u.id, from: c.regime, to: l.regime, note: 'Importação de planilha' + (fileName ? ' (' + fileName + ')' : '') });
          if (c.tradeName === c.name) c.tradeName = l.name;
        }
        c.code = l.code; c.name = l.name; c.active = true;
        if (l.cnpj) c.cnpj = l.cnpj;
        if (l.regime) c.regime = l.regime;
        touched.push(c.id);
        result[result.length - 1].companyId = c.id;
      }
      const report = {
        id: P.uid('imp'), at: D.stamp(), by: u.id, file: fileName || 'planilha', rows: result,
        criadas: plan.novas, atualizadas: plan.atualizar, iguais: plan.iguais, falhas: plan.erros, total: plan.total
      };
      db().importLogs = [report].concat(db().importLogs || []).slice(0, 20); // guarda as 20 últimas
      P.reindex();
      audit(u, 'Importação de empresas', fileName || 'planilha', `${plan.novas} novas, ${plan.atualizar} atualizadas, ${plan.iguais} sem alteração, ${plan.erros} com falha`);
      P.store.save();
      return { touched, report };
    },
    /* Impacto de apagar empresas: vínculos de carteira removidos e registros que só guardam o nome */
    companyDeleteImpact(ids) {
      const names = new Set(ids.map(id => (P.idx.companies.get(id) || {}).name).filter(Boolean));
      return {
        assignments: db().clientAssignments.filter(a => names.has(a.client)).length,
        entries: db().entries.filter(e => names.has(e.client)).length,
        tasks: db().tasks.filter(t => t.status === 'pendente' && names.has(t.client)).length
      };
    },
    /* Apaga empresas em lote (irreversível). Lançamentos e tarefas mantêm o nome do cliente como texto;
       os vínculos de carteira dessas empresas são removidos. */
    deleteCompanies(u, ids) {
      assert(P.isGlobal(u), 'Somente o gerente e a diretoria apagam empresas.');
      const set = new Set(ids), gone = db().companies.filter(c => set.has(c.id));
      assert(gone.length, 'Nenhuma empresa selecionada.');
      const names = new Set(gone.map(c => c.name));
      const before = db().clientAssignments.length;
      db().clientAssignments = db().clientAssignments.filter(a => !names.has(a.client));
      db().companies = db().companies.filter(c => !set.has(c.id));
      P.reindex();
      const list = gone.map(c => (c.code ? c.code + ' ' : '') + c.name);
      audit(u, 'Empresas apagadas em lote', gone.length + ' empresa(s)', list.slice(0, 50).join('; ') + (list.length > 50 ? '; … e mais ' + (list.length - 50) : ''));
      P.store.save();
      return { count: gone.length, assignments: before - db().clientAssignments.length };
    },
    setCompaniesActive(u, ids, active) {
      assert(P.isGlobal(u), 'Somente o gerente e a diretoria inativam empresas.');
      const set = new Set(ids); let n = 0;
      db().companies.forEach(c => { if (set.has(c.id) && c.active !== active) { c.active = active; n++; } });
      P.reindex(); audit(u, active ? 'Empresas reativadas em lote' : 'Empresas inativadas em lote', n + ' empresa(s)'); P.store.save();
      return n;
    },
    importLogs(u) {
      assert(u.role !== 'employee', 'Somente gestores e administradores consultam importações.');
      return db().importLogs || [];
    },

    /* Atualização em lote: grava os dados públicos sem sobrescrever o que já foi confirmado por alguém */
    applyReceita(u, id, info) {
      assert(u.role !== 'employee', 'Somente gestores e administradores atualizam empresas.');
      const c = api.company(u, id);
      const changes = [];
      // Não perde a forma de tributação já obtida antes se, desta vez, só a CNPJá respondeu
      if (!P.receita.hasRegimeSource(info) && c.receita && P.receita.hasRegimeSource(c.receita)) {
        Object.assign(info, { suggestion: c.receita.suggestion, regimes: c.receita.regimes, source: c.receita.source });
      }
      c.receita = info;
      if (!P.REGIMES[c.regime] && info.suggestion && info.suggestion.regime) { c.regime = info.suggestion.regime; changes.push('regime'); }
      if ((!c.tradeName || c.tradeName === c.name) && info.tradeName) { c.tradeName = info.tradeName; changes.push('nome fantasia'); }
      P.reindex(); audit(u, 'Empresa atualizada pela Receita', c.id, c.name + (changes.length ? ' · ' + changes.join(', ') : '')); P.store.save();
      return changes;
    },
    toggleCompany(u, id) {
      assert(P.isGlobal(u), 'Somente o gerente e a diretoria inativam empresas.');
      const c = api.company(u, id); c.active = !c.active;
      P.reindex(); audit(u, c.active ? 'Empresa reativada' : 'Empresa inativada', c.id, c.name); P.store.save();
    },

    /*
     * Férias: colaborador solicita → gestor aprova → gerente do escritório aprova → um diretor aprova → calendário.
     * Cada pedido começa na primeira etapa acima de quem pede (pedido de gestor começa no gerente; do gerente, na
     * diretoria). Etapas sem ninguém no cargo (departamento sem gestor, escritório sem gerente) são puladas.
     */
    STAGES: [['gestor', 2], ['gerente', 3], ['diretoria', 4]],
    _stageExists(stage, deptId) {
      if (stage === 'gestor') {
        // O gestor responsável pode ser um gestor ou um diretor que também gere o departamento
        const d = P.dept(deptId), m = d && d.managerId && P.user(d.managerId);
        return !!(m && m.active !== false && (m.role === 'manager' || m.role === 'admin'));
      }
      if (stage === 'gerente') return db().users.some(x => x.role === 'office' && x.active !== false);
      return true;
    },
    /* Próxima etapa acima de um nível (pula as vagas) */
    _nextStage(level, deptId) {
      const s = api.STAGES.find(([k, l]) => l > level && api._stageExists(k, deptId));
      return s ? s[0] : 'diretoria';
    },
    vacations(u) {
      const all = db().vacations || [];
      if (P.isGlobal(u)) return all;
      if (u.role === 'manager') return all.filter(v => v.deptId === u.deptId);
      // Funcionário: as próprias solicitações completas; dos colegas, só as datas aprovadas, sem comentário
      return all.filter(v => v.userId === u.id || (v.deptId === u.deptId && v.status === 'aprovada'))
        .map(v => v.userId === u.id ? v : { id: v.id, userId: v.userId, deptId: v.deptId, start: v.start, end: v.end, days: v.days, status: v.status, restricted: true });
    },
    vacationRules(start, end) {
      if (!start || !end) return 'Informe início e fim.';
      const s = D.parse(start), e = D.parse(end);
      if (e < s) return 'A data final deve ser igual ou posterior à inicial.';
      const days = Math.round((e - s) / 864e5) + 1;
      if (days < 5) return 'Cada período de férias deve ter no mínimo 5 dias corridos.';
      if (days > 30) return 'O período máximo é de 30 dias corridos.';
      if (start <= D.iso(P.today())) return 'Solicite férias com início a partir de amanhã.';
      if ([5, 6, 0].includes(s.getDay())) return 'As férias não podem começar na sexta, no sábado ou no domingo (dois dias antes do repouso semanal).';
      if (D.HOLIDAYS.has(start) || D.HOLIDAYS.has(D.iso(D.add(s, 1))) || D.HOLIDAYS.has(D.iso(D.add(s, 2)))) return 'As férias não podem começar em feriado nem nos dois dias que o antecedem.';
      return null;
    },
    requestVacation(u, data) {
      assert(P.LEVEL[u.role], 'Perfil sem permissão para solicitar férias.');
      const err = api.vacationRules(data.start, data.end);
      if (err) throw new Error(err);
      const mine = db().vacations.filter(v => v.userId === u.id && ['gestor', 'gerente', 'diretoria', 'aprovada'].includes(v.status));
      const clash = mine.find(v => !(data.end < v.start || data.start > v.end));
      if (clash) throw new Error('Você já tem férias ' + (clash.status === 'aprovada' ? 'aprovadas' : 'solicitadas') + ' de ' + D.fmt(clash.start) + ' a ' + D.fmt(clash.end) + '.');
      const days = Math.round((D.parse(data.end) - D.parse(data.start)) / 864e5) + 1;
      const v = {
        id: P.uid('v'), userId: u.id, deptId: u.deptId, start: data.start, end: data.end, days,
        comment: String(data.comment || '').trim(), abono: !!data.abono, adiant13: !!data.adiant13,
        // Ninguém aprova as próprias férias: o pedido começa na primeira etapa acima de quem pede
        status: api._nextStage(P.LEVEL[u.role], u.deptId), createdAt: D.stamp(),
        history: [{ at: D.stamp(), by: u.id, action: 'Solicitada', note: '' }]
      };
      db().vacations.push(v); audit(u, 'Férias solicitadas', v.id, D.fmt(v.start) + ' a ' + D.fmt(v.end)); P.store.save();
      return v;
    },
    /* Quem decide a etapa atual: o gestor responsável pelo departamento (gestor ou diretor-gestor), o gerente ou
       um diretor. Um diretor que já aprovou como gestor não decide também a etapa da diretoria. */
    _approvedBy(v, uid) { return (v.history || []).some(h => h.by === uid && /^Aprovada/.test(h.action)); },
    canReviewVacation(u, v) {
      if (!u || !v || v.userId === u.id) return false;
      if (v.status === 'gestor') { const d = P.dept(v.deptId); return !!d && d.managerId === u.id && (u.role === 'manager' || u.role === 'admin'); }
      if (v.status === 'gerente') return u.role === 'office';
      if (v.status === 'diretoria') return u.role === 'admin' && !api._approvedBy(v, u.id);
      return false;
    },
    /* A diretoria pode decidir direto um pedido que ainda está com o gestor ou com o gerente (pula as etapas) */
    canOverrideVacation(u, v) {
      return !!u && !!v && u.role === 'admin' && u.active !== false && v.userId !== u.id && ['gestor', 'gerente'].includes(v.status) && !api.canReviewVacation(u, v);
    },
    reviewVacation(u, id, action, note) {
      const v = db().vacations.find(x => x.id === id);
      assert(v, 'Solicitação não encontrada.');
      note = String(note || '').trim();
      if (action === 'recusar' && note.length < 3) throw new Error('Explique o motivo da recusa para o colaborador.');
      assert(v.userId !== u.id, 'Ninguém aprova as próprias férias.');
      if (api.canOverrideVacation(u, v)) {
        const skipped = v.status === 'gestor' ? 'gestor' + (api._stageExists('gerente') ? ' e gerente' : '') : 'gerente';
        v.status = action === 'aprovar' ? 'aprovada' : 'recusada';
        v.history.push({ at: D.stamp(), by: u.id, action: (action === 'aprovar' ? 'Aprovada' : 'Recusada') + ' direto pela diretoria (sem a etapa do ' + skipped + ')', note });
      } else if (v.status === 'gestor') {
        const d = P.dept(v.deptId);
        assert(d && d.managerId === u.id && (u.role === 'manager' || u.role === 'admin'), 'Esta solicitação aguarda a aprovação do gestor do departamento.');
        v.status = action === 'aprovar' ? api._nextStage(P.LEVEL.manager, v.deptId) : 'recusada';
        v.history.push({ at: D.stamp(), by: u.id, action: action === 'aprovar' ? 'Aprovada pelo gestor' : 'Recusada pelo gestor', note });
      } else if (v.status === 'gerente') {
        assert(u.role === 'office', 'Esta solicitação aguarda a aprovação do gerente do escritório.');
        v.status = action === 'aprovar' ? 'diretoria' : 'recusada';
        v.history.push({ at: D.stamp(), by: u.id, action: action === 'aprovar' ? 'Aprovada pelo gerente' : 'Recusada pelo gerente', note });
      } else if (v.status === 'diretoria') {
        // Basta um dos diretores
        assert(u.role === 'admin', 'Esta solicitação aguarda a aprovação da diretoria.');
        assert(!api._approvedBy(v, u.id), 'Você já aprovou esta solicitação como gestor. A etapa da diretoria precisa de outro diretor.');
        v.status = action === 'aprovar' ? 'aprovada' : 'recusada';
        v.history.push({ at: D.stamp(), by: u.id, action: action === 'aprovar' ? 'Aprovada pela diretoria' : 'Recusada pela diretoria', note });
      } else throw new Error('Esta solicitação já foi finalizada.');
      P.reindex(); audit(u, 'Férias: ' + v.history[v.history.length - 1].action.toLowerCase(), v.id, (P.user(v.userId) || {}).name + ' · ' + D.fmt(v.start) + ' a ' + D.fmt(v.end)); P.store.save();
      return v;
    },
    cancelVacation(u, id) {
      const v = db().vacations.find(x => x.id === id);
      assert(v && v.userId === u.id && ['gestor', 'gerente', 'diretoria'].includes(v.status), 'Só é possível cancelar solicitações próprias ainda em aprovação.');
      v.status = 'cancelada'; v.history.push({ at: D.stamp(), by: u.id, action: 'Cancelada pelo colaborador', note: '' });
      audit(u, 'Férias canceladas', v.id); P.store.save();
    },
    /* Colegas do mesmo departamento ausentes no mesmo período (aprovadas ou em aprovação) */
    vacationConflicts(v) {
      return (db().vacations || []).filter(x => x.id !== v.id && x.userId !== v.userId && x.deptId === v.deptId && ['gestor', 'gerente', 'diretoria', 'aprovada'].includes(x.status) && !(x.end < v.start || x.start > v.end));
    },

    /* Administração */
    saveDept(u, data) {
      assert(P.isGlobal(u), 'Somente o gerente e a diretoria criam e editam departamentos.');
      let d = data.id && P.dept(data.id);
      if (!d) { d = { id: P.uid('d'), active: true, createdAt: D.iso(P.today()) }; db().departments.push(d); }
      Object.assign(d, { name: data.name, code: data.code, description: data.description || '' });
      if (data.managerId !== undefined) api._assignManager(d, data.managerId);
      P.reindex(); audit(u, data.id ? 'Departamento editado' : 'Departamento criado', d.id, d.name); P.store.save(); return d;
    },
    _assignManager(d, managerId) {
      db().users.filter(x => x.role === 'manager' && x.deptId === d.id && x.id !== managerId).forEach(x => { x.deptId = null; });
      d.managerId = managerId || null;
      if (managerId) {
        const m = P.user(managerId);
        assert(m && m.active !== false && (m.role === 'manager' || m.role === 'admin'), 'O gestor responsável precisa ser um gestor ou um diretor ativo.');
        // Cada pessoa gere um único departamento
        db().departments.filter(o => o.id !== d.id && o.managerId === m.id).forEach(o => { o.managerId = null; });
        m.deptId = d.id;
      }
    },
    /*
     * Altera a função (perfil de acesso) de uma pessoa: funcionário, gestor ou administrador.
     * opts.deptId: departamento (obrigatório para funcionário e gestor)
     * opts.prevManager: se o departamento já tem gestor, o que acontece com ele: 'employee' (vira funcionário do
     *   mesmo departamento) ou 'none' (continua gestor, sem departamento)
     * opts.reason: motivo, registrado no histórico da pessoa e na auditoria
     */
    changeRole(u, userId, newRole, opts = {}) {
      assert(P.isGlobal(u), 'Somente o gerente do escritório e a diretoria alteram funções.');
      const x = P.user(userId);
      assert(x, 'Pessoa não encontrada.');
      assert(x.id !== u.id, 'Você não pode alterar a sua própria função.');
      assert(x.active !== false, 'Esta pessoa está desligada. Readmita antes de alterar a função.');
      assert(P.canChangeRole(u, x), 'Você só altera a função de quem está abaixo de você na hierarquia.');
      assert(P.ROLES[newRole], 'Função inválida.');
      assert(P.assignableRoles(u).includes(newRole), 'Você não pode atribuir a função ' + P.ROLES[newRole] + '.');
      assert(newRole !== x.role, 'A pessoa já tem essa função.');
      if (x.role === 'admin') assert(db().users.some(o => o.role === 'admin' && o.id !== x.id && o.active !== false), 'É preciso manter pelo menos um diretor ativo.');
      const global = newRole === 'admin' || newRole === 'office';
      const led = P.ledDept(x);
      // Promovido a diretor, pode continuar como gestor do departamento que já geria (diretor-gestor)
      const keep = newRole === 'admin' && !!led && !!opts.keepManagement;
      const deptId = keep ? led.id : global ? null : (opts.deptId || x.deptId);
      if (!global) assert(deptId && P.dept(deptId), 'Escolha o departamento.');
      const from = x.role, notes = [];

      // Deixa de ser gestor (ou diretor-gestor): o departamento fica sem gestor
      if (led && !keep && !(newRole === 'manager' && deptId === led.id)) { led.managerId = null; notes.push(led.name + ' ficou sem gestor'); }
      if (keep) notes.push('continua como gestor(a) de ' + led.name);
      if (newRole === 'manager') {
        const d = P.dept(deptId);
        const cur = d.managerId && d.managerId !== x.id ? P.user(d.managerId) : null;
        if (cur) {
          if (opts.prevManager === 'employee') {
            cur.role = 'employee'; cur.deptId = d.id; cur.active = cur.active !== false;
            if (/^Gestor/i.test(cur.title || '')) cur.title = 'Colaborador(a)';
            api._ensureWorker(cur);
            (cur.roleHistory = cur.roleHistory || []).unshift({ at: D.stamp(), by: u.id, from: 'manager', to: 'employee', reason: 'Substituído(a) na gestão de ' + d.name + ' por ' + x.name });
            notes.push(cur.name + ' passou a ser funcionário(a) de ' + d.name);
          } else { cur.deptId = null; notes.push(cur.name + ' continua gestor(a), sem departamento'); }
        }
        d.managerId = x.id;
      }
      if (from === 'employee' && newRole !== 'employee' && x.deptId && x.deptId !== deptId) db().deptHistory.push({ userId: x.id, from: x.deptId, to: deptId, at: D.iso(P.today()) });
      x.role = newRole; x.deptId = deptId;
      if (!global) api._ensureWorker(x);
      // Ninguém aprova as próprias férias: pedidos em uma etapa igual ou abaixo da nova função sobem para a próxima
      const stageLevel = { gestor: 2, gerente: 3, diretoria: 4 };
      (db().vacations || []).filter(v => v.userId === x.id && stageLevel[v.status] && stageLevel[v.status] <= P.LEVEL[newRole] && v.status !== 'diretoria').forEach(v => {
        v.status = api._nextStage(P.LEVEL[newRole], deptId); v.deptId = deptId || v.deptId;
        v.history.push({ at: D.stamp(), by: u.id, action: 'Encaminhada para ' + P.VAC[v.status].short.toLowerCase(), note: 'A pessoa passou a ser ' + P.ROLES[newRole].toLowerCase() });
        notes.push('pedido de férias de ' + D.fmt(v.start) + ' encaminhado para ' + P.VAC[v.status].short.toLowerCase());
      });
      // Se o escritório ficou sem gerente, pedidos que o aguardavam seguem para a diretoria
      if (from === 'office' && !api._stageExists('gerente')) (db().vacations || []).filter(v => v.status === 'gerente').forEach(v => {
        v.status = 'diretoria'; v.history.push({ at: D.stamp(), by: u.id, action: 'Encaminhada à diretoria', note: 'O escritório ficou sem gerente' });
        notes.push('pedido de férias de ' + (P.user(v.userId) || {}).name + ' encaminhado à diretoria');
      });
      const TITLES = { admin: 'Diretoria', office: 'Gerência do escritório', employee: 'Colaborador(a)' };
      if (keep) x.title = 'Diretoria · Gestão de ' + led.name;
      else if (newRole === 'manager' && (!x.title || /^(Colaborador|Funcion|Diretoria|Gerência)/i.test(x.title))) x.title = 'Gestor(a) de ' + (P.dept(deptId) || { name: '—' }).name;
      else if (TITLES[newRole] && (!x.title || /^(Gestor|Diretoria|Administra|Gerência|Colaborador)/i.test(x.title))) x.title = TITLES[newRole];
      (x.roleHistory = x.roleHistory || []).unshift({ at: D.stamp(), by: u.id, from, to: newRole, reason: String(opts.reason || '').trim() });
      P.reindex();
      audit(u, P.LEVEL[newRole] > P.LEVEL[from] ? 'Promoção' : 'Rebaixamento de função', x.id, x.name + ': ' + P.ROLES[from] + ' → ' + P.ROLES[newRole] + (deptId ? ' (' + (P.dept(deptId) || { name: '—' }).name + ')' : '') + (opts.reason ? ' · motivo: ' + opts.reason : '') + (notes.length ? ' · ' + notes.join('; ') : ''));
      P.store.save();
      return { user: x, notes };
    },
    /*
     * Desligamento (demissão): exclusivo da diretoria, vale para qualquer nível, inclusive outros diretores.
     * O histórico (lançamentos, metas, auditoria) é preservado; o acesso é bloqueado.
     */
    dismissImpact(id) {
      const x = P.user(id); if (!x) return null;
      const led = P.ledDept(x);
      const today = D.iso(P.today());
      const vacs = db().vacations || [];
      return {
        dept: led ? led.name : null,
        ownVacations: vacs.filter(v => v.userId === x.id && (['gestor', 'gerente', 'diretoria'].includes(v.status) || (v.status === 'aprovada' && v.start > today))).length,
        waiting: led ? vacs.filter(v => v.status === 'gestor' && v.deptId === led.id && v.userId !== x.id).length
          : x.role === 'office' ? (db().users.some(o => o.role === 'office' && o.id !== x.id && o.active !== false) ? 0 : vacs.filter(v => v.status === 'gerente').length) : 0,
        assignments: db().clientAssignments.filter(a => a.userId === x.id).length,
        tasks: db().tasks.filter(t => t.userId === x.id && t.status === 'pendente').length,
        lastDirector: x.role === 'admin' && !db().users.some(o => o.role === 'admin' && o.id !== x.id && o.active !== false)
      };
    },
    dismissUser(u, id, opts = {}) {
      assert(u.role === 'admin', 'Somente a diretoria pode desligar pessoas.');
      const x = P.user(id);
      assert(x && x.active !== false, 'Pessoa não encontrada ou já desligada.');
      assert(x.id !== u.id, 'Você não pode desligar a si mesmo(a).');
      if (x.role === 'admin') assert(db().users.some(o => o.role === 'admin' && o.id !== x.id && o.active !== false), 'É preciso manter pelo menos um diretor ativo.');
      const reason = String(opts.reason || '').trim();
      assert(reason.length >= 3, 'Informe o motivo do desligamento.');
      const date = opts.date || D.iso(P.today());
      let to = null;
      if (opts.transferTo) {
        to = P.user(opts.transferTo);
        assert(to && to.active !== false && to.id !== x.id && to.deptId === x.deptId && (to.role === 'employee' || to.role === 'manager'), 'Escolha uma pessoa ativa do mesmo departamento para receber a carteira e as tarefas.');
      }
      const notes = [], today = D.iso(P.today());
      // Departamento perde o gestor
      const d = x.deptId && P.dept(x.deptId), led = P.ledDept(x);
      if (led) { led.managerId = null; notes.push(led.name + ' ficou sem gestor'); }
      // Férias da pessoa: em aprovação ou futuras são canceladas
      (db().vacations || []).filter(v => v.userId === x.id && (['gestor', 'gerente', 'diretoria'].includes(v.status) || (v.status === 'aprovada' && v.start > today))).forEach(v => {
        v.status = 'cancelada'; v.history.push({ at: D.stamp(), by: u.id, action: 'Cancelada por desligamento', note: reason });
        notes.push('férias de ' + D.fmt(v.start) + ' canceladas');
      });
      // Carteira e tarefas pendentes: transferidas ou liberadas
      const asg = db().clientAssignments.filter(a => a.userId === x.id);
      if (to) asg.forEach(a => { a.userId = to.id; a.assignedBy = u.id; a.updatedAt = D.stamp(); });
      else db().clientAssignments = db().clientAssignments.filter(a => a.userId !== x.id);
      if (asg.length) notes.push(asg.length + ' empresa(s) da carteira ' + (to ? 'transferida(s) para ' + to.name : 'liberada(s) sem responsável'));
      const tks = db().tasks.filter(t => t.userId === x.id && t.status === 'pendente');
      if (to) tks.forEach(t => { t.userId = to.id; });
      if (tks.length) notes.push(tks.length + ' tarefa(s) pendente(s) ' + (to ? 'transferida(s) para ' + to.name : 'mantida(s) em nome de ' + x.name));
      // Desliga
      x.active = false;
      (x.dismissals = x.dismissals || []).unshift({ at: date, by: u.id, reason, role: x.role, deptId: x.deptId || null, recordedAt: D.stamp() });
      P.reindex();
      // Pedidos de férias que aguardavam esta pessoa sobem de etapa se o cargo ficou vago
      (db().vacations || []).forEach(v => {
        const stuck = (v.status === 'gestor' && !api._stageExists('gestor', v.deptId)) || (v.status === 'gerente' && !api._stageExists('gerente'));
        if (!stuck) return;
        v.status = api._nextStage(v.status === 'gestor' ? 2 : 3, v.deptId);
        v.history.push({ at: D.stamp(), by: u.id, action: 'Encaminhada para ' + P.VAC[v.status].short.toLowerCase(), note: 'Cargo vago após desligamento de ' + x.name });
        notes.push('pedido de férias de ' + (P.user(v.userId) || {}).name + ' encaminhado para ' + P.VAC[v.status].short.toLowerCase());
      });
      audit(u, 'Desligamento', x.id, x.name + ' (' + P.ROLES[x.role] + (d ? ', ' + d.name : '') + ') em ' + D.fmt(date) + ' · motivo: ' + reason + (notes.length ? ' · ' + notes.join('; ') : ''));
      P.store.save();
      return { user: x, notes };
    },
    /* Readmissão: devolve o acesso com a mesma função; um gestor só volta a gerir se o departamento estiver sem gestor */
    readmitUser(u, id) {
      assert(u.role === 'admin', 'Somente a diretoria pode readmitir pessoas.');
      const x = P.user(id);
      assert(x && x.active === false, 'Esta pessoa não está desligada.');
      const notes = [];
      x.active = true;
      if (x.role === 'manager' && x.deptId) {
        const d = P.dept(x.deptId);
        if (d && !d.managerId) { d.managerId = x.id; notes.push('voltou a gerir ' + d.name); }
        else if (d && d.managerId !== x.id) { x.role = 'employee'; notes.push(d.name + ' já tem gestor: readmitido(a) como funcionário(a)'); }
      }
      if (x.role === 'employee' || x.role === 'manager') api._ensureWorker(x);
      (x.dismissals = x.dismissals || []).length && (x.dismissals[0].readmittedAt = D.stamp());
      P.reindex(); audit(u, 'Readmissão', x.id, x.name + (notes.length ? ' · ' + notes.join('; ') : '')); P.store.save();
      return { user: x, notes };
    },
    /* Perfil próprio: cada pessoa altera o próprio nome de exibição e a foto */
    updateProfile(u, data) {
      const me = P.user(u.id);
      assert(me && me.active !== false, 'Usuário não encontrado.');
      const changes = [];
      if (data.name !== undefined) {
        const name = String(data.name || '').trim().replace(/\s+/g, ' ');
        assert(name.length >= 3, 'Informe um nome com pelo menos 3 letras.');
        assert(name.length <= 80, 'O nome pode ter no máximo 80 caracteres.');
        if (name !== me.name) { changes.push('nome: ' + me.name + ' → ' + name); me.name = name; }
      }
      if (data.photo !== undefined) {
        if (data.photo) {
          assert(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(data.photo), 'Formato de imagem não aceito. Use JPG, PNG ou WEBP.');
          assert(data.photo.length <= 400000, 'A imagem ficou grande demais. Tente outra foto.');
          me.photo = data.photo; changes.push('foto atualizada');
          // original reduzida + enquadramento: permitem reajustar depois sem enviar a foto de novo
          if (data.photoOrig) {
            assert(/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(data.photoOrig) && data.photoOrig.length <= 900000, 'A imagem original ficou grande demais.');
            me.photoOrig = data.photoOrig;
          }
          if (data.photoCrop) me.photoCrop = { zoom: +data.photoCrop.zoom || 1, rot: +data.photoCrop.rot || 0, x: +data.photoCrop.x || 0, y: +data.photoCrop.y || 0 };
        } else if (me.photo) { delete me.photo; delete me.photoOrig; delete me.photoCrop; changes.push('foto removida'); }
      }
      if (!changes.length) return me;
      P.reindex(); audit(u, 'Perfil atualizado', me.id, changes.join('; ')); P.store.save();
      return me;
    },
    /* Garante capacidade, jornada e metas para quem passa a ter produção (funcionário ou gestor) */
    _ensureWorker(x) {
      if (!(x.capacity > 0)) x.capacity = db().settings.defaultCapacity || 32;
      if (!(x.weeklyGoal > 0)) x.weeklyGoal = Math.round(x.capacity * 0.94);
      if (!(x.hours > 0)) x.hours = 40;
      if (!db().goals.some(g => g.scope === 'employee' && g.refId === x.id && g.period === 'semanal')) db().goals.push({ id: P.uid('g'), scope: 'employee', refId: x.id, period: 'semanal', target: x.weeklyGoal });
      if (!db().goals.some(g => g.scope === 'employee' && g.refId === x.id && g.period === 'mensal')) db().goals.push({ id: P.uid('g'), scope: 'employee', refId: x.id, period: 'mensal', target: x.capacity * 4 });
    },
    /*
     * Cadastro de pessoas seguindo a hierarquia: o gestor cria e edita funcionários do próprio departamento;
     * o gerente, gestores e funcionários; a diretoria, todos abaixo dela (e pode cadastrar novos diretores).
     */
    saveUser(u, data) {
      assert(P.isGlobal(u) || u.role === 'manager', 'Você não tem permissão para gerenciar usuários.');
      const email = String(data.email || '').trim().toLowerCase();
      // perfis desligados não bloqueiam o e-mail (a pessoa pode voltar com um acesso novo)
      assert(email && !db().users.some(x => x.email === email && x.id !== data.id && x.active !== false), 'Já existe um usuário ativo com este e-mail.');
      let x = data.id && P.user(data.id);
      const isNew = !x;
      if (isNew) {
        assert(P.assignableRoles(u).includes(data.role) || (u.role === 'manager' && data.role === 'employee'), 'Você não pode cadastrar uma pessoa com a função ' + (P.ROLES[data.role] || data.role) + '.');
        if (u.role === 'manager') data.deptId = u.deptId; // o gestor só cadastra no próprio departamento
      } else {
        assert(P.canManageUser(u, x), 'Você só altera os dados de quem está abaixo de você na hierarquia.');
        if (u.role === 'manager') data.deptId = u.deptId;
      }
      if (!x) { x = { id: P.uid('u'), password: 'demo123', active: true, role: data.role, createdAt: D.iso(P.today()) }; db().users.push(x); }
      const prevDept = x.deptId;
      Object.assign(x, { name: data.name, email, title: data.title || x.title || '', deptId: data.deptId || null });
      // data de contratação: base dos avos da PLR
      if (data.hiredAt !== undefined && data.hiredAt !== (x.hiredAt || '')) { assert(!data.hiredAt || data.hiredAt <= D.iso(P.today()), 'A data de contratação não pode estar no futuro.'); if (data.hiredAt) x.hiredAt = data.hiredAt; else delete x.hiredAt; }
      if (x.role === 'employee' || x.role === 'manager') {
        x.capacity = Number(data.capacity) || x.capacity || db().settings.defaultCapacity;
        x.weeklyGoal = Number(data.weeklyGoal) || x.weeklyGoal || Math.round(x.capacity * 0.94);
        x.hours = Number(data.hours) || x.hours || 40;
        // Quem foi desligado só volta pela readmissão (diretoria), não pela caixa "Ativo" do cadastro
        const dismissed = x.active === false && (x.dismissals || []).length && !x.dismissals[0].readmittedAt;
        if (x.role === 'employee' && !dismissed) x.active = data.active !== false;
        // permissão de abrir OS: só diretoria, gerência ou o gestor do departamento (mesma regra do cadastro)
        if (x.role === 'employee' && data.canOS !== undefined && !!data.canOS !== !!x.canOS) { x.canOS = !!data.canOS; audit(u, x.canOS ? 'Abertura de OS habilitada' : 'Abertura de OS desabilitada', x.id, x.name); }
        if (isNew) {
          db().goals.push({ id: P.uid('g'), scope: 'employee', refId: x.id, period: 'semanal', target: x.weeklyGoal });
          db().goals.push({ id: P.uid('g'), scope: 'employee', refId: x.id, period: 'mensal', target: x.capacity * 4 });
        }
        if (x.role === 'employee' && prevDept && prevDept !== x.deptId) db().deptHistory.push({ userId: x.id, from: prevDept, to: x.deptId, at: D.iso(P.today()) });
      }
      if (x.role === 'manager' && data.deptId) api._assignManager(P.dept(data.deptId), x.id);
      P.reindex(); audit(u, isNew ? 'Usuário criado' : 'Usuário editado', x.id, x.name + ' (' + P.ROLES[x.role] + ')'); P.store.save(); return x;
    },
    /* Pesos: o gestor altera os do próprio departamento; gerente e diretoria, de todos */
    _canEditActivities(u, deptId) { return P.isGlobal(u) || (u.role === 'manager' && deptId === u.deptId); },
    saveActivity(u, data) {
      const cur = data.id && P.act(data.id);
      assert(api._canEditActivities(u, data.deptId) && (!cur || api._canEditActivities(u, cur.deptId)), 'Você só altera os pesos das atividades do seu departamento.');
      let a = data.id && P.act(data.id);
      const weight = Number(String(data.weight).replace(',', '.'));
      assert(weight > 0, 'Informe um peso maior que zero.');
      if (!a) {
        a = { id: P.uid('ac'), active: true, deptId: data.deptId, name: data.name, unit: data.unit, weight, createdAt: D.iso(P.today()) };
        db().activities.push(a);
        db().weightHistory.unshift({ id: P.uid('w'), activityId: a.id, from: null, to: weight, at: D.iso(P.today()), by: u.id, reason: data.reason || 'Atividade criada' });
        audit(u, 'Atividade criada', a.id, a.name);
      } else {
        if (weight !== a.weight) {
          assert((data.reason || '').trim().length >= 5, 'Descreva o motivo da alteração do peso (mínimo 5 caracteres).');
          db().weightHistory.unshift({ id: P.uid('w'), activityId: a.id, from: a.weight, to: weight, at: D.iso(P.today()), by: u.id, reason: data.reason.trim() });
        }
        Object.assign(a, { name: data.name, unit: data.unit, weight, deptId: data.deptId });
        audit(u, 'Atividade editada', a.id, a.name);
      }
      P.reindex(); P.store.save(); return a;
    },
    toggleActivity(u, id) {
      const a = P.act(id);
      assert(a && api._canEditActivities(u, a.deptId), 'Você só altera as atividades do seu departamento.'); a.active = !a.active; audit(u, a.active ? 'Atividade ativada' : 'Atividade desativada', a.id, a.name); P.store.save();
    },
    deleteActivity(u, id) {
      assert(api._canEditActivities(u, (P.act(id) || {}).deptId), 'Você só altera as atividades do seu departamento.');
      const used = db().entries.some(e => e.activityId === id);
      assert(!used, 'Esta atividade possui lançamentos. Desative-a para preservar o histórico.');
      const a = P.act(id);
      db().activities = db().activities.filter(x => x.id !== id);
      P.reindex(); audit(u, 'Atividade excluída', id, a ? a.name : ''); P.store.save();
    },
    saveSettings(u, s) {
      assert(P.isGlobal(u), 'Somente o gerente e a diretoria alteram configurações gerais.');
      Object.assign(db().settings, s); audit(u, 'Configurações gerais alteradas', 'settings', JSON.stringify(s)); P.store.save();
    }
  };

  /* ---------- Reconhecimento e destaques ---------- */
  /*
   * Melhores do período (mês atual, mês anterior ou ano), sempre comparando pessoas do MESMO departamento
   * (os pesos são calibrados por departamento). Quem consulta não entra na própria lista.
   * Mínimo de dados: no mês, 10 dias úteis trabalhados e 20 lançamentos; no ano, 60 dias e 100 lançamentos.
   * Notas a menos de HL_TIE pontos do primeiro do grupo contam como empate.
   */
  P.HL_TIE = 2.5;
  P.HL_MIN = { mes_ant: { days: 10, entries: 20 }, mes: { days: 10, entries: 20 }, ano: { days: 60, entries: 100 } };
  P.highlights = function (u, deptId, key) {
    const t = P.today(), p = P.period(key);
    let prev = null;
    if (key === 'mes_ant') { const ms = D.addMonths(p.start, -1); prev = P.range(ms, D.monthEnd(ms)); }
    else if (key === 'mes') { const ms = D.addMonths(t, -1); prev = P.range(ms, D.min(D.add(ms, t.getDate() - 1), D.monthEnd(ms))); }
    const all = api.workers(u, deptId).filter(e => e.id !== u.id).map(e => Object.assign(M.merit(e, p, prev, P.HL_MIN[key] || P.HL_MIN.mes), { deptId: e.deptId }));
    const rows = all.filter(r => r.eligible).sort((a, b) => b.score - a.score || b.points - a.points);
    let lead = null, pos = 0;
    rows.forEach((r, i) => { if (!lead || lead.score - r.score >= P.HL_TIE) { lead = r; pos = i + 1; } r.pos = pos; });
    rows.forEach(r => { r.tie = rows.filter(o => o.pos === r.pos).length > 1; });
    rows.excluded = all.filter(r => !r.eligible);
    rows.period = p;
    return rows;
  };
  /* Um bloco por departamento (nunca um ranking misturado) */
  P.highlightsByDept = function (u, key, deptId) {
    const depts = deptId ? [api.department(u, deptId)] : api.departments(u);
    return depts.map(d => ({ dept: d, rows: P.highlights(u, d.id, key) })).filter(b => b.rows.length || b.rows.excluded.length);
  };
  /* Reconhecimento por categoria: mais de um caminho para ser reconhecido */
  P.REC_CATEGORIES = { constancia: 'Constância', qualidade: 'Qualidade', prazos: 'Prazos', evolucao: 'Evolução', colaboracao: 'Colaboração', iniciativa: 'Iniciativa', cliente: 'Atendimento ao cliente', outro: 'Outro' };
  P.categoryLeaders = function (rows, deptId, period) {
    const best = (list, val) => { const v = list.map(val).filter(x => x != null); if (!v.length) return []; const m = Math.max(...v); return list.filter(r => val(r) === m).slice(0, 3).map(r => ({ user: r.user, value: m })); };
    const out = [];
    const c = best(rows.filter(r => r.weeks >= 2 && r.constancy >= 50), r => r.constancy);
    if (c.length) out.push({ key: 'constancia', people: c, text: F.pct0(c[0].value) + ' das semanas na faixa saudável' });
    const q = best(rows.filter(r => r.reviewed >= 20), r => r.quality == null ? null : Math.round(r.quality));
    if (q.length) out.push({ key: 'qualidade', people: q, text: q[0].value + '% aprovados sem correção' });
    const pz = best(rows.filter(r => r.tasks >= 5), r => r.onTime == null ? null : Math.round(r.onTime));
    if (pz.length) out.push({ key: 'prazos', people: pz, text: pz[0].value + '% das tarefas no prazo' });
    const ev = best(rows.filter(r => r.growth != null && r.growth >= 3), r => Math.round(r.growth));
    if (ev.length) out.push({ key: 'evolucao', people: ev, text: '+' + ev[0].value + ' p.p. de utilização' });
    // Colaboração e iniciativa não aparecem nos números: vêm das indicações dos gestores no período
    const recs = (db().recognitions || []).filter(r => r.deptId === deptId && r.date >= period.s && r.date <= period.e);
    for (const k of ['colaboracao', 'iniciativa', 'cliente']) {
      const cnt = {}; recs.filter(r => r.category === k).forEach(r => { cnt[r.userId] = (cnt[r.userId] || 0) + 1; });
      const ids = Object.keys(cnt); if (!ids.length) continue;
      const m = Math.max(...ids.map(i => cnt[i]));
      out.push({ key: k, people: ids.filter(i => cnt[i] === m).slice(0, 3).map(i => ({ user: P.user(i), value: m })), text: m + ' indicaç' + (m > 1 ? 'ões' : 'ão') + ' de gestores' });
    }
    return out;
  };

  /* Indicações de reconhecimento: o número sugere, o gestor decide e justifica */
  Object.assign(api, {
    canRecognize(u, x) {
      // qualquer pessoa ativa reconhece qualquer colega ativo (menos a si mesma)
      return !!u && !!x && u.active !== false && x.active !== false && x.id !== u.id;
    },
    recognitions(u, f = {}) {
      let list = (db().recognitions || []).slice();
      if (u.role === 'employee') list = list.filter(r => r.userId === u.id && r.visible);
      else if (!P.isGlobal(u)) list = list.filter(r => r.deptId === u.deptId);
      if (f.deptId) list = list.filter(r => r.deptId === f.deptId);
      if (f.userId) list = list.filter(r => r.userId === f.userId);
      return list.sort((a, b) => a.at < b.at ? 1 : -1);
    },
    addRecognition(u, data) {
      const x = P.user(data.userId);
      assert(api.canRecognize(u, x), 'Escolha um colega ativo (não é possível reconhecer a si mesmo).');
      assert(P.REC_CATEGORIES[data.category], 'Escolha a categoria do reconhecimento.');
      const text = String(data.text || '').trim();
      assert(text.length >= 15, 'Escreva uma justificativa com pelo menos 15 caracteres: o que a pessoa fez e por que importa.');
      // Compartilhar com a equipe implica mostrar também ao próprio colaborador
      const shared = !!data.shared;
      // reconhecimento entre colegas é sempre mostrado a quem recebe
      if (u.role === 'employee') data.visible = true;
      const r = { id: P.uid('rc'), userId: x.id, deptId: x.deptId, by: u.id, at: D.stamp(), date: D.iso(P.today()), category: data.category, text, visible: shared || data.visible !== false, shared, source: data.source || 'manual' };
      (db().recognitions = db().recognitions || []).push(r);
      audit(u, 'Reconhecimento registrado', x.id, x.name + ' · ' + P.REC_CATEGORIES[r.category] + (shared ? ' · compartilhado no mural' : '')); P.store.save();
      return r;
    },
    /* Liga ou desliga o compartilhamento no mural (quem registrou, ou gerente e diretoria) */
    shareRecognition(u, id, shared) {
      const r = (db().recognitions || []).find(x => x.id === id);
      assert(r && (r.by === u.id || P.isGlobal(u)), 'Só quem registrou (ou o gerente e a diretoria) pode alterar este reconhecimento.');
      r.shared = !!shared; if (r.shared) r.visible = true;
      audit(u, r.shared ? 'Reconhecimento compartilhado no mural' : 'Reconhecimento retirado do mural', r.userId, (P.user(r.userId) || {}).name || ''); P.store.save();
      return r;
    },
    /*
     * Mural da equipe: só reconhecimentos que o gestor escolheu compartilhar. Mostra pessoa, categoria e mensagem;
     * nunca notas, ranking ou números de desempenho. Cada pessoa vê o mural do próprio departamento; gerente e diretoria, todos.
     */
    teamWall(u, deptId) {
      let list = (db().recognitions || []).filter(r => r.shared && P.user(r.userId) && P.user(r.userId).active !== false);
      if (!P.isGlobal(u)) list = list.filter(r => r.deptId === u.deptId);
      else if (deptId) list = list.filter(r => r.deptId === deptId);
      return list.sort((a, b) => a.at < b.at ? 1 : -1).map(r => ({ id: r.id, userId: r.userId, deptId: r.deptId, by: r.by, date: r.date, category: r.category, text: r.text }));
    },
    removeRecognition(u, id) {
      const r = (db().recognitions || []).find(x => x.id === id);
      assert(r && (r.by === u.id || P.isGlobal(u)), 'Só quem registrou (ou o gerente e a diretoria) pode remover este reconhecimento.');
      db().recognitions = db().recognitions.filter(x => x.id !== id);
      audit(u, 'Reconhecimento removido', r.userId, (P.user(r.userId) || {}).name || ''); P.store.save();
    }
  });
  /* Por que reconhecer alguém agora: crescente, constância, qualidade, prazos. Retorna um insight ou null. */
  P.recognition = function (e, overloaded) {
    const s = db().settings, t = P.today(), fn = e.name;
    const months = [3, 2, 1].map(i => { const ms = D.addMonths(t, -i); return M.merit(e, P.range(ms, D.monthEnd(ms))); });
    const m60 = M.merit(e, P.range(D.add(t, -59), t));
    const ws = M.weekly([e], 8, false).filter(w => w.util != null);
    const healthy = ws.filter(w => w.util >= s.lowThreshold && w.util <= s.highThreshold).length;
    const reasons = [];
    const u3 = months.map(m => m.util);
    // Crescente: utilização subindo mês a mês (sem recuo relevante), pelo menos 8 p.p. em 3 meses, chegando à faixa saudável
    if (!overloaded && months.every(m => m.eligible) && u3[1] >= u3[0] - 2 && u3[2] > u3[1] && u3[2] - u3[0] >= 8 && u3[2] >= s.lowThreshold && (m60.quality == null || m60.quality >= 90)) {
      reasons.push({ score: 59, cat: 'evolucao', title: 'Desempenho em crescente',
        text: `${fn} vem em uma crescente de desempenho nos últimos 3 meses: utilização de ${u3.map(x => F.pct0(x)).join(' → ')}.` });
    }
    if (!overloaded && ws.length >= 8 && healthy >= 8 && m60.quality != null && m60.quality >= 97) {
      reasons.push({ score: 56, cat: 'constancia', title: 'Entrega constante e equilibrada',
        text: `${fn} ficou na faixa saudável em ${healthy} das últimas ${ws.length} semanas, com ${F.pct0(m60.quality)} dos lançamentos aprovados sem correção.` });
    }
    if (m60.reviewed >= 40 && m60.rework === 0 && m60.util != null && m60.util >= 85 && m60.util <= s.highThreshold) {
      reasons.push({ score: 54, cat: 'qualidade', title: 'Qualidade exemplar',
        text: `Nos últimos 60 dias, todos os ${m60.reviewed} lançamentos de ${fn} foram aprovados de primeira, sem correção nem recusa.` });
    }
    if (!reasons.length) return null;
    const extra = [];
    if (reasons.length > 1) extra.push(...reasons.slice(1).map(r => r.title.toLowerCase()));
    if (m60.tasks >= 5 && m60.onTime >= 95) extra.push(F.pct0(m60.onTime) + ' das tarefas entregues no prazo');
    const r = reasons[0];
    return { score: r.score, title: r.title, cat: r.cat, recText: r.text,
      text: `${r.text}${extra.length ? ' Também se destaca em: ' + extra.join('; ') + '.' : ''} Pode ser reconhecido(a) com um feedback direto ou uma menção na reunião de equipe.` };
  };

  /* ---------- Insights ---------- */
  P.insights = function (u, deptId) {
    const out = [];
    const s = db().settings;
    const depts = deptId ? [api.department(u, deptId)] : api.departments(u);
    const t = P.today();
    const last30 = P.range(D.add(t, -29), t), prev30 = P.range(D.add(t, -59), D.add(t, -30));

    for (const d of depts) {
      const emps = api.workers(u, d.id);
      if (!emps.length) continue;
      const tag = depts.length > 1 ? d.name : null;

      for (const e of emps) {
        const ws = M.weekly([e], 9, false);
        const last4 = ws.slice(-4).reduce((a, w) => a + w.points, 0);
        const prev4 = ws.slice(-8, -4).reduce((a, w) => a + w.points, 0);
        const ch = prev4 ? (last4 - prev4) / prev4 * 100 : 0;
        const st = M.overloadStreak(e);
        const avgUtil = ws.slice(-4).reduce((a, w) => a + (w.util || 0), 0) / 4;
        const cur = M.stats(e, P.period('semana'));
        const fn = e.name;

        if (st.streak >= s.recurringWeeks) {
          out.push({ level: 'crit', kind: 'sobrecarga', dept: tag, emp: e.id, score: 100 + st.streak,
            title: 'Possível sobrecarga recorrente',
            text: `${fn} está utilizando ${F.pct(st.last.util)} da capacidade semanal pelo ${ordinal(st.streak)} período consecutivo. Avaliar redistribuição de atividades.` });
        }
        if (cur.points > e.capacity) {
          out.push({ level: 'warn', kind: 'acima', dept: tag, emp: e.id, score: 80,
            title: 'Acima da capacidade nesta semana',
            text: `${fn} realizou ${F.n(cur.points)} pontos nesta semana, acima da capacidade de referência de ${F.n(e.capacity)} pontos.` });
        }
        if (avgUtil < s.lowThreshold) {
          out.push({ level: 'info', kind: 'capacidade', dept: tag, emp: e.id, score: 60,
            title: 'Capacidade disponível',
            text: `${fn} possui utilização média de ${F.pct(avgUtil)} nas últimas 4 semanas, indicando possível capacidade disponível ou carteira de atividades leve.` });
        }
        if (ch >= 10) {
          out.push({ level: 'pos', kind: 'evolucao', dept: tag, emp: e.id, score: 40 + ch,
            title: 'Evolução de produção',
            text: `${fn} aumentou sua produção em ${F.pct(ch)} nas últimas 4 semanas em relação às 4 semanas anteriores.` });
        } else if (ch <= -15) {
          out.push({ level: 'info', kind: 'queda', dept: tag, emp: e.id, score: 45,
            title: 'Redução de produção',
            text: `${fn} reduziu a produção em ${F.pct(Math.abs(ch))} nas últimas 4 semanas. Vale verificar mudanças de carteira, férias ou bloqueios de processo.` });
        }
        // Reconhecimento: nunca para quem o próprio leitor é (gestor não se reconhece) nem para quem está em sobrecarga recorrente
        if (e.id !== u.id) { const rec = P.recognition(e, st.streak >= s.recurringWeeks); if (rec) out.push(Object.assign({ level: 'rec', kind: 'reconhecimento', dept: tag, emp: e.id }, rec)); }
      }
      // Destaque do mês anterior no departamento (substitui outra sugestão de reconhecimento da mesma pessoa)
      if (emps.length >= 3) {
        const mes = D.monthLabel(P.period('mes_ant').start, true);
        const tops = P.highlights(u, d.id, 'mes_ant').filter(r => r.pos === 1 && r.score >= 80);
        tops.forEach(top => {
          const dup = out.findIndex(i => i.level === 'rec' && i.emp === top.user.id);
          if (dup >= 0) out.splice(dup, 1);
          const over = top.util != null && top.util > s.highThreshold;
          const others = tops.filter(o => o !== top).map(o => o.user.name);
          const base = `${top.user.name} ${others.length ? 'ficou empatado(a) no topo do departamento com ' + others.join(' e ') : 'teve o melhor desempenho do departamento'} no mês passado (nota ${F.n(top.score, 0)}): ${F.pct0(top.util || 0)} da capacidade${top.quality != null ? ', ' + F.pct0(top.quality) + ' dos lançamentos aprovados sem correção' : ''}${top.onTime != null ? ' e ' + F.pct0(top.onTime) + ' das tarefas no prazo' : ''}.`;
          out.push({ level: 'rec', kind: 'destaque', dept: tag, emp: top.user.id, score: 58, cat: 'outro', recText: 'Destaque de ' + mes + ' em ' + d.name + '. ' + base,
            title: 'Destaque de ' + mes + ' em ' + d.name,
            text: `${base} Vale um reconhecimento.${over ? ' Como ficou acima da capacidade, vale também conversar sobre a carga.' : ''}` });
        });
      }

      // Nível departamento
      const a = M.team(emps, last30), b = M.team(emps, prev30);
      if (b.points) {
        const ch = (a.points - b.points) / b.points * 100;
        if (Math.abs(ch) >= 3) out.push({ level: ch > 0 ? 'pos' : 'info', kind: 'departamento', dept: tag, score: 70,
          title: 'Produção do departamento',
          text: `O departamento ${d.name} ${ch > 0 ? 'aumentou' : 'reduziu'} a produção em ${F.pct(Math.abs(ch))} nos últimos 30 dias em relação aos 30 dias anteriores (${F.n(a.points)} × ${F.n(b.points)} pontos).` });
      }
      const ba = M.byActivity(emps, last30);
      if (ba.rows.length >= 4) {
        const top3 = ba.rows.slice(0, 3), share = top3.reduce((x, r) => x + r.share, 0);
        out.push({ level: 'info', kind: 'concentracao', dept: tag, score: 50,
          title: 'Concentração de esforço',
          text: `${F.pct0(share)} dos pontos da equipe estão concentrados em 3 tipos de atividade: ${top3.map(r => r.act.name).join(', ')}.` });
        const r0 = ba.rows[0];
        const perUnit = r0.qty ? r0.points / r0.qty : 0;
        out.push({ level: 'info', kind: 'esforco', dept: tag, score: 48,
          title: 'Atividade que mais consome esforço',
          text: `"${r0.act.name}" respondeu por ${F.n(r0.points)} pontos (${F.pct0(r0.share)}) nos últimos 30 dias, com peso de ${F.n(perUnit, 2)} por ${r0.act.unit}. É candidata a revisão de processo ou automação.` });
      }
      const cur = M.team(emps, P.period('semana'));
      const over = cur.rows.filter(r => r.status === 'sobrecarga').sort((x, y) => y.util - x.util);
      const low = cur.rows.filter(r => r.status === 'baixa').sort((x, y) => x.util - y.util);
      if (over.length && low.length) {
        const top = M.byActivity([over[0].user], last30).rows[0];
        out.push({ level: 'warn', kind: 'redistribuir', dept: tag, score: 90,
          title: 'Oportunidade de redistribuição',
          text: `${over[0].user.name} está em ${F.pct0(over[0].util)} da capacidade enquanto ${low[0].user.name} está em ${F.pct0(low[0].util)}. Considere transferir parte de "${top ? top.act.name : 'atividades recorrentes'}" para equilibrar a carga.` });
      }
      const pendOld = db().entries.filter(x => x.deptId === d.id && x.status === 'pendente' && x.date <= D.iso(D.add(t, -3))).length;
      if (pendOld) out.push({ level: 'warn', kind: 'aprovacao', dept: tag, score: 65,
        title: 'Aprovações em atraso',
        text: `${pendOld} lançamento${pendOld > 1 ? 's aguardam' : ' aguarda'} aprovação há mais de 3 dias no ${d.name}. Pontos pendentes podem distorcer a leitura de capacidade.` });
    }

    if (P.isGlobal(u) && !deptId && depts.length > 1) {
      const rows = depts.map(d => ({ d, tm: M.team(api.workers(u, d.id), P.period('mes')) })).filter(r => r.tm.util != null);
      rows.sort((a, b) => b.tm.util - a.tm.util);
      if (rows.length > 1) {
        const hi = rows[0], lo = rows[rows.length - 1];
        out.push({ level: hi.tm.util > s.highThreshold ? 'warn' : 'info', kind: 'comparativo', dept: null, score: 75,
          title: 'Demanda entre departamentos',
          text: `${hi.d.name} tem a maior utilização média do mês (${F.pct(hi.tm.util)}); ${lo.d.name} tem a menor (${F.pct(lo.tm.util)}). A diferença indica onde a demanda está mais pressionada.` });
      }
    }
    return out.sort((a, b) => b.score - a.score);
  };
  function ordinal(n) { return ['', 'primeiro', 'segundo', 'terceiro', 'quarto', 'quinto', 'sexto', 'sétimo', 'oitavo'][n] || n + 'º'; }

  /* ---------- Alertas ---------- */
  P.alerts = function (u) {
    const out = [];
    const s = db().settings, t = P.today();
    const week = P.period('semana');
    const lastWeek = P.period('semana_ant');
    const emps = u.role === 'employee' ? [u] : api.workers(u);
    const recentIso = (() => { let x = t, k = 0; while (k < s.inactivityDays) { x = D.add(x, -1); if (D.isWorkday(x)) k++; } return D.iso(x); })();

    for (const e of emps) {
      const cur = M.stats(e, week);
      const st = M.overloadStreak(e);
      const prev = M.stats(e, lastWeek);
      const who = u.role === 'employee' ? 'Você' : e.name;
      // Sinais de carga (sobrecarga e baixa utilização) são só para gestores, gerente e diretoria
      const seesLoad = u.role !== 'employee';
      if (seesLoad && (cur.util > s.highThreshold || st.streak >= s.recurringWeeks)) {
        out.push({ id: 'over-' + e.id + '-' + week.s, color: 'red', emp: e.id, date: week.s,
          title: st.streak >= s.recurringWeeks ? 'Sobrecarga recorrente' : 'Acima de 100% da capacidade',
          text: st.streak >= s.recurringWeeks
            ? `${who} ${u.role === 'employee' ? 'ficou' : 'ficou'} acima da capacidade por ${st.streak} semanas seguidas. Avaliar redistribuição de atividades.`
            : `${who} ${u.role === 'employee' ? 'está' : 'está'} em ${F.pct(cur.util)} da capacidade nesta semana.` });
      }
      if (seesLoad && prev.util != null && prev.util < s.lowThreshold) {
        out.push({ id: 'low-' + e.id + '-' + lastWeek.s, color: 'yellow', emp: e.id, date: lastWeek.s,
          title: 'Abaixo de ' + s.lowThreshold + '% da capacidade',
          text: `${who} fechou a semana anterior com ${F.pct(prev.util)} de utilização. Há capacidade disponível para novas atividades.` });
      }
      const lastEntry = (P.idx.byUser.get(e.id) || []).slice(-1)[0];
      if ((!lastEntry || lastEntry.date < recentIso) && !P.onVacation(e.id, D.iso(t))) {
        out.push({ id: 'idle-' + e.id + '-' + D.iso(t), color: 'blue', emp: e.id, date: D.iso(t),
          title: 'Sem lançamentos recentes',
          text: `${who} não ${u.role === 'employee' ? 'registra' : 'registra'} atividades há mais de ${s.inactivityDays} dias úteis${lastEntry ? ' (último em ' + D.fmt(lastEntry.date) + ')' : ''}.` });
      }
      const g = db().goals.find(x => x.scope === 'employee' && x.refId === e.id && x.period === 'semanal');
      if (g && prev.points >= g.target) {
        out.push({ id: 'goal-' + e.id + '-' + lastWeek.s, color: 'green', emp: e.id, date: lastWeek.s,
          title: 'Meta semanal atingida',
          text: `${who} ${u.role === 'employee' ? 'atingiu' : 'atingiu'} ${F.n(prev.points)} de ${F.n(g.target)} pontos na semana anterior.` });
      }
    }
    if (u.role === 'employee') {
      // Reconhecimentos recebidos (só os marcados como visíveis ao colaborador), nos últimos 30 dias
      api.recognitions(u).filter(r => r.date >= D.iso(D.add(t, -30))).forEach(r => out.push({ id: 'rec-' + r.id, color: 'green', date: r.date, link: 'dashboard',
        title: 'Você recebeu um reconhecimento', text: P.REC_CATEGORIES[r.category] + ' · ' + ((P.user(r.by) || {}).name || 'Gestão') + ': ' + r.text }));
      const corr = (P.idx.byUser.get(u.id) || []).filter(e => e.status === 'correcao');
      if (corr.length) out.push({ id: 'corr-' + corr.map(c => c.id).join('.'), color: 'orange', date: corr[0].date, link: 'lancamentos',
        title: 'Correção solicitada', text: `${corr.length} lançamento${corr.length > 1 ? 's precisam' : ' precisa'} de ajuste antes da aprovação.` });
    } else {
      for (const d of api.departments(u)) {
        const n = db().entries.filter(e => e.deptId === d.id && e.status === 'pendente').length;
        if (n) out.push({ id: 'pend-' + d.id + '-' + n, color: 'orange', date: D.iso(t), link: 'lancamentos',
          title: 'Lançamentos pendentes de aprovação', text: `${n} lançamento${n > 1 ? 's' : ''} do ${d.name} aguardando aprovação.` });
      }
    }
    const vacs = db().vacations || [];
    const led = P.ledDept(u);
    if (led) {
      const n = vacs.filter(v => v.deptId === led.id && v.status === 'gestor' && v.userId !== u.id).length;
      if (n) out.push({ id: 'vac-g-' + led.id + '-' + n, color: 'orange', date: D.iso(t), link: 'ferias', title: 'Férias aguardando sua aprovação', text: `${n} solicitaç${n > 1 ? 'ões' : 'ão'} de férias da equipe aguardando o gestor.` });
    }
    if (u.role === 'office') {
      const n = vacs.filter(v => v.status === 'gerente' && v.userId !== u.id).length;
      if (n) out.push({ id: 'vac-o-' + n, color: 'orange', date: D.iso(t), link: 'ferias', title: 'Férias aguardando o gerente', text: `${n} solicitaç${n > 1 ? 'ões' : 'ão'} de férias aprovada${n > 1 ? 's' : ''} pelos gestores aguardando a sua decisão.` });
    }
    if (u.role === 'admin') {
      const n = vacs.filter(v => v.status === 'diretoria' && api.canReviewVacation(u, v)).length;
      if (n) out.push({ id: 'vac-d-' + n, color: 'orange', date: D.iso(t), link: 'ferias', title: 'Férias aguardando a diretoria', text: `${n} solicitaç${n > 1 ? 'ões' : 'ão'} de férias aguardando a decisão final.` });
    }
    {
      vacs.filter(v => v.userId === u.id && ((v.status === 'aprovada' && v.start > D.iso(t)) || v.status === 'recusada')).forEach(v => {
        out.push({ id: 'vac-' + v.id + '-' + v.status, color: v.status === 'aprovada' ? 'green' : 'red', date: (v.history[v.history.length - 1].at || '').slice(0, 10) || D.iso(t), link: 'ferias',
          title: v.status === 'aprovada' ? 'Férias aprovadas' : 'Férias recusadas', text: `Período de ${D.fmt(v.start)} a ${D.fmt(v.end)}${v.status === 'recusada' ? '. Veja o motivo na página de férias.' : ' confirmado pela diretoria.'}` });
      });
    }
    const order = { red: 0, orange: 1, yellow: 2, blue: 3, green: 4 };
    const read = new Set(db().alertsRead[u.id] || []);
    out.forEach(a => { a.read = read.has(a.id); });
    return out.sort((a, b) => order[a.color] - order[b.color]);
  };

})(window.P);
