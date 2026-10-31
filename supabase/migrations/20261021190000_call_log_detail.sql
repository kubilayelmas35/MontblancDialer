alter table public.call_logs
  add column if not exists dial_at timestamptz,
  add column if not exists answered_at timestamptz,
  add column if not exists caller_number text,
  add column if not exists work_type text,
  add column if not exists hangup_by text;
