-- EPUB publishing catalogue for BookWriters. Existing writing books are untouched.
create extension if not exists pgcrypto;
create table if not exists public.epub_books (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 title text not null check (char_length(trim(title)) between 1 and 160),
 description text not null default '' check (char_length(description)<=1800),
 genre text not null default 'Other' check (char_length(genre)<=40),
 age_rating text not null default 'Everyone' check (age_rating in ('Everyone','10+','13+','16+','18+')),
 epub_path text not null, cover_path text not null,
 is_published boolean not null default false,
 created_at timestamptz not null default now()
);
create index if not exists epub_books_published_created_idx on public.epub_books(is_published,created_at desc);
create index if not exists epub_books_owner_created_idx on public.epub_books(owner_id,created_at desc);
alter table public.epub_books enable row level security;
drop policy if exists "EPUB books are visible when published or owned" on public.epub_books;
drop policy if exists "Users upload their own EPUB books" on public.epub_books;
drop policy if exists "Owners update their EPUB books" on public.epub_books;
drop policy if exists "Owners delete their EPUB books" on public.epub_books;
create policy "EPUB books are visible when published or owned" on public.epub_books for select to anon,authenticated using(is_published=true or owner_id=(select auth.uid()));
create policy "Users upload their own EPUB books" on public.epub_books for insert to authenticated with check(owner_id=(select auth.uid()));
create policy "Owners update their EPUB books" on public.epub_books for update to authenticated using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));
create policy "Owners delete their EPUB books" on public.epub_books for delete to authenticated using(owner_id=(select auth.uid()));
grant select on public.epub_books to anon,authenticated;
grant insert,update,delete on public.epub_books to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('epub-library','epub-library',false,104857600,array['application/epub+zip','image/png'])
on conflict(id) do update set public=false,file_size_limit=104857600,allowed_mime_types=array['application/epub+zip','image/png'];
drop policy if exists "EPUB files readable by book readers" on storage.objects;
drop policy if exists "Owners upload EPUB files" on storage.objects;
drop policy if exists "Owners update EPUB files" on storage.objects;
drop policy if exists "Owners delete EPUB files" on storage.objects;
create policy "EPUB files readable by book readers" on storage.objects for select to anon,authenticated using(bucket_id='epub-library' and exists(select 1 from public.epub_books b where b.id::text=(storage.foldername(name))[1] and (b.is_published=true or b.owner_id=(select auth.uid()))));
create policy "Owners upload EPUB files" on storage.objects for insert to authenticated with check(bucket_id='epub-library' and exists(select 1 from public.epub_books b where b.id::text=(storage.foldername(name))[1] and b.owner_id=(select auth.uid())));
create policy "Owners update EPUB files" on storage.objects for update to authenticated using(bucket_id='epub-library' and exists(select 1 from public.epub_books b where b.id::text=(storage.foldername(name))[1] and b.owner_id=(select auth.uid()))) with check(bucket_id='epub-library' and exists(select 1 from public.epub_books b where b.id::text=(storage.foldername(name))[1] and b.owner_id=(select auth.uid())));
create policy "Owners delete EPUB files" on storage.objects for delete to authenticated using(bucket_id='epub-library' and exists(select 1 from public.epub_books b where b.id::text=(storage.foldername(name))[1] and b.owner_id=(select auth.uid())));
