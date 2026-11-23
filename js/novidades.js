/* Prumo — avisos de novidade no Dashboard, para funções que não cabem no guia (ficam em mais de uma tela).
 * Para anunciar algo novo: acrescente um item em ANNOUNCEMENTS. Cada pessoa vê uma vez, até clicar em "Entendi" ou
 * em "Experimentar" (que já leva até a tela e abre a novidade, para mostrar como funciona).
 * "open" é o nome de uma ação (P.actions) a chamar depois de ir para a página "go" — opcional. */
'use strict';
(function (P) {
  const V = P.V, A = P.actions, icon = V.icon;
  const ANNOUNCEMENTS = [
    { id: 'export-empresas-2026-12', icon: 'download', title: 'Novo: exportar lista de empresas', text: 'Baixe em Excel o CNPJ, o nome e o município das empresas, escolhendo o regime tributário (pode marcar mais de um, como Presumido e Real), o município, o departamento e o responsável — vale para a lista geral e para a carteira de cada pessoa.', go: 'empresas', open: 'compExportOpen', label: 'Experimentar' }
  ];
  const seenKey = id => 'prumo.novid.' + id;
  const seen = id => { try { return localStorage.getItem(seenKey(id)) === '1'; } catch (e) { return true; } };
  const dismiss = id => { try { localStorage.setItem(seenKey(id), '1'); } catch (e) { } };
  const origDash = V.dashboard;
  V.dashboard = u => {
    const html = origDash(u);
    const a = ANNOUNCEMENTS.find(x => !seen(x.id));
    if (!a) return html;
    return `<div class="banner">${icon(a.icon)}<div><b>${a.title}.</b> ${a.text} ${V.btn(a.label, { act: 'novidTry', cls: 'sm primary', attrs: `data-id="${a.id}"` })} ${V.btn('Entendi', { act: 'novidDismiss', cls: 'sm ghost', attrs: `data-id="${a.id}"` })}</div></div>` + html;
  };
  A.novidDismiss = el => { dismiss(el.dataset.id); P.render(); };
  A.novidTry = el => {
    const a = ANNOUNCEMENTS.find(x => x.id === el.dataset.id); if (!a) return;
    dismiss(a.id);
    if (a.go) P.go(a.go); else P.render();
    if (a.open && A[a.open]) A[a.open]();
  };
})(window.P);
