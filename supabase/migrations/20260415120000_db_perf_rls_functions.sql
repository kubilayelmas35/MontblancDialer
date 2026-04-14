-- Performans: FK sütunlarında indeks (Supabase advisor unindexed_foreign_keys)
-- RLS: auth.role() satır başına yeniden değerlendirilmesin → (select auth.role())
-- Güvenlik: public fonksiyonlarda search_path sabitlendi

-- ── service_role politikaları (HR / payroll / customers) ─────────────
alter policy leave_requests_service_all on public.leave_requests
  using ((select auth.role()) = 'service_role'::text)
  with check ((select auth.role()) = 'service_role'::text);
alter policy late_arrivals_service_all on public.late_arrivals
  using ((select auth.role()) = 'service_role'::text)
  with check ((select auth.role()) = 'service_role'::text);
alter policy user_leave_entitlements_service_all on public.user_leave_entitlements
  using ((select auth.role()) = 'service_role'::text)
  with check ((select auth.role()) = 'service_role'::text);
alter policy employee_of_month_service_all on public.employee_of_month
  using ((select auth.role()) = 'service_role'::text)
  with check ((select auth.role()) = 'service_role'::text);
alter policy customers_service_all on public.customers
  using ((select auth.role()) = 'service_role'::text)
  with check ((select auth.role()) = 'service_role'::text);
alter policy payroll_rules_service_all on public.payroll_rules
  using ((select auth.role()) = 'service_role'::text)
  with check ((select auth.role()) = 'service_role'::text);
alter policy payroll_employee_overrides_service_all on public.payroll_employee_overrides
  using ((select auth.role()) = 'service_role'::text)
  with check ((select auth.role()) = 'service_role'::text);
alter policy payroll_adjustments_service_all on public.payroll_adjustments
  using ((select auth.role()) = 'service_role'::text)
  with check ((select auth.role()) = 'service_role'::text);
alter policy payroll_monthly_service_all on public.payroll_monthly
  using ((select auth.role()) = 'service_role'::text)
  with check ((select auth.role()) = 'service_role'::text);
alter policy payroll_fx_rates_service_all on public.payroll_fx_rates
  using ((select auth.role()) = 'service_role'::text)
  with check ((select auth.role()) = 'service_role'::text);

-- ── indeksler ───────────────────────────────────────────────────────
create index if not exists idx_agent_campaigns_campaign_id on public.agent_campaigns(campaign_id);
create index if not exists idx_agent_campaigns_firm_id on public.agent_campaigns(firm_id);
create index if not exists idx_agent_sessions_campaign_id on public.agent_sessions(campaign_id);
create index if not exists idx_agent_sessions_firm_id on public.agent_sessions(firm_id);
create index if not exists idx_appointments_call_log_id on public.appointments(call_log_id);
create index if not exists idx_appointments_contact_id on public.appointments(contact_id);
create index if not exists idx_appointments_firm_id on public.appointments(firm_id);
create index if not exists idx_appointments_slot_id on public.appointments(slot_id);
create index if not exists idx_call_logs_contact_id on public.call_logs(contact_id);
create index if not exists idx_call_logs_firm_id on public.call_logs(firm_id);
create index if not exists idx_campaigns_firm_id on public.campaigns(firm_id);
create index if not exists idx_chat_groups_created_by on public.chat_groups(created_by);
create index if not exists idx_chat_messages_sender_id on public.chat_messages(sender_id);
create index if not exists idx_chat_user_read_state_group_id on public.chat_user_read_state(group_id);
create index if not exists idx_contacts_firm_id on public.contacts(firm_id);
create index if not exists idx_contacts_queue_id on public.contacts(queue_id);
create index if not exists idx_customers_created_by on public.customers(created_by);
create index if not exists idx_employee_of_month_set_by on public.employee_of_month(set_by);
create index if not exists idx_late_arrivals_recorded_by on public.late_arrivals(recorded_by);
create index if not exists idx_leave_requests_reviewed_by on public.leave_requests(reviewed_by);
create index if not exists idx_payroll_adjustments_created_by on public.payroll_adjustments(created_by);
create index if not exists idx_payroll_monthly_user_id on public.payroll_monthly(user_id);
create index if not exists idx_queues_campaign_id on public.queues(campaign_id);
create index if not exists idx_queues_firm_id on public.queues(firm_id);
create index if not exists idx_takvim_slots_appointment_id on public.takvim_slots(appointment_id);
create index if not exists idx_takvim_slots_firm_id on public.takvim_slots(firm_id);
create index if not exists idx_takvim_slots_kilitli_agent_id on public.takvim_slots(kilitli_agent_id);
create index if not exists idx_users_firm_id on public.users(firm_id);
create index if not exists idx_wiedervorlage_appointment_id on public.wiedervorlage(appointment_id);
create index if not exists idx_wiedervorlage_contact_id on public.wiedervorlage(contact_id);
create index if not exists idx_wiedervorlage_firm_id on public.wiedervorlage(firm_id);

-- ── fonksiyon search_path (imzalar projeye göre) ────────────────────
alter function public.verify_password(text, text) set search_path = public, pg_temp;
alter function public.create_user_with_password(uuid, text, text, text, text) set search_path = public, pg_temp;
alter function public.reset_user_password(uuid, text) set search_path = public, pg_temp;
alter function public.get_next_contact(uuid, uuid) set search_path = public, pg_temp;
alter function public.save_recording_url(text, text) set search_path = public, pg_temp;
