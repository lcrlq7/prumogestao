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
  A.sugImg = el => {
    const s = list().find(x => x.id === el.closest('[data-sid]').dataset.sid), src = s && s.imgs[Number(el.dataset.src)];
    if (!okImg(src)) return;
    P.ui.modal({ title: esc(s.title), cancel: 'Fechar', wide: true, body: `<img class="sg-full" src="${src}" alt="">` });
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
        s.status = status; s.reply = reply; s.replyBy = u.id; s.replyAt = D.stamp();
        (s.history = s.history || []).push({ at: D.stamp(), by: u.id, status, reply });
        if (s.from !== u.id) P.notify([s.from], { type: 'melhoria', icon: 'bulb', title: 'Sua sugestão: ' + STATUS[status][0].toLowerCase(), text: s.title + (reply ? ' · ' + reply.slice(0, 120) : ''), link: 'melhorias' });
        P.store.save(); P.toast('Sugestão atualizada.'); P.render();
      }
    });
  };

  const card = (s, u) => {
    const who = P.user(s.from) || { name: '—' }, by = s.replyBy && P.user(s.replyBy), stt = STATUS[s.status] || STATUS.nova;
    return `<article class="sg-card" data-sid="${esc(s.id)}">
      <header><span class="badge ${stt[1]}">${stt[0]}</span><b>${esc(s.title)}</b>${isRecipient(u, s) ? V.ibtn('edit', 'Responder / mudar situação', { act: 'sugReply', attrs: `data-id="${esc(s.id)}"` }) : ''}</header>
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
    const novas = got.filter(x => x.status === 'nova').length;
    const head = V.pageHead('Sugestões de melhoria', 'Mande ideias para melhorar o sistema e o dia a dia. Pode anexar prints. Chegam para os gestores do BPO Financeiro e do Contábil.', V.btn('Nova sugestão', { act: 'sugNew', icon: 'plus', cls: 'primary' }));
    const tabs = rec ? `<div class="chips" style="margin-bottom:12px">${[['recebidas', 'Recebidas' + (novas ? ' (' + novas + ' novas)' : '')], ['minhas', 'Enviadas por mim']].map(([k, l]) => `<button type="button" class="chip ${tab === k ? 'on' : ''}" data-act="sugTab" data-k="${k}">${l}</button>`).join('')}</div>` : '';
    const warn = !available() ? `<div class="banner warn">${icon('alert')}<div>As sugestões ainda não foram ativadas no banco. Peça para rodar o SQL de ativação.</div></div>` : '';
    return `${head}${warn}${tabs}${shown.length ? `<div class="sg-list">${shown.map(x => card(x, u)).join('')}</div>` : V.empty(tab === 'recebidas' ? 'Nenhuma sugestão recebida ainda.' : 'Você ainda não enviou sugestões. Clique em "Nova sugestão".', 'bulb')}`;
  };
  P.sugBadge = u => u ? list().filter(x => (x.to || []).includes(u.id) && x.status === 'nova').length : 0;
})(window.P);
