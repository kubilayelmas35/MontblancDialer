-- users.firm_id → firms(id) — PostgREST: users?select=id,name,firms(name)
-- Geçersiz firm_id FK'yi engellerse önce (yedek alarak) düzeltin:
-- UPDATE public.users u SET firm_id = NULL
-- WHERE u.firm_id IS NOT NULL
--   AND NOT EXISTS (SELECT 1 FROM public.firms f WHERE f.id = u.firm_id);

do $$
declare
  has_col boolean;
  has_fk  boolean;
begin
  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'users'
      and column_name = 'firm_id'
  ) into has_col;

  if not has_col then
    raise notice 'users.firm_id yok; FK eklenmedi';
    return;
  end if;

  select exists (
    select 1
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu
      on tc.constraint_schema = kcu.constraint_schema
     and tc.constraint_name = kcu.constraint_name
    where tc.table_schema = 'public'
      and tc.table_name = 'users'
      and tc.constraint_type = 'FOREIGN KEY'
      and kcu.column_name = 'firm_id'
  ) into has_fk;

  if has_fk then
    raise notice 'users.firm_id için FK zaten var';
    return;
  end if;

  alter table public.users
    add constraint users_firm_id_fkey
    foreign key (firm_id) references public.firms(id) on delete set null;

  raise notice 'users_firm_id_fkey eklendi';
exception
  when others then
    raise notice 'users_firm_id_fkey eklenemedi: %', sqlerrm;
end $$;
