-- Phase 4: Supabase performance advisor
-- - RLS: wrap auth.uid() as (select auth.uid()) to avoid per-row initplan (auth_rls_initplan)
-- - FK covering indexes (unindexed_foreign_keys)

-- --- FK indexes (job market + events + ledger) ---
create index if not exists idx_job_events_actor_firm_id on public.job_events (actor_firm_id);
create index if not exists idx_job_events_actor_user_id on public.job_events (actor_user_id);
create index if not exists idx_job_post_geo_rules_job_post_id on public.job_post_geo_rules (job_post_id);
create index if not exists idx_job_post_workers_worker_firm_id on public.job_post_workers (worker_firm_id);
create index if not exists idx_job_post_workers_worker_user_id on public.job_post_workers (worker_user_id);
create index if not exists idx_job_posts_requester_firm_id on public.job_posts (requester_firm_id);
create index if not exists idx_job_posts_requester_user_id on public.job_posts (requester_user_id);
create index if not exists idx_job_posts_winner_firm_id on public.job_posts (winner_firm_id);
create index if not exists idx_job_submissions_appointment_id on public.job_submissions (appointment_id);
create index if not exists idx_job_submissions_field_task_id on public.job_submissions (field_task_id);
create index if not exists idx_job_submissions_reviewed_by on public.job_submissions (reviewed_by);
create index if not exists idx_job_submissions_worker_firm_id on public.job_submissions (worker_firm_id);
create index if not exists idx_job_submissions_worker_user_id on public.job_submissions (worker_user_id);
create index if not exists idx_wallet_ledger_counterparty_firm_id on public.wallet_ledger (counterparty_firm_id);
create index if not exists idx_wallet_ledger_created_by on public.wallet_ledger (created_by);
create index if not exists idx_wallet_ledger_job_post_id on public.wallet_ledger (job_post_id);

-- --- field_tasks RLS ---
drop policy if exists field_tasks_select_policy on public.field_tasks;
create policy field_tasks_select_policy on public.field_tasks
for select using (
  (select auth.role()) = 'service_role'
  or exists (
    select 1
    from public.users u
    where u.id = (select auth.uid())
      and (
        u.role = 'super_admin'
        or (u.role in ('admin','firm_admin') and u.firm_id = field_tasks.firm_id)
        or (u.role = 'field_agent' and u.id = field_tasks.assigned_to)
      )
  )
);

drop policy if exists field_tasks_insert_policy on public.field_tasks;
create policy field_tasks_insert_policy on public.field_tasks
for insert with check (
  (select auth.role()) = 'service_role'
  or exists (
    select 1
    from public.users u
    where u.id = (select auth.uid())
      and (
        u.role = 'super_admin'
        or (u.role in ('admin','firm_admin') and u.firm_id = field_tasks.firm_id)
      )
  )
);

drop policy if exists field_tasks_update_policy on public.field_tasks;
create policy field_tasks_update_policy on public.field_tasks
for update using (
  (select auth.role()) = 'service_role'
  or exists (
    select 1
    from public.users u
    where u.id = (select auth.uid())
      and (
        u.role = 'super_admin'
        or (u.role in ('admin','firm_admin') and u.firm_id = field_tasks.firm_id)
        or (u.role = 'field_agent' and u.id = field_tasks.assigned_to)
      )
  )
) with check (
  (select auth.role()) = 'service_role'
  or exists (
    select 1
    from public.users u
    where u.id = (select auth.uid())
      and (
        u.role = 'super_admin'
        or (u.role in ('admin','firm_admin') and u.firm_id = field_tasks.firm_id)
        or (u.role = 'field_agent' and u.id = field_tasks.assigned_to)
      )
  )
);

drop policy if exists field_tasks_delete_policy on public.field_tasks;
create policy field_tasks_delete_policy on public.field_tasks
for delete using (
  (select auth.role()) = 'service_role'
  or exists (
    select 1
    from public.users u
    where u.id = (select auth.uid())
      and (
        u.role = 'super_admin'
        or (u.role in ('admin','firm_admin') and u.firm_id = field_tasks.firm_id)
      )
  )
);

-- --- field_task_files RLS ---
drop policy if exists field_task_files_select_policy on public.field_task_files;
create policy field_task_files_select_policy on public.field_task_files
for select using (
  (select auth.role()) = 'service_role'
  or exists (
    select 1
    from public.users u
    where u.id = (select auth.uid())
      and (
        u.role = 'super_admin'
        or (u.role in ('admin','firm_admin') and u.firm_id = field_task_files.firm_id)
        or (
          u.role = 'field_agent'
          and exists (
            select 1 from public.field_tasks ft
            where ft.id = field_task_files.task_id
              and ft.assigned_to = u.id
          )
        )
      )
  )
);

drop policy if exists field_task_files_insert_policy on public.field_task_files;
create policy field_task_files_insert_policy on public.field_task_files
for insert with check (
  (select auth.role()) = 'service_role'
  or exists (
    select 1
    from public.users u
    where u.id = (select auth.uid())
      and (
        u.role = 'super_admin'
        or (u.role in ('admin','firm_admin') and u.firm_id = field_task_files.firm_id)
        or (
          u.role = 'field_agent'
          and exists (
            select 1 from public.field_tasks ft
            where ft.id = field_task_files.task_id
              and ft.assigned_to = u.id
          )
        )
      )
  )
);

drop policy if exists field_task_files_delete_policy on public.field_task_files;
create policy field_task_files_delete_policy on public.field_task_files
for delete using (
  (select auth.role()) = 'service_role'
  or exists (
    select 1
    from public.users u
    where u.id = (select auth.uid())
      and (
        u.role = 'super_admin'
        or (u.role in ('admin','firm_admin') and u.firm_id = field_task_files.firm_id)
      )
  )
);

-- --- job market RLS ---
drop policy if exists job_posts_select_policy on public.job_posts;
create policy job_posts_select_policy on public.job_posts for select using (
  exists (
    select 1 from public.users u
    where u.id = (select auth.uid())
      and (
        u.role = 'super_admin'
        or u.firm_id = requester_firm_id
        or status in ('published','in_progress','pending_qc')
      )
  )
);

drop policy if exists job_posts_update_policy on public.job_posts;
create policy job_posts_update_policy on public.job_posts for update using (
  exists (select 1 from public.users u where u.id = (select auth.uid()) and (u.role='super_admin' or u.firm_id=requester_firm_id))
);

drop policy if exists job_post_workers_select_policy on public.job_post_workers;
create policy job_post_workers_select_policy on public.job_post_workers for select using (
  exists (select 1 from public.users u where u.id = (select auth.uid()) and (u.role='super_admin' or u.firm_id=worker_firm_id or u.firm_id in (select requester_firm_id from public.job_posts jp where jp.id=job_post_id)))
);

drop policy if exists job_submissions_select_policy on public.job_submissions;
create policy job_submissions_select_policy on public.job_submissions for select using (
  exists (select 1 from public.users u where u.id = (select auth.uid()) and (u.role='super_admin' or u.firm_id=worker_firm_id or u.firm_id in (select requester_firm_id from public.job_posts jp where jp.id=job_post_id)))
);

drop policy if exists wallet_ledger_select_policy on public.wallet_ledger;
create policy wallet_ledger_select_policy on public.wallet_ledger for select using (
  exists (select 1 from public.users u where u.id = (select auth.uid()) and (u.role='super_admin' or u.firm_id=firm_id))
);

drop policy if exists job_events_select_policy on public.job_events;
create policy job_events_select_policy on public.job_events for select using (
  exists (select 1 from public.users u join public.job_posts jp on jp.id = job_post_id where u.id = (select auth.uid()) and (u.role='super_admin' or u.firm_id=jp.requester_firm_id or jp.status in ('published','in_progress','pending_qc')))
);

-- --- audit_events RLS ---
drop policy if exists audit_events_select_policy on public.audit_events;
create policy audit_events_select_policy on public.audit_events
for select using (
  exists (
    select 1
    from public.users u
    where u.id = (select auth.uid())
      and (
        u.role = 'super_admin'
        or (u.role in ('admin', 'firm_admin') and u.firm_id = audit_events.firm_id)
      )
  )
);

drop policy if exists audit_events_insert_policy on public.audit_events;
create policy audit_events_insert_policy on public.audit_events
for insert with check (
  exists (
    select 1
    from public.users u
    where u.id = (select auth.uid())
      and (
        u.role = 'super_admin'
        or (u.role in ('admin', 'firm_admin') and u.firm_id = audit_events.firm_id)
      )
  )
);

-- --- job_post_slots RLS ---
drop policy if exists job_post_slots_select_policy on public.job_post_slots;
create policy job_post_slots_select_policy on public.job_post_slots for select using (
  exists (
    select 1
    from public.users u
    join public.job_posts jp on jp.id = job_post_id
    where u.id = (select auth.uid())
      and (u.role = 'super_admin' or u.firm_id = jp.requester_firm_id or jp.status in ('published','in_progress','pending_qc'))
  )
);
