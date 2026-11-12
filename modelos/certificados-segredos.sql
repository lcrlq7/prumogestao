-- Senhas dos certificados no servidor: saem da tabela que todos leem e passam a ser entregues só por função,
-- que registra QUEM consultou e QUANDO (o registro não pode ser falsificado pelo navegador).
-- Antes de mexer, guarda uma cópia em backup_zerar.certificates_antes_segredos.
create schema if not exists backup_zerar;
create table if not exists backup_zerar.certificates_antes_segredos as select * from public.certificates;

create table if not exists public.certificate_secrets (
  id text primary key,
  password text not null default '',
  updated_at timestamptz not null default now(),
  updated_by text
);
create table if not exists public.certificate_access_log (
  id bigserial primary key,
  cert_id text not null,
  company text,
  user_id text,
  user_name text,
  action text,
  at timestamptz not null default now()
);
alter table public.certificate_secrets enable row level security;
alter table public.certificate_access_log enable row level security;
revoke all on public.certificate_secrets from anon, authenticated;     -- sem políticas: ninguém lê nem grava direto
revoke all on public.certificate_access_log from anon, authenticated;

-- migra as senhas que estão nos documentos e tira o campo "password" de lá
insert into public.certificate_secrets (id, password)
  select id, doc->>'password' from public.certificates where id <> '_cfg' and coalesce(doc->>'password', '') <> ''
  on conflict (id) do nothing;
update public.certificates set doc = (doc - 'password') || '{"hasPassword": true}'::jsonb
  where id <> '_cfg' and coalesce(doc->>'password', '') <> '';

-- consultar a senha (registra quem consultou)
create or replace function public.cert_reveal(p_id text, p_how text default 'ver')
returns text language plpgsql security definer set search_path = public as $$
declare pw text; co text; nm text; me text := (select public.my_id())::text;
begin
  if not (select public.is_member()) then raise exception 'Sem permissão' using errcode = '42501'; end if;
  select password into pw from public.certificate_secrets where id = p_id;
  select doc->>'company' into co from public.certificates where id = p_id;
  select doc->>'name' into nm from public.profiles where id::text = me;
  insert into public.certificate_access_log (cert_id, company, user_id, user_name, action) values (p_id, co, me, nm, left(coalesce(p_how, 'ver'), 20));
  return coalesce(pw, '');
end $$;

-- gravar a senha (quem edita certificados); null apaga
create or replace function public.cert_set_password(p_id text, p_pw text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not ((select public.is_global()) or (select public.is_cert_editor())) then raise exception 'Sem permissão' using errcode = '42501'; end if;
  if p_pw is null then delete from public.certificate_secrets where id = p_id;
  else insert into public.certificate_secrets (id, password, updated_by) values (p_id, left(p_pw, 200), (select public.my_id())::text)
       on conflict (id) do update set password = excluded.password, updated_at = now(), updated_by = excluded.updated_by;
  end if;
end $$;

-- quem consultou (só diretoria e gerência)
create or replace function public.cert_access_list()
returns table (company text, user_name text, action text, at timestamptz) language plpgsql stable security definer set search_path = public as $$
begin
  if not (select public.is_global()) then raise exception 'Sem permissão' using errcode = '42501'; end if;
  return query select l.company, l.user_name, l.action, l.at from public.certificate_access_log l order by l.at desc limit 300;
end $$;

revoke all on function public.cert_reveal(text, text) from public;
revoke all on function public.cert_set_password(text, text) from public;
revoke all on function public.cert_access_list() from public;
grant execute on function public.cert_reveal(text, text) to authenticated;
grant execute on function public.cert_set_password(text, text) to authenticated;
grant execute on function public.cert_access_list() to authenticated;

-- PARA DESFAZER (devolve os documentos do backup):
-- update public.certificates c set doc = b.doc from backup_zerar.certificates_antes_segredos b where b.id = c.id;
