alter table public.call_logs add column if not exists operator_name text;
alter table public.call_logs add column if not exists ai_staff_id text;
create index if not exists call_logs_ai_staff_id_idx on public.call_logs (firm_id, ai_staff_id);
alter table public.users drop constraint if exists users_role_check;
alter table public.users add constraint users_role_check check (role = any (array['super_admin'::text, 'firm_admin'::text, 'admin'::text, 'agent'::text, 'qc'::text, 'field_agent'::text, 'ai'::text]));
