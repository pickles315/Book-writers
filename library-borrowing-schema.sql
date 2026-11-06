-- Additive schema for the Libby-inspired borrowing library.
-- Existing writer/EPUB tables and account records are intentionally untouched.

create table if not exists public.library_cards (
  id uuid primary key default gen_random_uuid(),
  card_number text not null unique check (card_number ~ '^[0-9]{12}$'),
  pin_hash text not null,
  role text not null default 'reader' check (role in ('reader','admin')),
  display_name text not null default 'Reader' check (char_length(display_name) between 1 and 60),
  created_at timestamptz not null default now(),
  disabled_at timestamptz
);

create table if not exists public.library_items (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) between 1 and 180),
  author text not null check (char_length(trim(author)) between 1 and 120),
  narrator text,
  media_type text not null check (media_type in ('book','graphic_novel','audiobook')),
  age_classification text not null check (age_classification in ('Juvenile','Adult','All Ages')),
  total_copies integer not null check (total_copies > 0 and total_copies <= 10000),
  file_path text not null,
  cover_path text not null,
  created_at timestamptz not null default now(),
  created_by uuid references public.library_cards(id)
);

create table if not exists public.library_loans (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.library_cards(id),
  item_id uuid not null references public.library_items(id),
  borrowed_at timestamptz not null default now(),
  due_at timestamptz not null default (now() + interval '12 days'),
  returned_at timestamptz,
  check (due_at > borrowed_at),
  check (returned_at is null or returned_at >= borrowed_at)
);

create table if not exists public.library_progress (
  loan_id uuid primary key references public.library_loans(id) on delete cascade,
  current_page integer not null default 0 check (current_page >= 0),
  total_pages integer check (total_pages is null or total_pages > 0),
  audio_position_seconds numeric(12,2) not null default 0 check (audio_position_seconds >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.library_sessions (
  token_hash text primary key,
  card_id uuid not null references public.library_cards(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);

create table if not exists public.library_login_attempts (
  attempt_key text primary key,
  attempts integer not null default 0 check (attempts >= 0),
  window_started_at timestamptz not null default now(),
  locked_until timestamptz
);

create index if not exists library_loans_active_card_idx
  on public.library_loans(card_id, due_at) where returned_at is null;
create index if not exists library_loans_active_item_idx
  on public.library_loans(item_id) where returned_at is null;
create index if not exists library_items_created_idx
  on public.library_items(created_at desc);
create index if not exists library_sessions_card_idx
  on public.library_sessions(card_id, expires_at);

alter table public.library_cards enable row level security;
alter table public.library_items enable row level security;
alter table public.library_loans enable row level security;
alter table public.library_progress enable row level security;
alter table public.library_sessions enable row level security;
alter table public.library_login_attempts enable row level security;

-- All reads/writes go through a server-side Edge Function using the service role.
-- Browser roles receive no direct table privileges and there are no public RLS policies.
revoke all on public.library_cards, public.library_items, public.library_loans,
  public.library_progress, public.library_sessions, public.library_login_attempts
  from anon, authenticated;
grant all on public.library_cards, public.library_items, public.library_loans,
  public.library_progress, public.library_sessions, public.library_login_attempts
  to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'library-media',
  'library-media',
  false,
  52428800,
  array[
    'application/epub+zip',
    'audio/mpeg',
    'audio/mp3',
    'image/png',
    'image/jpeg',
    'image/webp'
  ]
)
on conflict (id) do update
set public = false,
    file_size_limit = 52428800,
    allowed_mime_types = excluded.allowed_mime_types;
