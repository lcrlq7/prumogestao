/* Prumo — avisos de novidade no Dashboard, para funções que não cabem no guia (ficam em mais de uma tela).
 * Para anunciar algo novo: acrescente um item em ANNOUNCEMENTS. Cada pessoa vê uma vez, até clicar em "Entendi". */
'use strict';
(function (P) {
  const V = P.V, A = P.actions, icon = V.icon;
  const ANNOUNCEMENTS = [
    { id: 'export-empresas-2026-11', icon: 'download', title: 'Novo: exportar lista de empresas', text: 'Baixe em Excel o CNPJ, o nome e o município das empresas — todas, com os filtros que você usar, ou a carteira de cada pessoa.', go: 'empresas', label: 'Ver Empresas' }
  ];
  const seenKey = id => 'prumo.novid.' + id;
  const seen = id => { try { return localStorage.getItem(seenKey(id)) === '1'; } catch (e) { return true; } };
  const origDash = V.dashboard;
  V.dashboard = u => {
    const html = origDash(u);
    const a = ANNOUNCEMENTS.find(x => !seen(x.id));
    if (!a) return html;
    return `<div class="banner">${icon(a.icon)}<div><b>${a.title}.</b> ${a.text} ${V.btn(a.label, { go: a.go, cls: 'sm primary' })} ${V.btn('Entendi', { act: 'novidDismiss', cls: 'sm ghost', attrs: `data-id="${a.id}"` })}</div></div>` + html;
  };
  A.novidDismiss = el => { try { localStorage.setItem(seenKey(el.dataset.id), '1'); } catch (e) { } P.render(); };
})(window.P);
