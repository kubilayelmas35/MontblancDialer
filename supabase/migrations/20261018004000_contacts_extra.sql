alter table public.contacts
  add column if not exists extra jsonb not null default '{}'::jsonb;
