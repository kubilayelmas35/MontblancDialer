alter table public.appointments
  add column if not exists form_ek jsonb not null default '{}'::jsonb;
