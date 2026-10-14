/*
 * Prumo — Solicitações de compra
 *
 * Quem abre: o gerente do escritório e quem é de departamento de apoio (ex.: Apoio ao Escritório).
 * Quem aprova ou recusa: somente a diretoria (nunca a própria solicitação).
 * Fluxo: solicitada → aprovada/recusada → comprada (gerência/diretoria registram o valor real e a despesa
 * entra sozinha no Financeiro, categoria Material) → entregue. Quem pediu pode cancelar antes da decisão.
 * As mesmas regras valem no banco (gatilho guard_purchase_requests).
 * Também define a página inicial de quem é de departamento de apoio (V.supportHome), sem indicadores de produção.
 */
'use strict';
(function (P) {
  const D = P.date, esc = P.esc, V = P.V, icon = V.icon;
  const A = P.ext.actions;
  const db = () => P.store.db;
  const S = () => P.state;
  const U = () => S().user;
  const $ = (s, r = document) => r.querySelector(s);
  const deny = m => { throw new P.AccessError(m); };

  P.PAGES.solicitacoes = ['admin', 'office', 'manager', 'employee'];
  const canRequest = u => !!u && u.active !== false && (u.role === 'office' || P.isSupport(u));
  const canSee = u => !!u && (P.isGlobal(u) || canRequest(u));
  const canDecide = (u, r) => !!u && u.role === 'admin' && r.status === 'solicitada' && r.by !== u.id;
  const canBuy = (u, r) => P.isGlobal(u) && r.status === 'aprovada';
  const canDeliver = (u, r) => r.status === 'comprada' && (P.isGlobal(u) || r.by === u.id);
  const canCancel = (u, r) => r.status === 'solicitada' && r.by === u.id;

  const list = () => (db().purchases = db().purchases || []);
  const visible = u => list().filter(r => P.isGlobal(u) || r.by === u.id);
  const toC = v => Math.round((Number(String(v || '').replace(/\./g, '').replace(',', '.')) || 0) * 100);
  const brl = c => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const brlIn = c => (c / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const CATS = { limpeza: 'Limpeza', copa: 'Copa e cozinha', escritorio: 'Material de escritório', manutencao: 'Manutenção', outros: 'Outros' };
  const URG = { baixa: ['Baixa', 'st-sem'], normal: ['Normal', 'es-pendente'], alta: ['Alta', 'es-recusado'] };
  const ST = {
    solicitada: ['Aguardando diretoria', 'es-pendente', 'clock'], aprovada: ['Aprovada · a comprar', 'es-aprovado', 'check'], recusada: ['Recusada', 'es-recusado', 'x'],
    comprada: ['Comprada · a entregar', 'es-correcao', 'cart'], entregue: ['Entregue', 'es-aprovado', 'check'], cancelada: ['Cancelada', 'st-sem', 'x']
  };
  const badge = s => `<span class="badge ${ST[s][1]}">${icon(ST[s][2])}${ST[s][0]}</span>`;
  const notify = (ids, n) => { if (P.notify) P.notify(ids.filter(id => id && id !== U().id), Object.assign({ type: 'compra', icon: 'cart', link: 'solicitacoes' }, n)); };
  const admins = () => db().users.filter(x => x.role === 'admin' && x.active !== false).map(x => x.id);
  const office = () => db().users.filter(x => x.role === 'office' && x.active !== false).map(x => x.id);
  const safeUrl = s => /^https?:\/\/[^\s"'<>]+$/i.test(String(s || '').trim()) ? String(s).trim() : '';

  P.purchases = {
    canSee, canRequest,
    // número no menu: diretoria vê as que aguardam decisão; gerência, as aprovadas a comprar
    badge: u => !u ? 0 : u.role === 'admin' ? list().filter(r => canDecide(u, r)).length : u.role === 'office' ? list().filter(r => r.status === 'aprovada').length : 0
  };

  /* ---------- Página ---------- */
  const st = () => (S().pur = S().pur || { tab: 'abertas' });
  V.solicitacoes = u => {
    if (!canSee(u)) deny('As solicitações de compra são do gerente do escritório, da diretoria e do departamento de apoio.');
    const s = st(), all = visible(u).slice().sort((a, b) => a.at < b.at ? 1 : -1);
    const groups = { abertas: all.filter(r => r.status === 'solicitada'), andamento: all.filter(r => ['aprovada', 'comprada'].includes(r.status)), concluidas: all.filter(r => ['entregue', 'recusada', 'cancelada'].includes(r.status)) };
    const shown = groups[s.tab] || groups.abertas;
    const month = D.iso(P.today()).slice(0, 7);
    const spent = all.filter(r => r.boughtAt && r.boughtAt.slice(0, 7) === month).reduce((t, r) => t + (r.paidValue || 0), 0);
    const sub = u.role === 'admin' ? 'Você aprova ou recusa os pedidos. Depois de aprovados, a gerência ou a diretoria registram a compra e a despesa entra sozinha no Financeiro.'
      : u.role === 'office' ? 'Abra pedidos e registre as compras aprovadas pela diretoria. A despesa entra sozinha no Financeiro.'
      : 'Peça o que o escritório precisa. A diretoria aprova e você acompanha cada etapa por aqui e pelas notificações.';
    return `${V.pageHead('Solicitações de compra', sub, canRequest(u) ? V.btn('Nova solicitação', { act: 'purNew', icon: 'plus', cls: 'primary' }) : '')}
      <div class="strip">
        <div class="${groups.abertas.length && u.role === 'admin' ? 't-warn' : ''}"><span>Aguardando diretoria</span><b>${groups.abertas.length}</b></div>
        <div><span>A comprar</span><b>${all.filter(r => r.status === 'aprovada').length}</b></div>
        <div><span>A entregar</span><b>${all.filter(r => r.status === 'comprada').length}</b></div>
        <div><span>Comprado no mês</span><b>${brl(spent)}</b></div>
      </div>
      <div class="toolbar">${V.tabs([['abertas', 'Abertas', groups.abertas.length], ['andamento', 'Em andamento', groups.andamento.length], ['concluidas', 'Concluídas', groups.concluidas.length]], s.tab, 'pur.tab')}</div>
      ${V.card('', shown.length ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>Pedido</th><th>Categoria</th><th class="num">Qtd.</th><th class="num">Valor</th><th>Urgência</th>${P.isGlobal(u) ? '<th>Solicitante</th>' : ''}<th>Data</th><th>Situação</th><th class="actions-col"></th></tr></thead><tbody>
        ${shown.map(r => row(u, r)).join('')}</tbody></table></div>` : V.empty(s.tab === 'abertas' ? (canRequest(u) ? 'Nenhuma solicitação aberta. Use "Nova solicitação".' : 'Nenhuma solicitação aguardando decisão.') : 'Nada por aqui.', 'cart'), { cls: 'flush' })}`;
  };
  function row(u, r) {
    const who = P.user(r.by) || { name: '—' };
    const val = r.paidValue != null ? brl(r.paidValue) + '<small class="obs">estimado ' + brl(r.estimate) + '</small>' : brl(r.estimate) + '<small class="obs">estimado</small>';
    const b = (lbl, act, cls, ic) => V.btn(lbl, { act, cls: 'sm ' + (cls || ''), icon: ic, attrs: `data-id="${r.id}"` });
    return `<tr class="${['recusada', 'cancelada'].includes(r.status) ? 'inactive' : ''}">
      <td><b>${esc(r.item)}</b>${r.reason ? `<small class="obs">${esc(r.reason)}</small>` : ''}</td><td>${esc(CATS[r.category] || r.category)}</td>
      <td class="num">${P.fmt.n(r.qty, 2)} ${esc(r.unit || '')}</td><td class="num">${val}</td><td><span class="badge ${URG[r.urgency][1]}">${URG[r.urgency][0]}</span></td>
      ${P.isGlobal(u) ? `<td>${esc(who.name)}</td>` : ''}<td class="nowrap">${D.fmt(r.at.slice(0, 10))}</td><td>${badge(r.status)}</td>
      <td class="actions-col"><div class="row-actions">
        ${canDecide(u, r) ? b('Aprovar', 'purApprove', 'primary', 'check') + b('Recusar', 'purReject', 'ghost', 'x') : ''}
        ${canBuy(u, r) ? b('Registrar compra', 'purBuy', 'primary', 'cart') : ''}
        ${canDeliver(u, r) ? b('Confirmar entrega', 'purDeliver', '', 'check') : ''}
        ${canCancel(u, r) ? b('Cancelar', 'purCancel', 'ghost', 'x') : ''}
        ${V.ibtn('info', 'Detalhes e histórico', { act: 'purDetail', attrs: `data-id="${r.id}"` })}
      </div></td></tr>`;
  }

  /* ---------- Página inicial do departamento de apoio (sem indicadores de produção) ---------- */
  V.supportHome = u => {
    const mine = list().filter(r => r.by === u.id);
    const open = mine.filter(r => ['solicitada', 'aprovada', 'comprada'].includes(r.status));
    const d = P.dept(u.deptId);
    const h = new Date().getHours(), hi = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
    return `${V.pageHead(hi + ', ' + esc(P.firstName(u.name)) + '!', esc(d ? d.name : '') + ' · aqui ficam as suas solicitações de compra, as férias e a comunicação com o escritório.', V.btn('Nova solicitação de compra', { act: 'purNew', icon: 'plus', cls: 'primary' }))}
      <div class="kpis k3">
        ${V.kpi('Pedidos em andamento', open.length, { icon: 'cart', go: 'solicitacoes' })}
        ${V.kpi('Aguardando a diretoria', mine.filter(r => r.status === 'solicitada').length, { icon: 'clock', go: 'solicitacoes' })}
        ${V.kpi('A caminho (comprados)', mine.filter(r => r.status === 'comprada').length, { icon: 'check', go: 'solicitacoes' })}
      </div>
      ${V.card('Minhas últimas solicitações', mine.length ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>Pedido</th><th class="num">Qtd.</th><th>Data</th><th>Situação</th></tr></thead><tbody>${mine.slice().sort((a, b) => a.at < b.at ? 1 : -1).slice(0, 8).map(r => `<tr><td><b>${esc(r.item)}</b></td><td class="num">${P.fmt.n(r.qty, 2)} ${esc(r.unit || '')}</td><td>${D.fmt(r.at.slice(0, 10))}</td><td>${badge(r.status)}</td></tr>`).join('')}</tbody></table></div>`
        : V.empty('Você ainda não fez solicitações. Use "Nova solicitação de compra" quando faltar algo no escritório.', 'cart'), { cls: 'flush', actions: V.btn('Ver todas', { go: 'solicitacoes', cls: 'sm ghost' }) })}
      <div class="grid g-1-1">
        ${V.card('Férias', '<p class="prose">Solicite e acompanhe as suas férias.</p>' + V.btn('Abrir Férias', { go: 'ferias', icon: 'palm', cls: 'sm' }))}
        ${V.card('Comunicação', '<p class="prose">Converse com a equipe e veja os comunicados da diretoria.</p>' + V.btn('Abrir Comunicação', { go: 'comunicacao', icon: 'message', cls: 'sm' }))}
      </div>`;
  };

  /* ---------- Ações ---------- */
  const get = id => list().find(r => r.id === id);
  const hist = (r, action, note) => r.history.push({ at: D.stamp(), by: U().id, action, note: note || '' });
  const done = msg => { P.store.save(); P.toast(msg); P.render(); };
  A.purNew = () => {
    const u = U(); if (!canRequest(u)) return P.toast('Somente o gerente do escritório e o departamento de apoio abrem solicitações.', 'err');
    P.ui.modal({
      title: 'Nova solicitação de compra', submit: 'Enviar para a diretoria', wide: true,
      body: `<div class="fgrid">
        <label class="field span2"><span>O que precisa ser comprado</span><input id="pr-item" maxlength="120" placeholder="Ex.: detergente neutro 5 L"></label>
        <label class="field"><span>Categoria</span><select id="pr-cat">${Object.entries(CATS).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></label>
        <label class="field"><span>Quantidade</span><input id="pr-qty" type="number" min="0.01" step="0.01" value="1"></label>
        <label class="field"><span>Unidade</span><select id="pr-unit">${['un', 'cx', 'pct', 'kg', 'L', 'rolo', 'fardo'].map(x => `<option>${x}</option>`).join('')}</select></label>
        <label class="field"><span>Valor estimado (R$)</span><input id="pr-val" inputmode="decimal" placeholder="Ex.: 45,90"></label>
        <label class="field"><span>Urgência</span><select id="pr-urg"><option value="normal">Normal</option><option value="baixa">Baixa</option><option value="alta">Alta</option></select></label>
        <label class="field span2"><span>Link do produto <small>(opcional)</small></span><input id="pr-link" placeholder="https://…"></label>
        <label class="field span3"><span>Justificativa</span><textarea id="pr-why" rows="3" maxlength="500" placeholder="Ex.: o estoque acaba nesta semana; usado na limpeza diária das salas"></textarea></label></div>`,
      onSubmit: m => {
        const item = $('#pr-item', m).value.trim(), qty = Number($('#pr-qty', m).value), est = toC($('#pr-val', m).value), why = $('#pr-why', m).value.trim(), link = $('#pr-link', m).value.trim();
        if (item.length < 3) throw new Error('Descreva o que precisa ser comprado.');
        if (!(qty > 0)) throw new Error('Informe a quantidade.');
        if (!(est > 0)) throw new Error('Informe o valor estimado.');
        if (why.length < 5) throw new Error('Escreva uma justificativa curta.');
        if (link && !safeUrl(link)) throw new Error('O link precisa começar com http:// ou https://.');
        const r = { id: P.uid('pr'), by: u.id, deptId: u.deptId || null, at: D.stamp(), item, category: $('#pr-cat', m).value, qty, unit: $('#pr-unit', m).value, estimate: est, urgency: $('#pr-urg', m).value, why, link: safeUrl(link), status: 'solicitada', history: [] };
        hist(r, 'Solicitada'); list().push(r);
        P.audit(u, 'Solicitação de compra aberta', r.id, item + ' · ' + brl(est));
        notify(admins(), { title: 'Nova solicitação de compra', text: u.name + ': ' + item + ' (' + brl(est) + ')' });
        st().tab = 'abertas'; done('Solicitação enviada para a diretoria.');
      }
    });
  };
  A.purApprove = el => {
    const r = get(el.dataset.id); if (!r || !canDecide(U(), r)) return;
    P.ui.modal({ title: 'Aprovar solicitação', submit: 'Aprovar',
      body: `<p class="prose"><b>${esc(r.item)}</b> · ${P.fmt.n(r.qty, 2)} ${esc(r.unit)} · estimado ${brl(r.estimate)}<br><small class="muted">${esc(r.why)}</small></p><label class="field"><span>Observação (opcional)</span><input id="pa-n" placeholder="Ex.: comprar na mesma loja de sempre"></label>`,
      onSubmit: m => {
        r.status = 'aprovada'; r.decidedBy = U().id; r.decidedAt = D.stamp(); hist(r, 'Aprovada pela diretoria', $('#pa-n', m).value.trim());
        P.audit(U(), 'Solicitação de compra aprovada', r.id, r.item);
        notify([r.by], { title: 'Solicitação aprovada', text: r.item + ' foi aprovada pela diretoria.' }); notify(office(), { title: 'Compra aprovada para comprar', text: r.item + ' (' + brl(r.estimate) + ')' });
        done('Solicitação aprovada.');
      } });
  };
  A.purReject = el => {
    const r = get(el.dataset.id); if (!r || !canDecide(U(), r)) return;
    P.ui.modal({ title: 'Recusar solicitação', submit: 'Recusar', danger: true,
      body: `<p class="prose"><b>${esc(r.item)}</b> · estimado ${brl(r.estimate)}</p><label class="field"><span>Motivo da recusa</span><textarea id="pj-n" rows="3" placeholder="Ex.: ainda temos estoque; pedir no próximo mês"></textarea></label>`,
      onSubmit: m => {
        const n = $('#pj-n', m).value.trim(); if (n.length < 3) throw new Error('Explique o motivo da recusa.');
        r.status = 'recusada'; r.decidedBy = U().id; r.decidedAt = D.stamp(); r.reason = n; hist(r, 'Recusada pela diretoria', n);
        P.audit(U(), 'Solicitação de compra recusada', r.id, r.item + ' · ' + n);
        notify([r.by], { title: 'Solicitação recusada', text: r.item + ': ' + n }); done('Solicitação recusada.');
      } });
  };
  A.purBuy = el => {
    const r = get(el.dataset.id); if (!r || !canBuy(U(), r)) return;
    P.ui.modal({ title: 'Registrar compra', submit: 'Registrar compra',
      body: `<p class="prose"><b>${esc(r.item)}</b> · ${P.fmt.n(r.qty, 2)} ${esc(r.unit)} · estimado ${brl(r.estimate)}</p><div class="fgrid">
        <label class="field"><span>Valor pago (R$)</span><input id="pb-v" inputmode="decimal" value="${brlIn(r.estimate)}"></label>
        <label class="field"><span>Data da compra</span><input type="date" id="pb-d" value="${D.iso(P.today())}"></label>
        <label class="field"><span>Forma de pagamento</span><select id="pb-m">${['pix', 'cartão', 'boleto', 'dinheiro', 'transferência'].map(x => `<option>${x}</option>`).join('')}</select></label>
        <label class="field span3"><span>Fornecedor / loja</span><input id="pb-s" placeholder="Ex.: Atacadão"></label></div>
        <p class="fine">A despesa entra automaticamente no Financeiro (categoria Material) como paga nesta data.</p>`,
      onSubmit: m => {
        const v = toC($('#pb-v', m).value), dt = $('#pb-d', m).value, sup = $('#pb-s', m).value.trim();
        if (!(v > 0)) throw new Error('Informe o valor pago.'); if (!dt) throw new Error('Informe a data.');
        r.status = 'comprada'; r.paidValue = v; r.boughtAt = dt; r.boughtBy = U().id; r.supplier = sup; r.payMethod = $('#pb-m', m).value;
        hist(r, 'Compra registrada: ' + brl(v) + (sup ? ' · ' + sup : ''));
        // despesa no Financeiro (uma por solicitação: chave única "compra|id")
        const fe = (db().finEntries = db().finEntries || []);
        if (!fe.some(e => e.key === 'compra|' + r.id)) fe.push({ id: P.uid('fe'), key: 'compra|' + r.id, recId: null, purchaseId: r.id, userId: null, deptId: r.deptId, desc: 'Compra: ' + r.item, category: 'material',
          a: dt, b: dt, due: dt, original: v, vacAdj: 0, otherAdj: 0, final: v, calc: null, paid: v, paidAt: dt, paidBy: U().id, closed: false, adjustments: [], payMethod: r.payMethod, pixKey: '', holder: sup || 'Compra do escritório',
          history: [{ at: D.stamp(), by: U().id, action: 'Lançado pela solicitação de compra (pago)', value: v }] });
        P.audit(U(), 'Compra registrada', r.id, r.item + ' · ' + brl(v));
        notify([r.by], { title: 'Compra realizada', text: r.item + ' foi comprado. Confirme quando chegar.' }); done('Compra registrada e lançada no Financeiro.');
      } });
  };
  A.purDeliver = el => {
    const r = get(el.dataset.id); if (!r || !canDeliver(U(), r)) return;
    r.status = 'entregue'; r.deliveredAt = D.stamp(); hist(r, 'Entrega confirmada'); P.audit(U(), 'Entrega de compra confirmada', r.id, r.item);
    if (r.by !== U().id) notify([r.by], { title: 'Compra entregue', text: r.item + ' foi marcado como entregue.' });
    done('Entrega confirmada.');
  };
  A.purCancel = el => {
    const r = get(el.dataset.id); if (!r || !canCancel(U(), r)) return;
    P.ui.modal({ title: 'Cancelar solicitação', submit: 'Cancelar solicitação', cancel: 'Voltar', danger: true, body: `<p class="prose">${esc(r.item)} sai da fila da diretoria.</p>`,
      onSubmit: () => { r.status = 'cancelada'; hist(r, 'Cancelada por quem pediu'); P.audit(U(), 'Solicitação de compra cancelada', r.id, r.item); done('Solicitação cancelada.'); } });
  };
  A.purDetail = el => {
    const r = get(el.dataset.id); if (!r) return;
    const who = id => esc((P.user(id) || {}).name || '—');
    P.ui.modal({ title: esc(r.item), cancel: 'Fechar', wide: true,
      body: `<p class="prose">${badge(r.status)} · ${esc(CATS[r.category])} · ${P.fmt.n(r.qty, 2)} ${esc(r.unit)} · urgência ${URG[r.urgency][0].toLowerCase()}<br>
        Pedido por <b>${who(r.by)}</b> em ${esc(r.at)} · estimado ${brl(r.estimate)}${r.paidValue != null ? ` · pago <b>${brl(r.paidValue)}</b> em ${D.fmt(r.boughtAt)}${r.supplier ? ' (' + esc(r.supplier) + ')' : ''}` : ''}</p>
        <blockquote class="vac-comment">${icon('message')}<span>${esc(r.why)}</span></blockquote>
        ${r.link ? `<p class="prose">Produto: <a href="${esc(r.link)}" target="_blank" rel="noopener noreferrer nofollow">${esc(r.link.length > 70 ? r.link.slice(0, 70) + '…' : r.link)}</a></p>` : ''}
        <h4 class="sub-h">Histórico</h4><ul class="day-list">${r.history.slice().reverse().map(h => `<li><span>${esc(h.action)}${h.note ? `<small>${esc(h.note)}</small>` : ''}</span><b>${who(h.by)} · ${esc(h.at)}</b></li>`).join('')}</ul>` });
  };
})(window.P);
