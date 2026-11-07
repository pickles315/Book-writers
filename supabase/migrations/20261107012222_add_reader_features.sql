create table if not exists public.library_wishlist (
  card_id uuid not null references public.library_cards(id) on delete cascade,
  item_id uuid not null references public.library_items(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (card_id, item_id)
);
create table if not exists public.library_reviews (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.library_cards(id) on delete cascade,
  item_id uuid not null references public.library_items(id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  review text not null default '' check (char_length(review) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (card_id, item_id)
);
create table if not exists public.library_waitlist (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.library_cards(id) on delete cascade,
  item_id uuid not null references public.library_items(id) on delete cascade,
  status text not null default 'waiting' check (status in ('waiting','ready','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists library_waitlist_one_active
  on public.library_waitlist(card_id,item_id) where status in ('waiting','ready');
create index if not exists library_waitlist_queue_idx
  on public.library_waitlist(item_id,status,created_at);
create table if not exists public.library_bookmarks (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.library_cards(id) on delete cascade,
  loan_id uuid not null references public.library_loans(id) on delete cascade,
  location text not null check (char_length(location) <= 500),
  label text not null default '' check (char_length(label) <= 120),
  created_at timestamptz not null default now()
);
create table if not exists public.library_notes (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.library_cards(id) on delete cascade,
  loan_id uuid not null references public.library_loans(id) on delete cascade,
  content text not null check (char_length(content) between 1 and 3000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.library_recent_views (
  card_id uuid not null references public.library_cards(id) on delete cascade,
  item_id uuid not null references public.library_items(id) on delete cascade,
  viewed_at timestamptz not null default now(),
  primary key (card_id,item_id)
);
create index if not exists library_recent_views_card_idx
  on public.library_recent_views(card_id,viewed_at desc);
alter table public.library_wishlist enable row level security;
alter table public.library_reviews enable row level security;
alter table public.library_waitlist enable row level security;
alter table public.library_bookmarks enable row level security;
alter table public.library_notes enable row level security;
alter table public.library_recent_views enable row level security;
revoke all on public.library_wishlist, public.library_reviews, public.library_waitlist,
  public.library_bookmarks, public.library_notes, public.library_recent_views from anon, authenticated;
