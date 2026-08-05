create or replace function public.delete_quiz_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare current_user_id uuid := auth.uid();
begin
  if current_user_id is null then raise exception 'not authorized'; end if;
  delete from auth.users where id = current_user_id;
end;
$$;

revoke all on function public.delete_quiz_account() from public;
grant execute on function public.delete_quiz_account() to authenticated;

comment on function public.delete_quiz_account() is 'Deletes only the authenticated user and cascades their Quiz Make cloud data; local device data is unaffected.';
