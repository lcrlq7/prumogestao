/* Prumo — dados fictícios do AMBIENTE DE TESTE (previews de branch e localhost; ver js/config.js).
 * Só existe quando P.CONFIG.testEnv é verdadeiro: em produção este arquivo não faz nada.
 * Login de teste: diretor@teste.local / teste123 (todos os usuários usam a senha teste123). */
'use strict';
(function (P) {
  if (!P.CONFIG || !P.CONFIG.testEnv || typeof P.seed === 'function') return;
  const D = P.date, iso = d => D.iso(d), today = P.today();
  const PASS = 'teste123';
  P.seed = () => {
    const db = P.emptyDb();
    db.live = false;
    const dep = (id, name, code, managerId, extra) => Object.assign({ id, name, code, description: '', managerId, active: true, createdAt: iso(today) }, extra || {});
    db.departments = [dep('d1', 'Fiscal', 'FIS', 'm1'), dep('d2', 'Contábil', 'CTB', 'm2'), dep('d3', 'Legalização', 'LEG', 'm3', { deadlineOptional: true }), dep('d4', 'Departamento Pessoal', 'DP', 'm4')];
    const user = (id, name, role, deptId) => ({ id, name, email: id + '@teste.local', password: PASS, role, deptId, active: true, capacity: 32, weeklyGoal: 30, hours: 40, createdAt: iso(D.add(today, -400)), hiredAt: iso(D.add(today, -400)), tourDone: true });
    db.users = [
      Object.assign(user('diretor', 'Diretoria Teste', 'admin', null), { email: 'diretor@teste.local' }),
      Object.assign(user('gerente', 'Gerência Teste', 'office', null), { email: 'gerente@teste.local' }),
      user('m1', 'Gestor Fiscal', 'manager', 'd1'), user('m2', 'Gestora Contábil', 'manager', 'd2'), user('m3', 'Gestor Legalização', 'manager', 'd3'),
      user('f1', 'Ana Teste', 'employee', 'd1'), user('f2', 'Bruno Teste', 'employee', 'd1'),
      user('f3', 'Carla Teste', 'employee', 'd2'), user('f4', 'Diego Teste', 'employee', 'd2'),
      user('f5', 'Elisa Teste', 'employee', 'd3'), user('m4', 'Gestor Pessoal', 'manager', 'd4'), user('f6', 'Fabio Teste', 'employee', 'd4'), Object.assign(user('ftodos', 'Funcionário Teste (todos os departamentos)', 'employee', null), { email: 'todos@teste.local' })
    ];
    const act = (id, deptId, name, unit, weight) => ({ id, deptId, name, unit, weight, active: true, createdAt: iso(today) });
    db.activities = [
      act('a1', 'd1', 'Apuração do Simples Nacional', 'por empresa', 1), act('a2', 'd1', 'Conferir pagamento do DAS', 'por empresa', 0.5), act('a3', 'd1', 'ISS mensal', 'por empresa', 0.75),
      act('a4', 'd2', 'Conciliação bancária', 'por empresa', 2), act('a5', 'd2', 'Fechamento contábil', 'por empresa', 3),
      act('a6', 'd3', 'Abertura de empresa', 'por empresa', 4), act('a7', 'd3', 'Alteração contratual', 'por empresa', 2.5), act('a8', 'd3', 'Certificado digital (e-CNPJ)', 'por empresa', 1)
    ];
    db.weightHistory = db.activities.map(a => ({ id: 'w' + a.id, activityId: a.id, from: null, to: a.weight, at: iso(today), by: 'diretor', reason: 'Atividade criada (teste)' }));
    const regimes = ['simples', 'simples', 'presumido', 'real', 'simples', 'mei', 'presumido', 'simples'];
    db.companies = ['Alfa Comércio Teste LTDA', 'Beta Serviços Teste LTDA', 'Gama Indústria Teste SA', 'Delta Logística Teste LTDA', 'Épsilon Clínica Teste LTDA', 'Zeta MEI Teste', 'Eta Engenharia Teste LTDA', 'Teta Tecnologia Teste LTDA']
      .map((name, i) => ({ id: 'c' + (i + 1), code: String(100 + i), name, tradeName: name, cnpj: '', regime: regimes[i], active: true, depts: ['d1', 'd2'], since: iso(D.add(today, -300)), history: [], notes: '' }));
    P.clients = db.companies.map(c => c.name);
    db.clientAssignments = db.companies.flatMap((c, i) => [
      { id: 'ca1' + i, deptId: 'd1', userId: i % 2 ? 'f2' : 'f1', client: c.name, assignedBy: 'm1', assignedAt: iso(today) },
      { id: 'ca2' + i, deptId: 'd2', userId: i % 2 ? 'f4' : 'f3', client: c.name, assignedBy: 'm2', assignedAt: iso(today) }
    ]);
    const due = n => iso(D.add(today, n));
    db.tasks = [
      { id: 't1', userId: 'f1', deptId: 'd1', title: 'Conferir pagamento do DAS — Alfa Comércio Teste LTDA', activityId: 'a2', client: 'Alfa Comércio Teste LTDA', due: due(2), status: 'pendente', createdBy: 'm1' },
      { id: 't2', userId: 'f2', deptId: 'd1', title: 'ISS mensal — Beta Serviços Teste LTDA', activityId: 'a3', client: 'Beta Serviços Teste LTDA', due: due(-1), status: 'pendente', createdBy: 'm1' },
      { id: 't3', userId: 'f3', deptId: 'd2', title: 'Conciliação bancária — Gama Indústria Teste SA', activityId: 'a4', client: 'Gama Indústria Teste SA', due: due(5), status: 'pendente', createdBy: 'm2' },
      { id: 't4', userId: 'f5', deptId: 'd3', title: 'Abertura de empresa — cliente novo', activityId: 'a6', client: '', due: '', status: 'pendente', createdBy: 'm3' }
    ];
    db.recognitions = [{ id: 'rc1', userId: 'f1', deptId: 'd1', by: 'm1', at: D.stamp(), date: iso(today), category: Object.keys(P.REC_CATEGORIES || { outro: 1 })[0], text: 'Fechou todas as apurações antes do prazo e ainda ajudou a equipe 🎉', visible: true, shared: true, wall: 'all', source: 'manual' }];
    db.messages = [{ id: 'msg1', conv: 'geral', from: 'diretor', text: 'Bem-vindos ao ambiente de teste do Prumo! Aqui nada afeta o sistema real.', at: D.stamp(), ts: Date.now() - 60000 }];
    return db;
  };
})(window.P);
