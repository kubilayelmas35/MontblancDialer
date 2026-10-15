-- Firm role "admin" is a tenant admin, not a platform admin.
-- Scope comes from the session token (users.role / users.firm_id), not from
-- client-supplied x-mb-role / x-mb-firm-id headers.

create or replace function public.mb_req_user_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select mb_private.actor_id()
$$;

create or replace function public.mb_req_firm_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select mb_private.actor_firm()
$$;

create or replace function public.mb_req_role()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(mb_private.actor_role(), '')
$$;

create or replace function public.mb_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(mb_private.actor_is_super(), false)
$$;

create or replace function public.mb_same_firm(p_firm uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(mb_private.actor_same_firm(p_firm), false)
$$;

revoke all on function public.mb_req_user_id() from public;
revoke all on function public.mb_req_firm_id() from public;
revoke all on function public.mb_req_role() from public;
revoke all on function public.mb_is_admin() from public;
revoke all on function public.mb_same_firm(uuid) from public;

grant execute on function public.mb_req_user_id() to anon, authenticated, service_role;
grant execute on function public.mb_req_firm_id() to anon, authenticated, service_role;
grant execute on function public.mb_req_role() to anon, authenticated, service_role;
grant execute on function public.mb_is_admin() to anon, authenticated, service_role;
grant execute on function public.mb_same_firm(uuid) to anon, authenticated, service_role;
