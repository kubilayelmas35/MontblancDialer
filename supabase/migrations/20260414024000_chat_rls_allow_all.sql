-- Diğer tablolarla aynı model (allow_all); REST service_role ile uyum
alter table public.chat_groups enable row level security;
alter table public.chat_group_members enable row level security;
alter table public.chat_messages enable row level security;
alter table public.chat_user_read_state enable row level security;

drop policy if exists "allow_all" on public.chat_groups;
drop policy if exists "allow_all" on public.chat_group_members;
drop policy if exists "allow_all" on public.chat_messages;
drop policy if exists "allow_all" on public.chat_user_read_state;

create policy "allow_all" on public.chat_groups for all using (true) with check (true);
create policy "allow_all" on public.chat_group_members for all using (true) with check (true);
create policy "allow_all" on public.chat_messages for all using (true) with check (true);
create policy "allow_all" on public.chat_user_read_state for all using (true) with check (true);
