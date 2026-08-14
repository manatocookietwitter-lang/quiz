-- Keep public discovery read-only. All collaboration writes must pass the
-- validation and ownership checks in narrowly granted RPCs.
revoke all on table public.shared_problem_sets from anon, authenticated;
revoke all on table public.shared_questions from anon, authenticated;
revoke all on table public.problem_set_copies from anon, authenticated;
grant select on table public.shared_problem_sets to anon, authenticated;
grant select on table public.shared_questions to anon, authenticated;
revoke all on function public.publish_problem_set(jsonb, jsonb) from anon;
grant execute on function public.publish_problem_set(jsonb, jsonb) to authenticated;

-- Supabase exposes newly created functions to API roles unless each role is
-- revoked explicitly. Group/account operations always require auth.uid(), and
-- trigger/helper functions are not public API endpoints.
revoke all on function public.create_quiz_group(text) from anon;
revoke all on function public.list_my_groups() from anon;
revoke all on function public.create_group_invite(uuid) from anon;
revoke all on function public.join_quiz_group(text) from anon;
revoke all on function public.remove_quiz_group_member(uuid, uuid) from anon;
revoke all on function public.list_group_problem_sets(uuid) from anon;
revoke all on function public.list_quiz_group_members(uuid) from anon;
revoke all on function public.is_quiz_group_member(uuid, uuid) from anon;
revoke all on function public.is_quiz_group_admin(uuid, uuid) from anon;
revoke all on function public.set_profile_display_name(text) from anon;
revoke all on function public.delete_quiz_account() from anon;
revoke all on function public.handle_quiz_user_created() from public, anon, authenticated;

drop policy if exists shared_sets_owner_insert on public.shared_problem_sets;
drop policy if exists shared_sets_owner_update on public.shared_problem_sets;
drop policy if exists shared_sets_owner_delete on public.shared_problem_sets;
drop policy if exists shared_questions_owner_insert on public.shared_questions;
drop policy if exists shared_questions_owner_update on public.shared_questions;
drop policy if exists shared_questions_owner_delete on public.shared_questions;

create or replace function public.unpublish_problem_set(p_set_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  deleted_count integer;
begin
  if auth.uid() is null then
    raise exception 'not authorized';
  end if;

  delete from public.shared_problem_sets
  where id = p_set_id and owner_id = auth.uid();
  get diagnostics deleted_count = row_count;
  return deleted_count > 0;
end;
$$;

revoke all on function public.unpublish_problem_set(uuid) from public, anon;
grant execute on function public.unpublish_problem_set(uuid) to authenticated;

-- A signed-in account can increase a set's copy count only once, even after
-- reinstalling the app or supplying a different installation UUID.
delete from public.problem_set_copies older
using public.problem_set_copies newer
where older.set_id = newer.set_id
  and older.actor_id = newer.actor_id
  and older.actor_id is not null
  and (older.copied_at, older.id) < (newer.copied_at, newer.id);

create unique index if not exists problem_set_copies_actor_unique
  on public.problem_set_copies (set_id, actor_id)
  where actor_id is not null;

create or replace function public.record_problem_set_copy(
  p_set_id uuid,
  p_installation_id uuid,
  p_local_set_id text default ''
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  inserted_count integer;
begin
  if current_user_id is null then
    raise exception 'not authorized';
  end if;
  if not exists (
    select 1 from public.shared_problem_sets
    where id = p_set_id and visibility = 'public'
  ) then
    raise exception 'set not found';
  end if;

  insert into public.problem_set_copies (
    set_id, actor_id, installation_id, local_set_id
  ) values (
    p_set_id,
    current_user_id,
    p_installation_id,
    left(coalesce(p_local_set_id, ''), 200)
  )
  on conflict do nothing;
  get diagnostics inserted_count = row_count;

  if inserted_count > 0 then
    update public.shared_problem_sets
    set add_count = add_count + 1
    where id = p_set_id;
  end if;
end;
$$;

revoke all on function public.record_problem_set_copy(uuid, uuid, text) from public, anon;
grant execute on function public.record_problem_set_copy(uuid, uuid, text) to authenticated;

-- Remove legacy anonymous copy events from the popularity counter so the
-- number represents distinct signed-in accounts after this migration.
update public.shared_problem_sets sets
set add_count = (
  select count(*)::integer
  from public.problem_set_copies copies
  where copies.set_id = sets.id and copies.actor_id is not null
);

create or replace function public.enforce_shared_question_payload_limit()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  existing_bytes bigint;
begin
  if octet_length(new.question) > 30000
    or octet_length(new.answer_text) > 30000
    or octet_length(new.explanation) > 90000
    or octet_length(new.detailed_explanation) > 180000
    or octet_length(new.source_page) > 1500
    or octet_length(new.category) > 360
  then
    raise exception 'question content is too large';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(new.choices) choice
    where jsonb_typeof(choice) <> 'string'
      or octet_length(choice #>> '{}') > 12000
  ) then
    raise exception 'invalid choice content';
  end if;

  if cardinality(new.answer_indexes) <> (
    select count(distinct answer_index)
    from unnest(new.answer_indexes) answer_index
  ) or exists (
    select 1 from unnest(new.answer_indexes) answer_index
    where answer_index < 0 or answer_index >= jsonb_array_length(new.choices)
  ) then
    raise exception 'invalid answer indexes';
  end if;

  select coalesce(sum(pg_column_size(to_jsonb(question_row))), 0)
  into existing_bytes
  from public.shared_questions question_row
  where question_row.set_id = new.set_id
    and question_row.id <> new.id;

  if existing_bytes + pg_column_size(to_jsonb(new)) > 8388608 then
    raise exception 'problem set payload is too large';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_shared_question_payload_limit() from public, anon, authenticated;

drop trigger if exists enforce_shared_question_payload_limit on public.shared_questions;
create trigger enforce_shared_question_payload_limit
before insert or update on public.shared_questions
for each row execute function public.enforce_shared_question_payload_limit();

comment on function public.unpublish_problem_set(uuid) is
  'Deletes only the authenticated owner''s published snapshot.';
comment on function public.record_problem_set_copy(uuid, uuid, text) is
  'Counts one public-set copy per authenticated account.';
