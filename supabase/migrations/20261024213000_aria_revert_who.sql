create or replace function aria.tick(p_apply boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
  v_now timestamptz := now();
  v_local timestamp := v_now at time zone 'Europe/Berlin';
  v_today date := v_local::date;
  v_mins int := extract(hour from v_local)::int * 60 + extract(minute from v_local)::int;
  v_gun text := case extract(dow from v_local)::int
    when 1 then 'pzt' when 2 then 'sal' when 3 then 'car' when 4 then 'per'
    when 5 then 'cum' when 6 then 'cmt' else 'paz' end;
  v_start date;
  v_day date;
  v_settings jsonb;
  v_watch jsonb;
  v_on int;
  v_off int;
  v_tick bigint;
  v_break boolean;
  v_last text;
  v_last_day text;
  v_pick uuid;
  v_name text;
  v_bos int;
  v_kind text;
  v_cur uuid;
  v_cur_bos int;
  v_lead uuid;
  v_lead_name text;
  v_lead_bos int;
  v_esik int;
  v_pending int;
  v_mode text;
  v_min int;
  v_margin int;
  v_span int;
  v_sat boolean;
  v_moved int;
  v_plzs text[];
  v_ms bigint := (extract(epoch from v_now) * 1000)::bigint;
  v_gunluk jsonb;
  v_lines jsonb;
  v_entry jsonb;
  v_last_line jsonb;
  v_actions jsonb := '[]'::jsonb;
  v_firms int := 0;
begin
  for rec in
    select f.id as firm_id
    from firms f
    where coalesce(f.settings->'tour'->'watch'->>'aktif', '') in ('true', 't')
  loop
    v_firms := v_firms + 1;
    begin
      select settings into v_settings from firms where id = rec.firm_id;
      v_watch := coalesce(v_settings->'tour'->'watch', '{}'::jsonb);
      v_min := greatest(1, least(20, coalesce(nullif(v_watch->>'minBos', '')::int, 1)));
      v_margin := greatest(0, least(20, coalesce(nullif(v_watch->>'gecisBos', '')::int, 0)));
      v_span := case when v_watch->>'ufuk' in ('7', '21') then (v_watch->>'ufuk')::int else 14 end;
      v_sat := coalesce(v_watch->>'cumartesi', '') in ('true', 't');
      if coalesce(v_watch->>'zamanlayici', '') in ('true', 't') then
        v_on := aria.hm(v_watch->>'zamanAktif');
        v_off := aria.hm(v_watch->>'zamanPasif');
        if v_on is not null and v_off is not null then
          if v_on < v_off then
            if v_mins < v_on or v_mins >= v_off then continue; end if;
          elsif v_mins >= v_off and v_mins < v_on then
            continue;
          end if;
        end if;
      end if;

      v_break := false;
      if jsonb_typeof(v_settings->'mesai_plan'->v_gun->'breaks') = 'array' then
        select exists (
          select 1
          from jsonb_array_elements(v_settings->'mesai_plan'->v_gun->'breaks') b
          where aria.hm(b->>'start') is not null
            and aria.hm(b->>'end') is not null
            and v_mins >= aria.hm(b->>'start')
            and v_mins < aria.hm(b->>'end')
            and aria.hm(b->>'end') - v_mins > 5
        ) into v_break;
      end if;
      if v_break then continue; end if;

      v_tick := nullif(v_settings->'tour'->>'lastTickAt', '')::bigint;
      if v_tick is not null and (v_ms - v_tick) < 50000 then continue; end if;

      v_start := v_today + 1;
      while extract(dow from v_start) = 0 or (not v_sat and extract(dow from v_start) = 6) loop
        v_start := v_start + 1;
      end loop;
      if coalesce(v_watch->>'bosSlotAtla', 'true') in ('true', 't') then
        select min(tarih) into v_day
        from takvim_slots
        where firm_id = rec.firm_id
          and tarih >= v_start
          and tarih <= v_start + v_span
          and coalesce(gun_kapali, false) = false
          and durum = 'bos'
          and appointment_id is null
          and (extract(dow from tarih) not in (0, 6) or (v_sat and extract(dow from tarih) = 6));
        v_day := coalesce(v_day, v_start);
      else
        v_day := v_start;
      end if;
      if coalesce(v_watch->>'hedefManuel', '') in ('true', 't')
         and coalesce(v_watch->>'hedefTarih', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
        v_day := (v_watch->>'hedefTarih')::date;
      end if;

      select c.id, c.name, count(s.id)::int
        into v_lead, v_lead_name, v_lead_bos
      from campaigns c
      join takvim_slots s on s.campaign_id = c.id
        and s.firm_id = rec.firm_id
        and s.tarih = v_day
        and coalesce(s.gun_kapali, false) = false
        and s.durum = 'bos'
        and s.appointment_id is null
      where c.firm_id = rec.firm_id
      group by c.id, c.name
      having count(s.id) >= v_min
      order by count(s.id) desc,
        coalesce((substring(c.name from '^([0-9]+)'))::int, 99999),
        c.name
      limit 1;
      if v_lead is null then
        v_actions := v_actions || jsonb_build_array(jsonb_build_object('k', 'none'));
        continue;
      end if;

      v_last := nullif(v_settings->'tour'->>'lastCampId', '');
      v_cur := null;
      v_cur_bos := 0;
      if v_last is not null then
        select c.id, count(s.id)::int into v_cur, v_cur_bos
        from campaigns c
        join takvim_slots s on s.campaign_id = c.id
          and s.firm_id = rec.firm_id
          and s.tarih = v_day
          and coalesce(s.gun_kapali, false) = false
          and s.durum = 'bos'
          and s.appointment_id is null
        where c.firm_id = rec.firm_id
          and c.id::text = v_last
        group by c.id;
      end if;
      if v_cur is not null and v_cur_bos >= v_min and v_cur_bos + v_margin >= v_lead_bos then
        v_pick := v_cur;
        v_bos := v_cur_bos;
        select name into v_name from campaigns where id = v_cur;
        v_kind := 'stay';
      elsif v_cur is not null and v_cur <> v_lead then
        v_pick := v_lead;
        v_name := v_lead_name;
        v_bos := v_lead_bos;
        v_kind := 'switch';
      else
        v_pick := v_lead;
        v_name := v_lead_name;
        v_bos := v_lead_bos;
        v_kind := 'pick';
      end if;

      v_esik := greatest(50, least(20000, coalesce(nullif(v_watch->>'veriEsik', '')::int, 500)));
      v_mode := case when v_watch->>'kuyrukMod' = 'yakin' then 'yakin' else 'revert' end;
      select count(*)::int into v_pending
      from contacts
      where firm_id = rec.firm_id and campaign_id = v_pick and status = 'pending';

      v_last_day := coalesce(v_settings->'tour'->>'lastDay', '');
      v_entry := null;
      if v_last is distinct from v_pick::text or v_last_day is distinct from v_day::text then
        v_entry := jsonb_build_object('k', 'told', 'day', v_day::text, 'camp', v_name, 'n', v_bos, 'kind', v_kind);
        if p_apply then
          update campaigns
            set active_for_agents = false
          where firm_id = rec.firm_id and id <> v_pick and active_for_agents is true;
          update campaigns
            set active_for_agents = true,
                notif_ts = v_ms,
                notif_message = v_day::text || ' · ' || v_bos::text || ' boş slot'
          where id = v_pick;
        end if;
      end if;

      if v_pending < v_esik and v_mode = 'revert' then
        select coalesce(array_agg(distinct aria.plz(plz)), '{}') into v_plzs
        from appointments
        where firm_id = rec.firm_id
          and campaign_id = v_pick
          and (termin_tarih at time zone 'Europe/Berlin')::date = v_day
          and durum not in ('iptal', 'basarisiz')
          and aria.plz(plz) <> '';
        if p_apply and cardinality(v_plzs) > 0 then
          with picked as (
            select id from contacts
            where firm_id = rec.firm_id
              and campaign_id = v_pick
              and status = any (
                array(
                  select x
                  from jsonb_array_elements_text(
                    case
                      when jsonb_typeof(v_watch->'geriKim') = 'array' then v_watch->'geriKim'
                      else '["no_answer","voicemail"]'::jsonb
                    end
                  ) as t(x)
                  where x in ('no_answer', 'voicemail', 'callback', 'negative')
                )
              )
              and (
                attempt_count is null
                or attempt_count < greatest(1, least(10, coalesce(nullif(v_watch->>'geriKere', '')::int, 2)))
              )
              and aria.plz(plz) = any(v_plzs)
            limit 1000
          )
          update contacts c
            set status = 'pending', last_called_at = null
          from picked
          where c.id = picked.id;
          get diagnostics v_moved = row_count;
        else
          v_moved := 0;
        end if;
        if coalesce(v_moved, 0) > 0 then
          v_entry := jsonb_build_object('k', 'revert', 'day', v_day::text, 'camp', v_name, 'n', v_bos, 'kind', v_kind, 'moved', v_moved, 'pending', v_pending);
        end if;
      elsif v_pending < v_esik and v_mode = 'yakin' and v_entry is null then
        v_entry := jsonb_build_object('k', 'nearwait', 'day', v_day::text, 'camp', v_name, 'n', v_bos, 'kind', v_kind, 'pending', v_pending, 'esik', v_esik);
      end if;

      if p_apply then
        v_gunluk := v_settings->'tour'->'gunluk';
        if v_gunluk is null or v_gunluk->>'day' is distinct from v_today::text then
          v_lines := '[]'::jsonb;
        else
          v_lines := coalesce(v_gunluk->'lines', '[]'::jsonb);
        end if;
        v_last_line := case when jsonb_array_length(v_lines) > 0 then v_lines->(jsonb_array_length(v_lines) - 1) else null end;
        if v_entry is not null and not (
          v_last_line is not null
          and v_last_line->>'k' = v_entry->>'k'
          and v_last_line->>'camp' = v_entry->>'camp'
          and v_last_line->>'day' = v_entry->>'day'
        ) then
          v_entry := v_entry || jsonb_build_object('at', lpad((v_mins / 60)::text, 2, '0') || ':' || lpad((v_mins % 60)::text, 2, '0'));
          v_lines := v_lines || jsonb_build_array(v_entry);
          if jsonb_array_length(v_lines) > 30 then
            v_lines := (
              select coalesce(jsonb_agg(x order by ord), '[]'::jsonb)
              from (
                select value as x, ordinality as ord
                from jsonb_array_elements(v_lines) with ordinality
                order by ordinality desc
                limit 30
              ) t
            );
          end if;
        end if;
        update firms
          set settings = jsonb_set(
            jsonb_set(
              jsonb_set(
                jsonb_set(coalesce(settings, '{}'::jsonb), '{tour,lastTickAt}', to_jsonb(v_ms), true),
                '{tour,lastCampId}', to_jsonb(v_pick::text), true
              ),
              '{tour,lastDay}', to_jsonb(v_day::text), true
            ),
            '{tour,gunluk}', jsonb_build_object('day', v_today::text, 'lines', coalesce(v_lines, '[]'::jsonb)), true
          )
        where id = rec.firm_id;
      end if;

      v_actions := v_actions || jsonb_build_array(jsonb_build_object('k', coalesce(v_entry->>'k', v_kind)));
    exception when others then
      if not p_apply then raise; end if;
    end;
  end loop;
  return jsonb_build_object('firms', v_firms, 'actions', v_actions);
end;
$$;

