-- İzin takvimi: aynı firmadaki günleri isimsiz işaretle.
-- Bekleyen kaydı sahibi silebilir; firma yöneticisi başkası adına bekleyen talep açabilir.

create or replace function public.leave_calendar_marks(p_firm uuid, p_from date, p_to date)
returns table(day date, mark text)
language plpgsql
stable
security definer
set search_path = public, mb_private
as $$
begin
  if p_firm is null or p_from is null or p_to is null then
    return;
  end if;
  if p_to < p_from or (p_to - p_from) > 70 then
    return;
  end if;
  if not mb_private.actor_same_firm(p_firm) then
    return;
  end if;

  return query
  select gs::date,
    case
      when lr.user_id = mb_private.actor_id() and lr.kind = 'unpaid' then 'own_unpaid'
      when lr.user_id = mb_private.actor_id() then 'own_paid'
      else 'other'
    end
  from public.leave_requests lr
  cross join lateral generate_series(lr.date_from::timestamp, lr.date_to::timestamp, interval '1 day') gs
  where lr.firm_id = p_firm
    and lr.status in ('pending', 'approved')
    and lr.date_to >= p_from
    and lr.date_from <= p_to
  union all
  select la.day_date,
    case
      when la.user_id = mb_private.actor_id() then 'own_late'
      else 'late'
    end
  from public.late_arrivals la
  where la.firm_id = p_firm
    and la.day_date between p_from and p_to;
end;
$$;

revoke all on function public.leave_calendar_marks(uuid, date, date) from public;
grant execute on function public.leave_calendar_marks(uuid, date, date) to anon, authenticated, service_role;

drop policy if exists leave_actor_insert on public.leave_requests;
create policy leave_actor_insert on public.leave_requests
for insert with check (
  mb_private.actor_same_firm(firm_id)
  and coalesce(status, 'pending') = 'pending'
  and (
    mb_private.actor_is_self(user_id)
    or mb_private.actor_is_firm_admin(firm_id)
  )
);

drop policy if exists leave_actor_delete on public.leave_requests;
create policy leave_actor_delete on public.leave_requests
for delete using (
  (mb_private.actor_is_self(user_id) and status = 'pending')
  or mb_private.actor_is_firm_admin(firm_id)
);
