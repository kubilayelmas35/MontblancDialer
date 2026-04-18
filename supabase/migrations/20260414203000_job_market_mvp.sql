create table if not exists public.job_posts (
  id uuid primary key default gen_random_uuid(),
  requester_firm_id uuid not null references public.firms(id) on delete cascade,
  requester_user_id uuid not null references public.users(id) on delete set null,
  title text not null,
  description text null,
  job_type text not null default 'custom',
  requirements text null,
  budget numeric(12,2) not null check (budget > 0),
  currency text not null default 'TRY',
  qc_mode text not null default 'required' check (qc_mode in ('required','optional','none')),
  status text not null default 'published' check (status in ('published','in_progress','pending_qc','completed','cancelled','expired')),
  country text null,
  city text null,
  postal_code text null,
  deadline_at timestamptz null,
  winner_firm_id uuid null references public.firms(id) on delete set null,
  winner_submission_id uuid null,
  completed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.job_post_geo_rules (
  id uuid primary key default gen_random_uuid(),
  job_post_id uuid not null references public.job_posts(id) on delete cascade,
  radius_km numeric(8,2) null check (radius_km >= 0),
  polygon_geojson jsonb null,
  created_at timestamptz not null default now()
);

create table if not exists public.job_post_workers (
  id uuid primary key default gen_random_uuid(),
  job_post_id uuid not null references public.job_posts(id) on delete cascade,
  worker_firm_id uuid not null references public.firms(id) on delete cascade,
  worker_user_id uuid not null references public.users(id) on delete set null,
  status text not null default 'working' check (status in ('working','stopped','submitted','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(job_post_id, worker_firm_id)
);

create table if not exists public.job_submissions (
  id uuid primary key default gen_random_uuid(),
  job_post_id uuid not null references public.job_posts(id) on delete cascade,
  worker_firm_id uuid not null references public.firms(id) on delete cascade,
  worker_user_id uuid not null references public.users(id) on delete set null,
  submission_type text not null default 'custom' check (submission_type in ('appointment','lead','field_task','call_capacity','custom')),
  appointment_id uuid null references public.appointments(id) on delete set null,
  field_task_id uuid null references public.field_tasks(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'submitted' check (status in ('submitted','qc_pending','approved','rejected','superseded')),
  qc_note text null,
  reviewed_by uuid null references public.users(id) on delete set null,
  reviewed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.wallet_ledger (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms(id) on delete cascade,
  counterparty_firm_id uuid null references public.firms(id) on delete set null,
  job_post_id uuid null references public.job_posts(id) on delete set null,
  entry_type text not null check (entry_type in ('reserve','release','charge','reward','refund','adjustment')),
  amount numeric(12,2) not null,
  currency text not null default 'TRY',
  note text null,
  created_by uuid null references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.job_events (
  id uuid primary key default gen_random_uuid(),
  job_post_id uuid not null references public.job_posts(id) on delete cascade,
  event_type text not null,
  actor_user_id uuid null references public.users(id) on delete set null,
  actor_firm_id uuid null references public.firms(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_job_posts_status_created on public.job_posts(status, created_at desc);
create index if not exists idx_job_workers_post on public.job_post_workers(job_post_id, created_at desc);
create index if not exists idx_job_submissions_post on public.job_submissions(job_post_id, created_at desc);
create index if not exists idx_wallet_ledger_firm on public.wallet_ledger(firm_id, created_at desc);
create index if not exists idx_job_events_post on public.job_events(job_post_id, created_at desc);

alter table public.firms add column if not exists balance numeric(12,2) not null default 0;
alter table public.firms add column if not exists reserved_balance numeric(12,2) not null default 0;

create or replace function public.job_market_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_job_posts_updated_at on public.job_posts;
create trigger trg_job_posts_updated_at before update on public.job_posts for each row execute function public.job_market_touch_updated_at();
drop trigger if exists trg_job_post_workers_updated_at on public.job_post_workers;
create trigger trg_job_post_workers_updated_at before update on public.job_post_workers for each row execute function public.job_market_touch_updated_at();
drop trigger if exists trg_job_submissions_updated_at on public.job_submissions;
create trigger trg_job_submissions_updated_at before update on public.job_submissions for each row execute function public.job_market_touch_updated_at();

create or replace function public.log_job_event(p_job_post_id uuid, p_event_type text, p_actor_user_id uuid, p_actor_firm_id uuid, p_payload jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.job_events(job_post_id, event_type, actor_user_id, actor_firm_id, payload)
  values (p_job_post_id, p_event_type, p_actor_user_id, p_actor_firm_id, coalesce(p_payload,'{}'::jsonb));
end;
$$;

create or replace function public.create_job_post(
  p_title text, p_description text, p_job_type text, p_budget numeric, p_currency text,
  p_country text, p_city text, p_postal_code text, p_radius_km numeric, p_polygon_geojson jsonb,
  p_requirements text, p_deadline_at timestamptz, p_qc_mode text
)
returns table(job_post_id uuid, status text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.users%rowtype;
  v_firm public.firms%rowtype;
  v_job_id uuid;
  v_qc text;
begin
  select * into v_user from public.users where id = auth.uid();
  if v_user.id is null then raise exception 'not_authenticated'; end if;
  if v_user.role not in ('super_admin','admin','firm_admin') then raise exception 'not_allowed'; end if;
  select * into v_firm from public.firms where id = v_user.firm_id for update;
  if (coalesce(v_firm.balance,0) - coalesce(v_firm.reserved_balance,0)) < p_budget then raise exception 'insufficient_balance'; end if;
  v_qc := lower(coalesce(p_qc_mode,'required'));
  if v_qc not in ('required','optional','none') then v_qc := 'required'; end if;
  insert into public.job_posts(requester_firm_id,requester_user_id,title,description,job_type,requirements,budget,currency,qc_mode,status,country,city,postal_code,deadline_at)
  values(v_firm.id,v_user.id,trim(coalesce(p_title,'')),p_description,coalesce(p_job_type,'custom'),p_requirements,p_budget,upper(coalesce(p_currency,'TRY')),v_qc,'published',p_country,p_city,p_postal_code,p_deadline_at)
  returning id into v_job_id;
  if coalesce(p_radius_km,0) > 0 or p_polygon_geojson is not null then
    insert into public.job_post_geo_rules(job_post_id,radius_km,polygon_geojson) values(v_job_id,p_radius_km,p_polygon_geojson);
  end if;
  update public.firms set reserved_balance = coalesce(reserved_balance,0) + p_budget where id = v_firm.id;
  insert into public.wallet_ledger(firm_id,job_post_id,entry_type,amount,currency,note,created_by)
  values(v_firm.id,v_job_id,'reserve',p_budget,upper(coalesce(p_currency,'TRY')),'Job reserve',v_user.id);
  perform public.log_job_event(v_job_id,'job_created',v_user.id,v_firm.id,jsonb_build_object('budget',p_budget,'qc_mode',v_qc));
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
  if v_post.status='published' then update public.job_posts set status='in_progress' where id=v_post.id; end if;
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
  perform public.join_job_post(v_post.id);
  v_sub_status := case when v_post.qc_mode='none' then 'approved' else 'qc_pending' end;
  insert into public.job_submissions(job_post_id,worker_firm_id,worker_user_id,submission_type,appointment_id,field_task_id,payload,status)
  values(v_post.id,v_user.firm_id,v_user.id,coalesce(p_submission_type,'custom'),p_appointment_id,p_field_task_id,coalesce(p_payload,'{}'::jsonb),v_sub_status)
  returning id into v_sub;
  update public.job_posts
     set status = case when v_post.qc_mode='none' then 'completed' else 'pending_qc' end,
         winner_firm_id = case when v_post.qc_mode='none' then v_user.firm_id else winner_firm_id end,
         winner_submission_id = case when v_post.qc_mode='none' then v_sub else winner_submission_id end,
         completed_at = case when v_post.qc_mode='none' then now() else completed_at end
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

alter table public.job_posts enable row level security;
alter table public.job_post_geo_rules enable row level security;
alter table public.job_post_workers enable row level security;
alter table public.job_submissions enable row level security;
alter table public.wallet_ledger enable row level security;
alter table public.job_events enable row level security;

drop policy if exists job_posts_select_policy on public.job_posts;
create policy job_posts_select_policy on public.job_posts for select using (
  exists (
    select 1 from public.users u
    where u.id = auth.uid()
      and (
        u.role = 'super_admin'
        or u.firm_id = requester_firm_id
        or status in ('published','in_progress','pending_qc')
      )
  )
);

drop policy if exists job_posts_update_policy on public.job_posts;
create policy job_posts_update_policy on public.job_posts for update using (
  exists (select 1 from public.users u where u.id = auth.uid() and (u.role='super_admin' or u.firm_id=requester_firm_id))
);

drop policy if exists job_post_workers_select_policy on public.job_post_workers;
create policy job_post_workers_select_policy on public.job_post_workers for select using (
  exists (select 1 from public.users u where u.id = auth.uid() and (u.role='super_admin' or u.firm_id=worker_firm_id or u.firm_id in (select requester_firm_id from public.job_posts jp where jp.id=job_post_id)))
);

drop policy if exists job_submissions_select_policy on public.job_submissions;
create policy job_submissions_select_policy on public.job_submissions for select using (
  exists (select 1 from public.users u where u.id = auth.uid() and (u.role='super_admin' or u.firm_id=worker_firm_id or u.firm_id in (select requester_firm_id from public.job_posts jp where jp.id=job_post_id)))
);

drop policy if exists wallet_ledger_select_policy on public.wallet_ledger;
create policy wallet_ledger_select_policy on public.wallet_ledger for select using (
  exists (select 1 from public.users u where u.id = auth.uid() and (u.role='super_admin' or u.firm_id=firm_id))
);

drop policy if exists job_events_select_policy on public.job_events;
create policy job_events_select_policy on public.job_events for select using (
  exists (select 1 from public.users u join public.job_posts jp on jp.id = job_post_id where u.id = auth.uid() and (u.role='super_admin' or u.firm_id=jp.requester_firm_id or jp.status in ('published','in_progress','pending_qc')))
);
