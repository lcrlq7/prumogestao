/* Prumo — Aviso de privacidade (LGPD): toda pessoa precisa ler e concordar para continuar usando o sistema.
 * Sobe a versão (P.TERMS_VERSION) sempre que o texto mudar de verdade: isso pede o aceite de novo para todo mundo,
 * mesmo quem já está com o site aberto (a tela muda assim que a página é redesenhada, sem precisar de deploy novo). */
'use strict';
(function (P) {
  const D = P.date, esc = P.esc, V = P.V, A = P.actions, icon = V.icon, api = P.api;
  const db = () => P.store.db, U = () => P.state.user;

  P.TERMS_VERSION = 1;
  P.needsTerms = u => !!u && (Number(u.termsVersion) || 0) < P.TERMS_VERSION;

  // mesmo texto na tela obrigatória e no card "Meus dados", em Configurações
  const termsHtml = () => `
    <p>Este aviso explica, de forma direta, o que o Prumo guarda sobre você e por quê — conforme a Lei Geral de Proteção de Dados (LGPD).</p>
    <p><b>Quem trata os dados.</b> A 2S Consultoria e Serviços (Consultec), através do Prumo, sistema de uso interno da equipe.</p>
    <p><b>O que é guardado.</b> Nome, e-mail de acesso e foto de perfil (se você adicionar uma); departamento, função e carga horária; as atividades, lançamentos, ordens de serviço, férias, pontos e metas registrados por você ou atribuídos a você; as mensagens trocadas no canal de comunicação interno; e o registro de quando e o que foi feito no sistema (auditoria).</p>
    <p><b>Por quê.</b> Para organizar o trabalho do escritório: distribuir e acompanhar tarefas, aprovar lançamentos, calcular capacidade e metas, controlar férias e OS, e permitir a comunicação da equipe. A base legal é a execução do seu contrato de trabalho e o legítimo interesse do escritório em gerir sua operação (Art. 7º, V e IX, da LGPD).</p>
    <p><b>Quem vê o quê.</b> O próprio sistema limita o acesso: cada pessoa vê o seu trabalho; quem gerencia um departamento vê o que é desse departamento; a gerência e a diretoria veem tudo. Senhas de certificados ficam ocultas e cada consulta é registrada.</p>
    <p><b>Por quanto tempo.</b> Enquanto durar o seu vínculo com o escritório, e pelo prazo que a legislação trabalhista exigir depois do desligamento.</p>
    <p><b>Um pedido.</b> Não escreva em campos de observação (como o comentário do pedido de férias) informações sensíveis, como motivo de saúde. Se precisar tratar algo assim, fale diretamente com o seu gestor ou a diretoria, fora do sistema.</p>
    <p><b>Seus direitos.</b> A qualquer momento você pode pedir para ver, corrigir ou solicitar a exclusão dos seus dados, falando com a diretoria — ou pelo botão "Meus dados" em Configurações.</p>
    <p class="fine">Versão ${P.TERMS_VERSION} · ${D.fmt(D.iso(P.today()))}</p>`;
  P.termsHtml = termsHtml;

  V.termsGate = u => `<div class="mt" id="terms-gate" role="alertdialog" aria-modal="true" aria-labelledby="tg-h">
    <div class="mt-card" style="max-width:640px;text-align:left">
      <div class="mt-ico" style="animation:none">${icon('shield')}</div>
      <h1 id="tg-h">Aviso de privacidade</h1>
      <p>Olá, ${esc(P.firstName ? P.firstName(u.name) : u.name)}. Antes de continuar, leia e concorde com o texto abaixo.</p>
      <div class="terms-box">${termsHtml()}</div>
      <label class="check-inline" style="margin-top:14px"><input type="checkbox" id="tg-chk"> Li e concordo com o aviso acima</label>
      <div class="pref-btns" style="margin-top:14px;justify-content:center">
        ${V.btn('Continuar', { act: 'acceptTerms', cls: 'primary' })}
        ${V.btn('Sair', { act: 'logout', cls: 'ghost' })}
      </div>
    </div>
  </div>`;

  A.acceptTerms = () => {
    const chk = document.getElementById('tg-chk');
    if (!chk || !chk.checked) return P.toast('Marque que leu e concorda, para continuar.', 'err');
    try { api.acceptTerms(U()); P.render(); } catch (e) { P.toast(e.message, 'err'); }
  };

  /* ---------- "Meus dados", em Configurações ---------- */
  A.showPrivacy = () => {
    P.ui.modal({ title: 'Aviso de privacidade', cancel: 'Fechar', body: `<div class="prose terms-box">${termsHtml()}</div>` });
  };
  A.requestData = () => {
    const u = U();
    P.ui.modal({
      title: 'Pedir sobre meus dados', submit: 'Enviar pedido',
      body: `<p class="fine">Peça para ver, corrigir ou apagar os seus dados no Prumo. A diretoria recebe o pedido e fala com você.</p>
        <label class="field span3"><span>O que você precisa</span><select id="rd-k"><option value="ver">Ver todos os meus dados</option><option value="corrigir">Corrigir algum dado</option><option value="apagar">Apagar meus dados</option><option value="outro">Outro</option></select></label>
        <label class="field span3"><span>Detalhe (opcional)</span><textarea id="rd-note" rows="3" maxlength="400" placeholder="Ex.: meu e-mail mudou para..."></textarea></label>`,
      onSubmit: m => {
        const k = $v('#rd-k', m), note = $v('#rd-note', m);
        const LBL = { ver: 'Ver todos os dados', corrigir: 'Corrigir um dado', apagar: 'Apagar os dados', outro: 'Outro pedido' };
        const admins = (db().users || []).filter(x => x.role === 'admin' && x.active !== false).map(x => x.id);
        P.notify(admins, { type: 'privacidade', icon: 'shield', title: 'Pedido sobre dados pessoais', text: u.name + ' · ' + LBL[k] + (note ? ': ' + note : ''), link: 'configuracoes' });
        P.audit(u, 'Pediu sobre os próprios dados (LGPD)', u.id, LBL[k] + (note ? ' — ' + note : ''));
        P.store.save(); P.toast('Pedido enviado para a diretoria.');
      }
    });
  };
  const $v = (s, r) => String(((r || document).querySelector(s) || {}).value || '').trim();

  // injeta o card "Meus dados e privacidade" logo depois do card "Minha conta"
  const origConfig = V.configuracoes;
  const MARK = '</dl>`)}';
  V.configuracoes = u => {
    const html = origConfig(u);
    const i = html.indexOf(MARK);
    if (i < 0) return html;
    const j = i + MARK.length;
    const card = V.card('Meus dados e privacidade', `<p class="prose">O Prumo guarda os dados necessários para organizar o seu trabalho (atividades, lançamentos, férias, OS, pontos e mensagens internas). Veja o que isso significa e, se precisar, peça para ver, corrigir ou apagar.</p>
      <div class="pref-btns">${V.btn('Ler o aviso de privacidade', { act: 'showPrivacy', icon: 'shield', cls: 'sm ghost' })}${V.btn('Meus dados (ver, corrigir ou apagar)', { act: 'requestData', icon: 'mail', cls: 'sm ghost' })}</div>`);
    return html.slice(0, j) + card + html.slice(j);
  };
})(window.P);
