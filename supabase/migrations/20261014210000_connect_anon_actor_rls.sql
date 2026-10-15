-- Browser oturumu Supabase Auth JWT kullanmaz; x-mb-user-id başlığı taşır.
-- İş RPC'leri auth.uid() beklediği için not_authenticated dönüyordu.
-- Muhasebe, müşteri, izin ve geç kalma tabloları yalnızca service_role görüyordu.

create schema if not exists mb_private;

revoke all on schema mb_private from public;
grant usage on schema mb_private to anon, authenticated, service_role;

create or replace function mb_private.actor_id()
returns uuid
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_raw text;
  v_id uuid;
begin
  begin
    v_id := auth.uid();
  exception when others then
    v_id := null;
  end;

  if v_id is null then
    v_raw := nullif(public.mb_req_header('x-mb-user-id'), '');
    if v_raw is not null then
      begin
        v_id := v_raw::uuid;
      exception when others then
        v_id := null;
      end;
    end if;
  end if;

  if v_id is null then
    return null;
  end if;

  if not exists (
    select 1
    from public.users u
    where u.id = v_id
      and coalesce(u.is_active, true)
  ) then
    return null;
  end if;

  return v_id;
end;
$$;

create or replace function mb_private.actor_role()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select u.role from public.users u where u.id = mb_private.actor_id()
$$;

create or replace function mb_private.actor_firm()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select u.firm_id from public.users u where u.id = mb_private.actor_id()
$$;

create or replace function mb_private.actor_is_super()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select mb_private.actor_role() = 'super_admin'
$$;

create or replace function mb_private.actor_is_firm_admin(p_firm uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select mb_private.actor_is_super()
    or (
      mb_private.actor_role() in ('admin', 'firm_admin')
      and p_firm is not null
      and mb_private.actor_firm() = p_firm
    )
$$;

create or replace function mb_private.actor_same_firm(p_firm uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select mb_private.actor_is_super()
    or (p_firm is not null and mb_private.actor_firm() = p_firm)
$$;

create or replace function mb_private.actor_is_self(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p_user is not null and p_user = mb_private.actor_id()
$$;

create or replace function mb_private.actor_admins_user(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.users tgt
    where tgt.id = p_user
      and mb_private.actor_is_firm_admin(tgt.firm_id)
  )
$$;

revoke all on function mb_private.actor_id() from public;
revoke all on function mb_private.actor_role() from public;
revoke all on function mb_private.actor_firm() from public;
revoke all on function mb_private.actor_is_super() from public;
revoke all on function mb_private.actor_is_firm_admin(uuid) from public;
revoke all on function mb_private.actor_same_firm(uuid) from public;
revoke all on function mb_private.actor_is_self(uuid) from public;
revoke all on function mb_private.actor_admins_user(uuid) from public;

grant execute on function mb_private.actor_id() to anon, authenticated, service_role;
grant execute on function mb_private.actor_role() to anon, authenticated, service_role;
grant execute on function mb_private.actor_firm() to anon, authenticated, service_role;
grant execute on function mb_private.actor_is_super() to anon, authenticated, service_role;
grant execute on function mb_private.actor_is_firm_admin(uuid) to anon, authenticated, service_role;
grant execute on function mb_private.actor_same_firm(uuid) to anon, authenticated, service_role;
grant execute on function mb_private.actor_is_self(uuid) to anon, authenticated, service_role;
grant execute on function mb_private.actor_admins_user(uuid) to anon, authenticated, service_role;

-- İş fonksiyonları auth.uid() yerine doğrulanmış uygulama kullanıcısını okusun.
do $$
declare
  r record;
  def text;
begin
  for r in
    select p.oid
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and p.proname in (
        'create_job_post',
        'join_job_post',
        'submit_job_submission',
        'approve_job_submission',
        'withdraw_job_post',
        'job_market_run_auto_withdrawals'
      )
  loop
    def := pg_get_functiondef(r.oid);
    def := replace(def, 'auth.uid()', 'mb_private.actor_id()');
    execute def;
  end loop;
end $$;

-- Mevcut auth.uid() politikaları, JWT olmayan tarayıcı çağrılarını da tanısın.
drop policy if exists job_posts_select_policy on public.job_posts;
create policy job_posts_select_policy on public.job_posts
for select using (
  mb_private.actor_id() is not null
  and (
    mb_private.actor_is_super()
    or mb_private.actor_firm() = requester_firm_id
    or status in ('published', 'in_progress', 'pending_qc')
  )
);

drop policy if exists job_posts_update_policy on public.job_posts;
create policy job_posts_update_policy on public.job_posts
for update using (
  mb_private.actor_is_super()
  or mb_private.actor_firm() = requester_firm_id
)
with check (
  mb_private.actor_is_super()
  or mb_private.actor_firm() = requester_firm_id
);

drop policy if exists job_post_workers_select_policy on public.job_post_workers;
create policy job_post_workers_select_policy on public.job_post_workers
for select using (
  mb_private.actor_is_super()
  or mb_private.actor_firm() = worker_firm_id
  or mb_private.actor_firm() in (
    select jp.requester_firm_id from public.job_posts jp where jp.id = job_post_id
  )
);

drop policy if exists job_submissions_select_policy on public.job_submissions;
create policy job_submissions_select_policy on public.job_submissions
for select using (
  mb_private.actor_is_super()
  or mb_private.actor_firm() = worker_firm_id
  or mb_private.actor_firm() in (
    select jp.requester_firm_id from public.job_posts jp where jp.id = job_post_id
  )
);

drop policy if exists job_events_select_policy on public.job_events;
create policy job_events_select_policy on public.job_events
for select using (
  exists (
    select 1
    from public.job_posts jp
    where jp.id = job_post_id
      and (
        mb_private.actor_is_super()
        or mb_private.actor_firm() = jp.requester_firm_id
        or jp.status in ('published', 'in_progress', 'pending_qc')
      )
  )
);

drop policy if exists job_post_slots_select_policy on public.job_post_slots;
create policy job_post_slots_select_policy on public.job_post_slots
for select using (
  exists (
    select 1
    from public.job_posts jp
    where jp.id = job_post_id
      and (
        mb_private.actor_is_super()
        or mb_private.actor_firm() = jp.requester_firm_id
        or jp.status in ('published', 'in_progress', 'pending_qc')
      )
  )
);

drop policy if exists job_post_slots_update_actor on public.job_post_slots;
create policy job_post_slots_update_actor on public.job_post_slots
for update using (
  exists (
    select 1
    from public.job_posts jp
    where jp.id = job_post_id
      and mb_private.actor_is_firm_admin(jp.requester_firm_id)
  )
)
with check (
  exists (
    select 1
    from public.job_posts jp
    where jp.id = job_post_id
      and mb_private.actor_is_firm_admin(jp.requester_firm_id)
  )
);

drop policy if exists wallet_ledger_select_policy on public.wallet_ledger;
create policy wallet_ledger_select_policy on public.wallet_ledger
for select using (
  (select auth.role()) = 'service_role'
  or mb_private.actor_same_firm(firm_id)
);

drop policy if exists audit_events_select_policy on public.audit_events;
create policy audit_events_select_policy on public.audit_events
for select using (
  mb_private.actor_is_super()
  or (
    mb_private.actor_role() in ('admin', 'firm_admin')
    and firm_id = mb_private.actor_firm()
  )
);

drop policy if exists audit_events_insert_policy on public.audit_events;
create policy audit_events_insert_policy on public.audit_events
for insert with check (
  mb_private.actor_id() is not null
  and actor_id = mb_private.actor_id()
  and (
    mb_private.actor_is_super()
    or firm_id is null
    or firm_id = mb_private.actor_firm()
  )
);

drop policy if exists field_tasks_select_policy on public.field_tasks;
create policy field_tasks_select_policy on public.field_tasks
for select using (
  (select auth.role()) = 'service_role'
  or mb_private.actor_is_super()
  or (
    mb_private.actor_role() in ('admin', 'firm_admin')
    and firm_id = mb_private.actor_firm()
  )
  or (
    mb_private.actor_role() = 'field_agent'
    and assigned_to = mb_private.actor_id()
  )
);

drop policy if exists field_tasks_insert_policy on public.field_tasks;
create policy field_tasks_insert_policy on public.field_tasks
for insert with check (
  (select auth.role()) = 'service_role'
  or mb_private.actor_is_firm_admin(firm_id)
);

drop policy if exists field_tasks_update_policy on public.field_tasks;
create policy field_tasks_update_policy on public.field_tasks
for update using (
  (select auth.role()) = 'service_role'
  or mb_private.actor_is_firm_admin(firm_id)
  or (
    mb_private.actor_role() = 'field_agent'
    and assigned_to = mb_private.actor_id()
  )
)
with check (
  (select auth.role()) = 'service_role'
  or mb_private.actor_is_firm_admin(firm_id)
  or (
    mb_private.actor_role() = 'field_agent'
    and assigned_to = mb_private.actor_id()
  )
);

drop policy if exists field_tasks_delete_policy on public.field_tasks;
create policy field_tasks_delete_policy on public.field_tasks
for delete using (
  (select auth.role()) = 'service_role'
  or mb_private.actor_is_firm_admin(firm_id)
);

drop policy if exists field_task_files_select_policy on public.field_task_files;
create policy field_task_files_select_policy on public.field_task_files
for select using (
  (select auth.role()) = 'service_role'
  or mb_private.actor_is_firm_admin(firm_id)
  or (
    mb_private.actor_role() = 'field_agent'
    and exists (
      select 1
      from public.field_tasks ft
      where ft.id = field_task_files.task_id
        and ft.assigned_to = mb_private.actor_id()
    )
  )
);

drop policy if exists field_task_files_insert_policy on public.field_task_files;
create policy field_task_files_insert_policy on public.field_task_files
for insert with check (
  (select auth.role()) = 'service_role'
  or mb_private.actor_is_firm_admin(firm_id)
  or (
    mb_private.actor_role() = 'field_agent'
    and exists (
      select 1
      from public.field_tasks ft
      where ft.id = field_task_files.task_id
        and ft.assigned_to = mb_private.actor_id()
    )
  )
);

drop policy if exists field_task_files_delete_policy on public.field_task_files;
create policy field_task_files_delete_policy on public.field_task_files
for delete using (
  (select auth.role()) = 'service_role'
  or mb_private.actor_is_firm_admin(firm_id)
);

-- service_role politikaları durur. Tarayıcı için ek politikalar.
drop policy if exists customers_actor_select on public.customers;
create policy customers_actor_select on public.customers
for select using (mb_private.actor_same_firm(firm_id));

drop policy if exists customers_actor_insert on public.customers;
create policy customers_actor_insert on public.customers
for insert with check (mb_private.actor_is_firm_admin(firm_id));

drop policy if exists customers_actor_update on public.customers;
create policy customers_actor_update on public.customers
for update using (mb_private.actor_is_firm_admin(firm_id))
with check (mb_private.actor_is_firm_admin(firm_id));

drop policy if exists customers_actor_delete on public.customers;
create policy customers_actor_delete on public.customers
for delete using (mb_private.actor_is_firm_admin(firm_id));

drop policy if exists payroll_rules_actor_select on public.payroll_rules;
create policy payroll_rules_actor_select on public.payroll_rules
for select using (mb_private.actor_same_firm(firm_id));

drop policy if exists payroll_rules_actor_write on public.payroll_rules;
create policy payroll_rules_actor_write on public.payroll_rules
for all using (mb_private.actor_is_firm_admin(firm_id))
with check (mb_private.actor_is_firm_admin(firm_id));

drop policy if exists payroll_fx_actor_select on public.payroll_fx_rates;
create policy payroll_fx_actor_select on public.payroll_fx_rates
for select using (mb_private.actor_same_firm(firm_id));

drop policy if exists payroll_fx_actor_write on public.payroll_fx_rates;
create policy payroll_fx_actor_write on public.payroll_fx_rates
for all using (mb_private.actor_is_firm_admin(firm_id))
with check (mb_private.actor_is_firm_admin(firm_id));

drop policy if exists payroll_monthly_actor_select on public.payroll_monthly;
create policy payroll_monthly_actor_select on public.payroll_monthly
for select using (
  mb_private.actor_is_self(user_id)
  or mb_private.actor_is_firm_admin(firm_id)
);

drop policy if exists payroll_monthly_actor_write on public.payroll_monthly;
create policy payroll_monthly_actor_write on public.payroll_monthly
for all using (mb_private.actor_is_firm_admin(firm_id))
with check (mb_private.actor_is_firm_admin(firm_id));

drop policy if exists payroll_adj_actor_select on public.payroll_adjustments;
create policy payroll_adj_actor_select on public.payroll_adjustments
for select using (
  mb_private.actor_is_self(user_id)
  or mb_private.actor_is_firm_admin(firm_id)
);

drop policy if exists payroll_adj_actor_write on public.payroll_adjustments;
create policy payroll_adj_actor_write on public.payroll_adjustments
for all using (mb_private.actor_is_firm_admin(firm_id))
with check (mb_private.actor_is_firm_admin(firm_id));

drop policy if exists payroll_ovr_actor_select on public.payroll_employee_overrides;
create policy payroll_ovr_actor_select on public.payroll_employee_overrides
for select using (
  mb_private.actor_is_self(user_id)
  or mb_private.actor_is_firm_admin(firm_id)
);

drop policy if exists payroll_ovr_actor_write on public.payroll_employee_overrides;
create policy payroll_ovr_actor_write on public.payroll_employee_overrides
for all using (mb_private.actor_is_firm_admin(firm_id))
with check (mb_private.actor_is_firm_admin(firm_id));

drop policy if exists leave_actor_select on public.leave_requests;
create policy leave_actor_select on public.leave_requests
for select using (
  mb_private.actor_is_self(user_id)
  or mb_private.actor_is_firm_admin(firm_id)
);

drop policy if exists leave_actor_insert on public.leave_requests;
create policy leave_actor_insert on public.leave_requests
for insert with check (
  mb_private.actor_is_self(user_id)
  and mb_private.actor_same_firm(firm_id)
  and coalesce(status, 'pending') = 'pending'
);

drop policy if exists leave_actor_update on public.leave_requests;
create policy leave_actor_update on public.leave_requests
for update using (mb_private.actor_is_firm_admin(firm_id))
with check (mb_private.actor_is_firm_admin(firm_id));

drop policy if exists late_actor_select on public.late_arrivals;
create policy late_actor_select on public.late_arrivals
for select using (
  mb_private.actor_is_self(user_id)
  or mb_private.actor_is_firm_admin(firm_id)
);

drop policy if exists late_actor_write on public.late_arrivals;
create policy late_actor_write on public.late_arrivals
for all using (mb_private.actor_is_firm_admin(firm_id))
with check (mb_private.actor_is_firm_admin(firm_id));

drop policy if exists ent_actor_select on public.user_leave_entitlements;
create policy ent_actor_select on public.user_leave_entitlements
for select using (
  mb_private.actor_is_self(user_id)
  or mb_private.actor_admins_user(user_id)
);

drop policy if exists ent_actor_write on public.user_leave_entitlements;
create policy ent_actor_write on public.user_leave_entitlements
for all using (mb_private.actor_admins_user(user_id))
with check (mb_private.actor_admins_user(user_id));

drop policy if exists eom_actor_select on public.employee_of_month;
create policy eom_actor_select on public.employee_of_month
for select using (mb_private.actor_same_firm(firm_id));

drop policy if exists eom_actor_write on public.employee_of_month;
create policy eom_actor_write on public.employee_of_month
for all using (mb_private.actor_is_firm_admin(firm_id))
with check (mb_private.actor_is_firm_admin(firm_id));
