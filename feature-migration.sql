-- BookWriters feature migration.
-- Safe to re-run: creates/adds only feature schema and replaces policies below.
-- Review this file, then run it in the Supabase SQL Editor before enabling social/version features.

alter table public.books add column if not exists cover_url text;

create table if not exists public.book_likes (
  book_id uuid not null references public.books(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (book_id, user_id)
);

create table if not exists public.bookmarks (
  book_id uuid not null references public.books(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (book_id, user_id)
);

create table if not exists public.writer_follows (
  follower_id uuid not null references auth.users(id) on delete cascade,
  followed_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followed_id),
  check (follower_id <> followed_id)
);

create table if not exists public.chapter_versions (
  id bigint generated always as identity primary key,
  chapter_id uuid not null references public.chapters(id) on delete cascade,
  editor_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  content text not null default '',
  saved_at timestamptz not null default now()
);

alter table public.book_likes enable row level security;
alter table public.bookmarks enable row level security;
alter table public.writer_follows enable row level security;
alter table public.chapter_versions enable row level security;

-- Likes are visible only for published books. A user can only add a like to a published book
-- and can only remove their own like; this avoids leaking private-book activity.
drop policy if exists "Read likes on public books" on public.book_likes;
drop policy if exists "Users manage own likes" on public.book_likes;
drop policy if exists "Read public book likes" on public.book_likes;
drop policy if exists "Like published books" on public.book_likes;
drop policy if exists "Remove own likes" on public.book_likes;
create policy "Read public book likes" on public.book_likes
  for select to anon, authenticated
  using (exists (select 1 from public.books b where b.id = book_likes.book_id and b.is_published = true));
create policy "Like published books" on public.book_likes
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.books b where b.id = book_likes.book_id and b.is_published = true)
  );
create policy "Remove own likes" on public.book_likes
  for delete to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Users manage own bookmarks" on public.bookmarks;
create policy "Users manage own bookmarks" on public.bookmarks
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "Read follows" on public.writer_follows;
drop policy if exists "Users manage own follows" on public.writer_follows;
drop policy if exists "Read writer follows" on public.writer_follows;
drop policy if exists "Create own follows" on public.writer_follows;
drop policy if exists "Remove own follows" on public.writer_follows;
create policy "Read writer follows" on public.writer_follows
  for select to authenticated using (true);
create policy "Create own follows" on public.writer_follows
  for insert to authenticated
  with check (follower_id = (select auth.uid()) and follower_id <> followed_id);
create policy "Remove own follows" on public.writer_follows
  for delete to authenticated using (follower_id = (select auth.uid()));

drop policy if exists "Read versions for accessible books" on public.chapter_versions;
drop policy if exists "Editors save versions" on public.chapter_versions;
create policy "Read versions for accessible books" on public.chapter_versions
  for select to authenticated
  using (
    exists (
      select 1 from public.chapters c
      where c.id = chapter_versions.chapter_id
        and public.can_edit_book(c.book_id)
    )
  );
create policy "Editors save versions" on public.chapter_versions
  for insert to authenticated
  with check (
    editor_id = (select auth.uid())
    and exists (
      select 1 from public.chapters c
      where c.id = chapter_versions.chapter_id
        and public.can_edit_book(c.book_id)
    )
  );

grant select on public.book_likes to anon, authenticated;
grant insert, delete on public.book_likes to authenticated;
grant select, insert, delete on public.bookmarks to authenticated;
grant select, insert, delete on public.writer_follows to authenticated;
grant select, insert on public.chapter_versions to authenticated;
grant usage, select on sequence public.chapter_versions_id_seq to authenticated;
