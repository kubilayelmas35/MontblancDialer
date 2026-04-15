-- Read field tasks via validated actor context (anon client compatible).

create or replace function public.list_field_tasks_for_user(
  p_actor_user_id uuid,
  p_firm_id uuid default null
)
returns table (
  id uuid,
  firm_id uuid,
  appointment_id uuid,
  contact_id uuid,
  assigned_to uuid,
  assigned_by uuid,
  status text,
  result_key text,
  result_payload jsonb,
  notes text,
  next_action_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor public.users%rowtype;
  v_scope_firm uuid;
begin
  if p_actor_user_id is null then
    raise exception 'missing_actor';
  end if;

  select * into v_actor
  from public.users
  where id = p_actor_user_id and coalesce(is_active, true) = true
  limit 1;

  if v_actor.id is null then
    raise exception 'actor_not_found';
  end if;

  if v_actor.role = 'super_admin' then
    v_scope_firm := p_firm_id;
    return query
    select ft.id, ft.firm_id, ft.appointment_id, ft.contact_id, ft.assigned_to, ft.assigned_by,
           ft.status, ft.result_key, ft.result_payload, ft.notes, ft.next_action_at, ft.completed_at,
           ft.created_at, ft.updated_at
    from public.field_tasks ft
    where (v_scope_firm is null or ft.firm_id = v_scope_firm)
    order by ft.created_at desc
    limit 120;
    return;
  end if;

  if v_actor.role in ('admin', 'firm_admin', 'qc') then
    v_scope_firm := coalesce(p_firm_id, v_actor.firm_id);
    if v_scope_firm is null then
      return;
    end if;
    if v_actor.role <> 'super_admin' and v_scope_firm <> v_actor.firm_id then
      raise exception 'firm_mismatch';
    end if;
    return query
    select ft.id, ft.firm_id, ft.appointment_id, ft.contact_id, ft.assigned_to, ft.assigned_by,
           ft.status, ft.result_key, ft.result_payload, ft.notes, ft.next_action_at, ft.completed_at,
           ft.created_at, ft.updated_at
    from public.field_tasks ft
    where ft.firm_id = v_scope_firm
    order by ft.created_at desc
    limit 120;
    return;
  end if;

  if v_actor.role = 'field_agent' then
    return query
    select ft.id, ft.firm_id, ft.appointment_id, ft.contact_id, ft.assigned_to, ft.assigned_by,
           ft.status, ft.result_key, ft.result_payload, ft.notes, ft.next_action_at, ft.completed_at,
           ft.created_at, ft.updated_at
    from public.field_tasks ft
    where ft.firm_id = v_actor.firm_id
      and ft.assigned_to = v_actor.id
    order by ft.created_at desc
    limit 120;
    return;
  end if;

  raise exception 'actor_not_allowed';
end;
$$;

comment on function public.list_field_tasks_for_user(uuid, uuid) is
  'Lists field tasks by explicit actor role/firm validation (anon-compatible).';

grant execute on function public.list_field_tasks_for_user(uuid, uuid) to anon;
grant execute on function public.list_field_tasks_for_user(uuid, uuid) to authenticated;
grant execute on function public.list_field_tasks_for_user(uuid, uuid) to service_role;
