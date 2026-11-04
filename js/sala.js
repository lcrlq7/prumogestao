/* Prumo — Sala de reuniões
 * - A reserva é um evento da Agenda marcado com "Usar a sala de reuniões" (e.room = true).
 * - Não deixa reservar em cima de outra reunião (validação em P.agenda.save).
 * - Todos veem se a sala está livre ou ocupada: faixa em "Sua agenda de hoje" e página "Sala de reuniões".
 * - Quem reservou (ou a diretoria) pode encerrar mais cedo, editar ou cancelar.
 */
'use strict';
(function (P) {
  const D = P.date, esc = P.esc, V = P.V, icon = V.icon, A = P.ext.actions;
  const db = () => P.store.db, S = () => P.state;
  const OPEN = 8 * 60, CLOSE = 18 * 60;
  const mins = s => { const [h, m] = String(s || '').split(':').map(Number); return (h || 0) * 60 + (m || 0); };
  const hhmm = n => String(Math.floor(n / 60)).padStart(2, '0') + ':' + String(n % 60).padStart(2, '0');
  const endOf = e => e.end ? mins(e.end) : mins(e.start) + 60;
  const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
  const today = () => D.iso(P.today());
  const dur = n => n >= 60 ? Math.floor(n / 60) + 'h' + (n % 60 ? String(n % 60).padStart(2, '0') : '') : n + ' min';

  const bookings = date => (db().events || []).filter(e => e.room && !e.canceled && e.date === date && e.start).sort((a, b) => a.start.localeCompare(b.start));
  const people = e => (e.participants || []).concat(e.createdBy).filter((x, i, a) => x && a.indexOf(x) === i).map(id => P.user(id)).filter(Boolean);
  const names = e => { const l = people(e).map(p => p.name.split(' ')[0]); return l.length > 1 ? l.slice(0, -1).join(', ') + ' e ' + l[l.length - 1] : l[0] || ''; };
  // horários vagos do dia (entre 8h e 18h)
  const gaps = date => {
    const out = []; let t = OPEN;
    bookings(date).forEach(e => { const s = mins(e.start), f = endOf(e); if (s > t) out.push([t, s]); t = Math.max(t, f); });
    if (t < CLOSE) out.push([t, CLOSE]);
    return out;
  };
  const status = () => {
    const list = bookings(today()), n = nowMin();
    const cur = list.find(e => mins(e.start) <= n && n < endOf(e));
    const next = list.find(e => mins(e.start) > n);
    return { cur, next, n };
  };
  // conflito com outra reserva (usado ao salvar o evento)
  const conflict = (date, start, end, ignoreId) => {
    const s = mins(start), f = end ? mins(end) : s + 60;
    return bookings(date).find(e => e.id !== ignoreId && mins(e.start) < f && s < endOf(e));
  };
  const freeHint = (date, len) => gaps(date).filter(([a, b]) => b - a >= len && (date !== today() || b > nowMin())).slice(0, 3)
    .map(([a]) => { const s = date === today() ? Math.max(a, Math.ceil(nowMin() / 30) * 30) : a; return hhmm(s); });
  P.room = { bookings, conflict, freeHint, status, mins };

  /* ---------- Faixa compacta (dentro de "Sua agenda de hoje") ---------- */
  P.room.strip = () => {
    const { cur, next, n } = status();
    if (cur) {
      const s = mins(cur.start), f = endOf(cur), pct = Math.min(100, Math.max(0, Math.round((n - s) / (f - s) * 100)));
      return `<a class="rm-strip busy" data-go="sala" href="#/sala" title="Abrir a sala de reuniões">
        <span class="rm-ic">${icon('building')}</span>
        <span class="rm-tx"><b><i class="rm-lv"></i>Sala ocupada</b> · ${esc(cur.title)}<small>${esc(names(cur))}</small></span>
        <span class="rm-bar"><i style="width:${pct}%"></i></span><span class="rm-tm">até ${hhmm(f)}</span>${icon('right')}</a>`;
    }
    return `<a class="rm-strip free" data-go="sala" href="#/sala" title="Abrir a sala de reuniões">
      <span class="rm-ic">${icon('building')}</span>
      <span class="rm-tx"><b><i class="rm-lv"></i>Sala livre</b>${next ? ' até ' + next.start : ''}<small>${next ? 'Próxima: ' + esc(next.title) + ' às ' + next.start + ' · ' + esc(names(next)) : 'Nenhuma outra reserva hoje'}</small></span>
      <span class="rm-tm">Reservar</span>${icon('right')}</a>`;
  };

  /* ---------- Página ---------- */
  P.PAGES.sala = ['admin', 'office', 'manager', 'employee'];
  V.sala = u => {
    const day = S().roomDay || today(), isToday = day === today(), list = bookings(day), { cur, next, n } = status();
    const dt = D.parse(day), wd = dt.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }).replace(/^./, c => c.toUpperCase());
    // placa grande: situação de agora
    let plate;
    if (cur) {
      const s = mins(cur.start), f = endOf(cur), pct = Math.min(100, Math.max(0, Math.round((n - s) / (f - s) * 100)));
      plate = `<div class="rm-plate busy"><span class="rm-st"><i class="rm-lv"></i>Ocupada agora</span><b class="rm-big">${esc(cur.title)}</b>
        <span class="rm-sub">${esc(names(cur))} · termina às ${hhmm(f)} (em ${dur(f - n)})</span><span class="rm-pbar"><i style="width:${pct}%"></i></span></div>`;
    } else {
      plate = `<div class="rm-plate free"><span class="rm-st"><i class="rm-lv"></i>Livre agora</span><b class="rm-big">Sala disponível</b>
        <span class="rm-sub">${next ? 'Livre até ' + next.start + ' · próxima: ' + esc(next.title) : 'Nenhuma outra reserva hoje'}</span><span class="rm-pbar"><i style="width:0"></i></span></div>`;
    }
    const pos = m => ((Math.min(CLOSE, Math.max(OPEN, m)) - OPEN) / (CLOSE - OPEN) * 100).toFixed(2);
    const ribbon = `<div class="rm-rib">${list.map(e => { const s = mins(e.start), f = endOf(e), k = isToday && f <= n ? 'past' : isToday && s <= n ? 'now' : day < today() ? 'past' : 'next';
        return `<span class="rm-rb ${k}" style="left:${pos(s)}%;width:${(pos(f) - pos(s)).toFixed(2)}%" title="${esc(e.start + '–' + hhmm(f) + ' · ' + e.title)}"></span>`; }).join('')}
      ${gaps(day).map(([a, b]) => `<button type="button" class="rm-gap" data-act="agendaNew" data-room="1" data-date="${day}" data-start="${hhmm(a)}" style="left:${pos(a)}%;width:${(pos(b) - pos(a)).toFixed(2)}%" title="Reservar a partir das ${hhmm(a)}" aria-label="Reservar a partir das ${hhmm(a)}"></button>`).join('')}
      ${isToday && n >= OPEN && n <= CLOSE ? `<span class="rm-now" style="left:${pos(n)}%"></span>` : ''}</div>
      <div class="rm-hh">${[8, 10, 12, 14, 16, 18].map(h => `<span>${h}h</span>`).join('')}</div>`;
    const tag = e => {
      const s = mins(e.start), f = endOf(e);
      if (day < today() || (isToday && f <= n)) return '<span class="rm-tag past">Encerrada</span>';
      if (isToday && s <= n) return '<span class="rm-tag now">Em andamento</span>';
      return `<span class="rm-tag">${isToday ? 'Em ' + dur(s - n) : 'Às ' + e.start}</span>`;
    };
    const rows = list.map(e => {
      const f = endOf(e), live = isToday && mins(e.start) <= n && n < f, past = day < today() || (isToday && f <= n), can = P.agenda.canEdit(u, e);
      return `<li class="rm-it ${past ? 'past' : live ? 'now' : ''}"><span class="rm-t">${e.start}<small>${hhmm(f)}</small></span><span class="rm-bd"></span>
        <span class="rm-ev"><b>${esc(e.title)}</b><small>${esc(names(e))}</small></span>${tag(e)}
        ${can && live ? V.btn('Encerrar', { act: 'roomEnd', cls: 'sm', attrs: `data-id="${e.id}"` }) : ''}
        ${can && !past ? `${V.btn('', { act: 'agendaEdit', cls: 'sm ghost icon', icon: 'edit', attrs: `data-id="${e.id}" title="Editar" aria-label="Editar"` })}${V.btn('', { act: 'agendaCancel', cls: 'sm ghost icon', icon: 'x', attrs: `data-id="${e.id}" title="Cancelar reserva" aria-label="Cancelar reserva"` })}` : ''}</li>`;
    }).join('');
    const free = gaps(day).reduce((t, [a, b]) => t + Math.max(0, b - Math.max(a, isToday ? n : a)), 0);
    return `<div class="page-head"><div><h1>Sala de reuniões</h1><p class="fine">Veja se a sala está livre e reserve um horário. A reserva também aparece na Agenda dos participantes.</p></div>
        ${day >= today() ? V.btn('Reservar', { act: 'agendaNew', icon: 'plus', cls: 'rm-go', attrs: `data-room="1" data-date="${day}"` }) : ''}</div>
      ${isToday ? plate : ''}
      <section class="card rm-day">
        <div class="rm-dh"><span class="rm-nav">${V.btn('', { act: 'roomDay', cls: 'sm ghost icon', icon: 'left', attrs: 'data-d="-1" aria-label="Dia anterior"' })}<b>${isToday ? 'Hoje, ' : ''}${esc(wd)}</b>${V.btn('', { act: 'roomDay', cls: 'sm ghost icon', icon: 'right', attrs: 'data-d="1" aria-label="Próximo dia"' })}${!isToday ? V.btn('Hoje', { act: 'roomDay', cls: 'sm ghost', attrs: 'data-d="0"' }) : ''}</span>
          <small>${list.length} reserva${list.length === 1 ? '' : 's'}${day >= today() ? ' · ' + dur(free) + ' livres' : ''}</small></div>
        ${ribbon}
        ${rows ? `<ol class="rm-list">${rows}</ol>` : `<p class="fine rm-empty">${icon('check')} Nenhuma reserva neste dia. Clique numa faixa livre ou em "Reservar".</p>`}
      </section>`;
  };

  A.roomDay = el => { const d = +el.dataset.d; S().roomDay = d ? D.iso(D.add(D.parse(S().roomDay || today()), d)) : today(); P.render(); };
  A.roomEnd = el => {
    const u = S().user, e = db().events.find(x => x.id === el.dataset.id);
    if (!e || !P.agenda.canEdit(u, e)) return P.toast('Somente quem reservou (ou a diretoria) encerra a reunião.', 'err');
    e.end = hhmm(Math.max(mins(e.start) + 1, nowMin()));
    P.audit(u, 'Sala liberada', e.id, e.title + ' · encerrada às ' + e.end); P.store.save();
    P.toast('Reunião encerrada. A sala está livre.'); P.render();
  };

  // atualiza a situação da sala a cada minuto no painel e na página da sala
  setInterval(() => {
    const st = P.state; if (!st || !st.user || !st.route || !['dashboard', 'sala'].includes(st.route.page)) return;
    const m = document.querySelector('#modal-root'); if (m && !m.hidden) return;
    if (document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
    P.render && P.render();
  }, 60e3);
})(window.P);
