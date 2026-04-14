alter table public.job_submissions add column if not exists idempotency_key text null;
create unique index if not exists uq_job_submissions_idempotency
  on public.job_submissions(job_post_id, worker_firm_id, idempotency_key)
  where idempotency_key is not null;

create or replace function public.submit_job_submission(
  p_job_post_id uuid,
  p_submission_type text,
  p_payload jsonb,
  p_appointment_id uuid default null,
  p_field_task_id uuid default null,
  p_idempotency_key text default null
)
returns table(submission_id uuid, submission_status text, post_status text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.users%rowtype;
  v_post public.job_posts%rowtype;
  v_sub uuid;
  v_sub_status text;
  v_existing public.job_submissions%rowtype;
begin
  select * into v_user from public.users where id = auth.uid();
  if v_user.id is null then raise exception 'not_authenticated'; end if;
  select * into v_post from public.job_posts where id = p_job_post_id for update;
  if v_post.id is null then raise exception 'job_not_found'; end if;
  if v_post.requester_firm_id = v_user.firm_id then raise exception 'owner_cannot_submit'; end if;
  if v_post.status not in ('published','in_progress','pending_qc') then raise exception 'job_closed'; end if;

  if p_idempotency_key is not null and length(trim(p_idempotency_key)) > 0 then
    select * into v_existing
    from public.job_submissions
    where job_post_id = v_post.id
      and worker_firm_id = v_user.firm_id
      and idempotency_key = p_idempotency_key
    limit 1;
    if v_existing.id is not null then
      return query select v_existing.id, v_existing.status, v_post.status;
      return;
    end if;
  end if;

  perform public.join_job_post(v_post.id);
  v_sub_status := case when v_post.qc_mode='none' then 'approved' else 'qc_pending' end;

  insert into public.job_submissions(
    job_post_id, worker_firm_id, worker_user_id, submission_type, appointment_id, field_task_id, payload, status, idempotency_key
  )
  values(
    v_post.id, v_user.firm_id, v_user.id, coalesce(p_submission_type,'custom'), p_appointment_id, p_field_task_id,
    coalesce(p_payload,'{}'::jsonb), v_sub_status, nullif(trim(coalesce(p_idempotency_key,'')), '')
  )
  returning id into v_sub;

  update public.job_posts
     set status = case when v_post.qc_mode='none' then 'completed' else 'pending_qc' end,
         winner_firm_id = case when v_post.qc_mode='none' then v_user.firm_id else winner_firm_id end,
         winner_submission_id = case when v_post.qc_mode='none' then v_sub else winner_submission_id end,
         completed_at = case when v_post.qc_mode='none' then now() else completed_at end,
         first_submission_at = coalesce(first_submission_at, now())
   where id = v_post.id and status in ('published','in_progress','pending_qc');

  update public.job_post_workers
     set status = case when worker_firm_id=v_user.firm_id then 'submitted' else 'stopped' end
   where job_post_id = v_post.id;

  perform public.log_job_event(
    v_post.id,
    'submission_created',
    v_user.id,
    v_user.firm_id,
    jsonb_build_object('submission_id',v_sub,'status',v_sub_status,'idempotency_key',p_idempotency_key)
  );

  return query select v_sub, v_sub_status, (select status from public.job_posts where id=v_post.id);
end;
$$;
