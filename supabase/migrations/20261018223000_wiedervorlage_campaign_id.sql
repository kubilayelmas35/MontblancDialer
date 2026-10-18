alter table public.wiedervorlage
  add column if not exists campaign_id uuid references public.campaigns(id) on delete set null;

create index if not exists idx_wiedervorlage_campaign_id on public.wiedervorlage(campaign_id);
