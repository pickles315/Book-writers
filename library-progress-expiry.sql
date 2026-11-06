-- Remove saved position when a loan is returned or expires.
create or replace function public.library_return_item(p_card_id uuid, p_loan_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.library_loans
  set returned_at = now()
  where id = p_loan_id and card_id = p_card_id and returned_at is null;

  if not found then return false; end if;

  delete from public.library_progress where loan_id = p_loan_id;
  return true;
end;
$$;

create or replace function public.library_expire_loans()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  delete from public.library_progress
  where loan_id in (
    select id from public.library_loans
    where returned_at is null and due_at <= now()
  );

  update public.library_loans
  set returned_at = due_at
  where returned_at is null and due_at <= now();

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.library_return_item(uuid, uuid) from public, anon, authenticated;
revoke all on function public.library_expire_loans() from public, anon, authenticated;
grant execute on function public.library_return_item(uuid, uuid) to service_role;
grant execute on function public.library_expire_loans() to service_role;
