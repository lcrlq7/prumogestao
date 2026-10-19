# Prumo Gestão

Site estático do Prumo (gestão de carga e desempenho). Publicado pela Vercel.
Banco de dados e login: Supabase (configuração em js/config.js; a segurança fica nas regras RLS do banco).

## Como publicar com segurança (ambiente de teste)

- **main** = produção. Cada push na `main` vai direto para o site real.
- Qualquer **outra branch** gera, na Vercel, um endereço de **preview** (`prumogestao-git-<branch>-...vercel.app`).
- Os previews, links antigos de deploy e o `localhost` abrem em **modo teste**: dados fictícios salvos só no navegador, com a faixa
  "AMBIENTE DE TESTE". Eles **nunca** usam o banco real. Só os endereços listados em `js/config.js` (`PRODUCAO`) usam o banco real.
- Fluxo: trabalhar numa branch → testar no preview → juntar na `main` (pull request).
- Se o site ganhar um domínio próprio, **adicione-o à lista `PRODUCAO` em `js/config.js`**; senão ele abre em modo teste.
- A cada publicação, atualize `version.json`: é ele que faz as abas abertas recarregarem sozinhas.

## Lixeira

Tarefas, recorrências, atividades e reconhecimentos excluídos ficam 30 dias na Lixeira (menu lateral) e podem ser restaurados.
Precisa da tabela `trash` no banco; sem ela, a exclusão continua definitiva.
