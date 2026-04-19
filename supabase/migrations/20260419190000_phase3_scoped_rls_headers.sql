-- Phase-3: Scoped RLS model for anon-key client compatibility.
-- Uses application scope headers (x-mb-*) to enforce firm/user boundaries
-- instead of allow_all policies.

create or replace function public.mb_req_header(p_key text)
returns text
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce((current_setting('request.headers', true)::jsonb ->> lower(p_key)), '')
$$;

create or replace function public.mb_req_role()
returns text
language sql
stable
set search_path = public, pg_temp
as $$
  select public.mb_req_header('x-mb-role')
$$;

create or replace function public.mb_req_user_id()
returns uuid
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v text;
begin
  v := nullif(public.mb_req_header('x-mb-user-id'), '');
  if v is null then return null; end if;
  return v::uuid;
exception when others then
  return null;
end;
$$;

create or replace function public.mb_req_firm_id()
returns uuid
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v text;
begin
  v := nullif(public.mb_req_header('x-mb-firm-id'), '');
  if v is null then return null; end if;
  return v::uuid;
exception when others then
  return null;
end;
$$;

create or replace function public.mb_is_admin()
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select public.mb_req_role() in ('super_admin','admin')
$$;

create or replace function public.mb_same_firm(p_firm uuid)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select public.mb_is_admin() or (p_firm is not null and p_firm = public.mb_req_firm_id())
$$;

drop policy if exists allow_all on public.firms;
drop policy if exists mb_scope_all on public.firms;
create policy mb_scope_all on public.firms
for all
using (public.mb_is_admin() or id = public.mb_req_firm_id())
with check (public.mb_is_admin() or id = public.mb_req_firm_id());

drop policy if exists allow_all on public.users;
drop policy if exists mb_scope_all on public.users;
create policy mb_scope_all on public.users
for all
using (
  public.mb_is_admin()
  or id = public.mb_req_user_id()
  or (firm_id is not null and firm_id = public.mb_req_firm_id())
)
with check (
  public.mb_is_admin()
  or (firm_id is not null and firm_id = public.mb_req_firm_id())
);

drop policy if exists allow_all on public.campaigns;
drop policy if exists mb_scope_all on public.campaigns;
create policy mb_scope_all on public.campaigns
for all
using (public.mb_same_firm(firm_id))
with check (public.mb_same_firm(firm_id));

drop policy if exists allow_all on public.agent_campaigns;
drop policy if exists mb_scope_all on public.agent_campaigns;
create policy mb_scope_all on public.agent_campaigns
for all
using (public.mb_same_firm(firm_id))
with check (public.mb_same_firm(firm_id));

drop policy if exists allow_all on public.contacts;
drop policy if exists mb_scope_all on public.contacts;
create policy mb_scope_all on public.contacts
for all
using (public.mb_same_firm(firm_id))
with check (public.mb_same_firm(firm_id));

drop policy if exists allow_all on public.appointments;
drop policy if exists mb_scope_all on public.appointments;
create policy mb_scope_all on public.appointments
for all
using (public.mb_same_firm(firm_id))
with check (public.mb_same_firm(firm_id));

drop policy if exists allow_all on public.call_logs;
drop policy if exists mb_scope_all on public.call_logs;
create policy mb_scope_all on public.call_logs
for all
using (public.mb_same_firm(firm_id))
with check (public.mb_same_firm(firm_id));

drop policy if exists allow_all on public.agent_sessions;
drop policy if exists mb_scope_all on public.agent_sessions;
create policy mb_scope_all on public.agent_sessions
for all
using (
  public.mb_is_admin()
  or public.mb_same_firm(firm_id)
  or agent_id = public.mb_req_user_id()
)
with check (
  public.mb_is_admin()
  or public.mb_same_firm(firm_id)
  or agent_id = public.mb_req_user_id()
);

drop policy if exists allow_all on public.queues;
drop policy if exists mb_scope_all on public.queues;
create policy mb_scope_all on public.queues
for all
using (public.mb_same_firm(firm_id))
with check (public.mb_same_firm(firm_id));

drop policy if exists allow_all on public.takvim_slots;
drop policy if exists mb_scope_all on public.takvim_slots;
create policy mb_scope_all on public.takvim_slots
for all
using (public.mb_same_firm(firm_id))
with check (public.mb_same_firm(firm_id));

drop policy if exists allow_all on public.wiedervorlage;
drop policy if exists mb_scope_all on public.wiedervorlage;
create policy mb_scope_all on public.wiedervorlage
for all
using (public.mb_same_firm(firm_id))
with check (public.mb_same_firm(firm_id));

drop policy if exists allow_all on public.mesai_saatleri;
drop policy if exists mb_scope_all on public.mesai_saatleri;
create policy mb_scope_all on public.mesai_saatleri
for all
using (public.mb_same_firm(firm_id))
with check (public.mb_same_firm(firm_id));

drop policy if exists allow_all on public.chat_groups;
drop policy if exists mb_scope_all on public.chat_groups;
create policy mb_scope_all on public.chat_groups
for all
using (public.mb_same_firm(firm_id))
with check (public.mb_same_firm(firm_id));

drop policy if exists allow_all on public.chat_messages;
drop policy if exists mb_scope_all on public.chat_messages;
create policy mb_scope_all on public.chat_messages
for all
using (public.mb_same_firm(firm_id))
with check (public.mb_same_firm(firm_id));

drop policy if exists allow_all on public.chat_group_members;
drop policy if exists mb_scope_all on public.chat_group_members;
create policy mb_scope_all on public.chat_group_members
for all
using (public.mb_is_admin() or user_id = public.mb_req_user_id())
with check (public.mb_is_admin() or user_id = public.mb_req_user_id());

drop policy if exists allow_all on public.chat_user_read_state;
drop policy if exists mb_scope_all on public.chat_user_read_state;
create policy mb_scope_all on public.chat_user_read_state
for all
using (public.mb_is_admin() or user_id = public.mb_req_user_id())
with check (public.mb_is_admin() or user_id = public.mb_req_user_id());

drop policy if exists mb_scope_all on public.job_post_geo_rules;
create policy mb_scope_all on public.job_post_geo_rules
for all
using (
  public.mb_is_admin()
  or exists (
    select 1 from public.job_posts jp
    where jp.id = public.job_post_geo_rules.job_post_id
      and public.mb_same_firm(jp.requester_firm_id)
  )
)
with check (
  public.mb_is_admin()
  or exists (
    select 1 from public.job_posts jp
    where jp.id = public.job_post_geo_rules.job_post_id
      and public.mb_same_firm(jp.requester_firm_id)
  )
);
