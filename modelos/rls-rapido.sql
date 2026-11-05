-- Prumo · regras de acesso (RLS) mais rápidas, com as MESMAS permissões.
-- As funções que dizem "quem é você" (my_id, my_role, is_member, is_global, my_dept, my_led_dept) passam a rodar
-- UMA vez por consulta em vez de uma vez por linha; manages_dept(x) é trocada pelo próprio conteúdo dela, já nessa forma.
-- Antes de mudar, todas as regras atuais ficam guardadas em backup_zerar.policies_antigas.

create schema if not exists backup_zerar;
create table if not exists backup_zerar.policies_antigas (
  feito_em timestamptz default now(), tablename text, policyname text, cmd text, permissive text, qual text, with_check text
);
insert into backup_zerar.policies_antigas (tablename, policyname, cmd, permissive, qual, with_check)
  select tablename, policyname, cmd, permissive, qual, with_check from pg_policies where schemaname = 'public';

do $$
declare
  r record; q text; w text; n int := 0;
  -- manages_dept(d) = is_global() OR (d não nulo E (d = departamento que lidero OU (sou gestor E d = meu departamento)))
  fx constant text := '((SELECT public.is_global()) OR (\1 IS NOT NULL AND (\1 = (SELECT public.my_led_dept()) OR ((SELECT public.my_role()) = ''manager'' AND \1 = (SELECT public.my_dept())))))';
begin
  for r in select tablename, policyname, qual, with_check from pg_policies where schemaname = 'public' loop
    q := r.qual; w := r.with_check;
    -- 1) manages_dept(coluna) -> conteúdo da função
    q := regexp_replace(q, 'manages_dept\(([a-z_]+)\)', fx, 'g');
    w := regexp_replace(w, 'manages_dept\(([a-z_]+)\)', fx, 'g');
    -- 2) funções sem parâmetro -> (SELECT função()), calculada uma vez
    q := regexp_replace(q, '(?<![\w.])(is_member|is_global|my_id|my_role|my_dept|my_led_dept)\(\)', '(SELECT public.\1())', 'g');
    w := regexp_replace(w, '(?<![\w.])(is_member|is_global|my_id|my_role|my_dept|my_led_dept)\(\)', '(SELECT public.\1())', 'g');
    q := regexp_replace(q, '(?<!SELECT )auth\.uid\(\)', '(SELECT auth.uid())', 'g');
    w := regexp_replace(w, '(?<!SELECT )auth\.uid\(\)', '(SELECT auth.uid())', 'g');
    if q is not distinct from r.qual and w is not distinct from r.with_check then continue; end if;
    if q is not null and w is not null then
      execute format('alter policy %I on public.%I using (%s) with check (%s)', r.policyname, r.tablename, q, w);
    elsif q is not null then
      execute format('alter policy %I on public.%I using (%s)', r.policyname, r.tablename, q);
    else
      execute format('alter policy %I on public.%I with check (%s)', r.policyname, r.tablename, w);
    end if;
    n := n + 1;
  end loop;
  raise notice 'Regras ajustadas: %', n;
end $$;

-- Para DESFAZER (volta exatamente às regras guardadas no backup):
-- do $$ declare r record; begin
--   for r in select distinct on (tablename, policyname) * from backup_zerar.policies_antigas order by tablename, policyname, feito_em loop
--     if r.qual is not null and r.with_check is not null then execute format('alter policy %I on public.%I using (%s) with check (%s)', r.policyname, r.tablename, r.qual, r.with_check);
--     elsif r.qual is not null then execute format('alter policy %I on public.%I using (%s)', r.policyname, r.tablename, r.qual);
--     elsif r.with_check is not null then execute format('alter policy %I on public.%I with check (%s)', r.policyname, r.tablename, r.with_check); end if;
--   end loop; end $$;
