-- Campaign inserts must belong to the signed-in firm.
-- A drifted client firm_id used to fail mb_same_firm and surface as 42501.
-- With no session, leave firm_id alone so the existing RLS check still rejects the row.

create or replace function public.mb_stamp_campaign_firm()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
begin
  v_actor := mb_private.actor_id();
  if v_actor is null then
    return new;
  end if;
  if coalesce(mb_private.actor_is_super(), false) then
    if new.firm_id is null then
      new.firm_id := mb_private.actor_firm();
    end if;
  else
    new.firm_id := mb_private.actor_firm();
  end if;
  return new;
end;
$$;

drop trigger if exists mb_campaigns_stamp_firm on public.campaigns;
create trigger mb_campaigns_stamp_firm
before insert or update of firm_id on public.campaigns
for each row execute function public.mb_stamp_campaign_firm();

revoke all on function public.mb_stamp_campaign_firm() from public;
grant execute on function public.mb_stamp_campaign_firm() to anon, authenticated, service_role;

create or replace function public.mb_whoami()
returns table (
  user_id uuid,
  firm_id uuid,
  name text,
  role text,
  email text,
  firm_name text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select u.id, u.firm_id, u.name, u.role, u.email, f.name
  from public.users u
  left join public.firms f on f.id = u.firm_id
  where u.id = mb_private.actor_id()
$$;

revoke all on function public.mb_whoami() from public;
grant execute on function public.mb_whoami() to anon, authenticated, service_role;
