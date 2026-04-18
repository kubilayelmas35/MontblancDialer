-- QA seed dataset (idempotent)
-- password for seeded users: Test1234!

with qa_firms as (
  select id from public.firms where slug in ('qa-alpha','qa-beta','qa-gamma')
)
delete from public.field_tasks where firm_id in (select id from qa_firms);

with qa_firms as (
  select id from public.firms where slug in ('qa-alpha','qa-beta','qa-gamma')
)
delete from public.call_logs where firm_id in (select id from qa_firms);

with qa_firms as (
  select id from public.firms where slug in ('qa-alpha','qa-beta','qa-gamma')
)
delete from public.appointments where firm_id in (select id from qa_firms);

with qa_firms as (
  select id from public.firms where slug in ('qa-alpha','qa-beta','qa-gamma')
)
delete from public.contacts where firm_id in (select id from qa_firms);

with qa_firms as (
  select id from public.firms where slug in ('qa-alpha','qa-beta','qa-gamma')
)
delete from public.campaigns where firm_id in (select id from qa_firms) and name like 'QA %';

insert into public.firms (name, slug, plan, is_active, settings, balance, currency, reserved_balance)
values
  ('QA Alpha GmbH', 'qa-alpha', 'pro', true, '{"timezone":"Europe/Berlin","job_market_enabled":true,"fieldService":{"enabled":true,"can_manage_agents":true,"result_options":["satis","teklif","ziyaret_tamamlandi","ulasilamadi"],"document_requirements":["kimlik","sozlesme"],"form_schema":[]}}'::jsonb, 15000, 'EUR', 0),
  ('QA Beta Elektrik', 'qa-beta', 'pro', true, '{"timezone":"Europe/Berlin","job_market_enabled":true,"fieldService":{"enabled":true,"can_manage_agents":true,"result_options":["satis","teklif","ziyaret_tamamlandi","ulasilamadi"],"document_requirements":["kimlik","sozlesme"],"form_schema":[]}}'::jsonb, 12000, 'EUR', 0),
  ('QA Gamma Service', 'qa-gamma', 'basic', true, '{"timezone":"Europe/Berlin","job_market_enabled":true,"fieldService":{"enabled":true,"can_manage_agents":true,"result_options":["satis","teklif","ziyaret_tamamlandi","ulasilamadi"],"document_requirements":["kimlik","sozlesme"],"form_schema":[]}}'::jsonb, 8000, 'EUR', 0)
on conflict (slug)
do update set
  name = excluded.name,
  plan = excluded.plan,
  is_active = excluded.is_active,
  settings = coalesce(public.firms.settings, '{}'::jsonb) || excluded.settings,
  balance = excluded.balance,
  currency = excluded.currency;

insert into public.users (firm_id, email, password_hash, name, role, is_active)
select f.id, u.email, crypt('Test1234!', gen_salt('bf')), u.name, u.role, true
from public.firms f
join (
  values
    ('qa-alpha','qa.alpha.admin@mb-test.local','QA Alpha Admin','admin'),
    ('qa-alpha','qa.alpha.agent1@mb-test.local','QA Alpha Agent 1','agent'),
    ('qa-alpha','qa.alpha.agent2@mb-test.local','QA Alpha Agent 2','agent'),
    ('qa-alpha','qa.alpha.field@mb-test.local','QA Alpha Field','field_agent'),
    ('qa-alpha','qa.alpha.qc@mb-test.local','QA Alpha QC','qc'),

    ('qa-beta','qa.beta.admin@mb-test.local','QA Beta Admin','admin'),
    ('qa-beta','qa.beta.agent1@mb-test.local','QA Beta Agent 1','agent'),
    ('qa-beta','qa.beta.agent2@mb-test.local','QA Beta Agent 2','agent'),
    ('qa-beta','qa.beta.field@mb-test.local','QA Beta Field','field_agent'),
    ('qa-beta','qa.beta.qc@mb-test.local','QA Beta QC','qc'),

    ('qa-gamma','qa.gamma.admin@mb-test.local','QA Gamma Admin','firm_admin'),
    ('qa-gamma','qa.gamma.agent1@mb-test.local','QA Gamma Agent 1','agent'),
    ('qa-gamma','qa.gamma.field@mb-test.local','QA Gamma Field','field_agent')
) as u(slug,email,name,role)
  on f.slug = u.slug
on conflict (email)
do update set
  firm_id = excluded.firm_id,
  name = excluded.name,
  role = excluded.role,
  is_active = true,
  password_hash = excluded.password_hash;

insert into public.campaigns (firm_id, name, description, status, active_for_agents, dial_speed, notif_ts, notif_message, settings)
select f.id, c.name, c.description, 'active', true, c.dial_speed, (extract(epoch from now())*1000)::bigint, c.notif_message, '{}'::jsonb
from public.firms f
join (
  values
    ('qa-alpha','QA Solar Warm Leads','Solar warm lead listesi',2,'QA aktif kampanya: Solar Warm Leads'),
    ('qa-alpha','QA Heatpump Followup','Heatpump geri arama kampanyası',1,'QA aktif kampanya: Heatpump Followup'),
    ('qa-beta','QA Termin Boost','Termin odaklı kampanya',2,'QA aktif kampanya: Termin Boost'),
    ('qa-beta','QA Reaktivasyon','Eski lead reaktivasyon',1,'QA aktif kampanya: Reaktivasyon'),
    ('qa-gamma','QA Mini Outbound','Küçük outbound test kampanyası',1,'QA aktif kampanya: Mini Outbound')
) as c(slug,name,description,dial_speed,notif_message)
  on f.slug = c.slug;

insert into public.contacts (campaign_id, firm_id, phone, phone2, first_name, last_name, address, city, plz, notes, status, attempt_count)
select c.id, c.firm_id,
       '+4915' || lpad((10000000 + (row_number() over (order by c.id, gs.n)))::text, 8, '0') as phone,
       null,
       'Test' || gs.n,
       'Kontakt',
       case when f.slug='qa-beta' then 'Musterstrasse '||gs.n else 'Teststrasse '||gs.n end,
       case when f.slug='qa-gamma' then 'München' else 'Berlin' end,
       case when f.slug='qa-beta' then '50667' else '10115' end,
       'QA seed contact',
       case
         when gs.n % 8 = 0 then 'appointment'
         when gs.n % 7 = 0 then 'callback'
         when gs.n % 5 = 0 then 'negative'
         when gs.n % 3 = 0 then 'no_answer'
         when gs.n % 2 = 0 then 'calling'
         else 'pending'
       end,
       least(5, gs.n % 6)
from public.campaigns c
join public.firms f on f.id = c.firm_id
cross join lateral (select n from generate_series(1,30) as n) gs
where c.name like 'QA %';

update public.contacts c
set
  last_called_at = now() - ((2 + (c.attempt_count * 3)) || ' hours')::interval,
  callback_at = case when c.status = 'callback' then now() + ((2 + (c.attempt_count % 4)) || ' hours')::interval else null end
where c.notes = 'QA seed contact';

insert into public.call_logs (
  contact_id, agent_id, campaign_id, firm_id, phone, outcome, duration_sec,
  notes, telnyx_call_id, cost_usd, started_at, ended_at, callback_at
)
select
  c.id,
  ag.id,
  c.campaign_id,
  c.firm_id,
  c.phone,
  case
    when (row_number() over (partition by c.firm_id order by c.created_at, c.id)) % 13 = 0 then 'appointment_done'
    when (row_number() over (partition by c.firm_id order by c.created_at, c.id)) % 11 = 0 then 'appointment'
    when (row_number() over (partition by c.firm_id order by c.created_at, c.id)) % 7 = 0 then 'sale_closed'
    when (row_number() over (partition by c.firm_id order by c.created_at, c.id)) % 5 = 0 then 'no_answer'
    when (row_number() over (partition by c.firm_id order by c.created_at, c.id)) % 4 = 0 then 'busy'
    when (row_number() over (partition by c.firm_id order by c.created_at, c.id)) % 3 = 0 then 'callback_requested'
    else 'not_interested'
  end,
  45 + (((row_number() over (partition by c.firm_id order by c.created_at, c.id)) * 17) % 380),
  'QA seed call log',
  'qa-' || replace(c.id::text, '-', ''),
  round(((20 + ((row_number() over (partition by c.firm_id order by c.created_at, c.id)) % 50))::numeric) / 1000, 4),
  now() - (((row_number() over (partition by c.firm_id order by c.created_at, c.id)) % 96) || ' hours')::interval,
  now() - ((((row_number() over (partition by c.firm_id order by c.created_at, c.id)) % 96) || ' hours')::interval) + ((30 + ((row_number() over (partition by c.firm_id order by c.created_at, c.id)) % 200)) || ' seconds')::interval,
  case
    when (row_number() over (partition by c.firm_id order by c.created_at, c.id)) % 3 = 0
      then now() + (((row_number() over (partition by c.firm_id order by c.created_at, c.id)) % 10 + 1) || ' hours')::interval
    else null
  end
from public.contacts c
join lateral (
  select u.id
  from public.users u
  where u.firm_id = c.firm_id and u.role = 'agent' and u.is_active = true
  order by u.created_at
  limit 1
) ag on true
where c.notes = 'QA seed contact';

insert into public.appointments (
  contact_id, agent_id, campaign_id, firm_id,
  nachname, telefonnummer, strasse, plz, ortschaft,
  hausart, baujahr, qm, heizung, alter_der_heizung,
  verbrauch_pro_jahr, personen, durum, agent_notu, termin_tarih
)
select ct.id,
       ag.id,
       ct.campaign_id,
       ct.firm_id,
       coalesce(ct.first_name,'Test') || ' ' || coalesce(ct.last_name,'Kunde') as nachname,
       ct.phone,
       ct.address,
       ct.plz,
       ct.city,
       'Einfamilienhaus',
       '1998',
       '140',
       'Gas',
       '12',
       '24000',
       '3',
       case
         when row_number() over (partition by ct.firm_id order by ct.created_at, ct.id) % 5 = 0 then 'basarisiz'
         when row_number() over (partition by ct.firm_id order by ct.created_at, ct.id) % 3 = 0 then 'basarili'
         else 'qc_bekleniyor'
       end,
       'QA seed appointment',
       now() + ((row_number() over (partition by ct.firm_id order by ct.created_at, ct.id)) || ' hours')::interval
from public.contacts ct
join lateral (
  select u.id
  from public.users u
  where u.firm_id = ct.firm_id and u.role = 'agent' and u.is_active = true
  order by u.created_at
  limit 1
) ag on true
where ct.notes = 'QA seed contact'
  and (
    ct.status in ('appointment','callback','calling')
    or exists (
      select 1
      from public.call_logs l
      where l.contact_id = ct.id
        and l.notes = 'QA seed call log'
        and l.outcome in ('appointment','appointment_done')
    )
  )
  and not exists (
    select 1 from public.appointments a where a.contact_id = ct.id
  );

update public.appointments a
set call_log_id = (
  select c.id
  from public.call_logs c
  where c.contact_id = a.contact_id
  order by c.started_at desc nulls last
  limit 1
)
where a.agent_notu = 'QA seed appointment';

insert into public.takvim_slots (
  campaign_id, firm_id, tarih, baslangic_saat, bitis_saat, durum, appointment_id, alta_tasindi, gun_kapali
)
select
  a.campaign_id,
  a.firm_id,
  (a.termin_tarih at time zone 'Europe/Berlin')::date as tarih,
  ((a.termin_tarih at time zone 'Europe/Berlin')::time) as baslangic_saat,
  (((a.termin_tarih at time zone 'Europe/Berlin') + interval '2 hours')::time) as bitis_saat,
  'dolu',
  a.id,
  false,
  false
from public.appointments a
where a.agent_notu = 'QA seed appointment'
  and not exists (
    select 1 from public.takvim_slots ts where ts.appointment_id = a.id
  );

insert into public.field_tasks (firm_id, appointment_id, contact_id, assigned_to, assigned_by, status, result_payload, notes)
select a.firm_id,
       a.id,
       a.contact_id,
       fa.id,
       ad.id,
       case
         when row_number() over (partition by a.firm_id order by a.termin_tarih, a.id) % 6 = 0 then 'cancelled'
         when row_number() over (partition by a.firm_id order by a.termin_tarih, a.id) % 4 = 0 then 'completed'
         when row_number() over (partition by a.firm_id order by a.termin_tarih, a.id) % 2 = 0 then 'in_progress'
         else 'assigned'
       end,
       jsonb_build_object(
         'visit_result',
         case
           when row_number() over (partition by a.firm_id order by a.termin_tarih, a.id) % 4 = 0 then 'ok'
           when row_number() over (partition by a.firm_id order by a.termin_tarih, a.id) % 6 = 0 then 'cancelled_by_customer'
           else 'pending'
         end
       ),
       'QA seed field task'
from public.appointments a
join lateral (
  select u.id
  from public.users u
  where u.firm_id = a.firm_id and u.role = 'field_agent' and u.is_active = true
  order by u.created_at
  limit 1
) fa on true
join lateral (
  select u.id
  from public.users u
  where u.firm_id = a.firm_id and u.role in ('admin','firm_admin') and u.is_active = true
  order by u.created_at
  limit 1
) ad on true
where a.agent_notu = 'QA seed appointment'
  and not exists (
    select 1 from public.field_tasks ft where ft.appointment_id = a.id
  );

update public.field_tasks
set completed_at = now() - interval '2 hours'
where notes = 'QA seed field task'
  and status = 'completed';

insert into public.agent_sessions (agent_id, agent_name, firm_id, campaign_id, status, last_seen, call_start, break_start)
select
  u.id,
  u.name,
  u.firm_id,
  (
    select c.id
    from public.campaigns c
    where c.firm_id = u.firm_id and c.name like 'QA %'
    order by c.created_at desc
    limit 1
  ) as campaign_id,
  case
    when row_number() over (partition by u.firm_id order by u.created_at, u.id) % 3 = 0 then 'on_call'
    when row_number() over (partition by u.firm_id order by u.created_at, u.id) % 2 = 0 then 'ready'
    else 'break'
  end as status,
  now() - ((row_number() over (partition by u.firm_id order by u.created_at, u.id) % 7) || ' minutes')::interval as last_seen,
  case
    when row_number() over (partition by u.firm_id order by u.created_at, u.id) % 3 = 0 then now() - interval '4 minutes'
    else null
  end as call_start,
  case
    when row_number() over (partition by u.firm_id order by u.created_at, u.id) % 2 <> 0 then now() - interval '9 minutes'
    else null
  end as break_start
from public.users u
where u.email like '%@mb-test.local'
  and u.role in ('agent','qc')
  and u.is_active = true
on conflict (agent_id)
do update set
  agent_name = excluded.agent_name,
  firm_id = excluded.firm_id,
  campaign_id = excluded.campaign_id,
  status = excluded.status,
  last_seen = excluded.last_seen,
  call_start = excluded.call_start,
  break_start = excluded.break_start;

select
  (select count(*) from public.firms where slug in ('qa-alpha','qa-beta','qa-gamma')) as qa_firms,
  (select count(*) from public.users where email like '%@mb-test.local') as qa_users,
  (select count(*) from public.campaigns where name like 'QA %') as qa_campaigns,
  (select count(*) from public.contacts where notes = 'QA seed contact') as qa_contacts,
  (select count(*) from public.call_logs where notes = 'QA seed call log') as qa_call_logs,
  (select count(*) from public.call_logs where notes = 'QA seed call log' and outcome in ('appointment','appointment_done')) as qa_qc_call_logs,
  (select count(*) from public.appointments where agent_notu = 'QA seed appointment') as qa_appointments,
  (select count(*) from public.takvim_slots where appointment_id in (select id from public.appointments where agent_notu = 'QA seed appointment')) as qa_booked_slots,
  (select count(*) from public.field_tasks where notes = 'QA seed field task') as qa_field_tasks,
  (select count(*) from public.agent_sessions s join public.users u on u.id=s.agent_id where u.email like '%@mb-test.local' and s.status in ('ready','on_call')) as qa_online_agents;
