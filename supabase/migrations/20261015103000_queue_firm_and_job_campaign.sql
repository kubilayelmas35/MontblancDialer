-- Queue and contact inserts omitted firm_id, so mb_same_firm(null) rejected them.
-- Fill firm_id from the campaign, and accept a row whose campaign belongs to the session firm.

create or replace function public.mb_fill_firm_from_campaign()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.firm_id is null and new.campaign_id is not null then
    select c.firm_id into new.firm_id
    from public.campaigns c
    where c.id = new.campaign_id;
  end if;
  return new;
end;
$$;

drop trigger if exists mb_queues_fill_firm on public.queues;
create trigger mb_queues_fill_firm
before insert or update on public.queues
for each row execute function public.mb_fill_firm_from_campaign();

drop trigger if exists mb_contacts_fill_firm on public.contacts;
create trigger mb_contacts_fill_firm
before insert or update on public.contacts
for each row execute function public.mb_fill_firm_from_campaign();

drop policy if exists mb_scope_all on public.queues;
create policy mb_scope_all on public.queues
for all
using (
  public.mb_same_firm(firm_id)
  or exists (
    select 1 from public.campaigns c
    where c.id = public.queues.campaign_id
      and public.mb_same_firm(c.firm_id)
  )
)
with check (
  public.mb_same_firm(firm_id)
  or exists (
    select 1 from public.campaigns c
    where c.id = public.queues.campaign_id
      and public.mb_same_firm(c.firm_id)
  )
);

drop policy if exists mb_scope_all on public.contacts;
create policy mb_scope_all on public.contacts
for all
using (
  public.mb_same_firm(firm_id)
  or exists (
    select 1 from public.campaigns c
    where c.id = public.contacts.campaign_id
      and public.mb_same_firm(c.firm_id)
  )
)
with check (
  public.mb_same_firm(firm_id)
  or exists (
    select 1 from public.campaigns c
    where c.id = public.contacts.campaign_id
      and public.mb_same_firm(c.firm_id)
  )
);

alter table public.job_posts
  add column if not exists campaign_id uuid references public.campaigns(id) on delete set null;

create index if not exists idx_job_posts_campaign_id on public.job_posts(campaign_id);
