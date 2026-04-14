alter table public.job_posts add column if not exists sla_first_action_min integer not null default 120;
alter table public.job_posts add column if not exists sla_complete_min integer not null default 1440;
alter table public.job_posts add column if not exists first_worker_joined_at timestamptz null;
alter table public.job_posts add column if not exists first_submission_at timestamptz null;

drop function if exists public.create_job_post(text,text,text,numeric,text,text,text,text,numeric,jsonb,text,timestamptz,text);

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
  p_sla_first_action_min integer default 120,
  p_sla_complete_min integer default 1440
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
    currency, qc_mode, status, country, city, postal_code, deadline_at, sla_first_action_min, sla_complete_min
  )
  values (
    v_target_firm_id, v_user.id, trim(coalesce(p_title,'')), p_description, coalesce(p_job_type,'custom'), p_requirements,
    p_budget, v_unit_price, v_qty, upper(coalesce(p_currency,'TRY')), v_qc, 'published',
    p_country, p_city, p_postal_code, p_deadline_at,
    greatest(coalesce(p_sla_first_action_min,120), 5),
    greatest(coalesce(p_sla_complete_min,1440), 30)
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

create or replace function public.join_job_post(p_job_post_id uuid)
returns table(worker_id uuid, status text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.users%rowtype;
  v_post public.job_posts%rowtype;
  v_worker uuid;
begin
  select * into v_user from public.users where id = auth.uid();
  if v_user.id is null then raise exception 'not_authenticated'; end if;
  select * into v_post from public.job_posts where id = p_job_post_id for update;
  if v_post.id is null then raise exception 'job_not_found'; end if;
  if v_post.status not in ('published','in_progress','pending_qc') then raise exception 'job_closed'; end if;
  if v_post.requester_firm_id = v_user.firm_id then raise exception 'same_firm_not_allowed'; end if;
  insert into public.job_post_workers(job_post_id,worker_firm_id,worker_user_id,status)
  values(v_post.id,v_user.firm_id,v_user.id,'working')
  on conflict(job_post_id,worker_firm_id) do update set worker_user_id=excluded.worker_user_id,status='working',updated_at=now()
  returning id into v_worker;
  update public.job_posts
     set status = case when status='published' then 'in_progress' else status end,
         first_worker_joined_at = coalesce(first_worker_joined_at, now())
   where id = v_post.id;
  perform public.log_job_event(v_post.id,'worker_joined',v_user.id,v_user.firm_id,'{}'::jsonb);
  return query select v_worker,'working'::text;
end;
$$;

create or replace function public.submit_job_submission(
  p_job_post_id uuid, p_submission_type text, p_payload jsonb, p_appointment_id uuid default null, p_field_task_id uuid default null
)
returns table(submission_id uuid, submission_status text, post_status text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.users%rowtype;
  v_post public.job_posts%rowtype;
  v_sub uuid;
  v_sub_status text;
begin
  select * into v_user from public.users where id = auth.uid();
  if v_user.id is null then raise exception 'not_authenticated'; end if;
  select * into v_post from public.job_posts where id = p_job_post_id for update;
  if v_post.id is null then raise exception 'job_not_found'; end if;
  if v_post.requester_firm_id = v_user.firm_id then raise exception 'owner_cannot_submit'; end if;
  if v_post.status not in ('published','in_progress','pending_qc') then raise exception 'job_closed'; end if;
  perform public.join_job_post(v_post.id);
  v_sub_status := case when v_post.qc_mode='none' then 'approved' else 'qc_pending' end;
  insert into public.job_submissions(job_post_id,worker_firm_id,worker_user_id,submission_type,appointment_id,field_task_id,payload,status)
  values(v_post.id,v_user.firm_id,v_user.id,coalesce(p_submission_type,'custom'),p_appointment_id,p_field_task_id,coalesce(p_payload,'{}'::jsonb),v_sub_status)
  returning id into v_sub;
  update public.job_posts
     set status = case when v_post.qc_mode='none' then 'completed' else 'pending_qc' end,
         winner_firm_id = case when v_post.qc_mode='none' then v_user.firm_id else winner_firm_id end,
         winner_submission_id = case when v_post.qc_mode='none' then v_sub else winner_submission_id end,
         completed_at = case when v_post.qc_mode='none' then now() else completed_at end,
         first_submission_at = coalesce(first_submission_at, now())
   where id = v_post.id and status in ('published','in_progress','pending_qc');
  update public.job_post_workers set status = case when worker_firm_id=v_user.firm_id then 'submitted' else 'stopped' end where job_post_id=v_post.id;
  perform public.log_job_event(v_post.id,'submission_created',v_user.id,v_user.firm_id,jsonb_build_object('submission_id',v_sub,'status',v_sub_status));
  return query select v_sub,v_sub_status,(select status from public.job_posts where id=v_post.id);
end;
$$;

create or replace function public.approve_job_submission(p_submission_id uuid, p_approve boolean, p_qc_note text default null)
returns table(job_post_id uuid, post_status text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.users%rowtype;
  v_sub public.job_submissions%rowtype;
  v_post public.job_posts%rowtype;
begin
  select * into v_user from public.users where id = auth.uid();
  if v_user.id is null then raise exception 'not_authenticated'; end if;
  select * into v_sub from public.job_submissions where id = p_submission_id for update;
  if v_sub.id is null then raise exception 'submission_not_found'; end if;
  select * into v_post from public.job_posts where id = v_sub.job_post_id for update;

  if v_user.role <> 'super_admin' then
    if v_user.role not in ('admin','firm_admin','qc') then
      raise exception 'not_allowed';
    end if;
    if v_user.firm_id is distinct from v_post.requester_firm_id then
      raise exception 'not_allowed_for_firm';
    end if;
  end if;

  if p_approve then
    update public.job_submissions set status='approved',qc_note=p_qc_note,reviewed_by=v_user.id,reviewed_at=now() where id=v_sub.id;
    update public.job_submissions set status='superseded',reviewed_by=v_user.id,reviewed_at=now() where job_post_id=v_post.id and id<>v_sub.id and status in ('submitted','qc_pending');
    update public.job_posts set status='completed',winner_firm_id=v_sub.worker_firm_id,winner_submission_id=v_sub.id,completed_at=now() where id=v_post.id;
    update public.firms set reserved_balance=greatest(coalesce(reserved_balance,0)-v_post.budget,0),balance=coalesce(balance,0)-v_post.budget where id=v_post.requester_firm_id;
    update public.firms set balance=coalesce(balance,0)+v_post.budget where id=v_sub.worker_firm_id;
    insert into public.wallet_ledger(firm_id,counterparty_firm_id,job_post_id,entry_type,amount,currency,note,created_by) values
      (v_post.requester_firm_id,v_sub.worker_firm_id,v_post.id,'charge',v_post.budget,v_post.currency,'Job charge',v_user.id),
      (v_sub.worker_firm_id,v_post.requester_firm_id,v_post.id,'reward',v_post.budget,v_post.currency,'Job reward',v_user.id);
    perform public.log_job_event(v_post.id,'submission_approved',v_user.id,v_user.firm_id,jsonb_build_object('submission_id',v_sub.id));
  else
    update public.job_submissions set status='rejected',qc_note=p_qc_note,reviewed_by=v_user.id,reviewed_at=now() where id=v_sub.id;
    update public.job_posts set status='in_progress',winner_firm_id=null,winner_submission_id=null where id=v_post.id and status='pending_qc';
    update public.job_post_workers set status='working' where job_post_id=v_post.id and status='stopped';
    perform public.log_job_event(v_post.id,'submission_rejected',v_user.id,v_user.firm_id,jsonb_build_object('submission_id',v_sub.id));
  end if;
  return query select v_post.id,(select status from public.job_posts where id=v_post.id);
end;
$$;
