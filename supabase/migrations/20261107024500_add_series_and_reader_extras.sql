alter table public.library_items
  add column if not exists genre text not null default 'Uncategorized',
  add column if not exists series_name text,
  add column if not exists series_number integer;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'library_items_series_number_positive') then
    alter table public.library_items add constraint library_items_series_number_positive
      check (series_number is null or series_number > 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'library_items_series_requires_name') then
    alter table public.library_items add constraint library_items_series_requires_name
      check (series_number is null or nullif(btrim(series_name), '') is not null);
  end if;
end $$;

create index if not exists library_items_series_name_idx on public.library_items(series_name);
create index if not exists library_items_genre_idx on public.library_items(genre);

create table if not exists public.library_reading_goals (
  card_id uuid not null references public.library_cards(id) on delete cascade,
  goal_year integer not null check (goal_year between 2020 and 2100),
  target_books integer not null check (target_books between 1 and 500),
  updated_at timestamptz not null default now(),
  primary key (card_id, goal_year)
);

create table if not exists public.library_collections (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.library_cards(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  created_at timestamptz not null default now(),
  unique (card_id, name)
);

create table if not exists public.library_collection_items (
  collection_id uuid not null references public.library_collections(id) on delete cascade,
  item_id uuid not null references public.library_items(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (collection_id, item_id)
);

create table if not exists public.library_announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  message text not null check (char_length(btrim(message)) between 1 and 1500),
  created_by uuid not null references public.library_cards(id),
  created_at timestamptz not null default now(),
  is_published boolean not null default true
);

create table if not exists public.library_notifications (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.library_cards(id) on delete cascade,
  kind text not null,
  title text not null,
  message text not null,
  source_key text,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  unique (card_id, source_key)
);

create table if not exists public.library_reader_profiles (
  card_id uuid primary key references public.library_cards(id) on delete cascade,
  bio text not null default '' check (char_length(bio) <= 240),
  favorite_genre text not null default '',
  updated_at timestamptz not null default now()
);

create index if not exists library_notifications_card_idx
  on public.library_notifications(card_id, created_at desc);
create index if not exists library_announcements_created_idx
  on public.library_announcements(created_at desc);

alter table public.library_reading_goals enable row level security;
alter table public.library_collections enable row level security;
alter table public.library_collection_items enable row level security;
alter table public.library_announcements enable row level security;
alter table public.library_notifications enable row level security;
alter table public.library_reader_profiles enable row level security;

revoke all on public.library_reading_goals, public.library_collections,
  public.library_collection_items, public.library_announcements,
  public.library_notifications, public.library_reader_profiles
  from anon, authenticated;
