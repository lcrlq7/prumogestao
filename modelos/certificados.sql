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

-- função à parte (security definer) para não haver recursão de política
create or replace function public.is_cert_editor()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.certificates c where c.id = '_cfg' and (c.doc->'editors') ? (public.my_id())::text)
$$;
revoke all on function public.is_cert_editor() from public;
grant execute on function public.is_cert_editor() to authenticated;

drop policy if exists cert_select on public.certificates;
drop policy if exists cert_write on public.certificates;
drop policy if exists cert_insert on public.certificates;
drop policy if exists cert_update on public.certificates;
drop policy if exists cert_delete on public.certificates;
create policy cert_select on public.certificates for select to authenticated using ((select public.is_member()));
create policy cert_insert on public.certificates for insert to authenticated
  with check ((select public.is_global()) or (id <> '_cfg' and (select public.is_cert_editor())));
create policy cert_update on public.certificates for update to authenticated
  using ((select public.is_global()) or (id <> '_cfg' and (select public.is_cert_editor())))
  with check ((select public.is_global()) or (id <> '_cfg' and (select public.is_cert_editor())));
create policy cert_delete on public.certificates for delete to authenticated
  using ((select public.is_global()) or (id <> '_cfg' and (select public.is_cert_editor())));

alter publication supabase_realtime add table public.certificates;
