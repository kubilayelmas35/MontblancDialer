-- Auth RPC compatibility fix for pgcrypto in extensions schema
-- Ensures login/create/reset flows keep working in projects where pgcrypto
-- functions are available as extensions.crypt / extensions.gen_salt.

create extension if not exists pgcrypto with schema extensions;

create or replace function public.verify_password(p_email text, p_password text)
returns table (
  user_id uuid,
  firm_id uuid,
  name text,
  role text,
  firm_name text
)
language sql
security definer
set search_path = public, pg_temp
as $$
  select
    u.id as user_id,
    u.firm_id,
    u.name,
    u.role,
    f.name as firm_name
  from public.users u
  left join public.firms f on f.id = u.firm_id
  where lower(u.email) = lower(p_email)
    and coalesce(u.is_active, true) = true
    and extensions.crypt(p_password::text, u.password_hash::text) = u.password_hash::text
  limit 1
$$;

create or replace function public.create_user_with_password(
  p_firm_id uuid,
  p_email text,
  p_password text,
  p_name text,
  p_role text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if coalesce(length(trim(p_password)), 0) < 6 then
    raise exception 'password_min_length';
  end if;

  insert into public.users (firm_id, email, password_hash, name, role, is_active)
  values (
    p_firm_id,
    lower(trim(p_email)),
    extensions.crypt(p_password::text, extensions.gen_salt('bf')),
    p_name,
    p_role,
    true
  );
end;
$$;

create or replace function public.reset_user_password(p_user_id uuid, p_new_password text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.users
  set password_hash = extensions.crypt(p_new_password::text, extensions.gen_salt('bf'))
  where id = p_user_id;
end;
$$;
