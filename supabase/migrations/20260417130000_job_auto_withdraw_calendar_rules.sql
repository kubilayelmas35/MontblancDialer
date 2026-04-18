-- Geri çekme: manuel tarih zorunluluğu kalkar; QC bekleyen veya randevuya bağlı teslim yoksa tarih beklemeden geri çekilebilir.
-- Otomatik toplu geri çekme: randevu ilanı, CRM randevusu bağlı teslim yok, ilan en az 2 saat önce açıldı.

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
  p_retraction_deadline_at timestamptz default null
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
  i integer;
begin
  select * into v_user from public.users where id = auth.uid();
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
  if (coalesce(v_firm.balance,0) - coalesce(v_firm.reserved_balance,0)) < p_budget then raise exception 'insufficient_balance'; end if;

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

  if coalesce(p_job_type,'custom') = 'appointment' and p_slot_date is not null and p_slot_start is not null and p_slot_end is not null then
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

create or replace function public.withdraw_job_post(p_job_post_id uuid)
returns table(ok boolean, message text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.users%rowtype;
  v_post public.job_posts%rowtype;
  v_auto_skip_deadline boolean;
begin
  select * into v_user from public.users where id = auth.uid();
  if v_user.id is null then
    return query select false, 'not_authenticated'::text;
    return;
  end if;

  select * into v_post from public.job_posts where id = p_job_post_id for update;
  if v_post.id is null then
    return query select false, 'job_not_found'::text;
    return;
  end if;

  if v_user.role <> 'super_admin' then
    if not (v_user.firm_id = v_post.requester_firm_id and v_user.role in ('admin','firm_admin')) then
      return query select false, 'not_allowed'::text;
      return;
    end if;
  end if;

  if v_post.status not in ('published','in_progress','pending_qc') then
    return query select false, 'job_not_withdrawable'::text;
    return;
  end if;

  v_auto_skip_deadline :=
    (v_post.status = 'pending_qc')
    or (
      v_post.job_type = 'appointment'
      and not exists (
        select 1 from public.job_submissions s
        where s.job_post_id = v_post.id
          and s.appointment_id is not null
          and s.status in ('submitted','qc_pending','approved')
      )
    );

  if not v_auto_skip_deadline then
    if v_post.retraction_deadline_at is null or now() < v_post.retraction_deadline_at then
      return query select false, 'retraction_not_yet_allowed'::text;
      return;
    end if;
  end if;

  if exists (select 1 from public.job_submissions s where s.job_post_id = v_post.id and s.status = 'approved') then
    return query select false, 'job_has_approved_submission'::text;
    return;
  end if;

  if v_post.job_type = 'appointment' and v_post.status <> 'pending_qc' then
    if exists (
      select 1 from public.job_submissions s
      where s.job_post_id = v_post.id
        and s.appointment_id is not null
        and s.status in ('submitted','qc_pending','approved')
    ) then
      return query select false, 'appointment_already_linked'::text;
      return;
    end if;
  end if;

  update public.job_posts set status = 'cancelled' where id = v_post.id;

  update public.firms set reserved_balance = greatest(coalesce(reserved_balance,0) - v_post.budget, 0)
  where id = v_post.requester_firm_id;

  insert into public.wallet_ledger(firm_id,job_post_id,entry_type,amount,currency,note,created_by)
  values(v_post.requester_firm_id,v_post.id,'release',v_post.budget,v_post.currency,'İlan geri çekildi',v_user.id);

  update public.job_post_slots set status = 'cancelled' where job_post_id = v_post.id and status = 'open';

  perform public.log_job_event(
    v_post.id,
    'job_withdrawn',
    v_user.id,
    v_post.requester_firm_id,
    jsonb_build_object(
      'requester_firm_id', v_post.requester_firm_id,
      'title', v_post.title,
      'by_super_admin', v_user.role = 'super_admin',
      'auto_policy', v_auto_skip_deadline
    )
  );

  return query select true, 'ok'::text;
end;
$$;

create or replace function public.job_market_run_auto_withdrawals()
returns table(processed integer, withdrawn integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.users%rowtype;
  r record;
  v_cnt int := 0;
  v_w int := 0;
  v_ok boolean;
begin
  select * into v_user from public.users where id = auth.uid();
  if v_user.id is null then
    return query select 0, 0;
    return;
  end if;

  for r in
    select jp.id
    from public.job_posts jp
    where jp.status in ('published','in_progress','pending_qc')
      and jp.retraction_deadline_at is not null
      and jp.retraction_deadline_at <= now()
      and not exists (
        select 1 from public.job_submissions s
        where s.job_post_id = jp.id
          and s.status in ('submitted','qc_pending','approved')
      )
      and (
        v_user.role = 'super_admin'
        or (v_user.firm_id = jp.requester_firm_id and v_user.role in ('admin','firm_admin'))
      )
  loop
    v_cnt := v_cnt + 1;
    select w.ok into v_ok from public.withdraw_job_post(r.id) w limit 1;
    if coalesce(v_ok, false) then
      v_w := v_w + 1;
    end if;
  end loop;

  return query select v_cnt, v_w;
end;
$$;

comment on function public.job_market_run_auto_withdrawals() is
  'Belirlenen geri çekme tarih/saatine kadar teslim girişi yoksa ilanları otomatik geri çeker.';

grant execute on function public.job_market_run_auto_withdrawals() to anon;
grant execute on function public.job_market_run_auto_withdrawals() to authenticated;
grant execute on function public.job_market_run_auto_withdrawals() to service_role;
