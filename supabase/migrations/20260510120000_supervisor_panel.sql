-- Supervisor panel: agent_sessions tablosuna canlı çağrı bilgisi kolonları
alter table public.agent_sessions
  add column if not exists current_contact_name  text,
  add column if not exists current_contact_phone text,
  add column if not exists telnyx_call_control_id text,
  add column if not exists call_started_at        timestamptz;

-- Supervisor için realtime etkinleştir
alter publication supabase_realtime add table public.agent_sessions;
