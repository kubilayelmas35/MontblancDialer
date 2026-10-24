-- İş ilanı, firmanın eksi bakiye limitini (settings.billing.overdraft) harcanabilir tutara ekler.

create or replace function public.create_job_post(
  p_title text,
  p_description text,
  p_job_type text,
  p_budget numeric,
  p_unit_price numeric,
  p_quantity integer,
  p_currency text,
  p_requester_firm_id uuid,
  p_country text,
  p_city text,
  p_postal_code text,
  p_radius_km numeric,
  p_polygon_geojson jsonb,
  p_requirements text,
  p_deadline_at timestamptz,
  p_qc_mode text,
  p_slot_date date default null,
  p_slot_start time default null,
  p_slot_end time default null,
  p_retraction_deadline_at timestamptz default null,
  p_slots jsonb default null
)
returns table(job_post_id uuid, status text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.users%rowtype;
  v_firm public.firms%rowtype;
  v_target_firm_id uuid;
  v_job_id uuid;
  v_qc text;
  v_qty integer;
  v_unit_price numeric;
  v_duration interval;
  v_slot_start_ts timestamptz;
  v_slot_end_ts timestamptz;
  v_tz text;
  v_elem jsonb;
  v_overdraft numeric;
  i integer;
begin
  select * into v_user from public.users where id = mb_private.actor_id();
  if v_user.id is null then raise exception 'not_authenticated'; end if;
  if v_user.role not in ('super_admin','admin','firm_admin') then raise exception 'not_allowed'; end if;

  if v_user.role = 'super_admin' and p_requester_firm_id is not null then
    v_target_firm_id := p_requester_firm_id;
  else
    v_target_firm_id := v_user.firm_id;
  end if;

  select * into v_firm from public.firms where id = v_target_firm_id for update;
  if v_firm.id is null then raise exception 'firm_not_found'; end if;

  v_qty := greatest(coalesce(p_quantity, 1), 1);
  v_unit_price := coalesce(p_unit_price, p_budget, 0);
  if v_unit_price <= 0 then raise exception 'invalid_unit_price'; end if;
  if p_budget <= 0 then raise exception 'invalid_budget'; end if;
  if abs((v_unit_price * v_qty) - p_budget) > 0.01 then raise exception 'budget_mismatch'; end if;
  v_overdraft := greatest(coalesce(nullif(v_firm.settings #>> '{billing,overdraft}', '')::numeric, 0), 0);
  if (coalesce(v_firm.balance,0) - coalesce(v_firm.reserved_balance,0) + v_overdraft) < p_budget then raise exception 'insufficient_balance'; end if;

  v_qc := lower(coalesce(p_qc_mode,'required'));
  if v_qc not in ('required','optional','none') then v_qc := 'required'; end if;
  v_tz := coalesce(nullif(v_firm.settings->>'timezone',''), 'Europe/Berlin');

  insert into public.job_posts(
    requester_firm_id, requester_user_id, title, description, job_type, requirements, budget, unit_price, quantity,
    currency, qc_mode, status, country, city, postal_code, deadline_at,
    sla_first_action_min, sla_complete_min, retraction_deadline_at
  )
  values (
    v_target_firm_id, v_user.id, trim(coalesce(p_title,'')), p_description, coalesce(p_job_type,'custom'), p_requirements,
    p_budget, v_unit_price, v_qty, upper(coalesce(p_currency,'TRY')), v_qc, 'published',
    p_country, p_city, p_postal_code, p_deadline_at,
    999999, 999999,
    p_retraction_deadline_at
  )
  returning id into v_job_id;

  if coalesce(p_radius_km,0) > 0 or p_polygon_geojson is not null then
    insert into public.job_post_geo_rules(job_post_id, radius_km, polygon_geojson) values(v_job_id, p_radius_km, p_polygon_geojson);
  end if;

  if coalesce(p_job_type,'custom') = 'appointment'
     and p_slots is not null
     and jsonb_typeof(p_slots) = 'array'
     and jsonb_array_length(p_slots) > 0 then
    if jsonb_array_length(p_slots) > 48 then raise exception 'too_many_slots'; end if;
    for v_elem in select value from jsonb_array_elements(p_slots)
    loop
      if nullif(v_elem->>'date','') is null then continue; end if;
      v_slot_start_ts := ((v_elem->>'date') || ' ' || coalesce(nullif(v_elem->>'start',''), '10:00'))::timestamp at time zone v_tz;
      v_slot_end_ts := ((v_elem->>'date') || ' ' || coalesce(nullif(v_elem->>'end',''), '11:00'))::timestamp at time zone v_tz;
      if v_slot_end_ts <= v_slot_start_ts then
        v_slot_end_ts := v_slot_start_ts + interval '1 hour';
      end if;
      insert into public.job_post_slots(job_post_id, slot_start_at, slot_end_at, status)
      values(v_job_id, v_slot_start_ts, v_slot_end_ts, 'open');
    end loop;
  elsif coalesce(p_job_type,'custom') = 'appointment' and p_slot_date is not null and p_slot_start is not null and p_slot_end is not null then
    v_duration := (p_slot_end - p_slot_start);
    if v_duration <= interval '0' then v_duration := interval '1 hour'; end if;
    v_slot_start_ts := ((p_slot_date::text || ' ' || p_slot_start::text)::timestamp at time zone v_tz);
    for i in 0..(v_qty-1) loop
      v_slot_end_ts := v_slot_start_ts + v_duration;
      insert into public.job_post_slots(job_post_id, slot_start_at, slot_end_at, status)
      values(v_job_id, v_slot_start_ts, v_slot_end_ts, 'open');
      v_slot_start_ts := v_slot_end_ts;
    end loop;
  end if;

  update public.firms set reserved_balance = coalesce(reserved_balance,0) + p_budget where id = v_target_firm_id;
  insert into public.wallet_ledger(firm_id,job_post_id,entry_type,amount,currency,note,created_by)
  values(v_target_firm_id,v_job_id,'reserve',p_budget,upper(coalesce(p_currency,'TRY')),'Job reserve',v_user.id);
  perform public.log_job_event(v_job_id,'job_created',v_user.id,v_target_firm_id,jsonb_build_object('budget',p_budget,'unit_price',v_unit_price,'quantity',v_qty,'qc_mode',v_qc));
  return query select v_job_id,'published'::text;
end;
$$;
