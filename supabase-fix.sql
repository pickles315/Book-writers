-- BookWriters security and signup fix
-- Run this in Supabase SQL Editor before publishing the site.

-- Fix the signup trigger: the old username was longer than the profiles
-- table's 24-character limit, which could make signups fail.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    'writer_' || substr(replace(new.id::text, '-', ''), 1, 16),
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
      'Writer'
    )
  );
  return new;
end;
$$;

-- Security-definer helpers avoid recursive RLS checks when policies need
-- to determine whether the signed-in user belongs to a book.
create or replace function public.is_book_owner(target_book uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.books b
    where b.id = target_book and b.owner_id = (select auth.uid())
  );
$$;

create or replace function public.is_book_collaborator(target_book uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.book_collaborators bc
    where bc.book_id = target_book and bc.user_id = (select auth.uid())
  );
$$;

create or replace function public.can_access_book(target_book uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.books b
    where b.id = target_book
      and (
        b.is_published = true
        or b.owner_id = (select auth.uid())
        or exists (
          select 1 from public.book_collaborators bc
          where bc.book_id = b.id and bc.user_id = (select auth.uid())
        )
      )
  );
$$;

create or replace function public.can_edit_book(target_book uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.books b
    where b.id = target_book and b.owner_id = (select auth.uid())
  ) or exists (
    select 1 from public.book_collaborators bc
    where bc.book_id = target_book
      and bc.user_id = (select auth.uid())
      and bc.role in ('writer', 'editor')
  );
$$;

grant execute on function public.is_book_owner(uuid) to anon, authenticated;
grant execute on function public.is_book_collaborator(uuid) to anon, authenticated;
grant execute on function public.can_access_book(uuid) to anon, authenticated;
grant execute on function public.can_edit_book(uuid) to authenticated;

-- Replace the earlier policies with versions that avoid policy recursion.
drop policy if exists "Read published books or own collaborations" on public.books;
create policy "Read published books or own collaborations"
on public.books for select to anon, authenticated
using (
  is_published = true
  or owner_id = (select auth.uid())
  or public.is_book_collaborator(id)
);

drop policy if exists "Read collaborator lists for accessible books" on public.book_collaborators;
create policy "Read collaborator lists for accessible books"
on public.book_collaborators for select to authenticated
using (
  user_id = (select auth.uid())
  or public.is_book_owner(book_id)
  or public.is_book_collaborator(book_id)
  or exists (
    select 1 from public.books b
    where b.id = book_id and b.is_published = true
  )
);

drop policy if exists "Read chapters of accessible books" on public.chapters;
create policy "Read chapters of accessible books"
on public.chapters for select to anon, authenticated
using (public.can_access_book(book_id));

drop policy if exists "Writers create chapters" on public.chapters;
create policy "Writers create chapters"
on public.chapters for insert to authenticated
with check (public.can_edit_book(book_id));

drop policy if exists "Writers update chapters" on public.chapters;
create policy "Writers update chapters"
on public.chapters for update to authenticated
using (public.can_edit_book(book_id))
with check (public.can_edit_book(book_id));

drop policy if exists "Owners delete chapters" on public.chapters;
create policy "Owners delete chapters"
on public.chapters for delete to authenticated
using (public.is_book_owner(book_id));

drop policy if exists "Read chat for accessible books" on public.chat_messages;
create policy "Read chat for accessible books"
on public.chat_messages for select to authenticated
using (public.can_access_book(book_id) and (public.is_book_owner(book_id) or public.is_book_collaborator(book_id)));

drop policy if exists "Send chat as yourself to accessible books" on public.chat_messages;
create policy "Send chat as yourself to accessible books"
on public.chat_messages for insert to authenticated
with check (
  user_id = (select auth.uid())
  and (public.is_book_owner(book_id) or public.is_book_collaborator(book_id))
);

-- Keep profile creation and user data access available through Supabase.
grant usage on schema public to anon, authenticated;
grant select on public.profiles, public.books, public.chapters to anon, authenticated;
grant select, insert, update on public.profiles to authenticated;
grant insert, update, delete on public.books to authenticated;
grant select, insert, update, delete on public.chapters to authenticated;
grant select, insert, delete on public.book_collaborators to authenticated;
grant select, insert on public.chat_messages to authenticated;
