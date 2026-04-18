-- Ekip sohbeti şeması — supabase/migrations ile senkron
-- Montblanc Dialer — Ekip sohbeti (gruplar, mesaj, dosya URL)

create table if not exists public.chat_groups (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms(id) on delete cascade,
  name text not null,
  slug text not null,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (firm_id, slug)
);

create table if not exists public.chat_group_members (
  group_id uuid not null references public.chat_groups(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create index if not exists chat_group_members_user_idx on public.chat_group_members(user_id);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms(id) on delete cascade,
  group_id uuid not null references public.chat_groups(id) on delete cascade,
  sender_id uuid references public.users(id) on delete set null,
  content_type text not null default 'text'
    check (content_type in ('text','audio','image','file')),
  body text,
  file_url text,
  file_name text,
  mime_type text,
  duration_seconds numeric(10,2),
  created_at timestamptz not null default now()
);

create index if not exists chat_messages_group_created_idx on public.chat_messages(group_id, created_at desc);

create table if not exists public.chat_user_read_state (
  user_id uuid not null references public.users(id) on delete cascade,
  group_id uuid not null references public.chat_groups(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (user_id, group_id)
);

insert into storage.buckets (id, name, public)
values ('chat-files', 'chat-files', true)
on conflict (id) do update set public = true;

-- Realtime (supabase_realtime yayını) — migrations/20260413220000_chat_realtime.sql ile aynı
do $$
begin
  alter publication supabase_realtime add table public.chat_messages;
exception
  when others then
    null;
end $$;
