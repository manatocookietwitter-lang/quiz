create or replace function public.list_quiz_group_members(p_group_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when public.is_quiz_group_member(p_group_id) then coalesce(jsonb_agg(jsonb_build_object(
    'user_id', members.user_id,
    'display_name', coalesce(profiles.display_name, 'Quiz Make ユーザー'),
    'role', members.role
  ) order by case members.role when 'owner' then 0 when 'admin' then 1 else 2 end, members.joined_at), '[]'::jsonb) else '[]'::jsonb end
  from public.quiz_group_members members
  left join public.quiz_profiles profiles on profiles.user_id = members.user_id
  where members.group_id = p_group_id;
$$;

revoke all on function public.list_quiz_group_members(uuid) from public;
grant execute on function public.list_quiz_group_members(uuid) to authenticated;

comment on function public.list_quiz_group_members(uuid) is 'Returns display names and roles only to members of the same Quiz Make group.';
