insert into storage.buckets (id, name, public)
values ('call-recordings', 'call-recordings', true)
on conflict (id) do update set public = true;

drop policy if exists call_recordings_read on storage.objects;
drop policy if exists call_recordings_insert on storage.objects;
create policy call_recordings_read on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'call-recordings');
create policy call_recordings_insert on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'call-recordings');
