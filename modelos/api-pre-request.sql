-- Gancho que roda em TODA requisição à API do banco: quem está desativado recebe 403 na hora
-- (sem esperar o token vencer). Qualquer erro dentro da função deixa a requisição passar.
create or replace function public.api_pre_request()
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.role() is distinct from 'authenticated' or auth.uid() is null then return; end if;
  if exists (select 1 from public.profiles p where p.id::text = auth.uid()::text and p.doc->>'active' = 'false') then
    raise exception 'Acesso desativado. Fale com a diretoria.' using errcode = 'PT403';
  end if;
exception
  when sqlstate 'PT403' then raise;
  when others then return;
end $$;
grant execute on function public.api_pre_request() to anon, authenticated;

alter role authenticator set pgrst.db_pre_request = 'public.api_pre_request';
notify pgrst, 'reload config';

-- PARA DESFAZER:
-- alter role authenticator reset pgrst.db_pre_request;
-- notify pgrst, 'reload config';
