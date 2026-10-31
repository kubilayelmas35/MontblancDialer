alter table public.agent_sessions
  add column if not exists current_contact_id uuid;
