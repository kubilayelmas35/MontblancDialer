alter table public.call_logs add column if not exists qc_by uuid;
alter table public.call_logs add column if not exists qc_at timestamptz;
alter table public.call_logs add column if not exists qc_result text;
create index if not exists call_logs_qc_by_at_idx on public.call_logs (qc_by, qc_at desc);
