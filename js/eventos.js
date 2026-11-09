/* Prumo — Eventos do setor (indicações)
 * Fluxo: qualquer pessoa indica um evento (ContaCon, PlayBPO, Conarh…) → diretoria e gerência aprovam ou recusam
 * → ao aprovar, escolhem quem vai → cada convidado confirma, recusa (com motivo) ou sugere outra pessoa
 * → a direção aprova a troca. Os confirmados recebem o evento na agenda e um lembrete na véspera.
 * Guardado na coleção "eventSuggestions" (tabela event_suggestions). Se a tabela não existir, a página avisa.
 */
'use strict';
(function (P) {
  const D = P.date, esc = P.esc, V = P.V, icon = V.icon, A = P.ext.actions;
  const db = () => P.store.db, S = () => P.state, U = () => S().user;
  const $ = (s, r = document) => r.querySelector(s);
  const list = () => (db().eventSuggestions = db().eventSuggestions || []);
  const fail = m => { throw new Error(m); };
  const AREAS = ['Contábil', 'Fiscal', 'DP', 'RH', 'BPO', 'Legalização', 'Gestão'];
  const KINDS = { congresso: 'Congresso', feira: 'Feira', curso: 'Curso ou workshop', palestra: 'Palestra', online: 'On-line' };
  const RESP = { aguardando: ['Aguardando resposta', 'st-baixa'], sim: ['Confirmou', 'st-saudavel'], nao: ['Recusou', 'st-sobrecarga'], troca: ['Troca pendente', 'st-baixa'] };
  const brl = v => (+v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const safeUrl = s => { s = String(s || '').trim(); if (!s) return ''; if (!/^https?:\/\//i.test(s)) s = 'https://' + s; try { return new URL(s).href; } catch (e) { return ''; } };
  const canDecide = u => !!u && P.isGlobal(u);
  const active = () => db().users.filter(x => x.active !== false);
  const name = id => (P.user(id) || { name: '—' }).name;
  const first = id => name(id).split(' ')[0];
  const global = () => active().filter(x => P.isGlobal(x)).map(x => x.id);
  const today = () => D.iso(P.today());
  const going = e => (e.invited || []).filter(id => ((e.resp || {})[id] || {}).st !== 'nao');
  const confirmed = e => (e.invited || []).filter(id => ((e.resp || {})[id] || {}).st === 'sim');
  const missing = () => !!P.evSugMissing;
  const save = () => P.store.save();
  const notify = (ids, o) => { ids = [...new Set(ids)].filter(id => id && id !== (U() || {}).id); if (ids.length && P.notify) P.notify(ids, Object.assign({ type: 'evento', icon: 'bulb', link: 'eventos' }, o)); };
  const when = e => D.fmt(e.date) + (e.start ? ' · ' + e.start + (e.end ? '–' + e.end : '') : '');
  const find = id => list().find(x => x.id === id);

  /* ---------- Contadores ---------- */
  const myInfo = u => list().filter(e => e.status === 'info' && e.createdBy === u.id);
  const myPending = u => list().filter(e => e.status === 'aprovado' && e.date >= today() && ((e.resp || {})[u.id] || {}).st === 'aguardando');
  const toDecide = u => canDecide(u) ? list().filter(e => e.status === 'pendente').length + list().filter(e => e.status === 'aprovado' && Object.values(e.resp || {}).some(r => r.st === 'troca')).length : 0;
  P.evSug = { badge: u => !u ? 0 : toDecide(u) + myPending(u).length + myInfo(u).length };
  P.PAGES.eventos = ['admin', 'office', 'manager', 'employee'];

  /* ---------- Agenda e calendário: evento aprovado entra como compromisso ---------- */
  // quem vê um evento: quem indicou, a direção e os convidados pela direção (no calendário, só os que não recusaram)
  const sees = (u, e) => !!u && (P.isGlobal(u) || e.createdBy === u.id || (e.invited || []).includes(u.id));
  const asEvent = e => ({ id: 'sg_' + e.id, sg: e.id, ext: true, type: 'evento', title: e.title, date: e.date, start: e.start || '', end: e.end || '', place: e.place || '', notes: e.why || '', participants: going(e), createdBy: e.decidedBy || e.createdBy });
  const agendaFor = u => list().filter(e => e.status === 'aprovado' && (P.isGlobal(u) || e.createdBy === u.id || going(e).includes(u.id))).map(asEvent);
  P.evSug.agendaFor = agendaFor;
  const origFor = P.agenda.forUser;
  P.agenda.forUser = (u, scope) => origFor(u, scope).concat(agendaFor(u));
  const origCan = P.agenda.canEdit;
  P.agenda.canEdit = (u, e) => !!e && !e.ext && origCan(u, e);

  /* ---------- Cartão (ingresso) ---------- */
  const ticket = (u, e) => {
    const resp = e.resp || {}, mine = resp[u.id], conf = confirmed(e).length;
    const stTag = e.status === 'info' ? '<span class="badge st-baixa">Aguardando informações</span>' : e.status === 'pendente' ? '<span class="badge st-baixa">Aguardando a direção</span>' : e.status === 'recusado' ? '<span class="badge st-sobrecarga">Recusado</span>' : e.date < today() ? '<span class="badge">Realizado</span>' : '<span class="badge st-saudavel">Aprovado</span>';
    const left = `<div class="evx-l"><span class="evx-k">${e.areas && e.areas.length ? esc(e.areas.join(' · ')) : 'Evento do setor'} ${stTag}</span>
      <b class="evx-t">${esc(e.title)}</b>
      <span class="evx-m">${icon('calendar')}${esc(D.WEEKDAYS_L[D.parse(e.date).getDay()])}, ${D.fmt(e.date)}${e.start ? ' · ' + e.start + (e.end ? ' às ' + e.end : '') : ''}</span>
      ${e.place ? `<span class="evx-m">${icon('building')}${esc(e.place)}</span>` : ''}
      <span class="evx-m">${icon('users')}${esc(KINDS[e.kind] || 'Evento')}${e.status === 'aprovado' ? ` · ${(e.invited || []).length} convidado${(e.invited || []).length === 1 ? '' : 's'}, ${conf} confirmado${conf === 1 ? '' : 's'}` : ''}</span>
      ${e.why ? `<span class="evx-q">“${esc(e.why)}”<small>Indicado por ${esc(name(e.createdBy))} · ${D.fmt(e.at.slice(0, 10))}</small></span>` : `<span class="evx-q"><small>Indicado por ${esc(name(e.createdBy))} · ${D.fmt(e.at.slice(0, 10))}</small></span>`}
      ${e.status === 'recusado' && e.reason ? `<span class="evx-q"><small>Motivo da recusa: ${esc(e.reason)}</small></span>` : ''}</div>`;
    let acts = '';
    if (e.status === 'pendente' && canDecide(u)) acts = V.btn('Aprovar e convidar', { act: 'evsApprove', icon: 'check', cls: 'evx-b', attrs: `data-id="${e.id}"` }) + `<span class="evx-s">${V.btn('Pedir informações', { act: 'evsAsk', cls: 'sm ghost', attrs: `data-id="${e.id}"` })}${V.btn('Recusar', { act: 'evsReject', cls: 'sm ghost', attrs: `data-id="${e.id}"` })}</span>`;
    else if (e.status === 'aprovado' && mine && e.date >= today()) acts = V.btn(mine.st === 'aguardando' ? 'Responder convite' : 'Alterar resposta', { act: 'evsRespond', icon: 'check', cls: 'evx-b', attrs: `data-id="${e.id}"` }) + `<span class="evx-s"><small>Sua resposta: ${RESP[mine.st][0]}</small></span>`;
    else if (e.status === 'aprovado' && canDecide(u) && e.date >= today()) acts = V.btn('Convidar mais pessoas', { act: 'evsApprove', icon: 'plus', cls: 'evx-b', attrs: `data-id="${e.id}"` });
    else if (e.status === 'info' && e.createdBy === u.id) acts = V.btn('Completar informações', { act: 'evsFill', icon: 'edit', cls: 'evx-b', attrs: `data-id="${e.id}"` }) + V.btn('Cancelar indicação', { act: 'evsCancel', cls: 'evx-b2', attrs: `data-id="${e.id}"` });
    else if (e.status === 'info' && canDecide(u)) acts = `<small class="evx-wait">Aguardando ${esc(first(e.createdBy))} completar as informações</small>` + V.btn('Recusar', { act: 'evsReject', cls: 'evx-b2', attrs: `data-id="${e.id}"` });
    else if (e.status === 'pendente' && e.createdBy === u.id) acts = V.btn('Cancelar indicação', { act: 'evsCancel', cls: 'evx-b2', attrs: `data-id="${e.id}"` });
    // valor do ingresso: só a direção vê (e quem indicou, enquanto a indicação não foi aprovada); os convidados veem a data
    const seePrice = canDecide(u) || (e.createdBy === u.id && e.status !== 'aprovado');
    const top = seePrice ? `<span class="evx-k">${e.price ? 'A partir de' : 'Valor'}</span><b class="evx-p${e.price ? '' : ' tbd'}">${e.price ? brl(e.price) : 'A confirmar'}</b>${e.price ? '<small>por pessoa</small>' : ''}`
      : `<span class="evx-k">${e.status === 'aprovado' ? 'Convite da direção' : 'Data'}</span><b class="evx-p tbd">${D.fmt(e.date)}</b><small>${esc(D.WEEKDAYS_L[D.parse(e.date).getDay()])}${e.start ? ' · ' + e.start : ''}</small>`;
    const right = `<div class="evx-r"><div>${top}
      ${e.link ? `<a class="evx-a" href="${esc(e.link)}" target="_blank" rel="noopener noreferrer">${icon('right')}${seePrice ? 'Ingressos e detalhes' : 'Site do evento'}</a>` : ''}
      ${e.status === 'aprovado' && e.deadline ? `<small class="evx-dl">Responder até ${D.fmt(e.deadline)}</small>` : ''}</div><div class="evx-acts">${acts}</div></div>`;
    // direção: situação de cada convidado
    let people = '';
    if (e.status === 'aprovado' && (canDecide(u) || (e.invited || []).includes(u.id))) {
      const rows = (e.invited || []).map(id => {
        const r = resp[id] || { st: 'aguardando' }, p = P.user(id);
        const extra = r.st === 'troca' ? ` ${icon('right')} <b>${esc(name(r.sub))}</b>` : '';
        const btns = canDecide(u) && e.date >= today() ? (r.st === 'troca' ? V.btn('Aprovar troca', { act: 'evsSwapOk', cls: 'sm primary', attrs: `data-id="${e.id}" data-u="${id}"` }) + V.btn('Manter ' + esc(first(id)), { act: 'evsSwapNo', cls: 'sm ghost', attrs: `data-id="${e.id}" data-u="${id}"` })
          : r.st === 'nao' ? V.btn('Convidar outra pessoa', { act: 'evsApprove', cls: 'sm ghost', icon: 'plus', attrs: `data-id="${e.id}"` }) : '') : '';
        return `<li>${p ? V.avatar(p, 'xs') : ''}<span class="evx-pn">${esc(name(id))}${extra}${r.why ? `<small>“${esc(r.why)}”</small>` : ''}</span><span class="badge ${RESP[r.st][1]}">${RESP[r.st][0]}</span>${btns}</li>`;
      }).join('');
      const canBuy = P.purchases && P.purchases.canRequest(u) && e.price && confirmed(e).length && !e.purchaseId && e.date >= today();
      people = `<div class="evx-ppl"><div class="evx-ph"><b>Convidados</b><small>${confirmed(e).length} confirmado(s) · ${(e.invited || []).filter(id => (resp[id] || {}).st === 'aguardando').length} aguardando · ${(e.invited || []).filter(id => (resp[id] || {}).st === 'nao').length} recusou</small>
        ${canBuy ? V.btn(`Abrir solicitação de compra (${confirmed(e).length} × ${brl(e.price)})`, { act: 'evsBuy', cls: 'sm', icon: 'cart', attrs: `data-id="${e.id}"` }) : e.purchaseId ? '<small>Solicitação de compra aberta</small>' : ''}</div><ul>${rows}</ul></div>`;
    }
    const com = (e.comments || []).length ? `<div class="evx-com">${e.comments.map(c => `<p><b>${esc(first(c.by))}:</b> ${esc(c.text)} <small>${D.fmt(c.at.slice(0, 10))}</small></p>`).join('')}${(canDecide(u) || e.createdBy === u.id) && ['pendente', 'info'].includes(e.status) ? V.btn('Responder', { act: 'evsComment', cls: 'sm ghost', attrs: `data-id="${e.id}"` }) : ''}</div>` : '';
    const askBox = e.status === 'info' && e.infoReq ? `<div class="evx-ask">${icon('message')}<span><b>${esc(first(e.infoReq.by))} pediu mais informações · ${D.fmt(e.infoReq.at.slice(0, 10))}</b>${esc(e.infoReq.text)}</span></div>` : '';
    return `<article class="evx ${e.status}">${askBox}<div class="evx-tk">${left}${right}</div>${com}${people}</article>`;
  };

  /* ---------- Página ---------- */
  V.eventos = u => {
    const st = S().evs = S().evs || {}, dec = canDecide(u);
    const all = list().slice().sort((a, b) => a.date.localeCompare(b.date));
    const fut = e => e.date >= today();
    const tabs = (dec ? [['pendente', 'Aguardando decisão', all.filter(e => e.status === 'pendente').length], ['info', 'Aguardando informações', all.filter(e => e.status === 'info').length]] : [])
      .concat([['convites', 'Meus convites', all.filter(e => e.status === 'aprovado' && (e.invited || []).includes(u.id) && fut(e)).length],
        ['aprovados', 'Próximos eventos', all.filter(e => e.status === 'aprovado' && fut(e) && sees(u, e)).length],
        ['minhas', 'Minhas indicações', all.filter(e => e.createdBy === u.id && e.status === 'info').length || all.filter(e => e.createdBy === u.id).length]])
      .concat(dec ? [['historico', 'Recusados e realizados', all.filter(e => e.status === 'recusado' || (e.status === 'aprovado' && !fut(e))).length]] : []);
    const tab = tabs.some(t => t[0] === st.tab) ? st.tab : (dec && tabs[0][2] ? 'pendente' : myInfo(u).length ? 'minhas' : myPending(u).length ? 'convites' : dec ? 'pendente' : 'aprovados');
    const shown = {
      pendente: all.filter(e => e.status === 'pendente'),
      info: all.filter(e => e.status === 'info'),
      convites: all.filter(e => e.status === 'aprovado' && (e.invited || []).includes(u.id) && fut(e)),
      aprovados: all.filter(e => e.status === 'aprovado' && fut(e) && sees(u, e)),
      minhas: all.filter(e => e.createdBy === u.id).reverse(),
      historico: all.filter(e => e.status === 'recusado' || (e.status === 'aprovado' && !fut(e))).reverse()
    }[tab] || [];
    const warn = missing() ? `<div class="banner warn">${icon('alert')}<div><b>As indicações de eventos ainda não estão ativas.</b> Falta criar a tabela <code>event_suggestions</code> no banco (comando enviado no chat).</div></div>` : '';
    const empty = { pendente: 'Nenhuma indicação aguardando decisão.', info: 'Nenhuma indicação aguardando informações.', convites: 'Você não tem convites para eventos.', aprovados: 'Nenhum evento aprovado por enquanto.', minhas: 'Você ainda não indicou nenhum evento. Achou algo bom? Use "Indicar evento".', historico: 'Nada por aqui.' }[tab];
    return `${V.pageHead('Eventos do setor', 'Congressos, feiras e cursos de contabilidade, BPO, RH e afins. Qualquer pessoa indica; a direção aprova e escolhe quem vai.', V.btn('Indicar evento', { act: 'evsNew', icon: 'plus', cls: 'evx-go' }))}
      ${warn}<div class="toolbar">${V.tabs(tabs, tab, 'evs.tab')}</div>
      ${shown.length ? `<div class="evx-list">${shown.map(e => ticket(u, e)).join('')}</div>` : V.card('', V.empty(empty, 'bulb'))}`;
  };

  /* ---------- Indicar ---------- */
  // mesmo formulário para indicar (x vazio) e para completar as informações pedidas pela direção (x = indicação)
  const evForm = x => {
    if (missing()) return P.toast('As indicações ainda não estão ativas: falta criar a tabela no banco.', 'err');
    const u = U(), v = k => esc(x ? x[k] || '' : ''), ask = x && x.infoReq;
    P.ui.modal({
      title: x ? 'Completar informações · ' + esc(x.title) : 'Indicar evento para a direção', wide: true, submit: x ? 'Reenviar para a direção' : 'Enviar para a direção',
      body: `<form class="form" novalidate>${ask ? `<div class="evx-ask">${icon('message')}<span><b>${esc(first(ask.by))} pediu mais informações</b>${esc(ask.text)}</span></div>` : '<p class="fine">Achou um evento bom para o escritório? Preencha os dados. A direção avalia e escolhe quem vai.</p>'}<div class="fgrid">
        <label class="field span2"><span>Nome do evento</span><input type="text" id="es-title" maxlength="90" placeholder="Ex.: ContaCon 2027" value="${v('title')}"></label>
        <label class="field"><span>Tipo</span><select id="es-kind">${Object.entries(KINDS).map(([k, l]) => `<option value="${k}" ${x && x.kind === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="field"><span>Data</span><input type="date" id="es-date" min="${today()}" value="${v('date')}"></label>
        <label class="field"><span>Início <small>(opcional)</small></span><input type="time" id="es-start" value="${v('start')}"></label>
        <label class="field"><span>Término <small>(opcional)</small></span><input type="time" id="es-end" value="${v('end')}"></label>
        <label class="field span2"><span>Local e cidade</span><input type="text" id="es-place" maxlength="140" placeholder="Ex.: Expo Center Norte · São Paulo/SP (ou On-line)" value="${v('place')}"></label>
        <label class="field"><span>Valor por pessoa <small>(R$, opcional)</small></span><input type="number" id="es-price" min="0" step="0.01" placeholder="390,00" value="${x && x.price ? x.price : ''}"></label>
        <label class="field span3"><span>Link do evento ou dos ingressos <small>(Sympla, site oficial…)</small></span><input type="url" id="es-link" maxlength="400" placeholder="https://www.sympla.com.br/..." value="${v('link')}"></label>
      </div>
      <div class="field"><span>Para quais áreas?</span><div class="evx-chips">${AREAS.map(a => `<label class="evx-chip"><input type="checkbox" value="${a}" ${x && (x.areas || []).includes(a) ? 'checked' : ''}><span>${a}</span></label>`).join('')}</div></div>
      <label class="field"><span>Por que vale a pena?</span><textarea id="es-why" rows="2" maxlength="500" placeholder="Ex.: Tem trilha sobre a reforma tributária, seria ótimo para o fiscal.">${v('why')}</textarea></label>
      ${x ? `<label class="field"><span>Resposta para a direção <small>(opcional)</small></span><textarea id="es-ans" rows="2" maxlength="400" placeholder="Ex.: Incluí o link do Sympla e o valor do 1º lote."></textarea></label>` : ''}</form>`,
      onSubmit: m => {
        if (x) {
          const title = $('#es-title', m).value.trim(), date = $('#es-date', m).value, start = $('#es-start', m).value, end = $('#es-end', m).value, rawLink = $('#es-link', m).value.trim();
          if (title.length < 3) fail('Informe o nome do evento.');
          if (!date) fail('Informe a data do evento.');
          if (start && end && end <= start) fail('O término deve ser depois do início.');
          const link = safeUrl(rawLink); if (rawLink && !link) fail('O link não parece válido.');
          const ans = $('#es-ans', m).value.trim();
          Object.assign(x, { title, kind: $('#es-kind', m).value, date, start, end, place: $('#es-place', m).value.trim(), price: Math.max(0, +$('#es-price', m).value || 0), link, areas: [...m.querySelectorAll('.evx-chip input:checked')].map(i => i.value), why: $('#es-why', m).value.trim(), status: 'pendente' });
          (x.comments = x.comments || []).push({ by: u.id, at: D.stamp(), text: 'Informações completadas' + (ans ? ': ' + ans : '.') });
          const asker = x.infoReq ? x.infoReq.by : null; delete x.infoReq;
          notify(asker ? [asker] : global(), { icon: 'check', title: 'Indicação completada: ' + title, text: `${u.name} completou as informações${ans ? ': ' + ans : '.'} A indicação voltou para decisão.` });
          P.audit(u, 'Indicação de evento completada', x.id, title);
          save(); P.toast('Informações enviadas. A indicação voltou para a direção.'); P.render(); return;
        }
        const title = $('#es-title', m).value.trim(), date = $('#es-date', m).value, start = $('#es-start', m).value, end = $('#es-end', m).value, rawLink = $('#es-link', m).value.trim();
        if (title.length < 3) fail('Informe o nome do evento.');
        if (!date) fail('Informe a data do evento.');
        if (date < today()) fail('A data não pode estar no passado.');
        if (start && end && end <= start) fail('O término deve ser depois do início.');
        const link = safeUrl(rawLink); if (rawLink && !link) fail('O link não parece válido.');
        const areas = [...m.querySelectorAll('.evx-chip input:checked')].map(i => i.value);
        const e = { id: P.uid('es'), createdBy: u.id, at: D.stamp(), title, kind: $('#es-kind', m).value, date, start, end, place: $('#es-place', m).value.trim(), price: Math.max(0, +$('#es-price', m).value || 0), link, areas, why: $('#es-why', m).value.trim(), status: 'pendente', comments: [], invited: [], resp: {} };
        list().push(e);
        P.audit(u, 'Evento indicado', e.id, title + ' · ' + D.fmt(date));
        notify(global(), { title: 'Nova indicação de evento', text: `${u.name} indicou ${title} · ${D.fmt(date)}${e.place ? ' · ' + e.place : ''}${e.price ? ' · a partir de ' + brl(e.price) : ''}` });
        save(); S().evs = { tab: 'minhas' }; P.toast('Indicação enviada para a direção.'); P.fx && P.fx.success(); P.go('eventos');
      }
    });
  };
  A.evsNew = () => evForm(null);
  A.evsFill = el => { const e = find(el.dataset.id), u = U(); if (e && e.createdBy === u.id && e.status === 'info') evForm(e); };
  // direção: devolve a indicação para quem indicou completar os dados
  A.evsAsk = el => {
    const u = U(), e = find(el.dataset.id); if (!e || !canDecide(u)) return;
    P.ui.modal({ title: 'Pedir mais informações', submit: 'Devolver para ' + first(e.createdBy), body: `<form class="form"><p class="fine">${esc(e.title)} · indicado por ${esc(name(e.createdBy))}. A indicação volta para ${esc(first(e.createdBy))} completar e reenviar.</p>
      <div class="evx-chips evx-qk">${['Link de inscrição', 'Valor do ingresso', 'Horário', 'Programação / palestras', 'Local exato'].map(t => `<label class="evx-chip"><input type="checkbox" value="${t}"><span>${t}</span></label>`).join('')}</div>
      <label class="field"><span>O que falta?</span><textarea id="evx-ask" rows="3" maxlength="400" placeholder="Ex.: Mande o link do Sympla e a programação das palestras de reforma tributária."></textarea></label></form>`,
      onSubmit: m => {
        const picks = [...m.querySelectorAll('.evx-qk input:checked')].map(i => i.value), extra = $('#evx-ask', m).value.trim();
        const text = (picks.length ? 'Faltam: ' + picks.join(', ').toLowerCase() + '.' : '') + (extra ? (picks.length ? ' ' : '') + extra : '');
        if (text.length < 3) fail('Marque ou escreva o que falta.');
        e.status = 'info'; e.infoReq = { by: u.id, at: D.stamp(), text };
        (e.comments = e.comments || []).push({ by: u.id, at: D.stamp(), text: 'Pediu mais informações: ' + text });
        notify([e.createdBy], { icon: 'message', title: 'A direção pediu mais informações', text: `${e.title}: ${text} Abra a indicação e clique em "Completar informações".` });
        P.audit(u, 'Pedido de informações em indicação de evento', e.id, e.title + ' · ' + text);
        save(); P.toast('Indicação devolvida para ' + first(e.createdBy) + '.'); P.render();
      } });
  };
  A.evsCancel = el => { const e = find(el.dataset.id), u = U(); if (!e || e.createdBy !== u.id || !['pendente', 'info'].includes(e.status)) return; if (!confirm('Cancelar esta indicação?')) return; db().eventSuggestions = list().filter(x => x !== e); P.audit(u, 'Indicação de evento cancelada', e.id, e.title); save(); P.render(); };

  /* ---------- Direção: aprovar e escolher quem vai ---------- */
  A.evsApprove = el => {
    const u = U(), e = find(el.dataset.id); if (!e || !canDecide(u)) return;
    const already = new Set(e.invited || []), people = active().filter(x => !already.has(x.id) || (e.resp[x.id] || {}).st === 'nao');
    const groups = {}; people.forEach(p => { const k = p.role === 'admin' ? 'Diretoria' : p.role === 'office' ? 'Gerência' : (P.dept(p.deptId) || { name: 'Sem departamento' }).name; (groups[k] = groups[k] || []).push(p); });
    const fits = k => (e.areas || []).some(a => k.toLowerCase().includes(a.toLowerCase().slice(0, 4)));
    const order = Object.keys(groups).sort((a, b) => (fits(b) - fits(a)) || a.localeCompare(b));
    const isFirst = e.status === 'pendente', dl0 = D.iso(D.add(D.parse(e.date), -14)), dl = e.deadline || (dl0 < today() ? today() : dl0);
    P.ui.modal({
      title: isFirst ? `Aprovar · ${esc(e.title)}` : `Convidar mais pessoas · ${esc(e.title)}`, wide: true, submit: isFirst ? 'Aprovar e convidar' : 'Convidar',
      body: `<form class="form" novalidate><p class="fine">${when(e)}${e.place ? ' · ' + esc(e.place) : ''}${e.price ? ' · ' + brl(e.price) + ' por pessoa' : ''}</p>
        <div class="ag-ph"><b>Quem vai participar?</b><span id="evx-n">0 selecionado(s)</span></div>
        <div class="ag-groups">${order.map(k => `<button type="button" class="chip-btn" data-act="evsGroup" data-k="${esc(k)}">${icon('plus')}${esc(k)}</button>`).join('')}<button type="button" class="chip-btn ghost" data-act="evsGroup" data-k="">${icon('x')}Limpar</button></div>
        <div class="ag-people" id="evx-people">${order.map(k => `<div class="ag-dg" data-k="${esc(k)}"><small>${esc(k)}${fits(k) ? ' · área do evento' : ''}</small>${groups[k].map(p => `<label class="ag-p"><input type="checkbox" value="${p.id}" ${p.id === e.createdBy && isFirst ? 'checked' : ''}>${V.avatar(p)}<span><b>${esc(p.name)}</b><small>${esc(P.ROLES[p.role])}${p.id === e.createdBy ? ' · indicou' : ''}</small></span></label>`).join('')}</div>`).join('')}</div>
        <div class="fgrid" data-st="margin-top:12px">
          <label class="field"><span>Responder até</span><input type="date" id="evx-dl" min="${today()}" max="${e.date}" value="${dl}"></label>
        </div>
        <p class="fine" id="evx-cost"></p></form>`,
      onSubmit: m => {
        const ids = [...m.querySelectorAll('#evx-people input:checked')].map(i => i.value);
        if (!ids.length) fail('Escolha pelo menos uma pessoa.');
        e.invited = [...new Set((e.invited || []).concat(ids))]; e.resp = e.resp || {};
        ids.forEach(id => { e.resp[id] = { st: 'aguardando', at: D.stamp() }; });
        e.deadline = $('#evx-dl', m).value || e.deadline || '';
        if (isFirst) { e.status = 'aprovado'; e.decidedBy = u.id; e.decidedAt = D.stamp(); e.publish = 'convidados'; notify([e.createdBy], { icon: 'check', title: 'Sua indicação foi aprovada', text: `A direção aprovou ${e.title} e convidou ${ids.length} pessoa${ids.length > 1 ? 's' : ''}.` }); }
        notify(ids, { icon: 'calendar', title: 'Você foi convidado pela direção', text: `${e.title} · ${when(e)}${e.place ? ' · ' + e.place : ''}. Responda${e.deadline ? ' até ' + D.fmt(e.deadline) : ''}: confirmar, recusar ou indicar outra pessoa.` });
        P.audit(u, isFirst ? 'Evento aprovado' : 'Convidados adicionados', e.id, e.title + ' · ' + ids.map(name).join(', '));
        save(); P.toast(`${ids.length} convite${ids.length > 1 ? 's enviados' : ' enviado'}.`); P.fx && P.fx.success(); S().evs = { tab: 'aprovados' }; P.render();
      }
    });
    const m = $('#modal-root'), upd = () => { const n = m.querySelectorAll('#evx-people input:checked').length; $('#evx-n', m).textContent = n + ' selecionado(s)'; $('#evx-cost', m).textContent = e.price ? 'Custo estimado: ' + brl(n * e.price) + ' (' + n + ' × ' + brl(e.price) + ')' : ''; };
    m.querySelector('#evx-people').addEventListener('change', upd); upd();
  };
  A.evsGroup = el => {
    const m = $('#modal-root'), k = el.dataset.k;
    m.querySelectorAll('#evx-people .ag-dg').forEach(g => { if (!k || g.dataset.k === k) g.querySelectorAll('input').forEach(i => { i.checked = !!k; }); });
    m.querySelector('#evx-people').dispatchEvent(new Event('change'));
  };
  A.evsReject = el => {
    const u = U(), e = find(el.dataset.id); if (!e || !canDecide(u)) return;
    P.ui.modal({ title: 'Recusar indicação', submit: 'Recusar', body: `<form class="form"><p class="fine">${esc(e.title)} · indicado por ${esc(name(e.createdBy))}</p><label class="field"><span>Motivo <small>(opcional, ${esc(first(e.createdBy))} vê)</small></span><textarea id="evx-r" rows="2" maxlength="300"></textarea></label></form>`,
      onSubmit: m => { e.status = 'recusado'; e.reason = $('#evx-r', m).value.trim(); e.decidedBy = u.id; e.decidedAt = D.stamp(); notify([e.createdBy], { icon: 'x', title: 'Indicação de evento recusada', text: e.title + (e.reason ? ' · ' + e.reason : '') }); P.audit(u, 'Indicação de evento recusada', e.id, e.title); save(); P.toast('Indicação recusada.'); P.render(); } });
  };
  A.evsComment = el => {
    const u = U(), e = find(el.dataset.id); if (!e) return;
    P.ui.modal({ title: 'Comentar indicação', submit: 'Enviar', body: `<form class="form"><p class="fine">${esc(e.title)}</p><label class="field"><span>Comentário</span><textarea id="evx-c" rows="3" maxlength="400" placeholder="Ex.: Tem programação completa? Quanto custa o 2º lote?"></textarea></label></form>`,
      onSubmit: m => { const t = $('#evx-c', m).value.trim(); if (t.length < 2) fail('Escreva o comentário.'); (e.comments = e.comments || []).push({ by: u.id, at: D.stamp(), text: t }); notify(u.id === e.createdBy ? global() : [e.createdBy], { icon: 'message', title: 'Comentário na indicação ' + e.title, text: u.name + ': ' + t }); save(); P.toast('Comentário enviado.'); P.render(); } });
  };

  /* ---------- Convidado: confirmar, recusar ou indicar outra pessoa ---------- */
  A.evsRespond = el => {
    const u = U(), e = find(el.dataset.id); if (!e || !(e.invited || []).includes(u.id)) return;
    const cur = (e.resp || {})[u.id] || {}, others = active().filter(x => x.id !== u.id && !(e.invited || []).includes(x.id)).sort((a, b) => a.name.localeCompare(b.name));
    P.ui.modal({
      title: 'Convite · ' + e.title, submit: 'Enviar resposta',
      body: `<form class="form" novalidate><p class="fine">${when(e)}${e.place ? ' · ' + esc(e.place) : ''}${e.deadline ? ' · responda até ' + D.fmt(e.deadline) : ''}</p>
        <div class="evx-ops">
          <label class="evx-op ok"><input type="radio" name="evx-o" value="sim" ${cur.st !== 'nao' && cur.st !== 'troca' ? 'checked' : ''}>${icon('check')}<b>Vou participar</b><small>Confirma presença</small></label>
          <label class="evx-op no"><input type="radio" name="evx-o" value="nao" ${cur.st === 'nao' ? 'checked' : ''}>${icon('x')}<b>Não posso ir</b><small>Recusa com motivo</small></label>
          <label class="evx-op sw"><input type="radio" name="evx-o" value="troca" ${cur.st === 'troca' ? 'checked' : ''}>${icon('users')}<b>Indicar outra pessoa</b><small>Sugere quem vai no lugar</small></label>
        </div>
        <label class="field evx-sub"><span>Quem pode ir no seu lugar?</span><select id="evx-sub"><option value="">Escolha…</option>${others.map(p => `<option value="${p.id}" ${cur.sub === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>
        <label class="field evx-why"><span>Motivo ou observação <small>(a direção vê)</small></span><textarea id="evx-w" rows="2" maxlength="300">${esc(cur.why || '')}</textarea></label>
        <p class="fine evx-sub">A troca só vale depois que a direção aprovar. Até lá, o convite continua com você.</p></form>`,
      onSubmit: m => {
        const o = (m.querySelector('input[name=evx-o]:checked') || {}).value, why = $('#evx-w', m).value.trim(), sub = $('#evx-sub', m).value;
        if (o === 'nao' && why.length < 3) fail('Conte rapidamente o motivo da recusa.');
        if (o === 'troca' && !sub) fail('Escolha quem pode ir no seu lugar.');
        e.resp[u.id] = { st: o, at: D.stamp(), why, sub: o === 'troca' ? sub : '' };
        const dec = global().concat(e.decidedBy || []);
        if (o === 'sim') notify([e.decidedBy], { icon: 'check', title: `${u.name} confirmou presença`, text: e.title + ' · ' + when(e) });
        if (o === 'nao') notify(dec, { icon: 'x', title: `${u.name} recusou o convite`, text: e.title + ' · ' + why });
        if (o === 'troca') notify(dec, { icon: 'users', title: `${u.name} sugeriu ${name(sub)} no lugar`, text: e.title + (why ? ' · ' + why : '') + '. Aprove ou mantenha o convite.' });
        P.audit(u, 'Resposta a convite de evento', e.id, e.title + ' · ' + RESP[o][0]);
        save(); P.toast(o === 'sim' ? 'Presença confirmada. O evento está na sua agenda.' : o === 'nao' ? 'Convite recusado. A direção foi avisada.' : 'Sugestão enviada para a direção.'); P.render();
      }
    });
    const m = $('#modal-root'), sync = () => { const o = (m.querySelector('input[name=evx-o]:checked') || {}).value; m.querySelectorAll('.evx-sub').forEach(x => { x.hidden = o !== 'troca'; }); m.querySelector('.evx-why').hidden = o === 'sim'; };
    m.querySelectorAll('input[name=evx-o]').forEach(i => i.addEventListener('change', sync)); sync();
  };
  A.evsSwapOk = el => {
    const u = U(), e = find(el.dataset.id), id = el.dataset.u; if (!e || !canDecide(u)) return;
    const r = e.resp[id]; if (!r || r.st !== 'troca' || !r.sub) return;
    e.invited = e.invited.filter(x => x !== id).concat(e.invited.includes(r.sub) ? [] : [r.sub]);
    e.resp[r.sub] = { st: 'aguardando', at: D.stamp(), why: '', from: id }; delete e.resp[id];
    notify([r.sub], { icon: 'calendar', title: `Você foi convidado no lugar de ${first(id)}`, text: `${e.title} · ${when(e)}${e.place ? ' · ' + e.place : ''}. Confirme sua presença.` });
    notify([id], { icon: 'check', title: 'Troca aprovada', text: `${name(r.sub)} vai ao ${e.title} no seu lugar. O evento saiu da sua agenda.` });
    P.audit(u, 'Troca de participante aprovada', e.id, e.title + ' · ' + name(id) + ' → ' + name(r.sub)); save(); P.toast('Troca aprovada. Os dois foram avisados.'); P.render();
  };
  A.evsSwapNo = el => {
    const u = U(), e = find(el.dataset.id), id = el.dataset.u; if (!e || !canDecide(u)) return;
    e.resp[id] = { st: 'aguardando', at: D.stamp(), why: '' };
    notify([id], { icon: 'calendar', title: 'A direção manteve o seu convite', text: `${e.title} · ${when(e)}. Confirme sua presença ou recuse com o motivo.` });
    P.audit(u, 'Troca de participante não aprovada', e.id, e.title + ' · ' + name(id)); save(); P.toast('Convite mantido. ' + first(id) + ' foi avisado(a).'); P.render();
  };

  /* ---------- Solicitação de compra dos ingressos (gerência) ---------- */
  A.evsBuy = el => {
    const u = U(), e = find(el.dataset.id); if (!e || !P.purchases || !P.purchases.canRequest(u)) return;
    const n = confirmed(e).length; if (!n) return P.toast('Ninguém confirmou ainda.', 'err');
    db().purchases = db().purchases || [];
    const r = { id: P.uid('pr'), by: u.id, deptId: u.deptId || null, at: D.stamp(), item: 'Ingressos · ' + e.title + ' (' + D.fmt(e.date) + ')', category: 'outros', qty: n, unit: 'ingresso', estimate: Math.round(n * e.price * 100) / 100, urgency: 'normal', why: 'Evento aprovado pela direção. Participantes: ' + confirmed(e).map(name).join(', ') + '.', link: e.link || '', status: 'solicitada', history: [{ at: D.stamp(), by: u.id, action: 'Solicitada', note: 'Ingressos de evento aprovado' }] };
    db().purchases.push(r); e.purchaseId = r.id;
    notify(active().filter(x => x.role === 'admin').map(x => x.id), { type: 'compra', icon: 'cart', link: 'solicitacoes', title: 'Nova solicitação de compra', text: u.name + ': ' + r.item + ' (' + brl(r.estimate) + ')' });
    P.audit(u, 'Solicitação de compra aberta', r.id, r.item + ' · ' + brl(r.estimate)); save(); P.toast('Solicitação de compra enviada para a diretoria.'); P.render();
  };

  /* ---------- Calendário: botões e eventos ---------- */
  const origCal = V.calendario;
  V.calendario = u => {
    const html = origCal(u), box = document.createElement('div'); box.innerHTML = html;
    const b = box.querySelector('[data-act=agendaNew]'), n = P.evSug.badge(u);
    if (b) b.insertAdjacentHTML('beforebegin', V.btn('Eventos do setor' + (n ? ` <em class="nav-count">${n}</em>` : ''), { go: 'eventos', icon: 'bulb', cls: 'ghost' }) + V.btn('Indicar evento', { act: 'evsNew', icon: 'plus', cls: 'evx-go' }));
    return box.innerHTML;
  };
  // item de evento externo no painel do dia: leva para a página de eventos
  const origItem = V.agendaItem;
  V.agendaItem = (u, e) => e.ext ? `<div class="evt ev evx-day">${icon('bulb')}<span><b>${esc(e.title)}</b><small>Evento do setor${e.start ? ' · ' + e.start + (e.end ? '–' + e.end : '') : ''}${e.place ? ' · ' + esc(e.place) : ''}${e.participants.length ? ' · ' + e.participants.length + ' participante(s)' : ''}</small></span>${V.btn('Ver', { go: 'eventos', cls: 'sm ghost' })}</div>` : origItem(u, e);

  /* ---------- Painel inicial: convite pendente ---------- */
  const origDash = V.dashboard;
  V.dashboard = u => {
    const html = origDash(u), p = myPending(u), fi = myInfo(u); if (!p.length && !fi.length) return html;
    const card = (fi.length ? `<div class="evx-inv">${icon('message')}<span><b>A direção pediu mais informações sobre ${fi.length === 1 ? 'sua indicação' : fi.length + ' indicações suas'}</b><small>${fi.map(e => esc(e.title)).join(' · ')}</small></span>${fi.length === 1 ? V.btn('Completar', { act: 'evsFill', cls: 'evx-go sm', attrs: `data-id="${fi[0].id}"` }) : V.btn('Ver indicações', { go: 'eventos', cls: 'evx-go sm' })}</div>` : '') + (!p.length ? '' : `<div class="evx-inv">${icon('calendar')}<span><b>${p.length === 1 ? 'Você foi convidado para um evento' : 'Você tem ' + p.length + ' convites para eventos'}</b><small>${p.map(e => esc(e.title) + ' · ' + D.fmt(e.date)).join(' · ')}</small></span>${p.length === 1 ? V.btn('Responder', { act: 'evsRespond', cls: 'evx-go sm', attrs: `data-id="${p[0].id}"` }) : V.btn('Ver convites', { go: 'eventos', cls: 'evx-go sm' })}</div>`);
    const box = document.createElement('div'); box.innerHTML = html;
    const head = box.querySelector('.wsum') || box.querySelector('.page-head');
    if (head) head.insertAdjacentHTML('afterend', card); else box.insertAdjacentHTML('afterbegin', card);
    return box.innerHTML;
  };

  /* ---------- Lembretes: véspera do evento (confirmados) e prazo de resposta (direção) ---------- */
  const remind = () => {
    const u = U(); if (!u || !P.notify || missing()) return;
    let seen; try { seen = JSON.parse(localStorage.getItem('prumo.evs.' + u.id) || '{}'); } catch (e) { seen = {}; }
    const tm = D.iso(D.add(P.today(), 1)); let n = 0;
    list().filter(e => e.status === 'aprovado').forEach(e => {
      if (e.date === tm && confirmed(e).includes(u.id) && !seen['v' + e.id]) { seen['v' + e.id] = 1; P.notify([u.id], { type: 'evento', icon: 'clock', link: 'eventos', title: 'Amanhã: ' + e.title, text: when(e) + (e.place ? ' · ' + e.place : '') }); n++; }
      const left = e.deadline ? Math.round((D.parse(e.deadline) - D.parse(today())) / 864e5) : -1, wait = (e.invited || []).filter(id => (e.resp[id] || {}).st === 'aguardando');
      if (canDecide(u) && left >= 0 && left <= 3 && wait.length && !seen['d' + e.id]) { seen['d' + e.id] = 1; P.notify([u.id], { type: 'evento', icon: 'bell', link: 'eventos', title: 'Prazo de resposta: ' + e.title, text: `Faltam ${left} dia(s). ${wait.length} convidado(s) ainda não respondeu: ${wait.map(first).join(', ')}.` }); n++; }
    });
    try { localStorage.setItem('prumo.evs.' + u.id, JSON.stringify(seen)); } catch (e) { }
    if (n) save();
  };
  setTimeout(remind, 7000); setInterval(remind, 60 * 60e3);
})(window.P);
