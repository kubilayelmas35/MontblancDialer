-- Firm admins are not platform admins. Chat membership stays inside the firm:
-- a member row is visible or writable when the actor is that user, a super admin,
-- or both the group and the target user belong to the actor's firm.

create or replace function public.mb_chat_member_in_firm(p_group uuid, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    coalesce(mb_private.actor_is_super(), false)
    or p_user = mb_private.actor_id()
    or (
      coalesce(mb_private.actor_same_firm((select g.firm_id from public.chat_groups g where g.id = p_group)), false)
      and coalesce(mb_private.actor_same_firm((select u.firm_id from public.users u where u.id = p_user)), false)
    )
$$;

revoke all on function public.mb_chat_member_in_firm(uuid, uuid) from public;
grant execute on function public.mb_chat_member_in_firm(uuid, uuid) to anon, authenticated, service_role;

drop policy if exists mb_scope_all on public.chat_group_members;
create policy mb_scope_all on public.chat_group_members
  for all
  using (public.mb_chat_member_in_firm(group_id, user_id))
  with check (public.mb_chat_member_in_firm(group_id, user_id));
