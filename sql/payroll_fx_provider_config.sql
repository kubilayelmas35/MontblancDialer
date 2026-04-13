alter table public.payroll_rules
  add column if not exists fx_api_provider text not null default 'exchangerate_host',
  add column if not exists fx_api_url text,
  add column if not exists fx_api_key text;
