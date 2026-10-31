alter table public.users
  add column if not exists ui_prefs jsonb not null default '{}'::jsonb;

create or replace function public.mb_users_ui_prefs_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.ui_prefs is null or jsonb_typeof(new.ui_prefs) <> 'object' then
    new.ui_prefs := '{}'::jsonb;
  end if;
  if octet_length(new.ui_prefs::text) > 12000 then
    raise exception 'ui_prefs too large';
  end if;
  return new;
end;
$$;

drop trigger if exists mb_users_ui_prefs_guard on public.users;
create trigger mb_users_ui_prefs_guard
  before insert or update of ui_prefs on public.users
  for each row execute function public.mb_users_ui_prefs_guard();

revoke all on function public.mb_users_ui_prefs_guard() from public, anon, authenticated;
