-- Saha modülü MVP (termin bazlı)
-- - users.role: field_agent
-- - field_tasks / field_task_files tabloları
-- - storage bucket: field-docs
-- - temel RLS politikaları

alter table public.users drop constraint if exists users_role_check;
alter table public.users add constraint users_role_check check (
  role = any (array[
    'super_admin'::text,
    'firm_admin'::text,
    'admin'::text,
    'agent'::text,
    'qc'::text,
    'field_agent'::text
  ])
);

create table if not exists public.field_tasks (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms(id) on delete cascade,
  appointment_id uuid references public.appointments(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  assigned_to uuid not null references public.users(id) on delete restrict,
  assigned_by uuid references public.users(id) on delete set null,
  status text not null default 'assigned' check (
    status in ('assigned','in_progress','completed','cancelled')
  ),
  result_key text,
  result_payload jsonb not null default '{}'::jsonb,
  notes text,
  next_action_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.field_task_files (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.field_tasks(id) on delete cascade,
  firm_id uuid not null references public.firms(id) on delete cascade,
  uploaded_by uuid references public.users(id) on delete set null,
  file_url text not null,
  file_name text not null,
  mime_type text,
  file_size bigint,
  created_at timestamptz not null default now()
);

create index if not exists idx_field_tasks_firm_id on public.field_tasks(firm_id);
create index if not exists idx_field_tasks_assigned_to on public.field_tasks(assigned_to);
create index if not exists idx_field_tasks_appointment_id on public.field_tasks(appointment_id);
create index if not exists idx_field_tasks_status on public.field_tasks(status);
create index if not exists idx_field_tasks_created_at on public.field_tasks(created_at desc);
create index if not exists idx_field_task_files_task_id on public.field_task_files(task_id);
create index if not exists idx_field_task_files_firm_id on public.field_task_files(firm_id);

create or replace function public.set_field_task_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_field_tasks_updated_at on public.field_tasks;
create trigger trg_field_tasks_updated_at
before update on public.field_tasks
for each row execute function public.set_field_task_updated_at();

alter table public.field_tasks enable row level security;
alter table public.field_task_files enable row level security;

drop policy if exists field_tasks_select_policy on public.field_tasks;
create policy field_tasks_select_policy on public.field_tasks
for select using (
  (select auth.role()) = 'service_role'
  or exists (
    select 1
    from public.users u
    where u.id = auth.uid()
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
    where u.id = auth.uid()
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
    where u.id = auth.uid()
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
    where u.id = auth.uid()
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
    where u.id = auth.uid()
      and (
        u.role = 'super_admin'
        or (u.role in ('admin','firm_admin') and u.firm_id = field_tasks.firm_id)
      )
  )
);

drop policy if exists field_task_files_select_policy on public.field_task_files;
create policy field_task_files_select_policy on public.field_task_files
for select using (
  (select auth.role()) = 'service_role'
  or exists (
    select 1
    from public.users u
    where u.id = auth.uid()
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
    where u.id = auth.uid()
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
    where u.id = auth.uid()
      and (
        u.role = 'super_admin'
        or (u.role in ('admin','firm_admin') and u.firm_id = field_task_files.firm_id)
      )
  )
);

insert into storage.buckets (id, name, public)
values ('field-docs', 'field-docs', true)
on conflict (id) do update
set public = true;
