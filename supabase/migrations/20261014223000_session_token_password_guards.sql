-- Browser sessions are anon-key + x-mb-session. A bare x-mb-user-id is not an actor.

create table if not exists public.app_sessions (
  token text primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists app_sessions_user_id_idx on public.app_sessions (user_id);
create index if not exists app_sessions_expires_at_idx on public.app_sessions (expires_at);

alter table public.app_sessions enable row level security;
revoke all on table public.app_sessions from public, anon, authenticated;

create or replace function mb_private.session_user_id()
returns uuid
language plpgsql
stable
security definer
set search_path to public, pg_temp
as $$
declare
  v_token text;
  v_user uuid;
begin
  v_token := nullif(public.mb_req_header('x-mb-session'), '');
  if v_token is null then
    return null;
  end if;

  select s.user_id into v_user
  from public.app_sessions s
  join public.users u on u.id = s.user_id
  where s.token = v_token
    and s.expires_at > now()
    and coalesce(u.is_active, true);

  return v_user;
end;
$$;

revoke all on function mb_private.session_user_id() from public, anon, authenticated;

create or replace function mb_private.actor_id()
returns uuid
language plpgsql
stable
security definer
set search_path to public, pg_temp
as $$
declare
  v_session uuid;
  v_raw text;
  v_requested uuid;
begin
  begin
    v_session := auth.uid();
  exception when others then
    v_session := null;
  end;

  if v_session is null then
    v_session := mb_private.session_user_id();
  end if;

  if v_session is null then
    return null;
  end if;

  if not exists (
    select 1 from public.users u
    where u.id = v_session and coalesce(u.is_active, true)
  ) then
    return null;
  end if;

  v_raw := nullif(public.mb_req_header('x-mb-user-id'), '');
  if v_raw is null then
    return v_session;
  end if;

  begin
    v_requested := v_raw::uuid;
  exception when others then
    return v_session;
  end;

  if v_requested = v_session then
    return v_session;
  end if;

  if exists (
    select 1 from public.users u
    where u.id = v_session
      and u.role = 'super_admin'
      and coalesce(u.is_active, true)
  ) and exists (
    select 1 from public.users t
    where t.id = v_requested
      and coalesce(t.is_active, true)
  ) then
    return v_requested;
  end if;

  return v_session;
end;
$$;

create or replace function mb_private.assert_session_actor(p_actor uuid)
returns void
language plpgsql
stable
security definer
set search_path to public, pg_temp
as $$
declare
  v_session uuid;
  v_role text;
begin
  v_session := mb_private.session_user_id();
  if v_session is null then
    raise exception 'not_authenticated';
  end if;
  if p_actor is null or p_actor = v_session then
    return;
  end if;
  select u.role into v_role
  from public.users u
  where u.id = v_session and coalesce(u.is_active, true);
  if v_role = 'super_admin' then
    return;
  end if;
  raise exception 'not_allowed';
end;
$$;

revoke all on function mb_private.assert_session_actor(uuid) from public, anon, authenticated;

drop function if exists public.verify_password(text, text);

create function public.verify_password(p_email text, p_password text)
returns table (
  user_id uuid,
  firm_id uuid,
  name text,
  role text,
  firm_name text,
  session_token text
)
language plpgsql
security definer
set search_path to public, pg_temp
as $$
declare
  v_user public.users%rowtype;
  v_firm text;
  v_token text;
begin
  select u.* into v_user
  from public.users u
  where lower(u.email) = lower(trim(p_email))
    and coalesce(u.is_active, true)
    and extensions.crypt(p_password::text, u.password_hash::text) = u.password_hash::text
  limit 1;

  if v_user.id is null then
    return;
  end if;

  delete from public.app_sessions where expires_at <= now();

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.app_sessions (token, user_id, expires_at)
  values (v_token, v_user.id, now() + interval '20 hours');

  select f.name into v_firm from public.firms f where f.id = v_user.firm_id;

  user_id := v_user.id;
  firm_id := v_user.firm_id;
  name := v_user.name;
  role := v_user.role;
  firm_name := v_firm;
  session_token := v_token;
  return next;
end;
$$;

grant execute on function public.verify_password(text, text) to anon, authenticated, service_role;

create or replace function public.end_app_session()
returns void
language plpgsql
security definer
set search_path to public, pg_temp
as $$
declare
  v_token text;
begin
  v_token := nullif(public.mb_req_header('x-mb-session'), '');
  if v_token is null then
    return;
  end if;
  delete from public.app_sessions where token = v_token;
end;
$$;

grant execute on function public.end_app_session() to anon, authenticated, service_role;

create or replace function public.create_user_with_password(
  p_firm_id uuid,
  p_email text,
  p_password text,
  p_name text,
  p_role text
)
returns void
language plpgsql
security definer
set search_path to public, pg_temp
as $$
declare
  v_actor uuid;
  v_role text;
  v_firm uuid;
begin
  if coalesce(length(trim(p_password)), 0) < 6 then
    raise exception 'password_min_length';
  end if;

  v_actor := mb_private.session_user_id();
  if v_actor is null then
    raise exception 'not_allowed';
  end if;

  select u.role, u.firm_id into v_role, v_firm
  from public.users u
  where u.id = v_actor and coalesce(u.is_active, true);

  if v_role is null or v_role not in ('super_admin', 'admin', 'firm_admin') then
    raise exception 'not_allowed';
  end if;

  if v_role <> 'super_admin' and p_firm_id is distinct from v_firm then
    raise exception 'not_allowed';
  end if;

  if coalesce(p_role, '') = 'super_admin' and v_role <> 'super_admin' then
    raise exception 'not_allowed';
  end if;

  insert into public.users (firm_id, email, password_hash, name, role, is_active)
  values (
    p_firm_id,
    lower(trim(p_email)),
    extensions.crypt(p_password::text, extensions.gen_salt('bf')),
    p_name,
    p_role,
    true
  );
end;
$$;

create or replace function public.reset_user_password(p_user_id uuid, p_new_password text)
returns void
language plpgsql
security definer
set search_path to public, pg_temp
as $$
declare
  v_actor uuid;
  v_role text;
  v_firm uuid;
  v_target_role text;
  v_target_firm uuid;
begin
  if coalesce(length(trim(p_new_password)), 0) < 6 then
    raise exception 'password_min_length';
  end if;

  v_actor := mb_private.session_user_id();
  if v_actor is null then
    raise exception 'not_allowed';
  end if;

  select u.role, u.firm_id into v_role, v_firm
  from public.users u
  where u.id = v_actor and coalesce(u.is_active, true);

  if v_role is null or v_role not in ('super_admin', 'admin', 'firm_admin') then
    raise exception 'not_allowed';
  end if;

  select u.role, u.firm_id into v_target_role, v_target_firm
  from public.users u
  where u.id = p_user_id;

  if v_target_role is null then
    raise exception 'not_found';
  end if;

  if v_role <> 'super_admin' then
    if v_target_firm is distinct from v_firm then
      raise exception 'not_allowed';
    end if;
    if v_target_role = 'super_admin' then
      raise exception 'not_allowed';
    end if;
  end if;

  update public.users
  set password_hash = extensions.crypt(p_new_password::text, extensions.gen_salt('bf'))
  where id = p_user_id;
end;
$$;

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
set search_path to public, pg_temp
as $$
declare
  v_actor public.users%rowtype;
  v_scope_firm uuid;
begin
  perform mb_private.assert_session_actor(p_actor_user_id);
  if p_actor_user_id is null then
    raise exception 'missing_actor';
  end if;
  select * into v_actor
  from public.users u
  where u.id = p_actor_user_id and coalesce(u.is_active, true) = true
  limit 1;
  if v_actor.id is null then
    raise exception 'actor_not_found';
  end if;
  if v_actor.role = 'super_admin' then
    v_scope_firm := p_firm_id;
    return query
    select ft.id, ft.firm_id, ft.appointment_id, ft.contact_id, ft.assigned_to, ft.assigned_by,
           ft.status, ft.result_key, ft.result_payload, ft.notes, ft.next_action_at,
           ft.completed_at, ft.created_at, ft.updated_at
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
           ft.status, ft.result_key, ft.result_payload, ft.notes, ft.next_action_at,
           ft.completed_at, ft.created_at, ft.updated_at
    from public.field_tasks ft
    where ft.firm_id = v_scope_firm
    order by ft.created_at desc
    limit 120;
    return;
  end if;
  if v_actor.role = 'field_agent' then
    return query
    select ft.id, ft.firm_id, ft.appointment_id, ft.contact_id, ft.assigned_to, ft.assigned_by,
           ft.status, ft.result_key, ft.result_payload, ft.notes, ft.next_action_at,
           ft.completed_at, ft.created_at, ft.updated_at
    from public.field_tasks ft
    where ft.firm_id = v_actor.firm_id and ft.assigned_to = v_actor.id
    order by ft.created_at desc
    limit 120;
    return;
  end if;
  raise exception 'actor_not_allowed';
end;
$$;

create or replace function public.create_field_task_from_admin(
  p_actor_user_id uuid,
  p_appointment_id uuid,
  p_assigned_to uuid
)
returns uuid
language plpgsql
security definer
set search_path to public, pg_temp
as $$
declare
  v_actor public.users%rowtype;
  v_appt public.appointments%rowtype;
  v_assignee public.users%rowtype;
  v_existing uuid;
  v_task_id uuid;
begin
  perform mb_private.assert_session_actor(p_actor_user_id);
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
  select * into v_appt from public.appointments where id = p_appointment_id limit 1;
  if v_appt.id is null then
    raise exception 'appointment_not_found';
  end if;
  if v_actor.role <> 'super_admin' and v_actor.firm_id <> v_appt.firm_id then
    raise exception 'firm_mismatch';
  end if;
  select * into v_assignee
  from public.users
  where id = p_assigned_to and role = 'field_agent' and coalesce(is_active, true) = true
  limit 1;
  if v_assignee.id is null then
    raise exception 'assignee_not_found_or_not_field_agent';
  end if;
  if v_assignee.firm_id <> v_appt.firm_id then
    raise exception 'assignee_firm_mismatch';
  end if;
  select ft.id into v_existing
  from public.field_tasks ft
  where ft.appointment_id = p_appointment_id and ft.assigned_to = p_assigned_to
  limit 1;
  if v_existing is not null then
    raise exception 'already_assigned';
  end if;
  insert into public.field_tasks (
    firm_id, appointment_id, contact_id, assigned_to, assigned_by, status
  ) values (
    v_appt.firm_id, v_appt.id, v_appt.contact_id, p_assigned_to, v_actor.id, 'assigned'
  ) returning id into v_task_id;
  return v_task_id;
end;
$$;
