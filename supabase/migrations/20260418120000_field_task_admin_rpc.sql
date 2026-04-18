-- Allow admin-side field assignment via explicit actor validation.
-- The app uses anon RPC calls, so RLS policies that depend on auth.uid()
-- need a dedicated security-definer function for this action.

create or replace function public.create_field_task_from_admin(
  p_actor_user_id uuid,
  p_appointment_id uuid,
  p_assigned_to uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor public.users%rowtype;
  v_appt public.appointments%rowtype;
  v_assignee public.users%rowtype;
  v_existing uuid;
  v_task_id uuid;
begin
  if p_actor_user_id is null or p_appointment_id is null or p_assigned_to is null then
    raise exception 'missing_params';
  end if;

  select * into v_actor
  from public.users
  where id = p_actor_user_id and coalesce(is_active, true) = true
  limit 1;

  if v_actor.id is null then
    raise exception 'actor_not_found';
  end if;

  if v_actor.role not in ('admin', 'firm_admin', 'super_admin') then
    raise exception 'actor_not_allowed';
  end if;

  select * into v_appt
  from public.appointments
  where id = p_appointment_id
  limit 1;

  if v_appt.id is null then
    raise exception 'appointment_not_found';
  end if;

  if v_actor.role <> 'super_admin' and v_actor.firm_id <> v_appt.firm_id then
    raise exception 'firm_mismatch';
  end if;

  select * into v_assignee
  from public.users
  where id = p_assigned_to
    and role = 'field_agent'
    and coalesce(is_active, true) = true
  limit 1;

  if v_assignee.id is null then
    raise exception 'assignee_not_found_or_not_field_agent';
  end if;

  if v_assignee.firm_id <> v_appt.firm_id then
    raise exception 'assignee_firm_mismatch';
  end if;

  select ft.id into v_existing
  from public.field_tasks ft
  where ft.appointment_id = p_appointment_id
    and ft.assigned_to = p_assigned_to
  limit 1;

  if v_existing is not null then
    raise exception 'already_assigned';
  end if;

  insert into public.field_tasks (
    firm_id,
    appointment_id,
    contact_id,
    assigned_to,
    assigned_by,
    status
  )
  values (
    v_appt.firm_id,
    v_appt.id,
    v_appt.contact_id,
    p_assigned_to,
    v_actor.id,
    'assigned'
  )
  returning id into v_task_id;

  return v_task_id;
end;
$$;

comment on function public.create_field_task_from_admin(uuid, uuid, uuid) is
  'Creates a field task from an appointment after explicit actor/firm checks.';

grant execute on function public.create_field_task_from_admin(uuid, uuid, uuid) to anon;
grant execute on function public.create_field_task_from_admin(uuid, uuid, uuid) to authenticated;
grant execute on function public.create_field_task_from_admin(uuid, uuid, uuid) to service_role;
