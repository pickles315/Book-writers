create or replace function public.library_return_item(p_card_id uuid, p_loan_id uuid)
returns boolean
language plpgsql
as $$
begin
  update public.library_loans
  set returned_at = now()
  where id = p_loan_id and card_id = p_card_id and returned_at is null;
  if not found then return false; end if;
  return true;
end;
$$;

create or replace function public.library_expire_loans()
returns integer
language plpgsql
as $$
declare
  v_count integer;
begin
  update public.library_loans
  set returned_at = due_at
  where returned_at is null and due_at <= now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;