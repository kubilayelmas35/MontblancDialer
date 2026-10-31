-- Operatör durum geçmişi ve günün ilk girişi. Eski hareketler doldurulmaz.

alter table public.agent_sessions
  add column if not exists login_at timestamptz,
  add column if not exists break_code text;

create table if not exists public.agent_status_log (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms(id) on delete cascade,
  agent_id uuid not null,
  status text not null,
  break_code text,
  campaign_id uuid,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  duration_sec integer
);

create index if not exists agent_status_log_firm_idx on public.agent_status_log (firm_id, started_at desc);
create index if not exists agent_status_log_agent_idx on public.agent_status_log (agent_id, started_at desc);

alter table public.agent_status_log enable row level security;

drop policy if exists agent_status_log_select on public.agent_status_log;
create policy agent_status_log_select on public.agent_status_log
  for select using (mb_private.actor_same_firm(firm_id) or mb_private.actor_is_self(agent_id));

drop policy if exists agent_status_log_insert on public.agent_status_log;
create policy agent_status_log_insert on public.agent_status_log
  for insert with check (mb_private.actor_is_self(agent_id) or mb_private.actor_is_firm_admin(firm_id));

drop policy if exists agent_status_log_update on public.agent_status_log;
create policy agent_status_log_update on public.agent_status_log
  for update using (mb_private.actor_is_self(agent_id) or mb_private.actor_is_firm_admin(firm_id))
  with check (mb_private.actor_is_self(agent_id) or mb_private.actor_is_firm_admin(firm_id));

grant select, insert, update, delete on public.agent_status_log to anon, authenticated, service_role;
