-- A tela só mostra os últimos 60 eventos de qualquer forma, então apagar os antigos não muda nada visível.
-- Troque '180 days' por outro período se quiser guardar mais ou menos tempo. Rode de novo sempre que quiser liberar espaço.
delete from public.audit_log where updated_at < now() - interval '180 days';
