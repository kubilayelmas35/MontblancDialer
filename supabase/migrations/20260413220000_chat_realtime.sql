-- chat_messages için Realtime (postgres_changes) — tekrar çalışırsa yutulsun
do $$
begin
  alter publication supabase_realtime add table public.chat_messages;
exception
  when others then
    null;
end $$;
