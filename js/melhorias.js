/* Prumo — Sugestões de melhoria: qualquer pessoa envia uma ideia (com imagens) e ela chega para os gestores do BPO Financeiro e do Contábil.
 * Quem recebe acompanha, muda a situação e responde; quem enviou é avisado. Ficam na coleção suggestions (tabela suggestions). */
'use strict';
(function (P) {
  const D = P.date, esc = P.esc, V = P.V, A = P.actions, icon = V.icon;
  const db = () => P.store.db, U = () => P.state.user;
  const list = () => (db().suggestions = db().suggestions || []);
  const st = () => (P.state.sug = P.state.sug || { tab: '' });
  P.PAGES.melhorias = ['admin', 'office', 'manager', 'employee'];
  const MAX_IMG = 4;
  const STATUS = { nova: ['Nova', 'st-sem'], analise: ['Em análise', 'es-pendente'], feita: ['Implementada', 'es-aprovado'], descartada: ['Não será feita', 'es-recusado'] };

  // quem recebe: os gestores do BPO Financeiro e do Contábil (sem gestor cadastrado, vai para a diretoria)
  const recipients = () => {
    const ids = db().departments.filter(d => d.active !== false && /bpo|cont[aá]bil/i.test(d.name || '')).map(d => d.managerId).filter(id => id && P.user(id) && P.user(id).active !== false);
    return ids.length ? [...new Set(ids)] : db().users.filter(x => x.role === 'admin' && x.active !== false).map(x => x.id);
  };
  const isRecipient = (u, s) => !!u && (s ? (s.to || []).includes(u.id) : recipients().includes(u.id));
  const available = () => !(P.isLive && P.suggMissing);

  // imagens: reduz para no máximo 1280 px e grava como JPEG (poucas centenas de KB)
  let pending = [];
  const shrink = f => new Promise((ok, fail) => {
    if (!/^image\//.test(f.type)) return fail(new Error('Envie apenas imagens (JPG, PNG, WEBP ou print da tela).'));
    const url = URL.createObjectURL(f), img = new Image();
    img.onload = () => {
      const k = Math.min(1, 1280 / Math.max(img.naturalWidth, img.naturalHeight)), c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
      const cx = c.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, c.width, c.height); cx.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url); ok(c.toDataURL('image/jpeg', 0.72));
    };
    img.onerror = () => { URL.revokeObjectURL(url); fail(new Error('Não foi possível ler a imagem ' + f.name + '.')); };
    img.src = url;
  });
  const okImg = s => typeof s === 'string' && /^data:image\/jpeg;base64,/.test(s);
  const thumbs = (imgs, removable) => imgs.map((s, i) => `<span class="sg-th">${okImg(s) ? `<img src="${s}" alt="Imagem ${i + 1}" data-act="sugImg" data-src="${i}">` : ''}${removable ? `<button type="button" class="sg-x" data-act="sugImgDel" data-i="${i}" aria-label="Remover imagem">${icon('x')}</button>` : ''}</span>`).join('');
  const drawPending = () => { const b = document.getElementById('sg-imgs'); if (b) b.innerHTML = thumbs(pending, true); const n = document.getElementById('sg-n'); if (n) n.textContent = pending.length + '/' + MAX_IMG; };
  const addFiles = async files => {
    for (const f of [...files]) {
      if (pending.length >= MAX_IMG) { P.toast('No máximo ' + MAX_IMG + ' imagens por sugestão.', 'err'); break; }
      try { pending.push(await shrink(f)); } catch (e) { P.toast(e.message, 'err'); }
    }
    drawPending();
  };
  document.addEventListener('change', ev => { if (ev.target && ev.target.id === 'sg-file') { addFiles(ev.target.files); ev.target.value = ''; } });
  // colar um print (Ctrl+V) direto no formulário
  document.addEventListener('paste', ev => {
    if (!document.getElementById('sg-imgs') || !ev.clipboardData) return;
    const fs = [...ev.clipboardData.items].filter(i => i.type.startsWith('image/')).map(i => i.getAsFile()).filter(Boolean);
    if (fs.length) { ev.preventDefault(); addFiles(fs); }
  });
  A.sugImgDel = el => { pending.splice(Number(el.dataset.i), 1); drawPending(); };

  A.sugNew = () => {
    if (!available()) return P.toast('As sugestões ainda não estão ativadas no banco (falta rodar o SQL enviado no chat).', 'err');
    pending = [];
    const to = recipients().map(id => (P.user(id) || {}).name).filter(Boolean);
    P.ui.modal({
      title: 'Nova sugestão de melhoria', submit: 'Enviar sugestão', wide: true,
      body: `<p class="prose">Conte o que pode melhorar no sistema ou no dia a dia. Vai para ${esc(to.join(' e ') || 'a diretoria')}.</p>
        <div class="fgrid"><label class="field span3"><span>Título</span><input id="sg-title" maxlength="120" placeholder="Ex.: filtro por código na tela de tarefas"></label>
        <label class="field span3"><span>Descrição</span><textarea id="sg-text" rows="5" maxlength="4000" placeholder="O que acontece hoje, o que você sugere e por que ajudaria"></textarea></label></div>
        <div class="sg-up"><label class="btn ghost sm">${icon('plus')}<span>Adicionar imagem</span><input type="file" id="sg-file" accept="image/*" multiple hidden></label>
        <small class="muted">ou cole um print com Ctrl+V · <span id="sg-n">0/${MAX_IMG}</span></small></div>
        <div class="sg-imgs" id="sg-imgs"></div>`,
      onSubmit: () => {
        const u = U(), title = document.getElementById('sg-title').value.trim(), text = document.getElementById('sg-text').value.trim();
        if (title.length < 3) throw new Error('Dê um título para a sugestão.');
        if (!text && !pending.length) throw new Error('Descreva a sugestão ou adicione uma imagem.');
        const s = { id: P.uid('sg'), from: u.id, deptId: u.deptId || '', to: recipients(), title, text, imgs: pending.slice(), status: 'nova', at: D.stamp(), ts: Date.now(), history: [] };
        list().push(s); pending = [];
        P.notify(s.to.filter(id => id !== u.id), { type: 'melhoria', icon: 'bulb', title: 'Nova sugestão de melhoria', text: `${u.name}: ${title}`, link: 'melhorias' });
        P.store.save(); P.toast('Sugestão enviada. Obrigado!'); st().tab = 'minhas'; P.render();
      }
    });
  };
  // visualizador: zoom (botões, Ctrl + roda do mouse, duplo clique), arrastar, baixar e passar entre as imagens
  const view = { s: null, i: 0, z: 0 };
  const fileName = (s, i) => 'sugestao-' + String(s.title || 'imagem').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 40) + '-' + (i + 1) + '.jpg';
  const paint = () => {
    const box = document.getElementById('sgv'); if (!box) return;
    const img = box.querySelector('img'), n = view.s.imgs.length;
    img.src = view.s.imgs[view.i];
    img.classList.toggle('fit', view.z === 0); img.style.width = view.z === 0 ? '' : Math.round(img.naturalWidth * view.z) + 'px';
    box.querySelector('.sgv-z').textContent = view.z === 0 ? 'Ajustar' : Math.round(view.z * 100) + '%';
    box.querySelector('.sgv-n').textContent = n > 1 ? (view.i + 1) + ' de ' + n : '';
    box.querySelectorAll('.sgv-nav').forEach(b => { b.hidden = n < 2; });
    const a = box.querySelector('.sgv-dl'); a.href = view.s.imgs[view.i]; a.download = fileName(view.s, view.i);
  };
  const zoomTo = z => { view.z = Math.max(0.25, Math.min(4, z)); paint(); };
  const curZoom = () => { if (view.z) return view.z; const img = document.querySelector('#sgv img'); return img && img.naturalWidth ? img.clientWidth / img.naturalWidth : 1; };
  A.sugImg = el => {
    const s = list().find(x => x.id === el.closest('[data-sid]').dataset.sid), i = Number(el.dataset.src);
    if (!s || !okImg(s.imgs[i])) return;
    Object.assign(view, { s, i, z: 0 });
    P.ui.modal({ title: esc(s.title), cancel: 'Fechar', wide: true, body: `<div class="sgv" id="sgv">
      <div class="sgv-bar"><button type="button" class="btn sm ghost sgv-nav" data-act="sugImgGo" data-d="-1" aria-label="Imagem anterior">${icon('left')}</button><span class="sgv-n"></span><button type="button" class="btn sm ghost sgv-nav" data-act="sugImgGo" data-d="1" aria-label="Próxima imagem">${icon('right')}</button>
        <span class="sgv-sp"></span>
        <button type="button" class="btn sm ghost" data-act="sugZoom" data-k="-" aria-label="Diminuir zoom" title="Diminuir zoom">−</button>
        <button type="button" class="btn sm ghost sgv-z" data-act="sugZoom" data-k="0" title="Alternar entre ajustar à tela e tamanho real">Ajustar</button>
        <button type="button" class="btn sm ghost" data-act="sugZoom" data-k="+" aria-label="Aumentar zoom" title="Aumentar zoom">+</button>
        <a class="btn sm primary sgv-dl" href="#" download>${icon('download')}<span>Baixar imagem</span></a></div>
      <div class="sgv-stage"><img alt="Imagem anexada à sugestão"></div>
      <small class="muted">Ctrl + roda do mouse dá zoom · arraste para mover · clique duas vezes para alternar entre ajustar e 100%.</small></div>` });
    const stage = document.querySelector('#sgv .sgv-stage'), img = stage.querySelector('img');
    img.onload = () => { if (view.z) paint(); };
    paint();
    stage.addEventListener('wheel', ev => { if (!ev.ctrlKey) return; ev.preventDefault(); zoomTo(curZoom() * (ev.deltaY < 0 ? 1.2 : 1 / 1.2)); }, { passive: false });
    stage.addEventListener('dblclick', () => { view.z = view.z === 0 ? 1 : 0; paint(); });
    let drag = null;
    stage.addEventListener('mousedown', ev => { if (view.z === 0) return; drag = { x: ev.clientX, y: ev.clientY, l: stage.scrollLeft, t: stage.scrollTop }; stage.classList.add('drag'); ev.preventDefault(); });
    stage.addEventListener('mousemove', ev => { if (drag) { stage.scrollLeft = drag.l - (ev.clientX - drag.x); stage.scrollTop = drag.t - (ev.clientY - drag.y); } });
    ['mouseup', 'mouseleave'].forEach(t => stage.addEventListener(t, () => { drag = null; stage.classList.remove('drag'); }));
  };
  A.sugZoom = el => { const k = el.dataset.k; if (k === '0') { view.z = view.z === 0 ? 1 : 0; paint(); } else zoomTo(curZoom() * (k === '+' ? 1.25 : 0.8)); };
  A.sugImgGo = el => { const n = view.s.imgs.length; view.i = (view.i + Number(el.dataset.d) + n) % n; view.z = 0; paint(); };

  // assumir: quem recebe pega a sugestão para si; os outros veem que já tem responsável e não precisam tratar
  const done = s => ['feita', 'descartada'].includes(s.status);
  A.sugTake = el => {
    const u = U(), s = list().find(x => x.id === el.dataset.id); if (!s || !isRecipient(u, s)) return;
    if (s.owner && s.owner !== u.id && !confirm(P.firstName((P.user(s.owner) || {}).name || '') + ' já assumiu esta sugestão. Assumir no lugar?')) return;
    const prev = s.owner; s.owner = u.id; s.ownerAt = D.stamp(); if (s.status === 'nova') s.status = 'analise';
    (s.history = s.history || []).push({ at: D.stamp(), by: u.id, status: s.status, reply: 'Assumiu a sugestão' });
    P.notify((s.to || []).filter(id => id !== u.id), { type: 'melhoria', icon: 'check', title: u.name + ' assumiu uma sugestão', text: s.title + ' · você não precisa tratar esta.', link: 'melhorias' });
    if (s.from !== u.id) P.notify([s.from], { type: 'melhoria', icon: 'bulb', title: 'Sua sugestão está em análise', text: s.title + ' · com ' + u.name + '.', link: 'melhorias' });
    P.store.save(); P.toast(prev ? 'Sugestão transferida para você.' : 'Sugestão assumida. Os outros gestores foram avisados.'); P.render();
  };
  A.sugDrop = el => {
    const u = U(), s = list().find(x => x.id === el.dataset.id); if (!s || s.owner !== u.id) return;
    delete s.owner; delete s.ownerAt; (s.history = s.history || []).push({ at: D.stamp(), by: u.id, status: s.status, reply: 'Liberou a sugestão' });
    P.notify((s.to || []).filter(id => id !== u.id), { type: 'melhoria', icon: 'bulb', title: u.name + ' liberou uma sugestão', text: s.title + ' · está sem responsável de novo.', link: 'melhorias' });
    P.store.save(); P.toast('Sugestão liberada.'); P.render();
  };
  const sgActs = (s, u) => {
    const b = (l, act, cls, ic) => V.btn(l, { act, cls: 'sm ' + cls, icon: ic, attrs: `data-id="${esc(s.id)}"` });
    if (done(s)) return `<span class="sg-acts">${b('Editar resposta', 'sugReply', 'ghost', 'edit')}</span>`;
    if (!s.owner) return `<span class="sg-acts">${b('Assumir', 'sugTake', 'primary', 'check')}${b('Responder', 'sugReply', 'ghost', 'edit')}</span>`;
    if (s.owner === u.id) return `<span class="sg-acts">${b('Responder', 'sugReply', 'primary', 'edit')}${b('Liberar', 'sugDrop', 'ghost')}</span>`;
    return `<span class="sg-acts">${b('Assumir no lugar', 'sugTake', 'ghost')}</span>`;
  };
  A.sugTab = el => { st().tab = el.dataset.k; P.render(); };
  // quem recebe muda a situação e pode responder; quem enviou é avisado
  A.sugReply = el => {
    const u = U(), s = list().find(x => x.id === el.dataset.id); if (!s || !isRecipient(u, s)) return;
    P.ui.modal({
      title: 'Responder sugestão', submit: 'Salvar',
      body: `<p class="prose"><b>${esc(s.title)}</b></p><div class="fgrid">
        <label class="field span3"><span>Situação</span><select id="sg-st">${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${s.status === k ? 'selected' : ''}>${v[0]}</option>`).join('')}</select></label>
        <label class="field span3"><span>Resposta para ${esc(P.firstName((P.user(s.from) || {}).name || ''))} (opcional)</span><textarea id="sg-rep" rows="3" maxlength="2000">${esc(s.reply || '')}</textarea></label></div>`,
      onSubmit: () => {
        const status = document.getElementById('sg-st').value, reply = document.getElementById('sg-rep').value.trim();
        if (status === s.status && reply === (s.reply || '')) return;
        s.status = status; s.reply = reply; s.replyBy = u.id; s.replyAt = D.stamp(); if (!s.owner) { s.owner = u.id; s.ownerAt = D.stamp(); }
        (s.history = s.history || []).push({ at: D.stamp(), by: u.id, status, reply });
        if (s.from !== u.id) P.notify([s.from], { type: 'melhoria', icon: 'bulb', title: 'Sua sugestão: ' + STATUS[status][0].toLowerCase(), text: s.title + (reply ? ' · ' + reply.slice(0, 120) : ''), link: 'melhorias' });
        P.store.save(); P.toast('Sugestão atualizada.'); P.render();
      }
    });
  };

  const card = (s, u) => {
    const who = P.user(s.from) || { name: '—' }, by = s.replyBy && P.user(s.replyBy), stt = STATUS[s.status] || STATUS.nova;
    return `<article class="sg-card" data-sid="${esc(s.id)}">
      <header><span class="badge ${stt[1]}">${stt[0]}</span><b>${esc(s.title)}</b>${isRecipient(u, s) ? sgActs(s, u) : ''}</header>
      ${s.owner ? `<div class="sg-own ${s.owner === u.id ? 'me' : ''}">${V.avatar(P.user(s.owner) || { name: '?' }, 'xs')}<span>${s.owner === u.id ? 'Com você' : 'Com ' + esc((P.user(s.owner) || { name: '—' }).name) + (isRecipient(u, s) && !done(s) ? ' · você não precisa tratar esta' : '')}</span><small>desde ${D.fmt(String(s.ownerAt || '').slice(0, 10))}</small></div>` : ''}
      <small class="muted">${V.avatar(who, 'sm')} ${esc(who.name)}${P.dept(s.deptId) ? ' · ' + esc(P.dept(s.deptId).name) : ''} · ${esc(String(s.at || '').slice(0, 16).replace('T', ' '))}</small>
      ${s.text ? `<p class="sg-text">${esc(s.text)}</p>` : ''}
      ${(s.imgs || []).length ? `<div class="sg-imgs">${thumbs(s.imgs, false)}</div>` : ''}
      ${s.reply ? `<div class="sg-reply"><b>${esc(by ? by.name : 'Resposta')}:</b> ${esc(s.reply)}</div>` : ''}
    </article>`;
  };
  V.melhorias = u => {
    const rec = isRecipient(u), s = st();
    if (s.uid !== u.id) { s.uid = u.id; s.tab = ''; } // a aba escolhida vale para a pessoa logada
    const tab = s.tab || (rec ? 'recebidas' : 'minhas');
    const mine = list().filter(x => x.from === u.id), got = list().filter(x => (x.to || []).includes(u.id));
    const shown = (tab === 'recebidas' ? got : mine).slice().sort((a, b) => (b.ts || 0) - (a.ts || 0));
    const novas = got.filter(x => !x.owner && !done(x)).length;
    const head = V.pageHead('Sugestões de melhoria', 'Mande ideias para melhorar o sistema e o dia a dia. Pode anexar prints. Chegam para os gestores do BPO Financeiro e do Contábil.', V.btn('Nova sugestão', { act: 'sugNew', icon: 'plus', cls: 'primary' }));
    const tabs = rec ? `<div class="chips" data-st="margin-bottom:12px">${[['recebidas', 'Recebidas' + (novas ? ' (' + novas + ' sem responsável)' : '')], ['minhas', 'Enviadas por mim']].map(([k, l]) => `<button type="button" class="chip ${tab === k ? 'on' : ''}" data-act="sugTab" data-k="${k}">${l}</button>`).join('')}</div>` : '';
    const warn = !available() ? `<div class="banner warn">${icon('alert')}<div>As sugestões ainda não foram ativadas no banco. Peça para rodar o SQL de ativação.</div></div>` : '';
    return `${head}${warn}${tabs}${shown.length ? `<div class="sg-list">${shown.map(x => card(x, u)).join('')}</div>` : V.empty(tab === 'recebidas' ? 'Nenhuma sugestão recebida ainda.' : 'Você ainda não enviou sugestões. Clique em "Nova sugestão".', 'bulb')}`;
  };
  P.sugBadge = u => u ? list().filter(x => (x.to || []).includes(u.id) && !x.owner && !done(x)).length : 0;
})(window.P);
