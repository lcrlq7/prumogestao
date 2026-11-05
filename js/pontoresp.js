/*
 * Prumo — 1 ponto por responder uma OS ou uma sugestão de melhoria
 *
 * Quem responde (funcionário ou gestor) ganha 1 ponto, uma vez só por OS/sugestão.
 * Responder o próprio pedido não pontua. Diretoria e gerência não têm pontuação.
 * O ponto entra como lançamento da atividade "Resposta a OS/sugestão" (peso 1) do departamento
 * de quem respondeu (id resp-<departamento>), seguindo as mesmas regras de aprovação dos demais lançamentos.
 */
'use strict';
(function (P) {
  const db = () => P.store.db;
  const NAME = 'Resposta a OS/sugestão';
  const actId = deptId => 'resp-' + deptId;

  // garante a atividade no departamento (no banco ela é criada pelo SQL; aqui só no modo de teste ou por quem pode editar pesos)
  const ensureAct = (u, deptId) => {
    let a = P.act(actId(deptId));
    if (a) return a.active ? a : null;
    const canCreate = (window.PRUMO_CONFIG || {}).testEnv || (P.api._canEditActivities && P.api._canEditActivities(u, deptId));
    if (!canCreate) return null;
    a = { id: actId(deptId), deptId, name: NAME, unit: 'por resposta', weight: 1, active: true, createdAt: P.date.iso(P.today()) };
    db().activities.push(a); if (P.reindex) P.reindex();
    return a;
  };

  // kind: 'os' | 'melhoria'; item: a OS ou a sugestão; author: quem abriu/enviou
  P.respPoint = (u, kind, item, author) => {
    try {
      if (!u || !item || !(u.role === 'employee' || u.role === 'manager') || !u.deptId) return;
      if (author && author === u.id) return;
      const ref = kind + ':' + item.id;
      if ((db().entries || []).some(e => e.respRef === ref && e.userId === u.id && e.status !== 'recusado')) return;
      const a = ensureAct(u, u.deptId); if (!a) return;
      const label = kind === 'os' ? 'OS ' + (item.code || '') : 'Sugestão: ' + (item.title || '');
      const e = P.api.createEntry(u, { userId: u.id, activityId: a.id, date: P.date.iso(P.today()), qty: 1, client: kind === 'os' ? (item.company || '') : '', obs: 'Resposta a ' + label.trim() });
      e.respRef = ref; P.store.save();
      return e.status === 'pendente' ? ' · +1 ponto (aguardando aprovação)' : ' · +1 ponto';
    } catch (err) { console.warn('Ponto por resposta não registrado:', err && err.message); }
  };
})(window.P);
