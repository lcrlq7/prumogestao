-- Certificados digitais: todos os usuários logados veem; só a diretoria, a gerência e quem a diretoria delegar alteram.
-- A lista de quem pode editar fica na linha especial '_cfg' (só a diretoria/gerência grava nela).
create table if not exists public.certificates (
  id text primary key,
  doc jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.certificates enable row level security;
revoke all on public.certificates from anon;
grant select, insert, update, delete on public.certificates to authenticated;

drop policy if exists cert_select on public.certificates;
drop policy if exists cert_write on public.certificates;
create policy cert_select on public.certificates for select to authenticated using ((select public.is_member()));
create policy cert_write on public.certificates for all to authenticated
  using ((select public.is_global()) or (id <> '_cfg' and exists (select 1 from public.certificates c where c.id = '_cfg' and (c.doc->'editors') ? ((select public.my_id())::text))))
  with check ((select public.is_global()) or (id <> '_cfg' and exists (select 1 from public.certificates c where c.id = '_cfg' and (c.doc->'editors') ? ((select public.my_id())::text))));

alter publication supabase_realtime add table public.certificates;
