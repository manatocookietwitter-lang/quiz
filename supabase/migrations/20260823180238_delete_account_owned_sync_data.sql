-- Keep account deletion and account-owned sync operations atomic. Existing
-- access tokens must not be able to recreate sync data after their auth user
-- has been deleted.

create or replace function private.quiz_sync_authenticated_user()
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  authenticated_user uuid := auth.uid();
  claims jsonb := '{}'::jsonb;
  anonymous_claim text;
begin
  begin
    claims := coalesce(
      nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb,
      '{}'::jsonb
    );
  exception when others then
    claims := '{}'::jsonb;
  end;

  anonymous_claim := pg_catalog.lower(coalesce(claims ->> 'is_anonymous', 'false'));
  if authenticated_user is null
    or anonymous_claim not in ('false', 'f', '0')
  then
    raise sqlstate 'PGRST' using
      message = pg_catalog.jsonb_build_object(
        'code', 'quiz_sync_authentication_required',
        'message', 'A signed-in, non-anonymous account is required for sync.'
      )::text,
      detail = pg_catalog.jsonb_build_object(
        'status', 401,
        'status_text', 'Unauthorized'
      )::text;
  end if;

  perform pg_catalog.pg_advisory_xact_lock_shared(
    pg_catalog.hashtextextended('quiz-sync-account:' || authenticated_user::text, 0)
  );

  if not exists (
    select 1
    from auth.users as account
    where account.id = authenticated_user
  ) then
    raise sqlstate 'PGRST' using
      message = pg_catalog.jsonb_build_object(
        'code', 'quiz_sync_authentication_required',
        'message', 'A signed-in, non-anonymous account is required for sync.'
      )::text,
      detail = pg_catalog.jsonb_build_object(
        'status', 401,
        'status_text', 'Unauthorized'
      )::text;
  end if;

  return authenticated_user;
end;
$function$;

create or replace function private.quiz_sync_actor_hash()
returns bytea
language sql
volatile
security definer
set search_path = ''
as $function$
  select private.quiz_sync_hash(
    'user:' || private.quiz_sync_authenticated_user()::text
  )
$function$;

revoke all on function private.quiz_sync_authenticated_user() from public, anon, authenticated;
revoke all on function private.quiz_sync_actor_hash() from public, anon, authenticated;

create or replace function public.delete_quiz_account()
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  current_user_id uuid := auth.uid();
  current_creator_hash bytea;
begin
  if current_user_id is null then
    raise exception 'not authorized';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('quiz-sync-account:' || current_user_id::text, 0)
  );

  if not exists (
    select 1
    from auth.users as account
    where account.id = current_user_id
  ) then
    raise exception 'not authorized';
  end if;

  current_creator_hash := private.quiz_sync_hash('user:' || current_user_id::text);

  delete from private.quiz_sync_tombstones as tombstone
  using public.quiz_sync_data as sync_data
  where sync_data.creator_hash = current_creator_hash
    and tombstone.sync_id_hash = private.quiz_sync_hash('sync:' || sync_data.sync_id);

  delete from public.quiz_sync_data as sync_data
  where sync_data.creator_hash = current_creator_hash;

  delete from private.quiz_sync_rate_limits as rate_limit
  where rate_limit.actor_hash = current_creator_hash;

  delete from auth.users as account
  where account.id = current_user_id;
end;
$function$;

revoke all on function public.delete_quiz_account() from public, anon;
grant execute on function public.delete_quiz_account() to authenticated;

comment on function public.delete_quiz_account() is
  'Deletes the authenticated user and all account-owned QuizMake shared and sync cloud data; local device data is unaffected.';
