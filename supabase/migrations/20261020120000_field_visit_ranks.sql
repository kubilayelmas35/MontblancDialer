-- Saha sıralaması: tamamlanan ziyaret, arama randevusundan ayrı.

create or replace function public.list_field_visit_ranks(
  p_actor_user_id uuid,
  p_firm_id uuid,
  p_from date,
  p_to date
)
returns table (
  user_id uuid,
  name text,
  completed integer,
  sales integer
)
language plpgsql
security definer
set search_path to public, pg_temp
as $$
declare
  v_actor public.users%rowtype;
  v_firm uuid;
begin
  perform mb_private.assert_session_actor(p_actor_user_id);
  if p_actor_user_id is null or p_from is null or p_to is null then
    raise exception 'missing_params';
  end if;

  select * into v_actor
  from public.users u
  where u.id = p_actor_user_id and coalesce(u.is_active, true) = true
  limit 1;

  if v_actor.id is null then
    raise exception 'actor_not_found';
  end if;

  if v_actor.role = 'super_admin' then
    v_firm := p_firm_id;
  elsif v_actor.role in ('admin', 'firm_admin', 'field_agent') then
    v_firm := v_actor.firm_id;
    if p_firm_id is not null and p_firm_id <> v_actor.firm_id then
      raise exception 'firm_mismatch';
    end if;
  else
    raise exception 'actor_not_allowed';
  end if;

  if v_firm is null then
    return;
  end if;

  return query
  select u.id,
         u.name,
         count(*) filter (where ft.status = 'completed')::integer,
         count(*) filter (where ft.status = 'completed' and lower(coalesce(ft.result_key, '')) in ('satis', 'sale'))::integer
  from public.field_tasks ft
  join public.users u on u.id = ft.assigned_to
  where ft.firm_id = v_firm
    and ft.completed_at is not null
    and (ft.completed_at at time zone 'Europe/Berlin')::date between p_from and p_to
    and u.role = 'field_agent'
  group by u.id, u.name
  order by 3 desc, 4 desc, u.name;
end;
$$;

grant execute on function public.list_field_visit_ranks(uuid, uuid, date, date) to anon, authenticated, service_role;
