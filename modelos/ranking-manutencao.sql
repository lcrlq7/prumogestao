-- Ranking do joguinho da tela de manutenção.
-- A tela aparece antes do login, então o ranking usa só duas funções fechadas (a tabela em si não fica aberta).
create table if not exists public.maint_ranking (
  name text primary key,
  score int not null,
  updated_at timestamptz not null default now()
);
alter table public.maint_ranking enable row level security;   -- sem políticas: ninguém lê nem escreve direto
revoke all on public.maint_ranking from anon, authenticated;

create or replace function public.maint_rank_submit(p_name text, p_score int)
returns void language plpgsql security definer set search_path = public as $$
begin
  p_name := left(btrim(coalesce(p_name, '')), 20);
  if p_name = '' or p_score is null or p_score < 1 or p_score > 1000 then return; end if;
  insert into public.maint_ranking (name, score) values (p_name, p_score)
  on conflict (name) do update set score = greatest(public.maint_ranking.score, excluded.score), updated_at = now();
end $$;

create or replace function public.maint_rank_top()
returns table (name text, score int) language sql stable security definer set search_path = public as $$
  select name, score from public.maint_ranking order by score desc, updated_at asc limit 10
$$;

revoke all on function public.maint_rank_submit(text, int) from public;
revoke all on function public.maint_rank_top() from public;
grant execute on function public.maint_rank_submit(text, int) to anon, authenticated;
grant execute on function public.maint_rank_top() to anon, authenticated;
