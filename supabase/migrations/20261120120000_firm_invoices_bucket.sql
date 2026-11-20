insert into storage.buckets (id, name, public)
values ('firm-invoices', 'firm-invoices', true)
on conflict (id) do update
set public = true;
