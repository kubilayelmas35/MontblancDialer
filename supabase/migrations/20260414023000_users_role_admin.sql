-- Uygulama kodunda kullanılan 'admin' rolü (Montblanc içi admin)
alter table public.users drop constraint if exists users_role_check;
alter table public.users add constraint users_role_check check (
  role = any (array['super_admin'::text, 'firm_admin'::text, 'admin'::text, 'agent'::text, 'qc'::text])
);
