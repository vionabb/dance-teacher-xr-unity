-- Read-only companion materials for the two hosted CHI25 study catalogs.
-- A shared reference is visible to a member of either study; other assets
-- remain scoped to the study recorded on the catalog row.
create table public.research_material (
  id text primary key check (id ~ '^[a-f0-9]{24}$'),
  scope text not null check (scope in ('shared', 'chi25_study1', 'chi25_study2')),
  kind text not null check (kind in ('reference_video', 'human_ratings', 'reviewed_pose')),
  label text not null,
  object_path text not null unique,
  content_type text not null check (content_type in ('video/mp4', 'text/csv')),
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  bytes bigint not null check (bytes > 0),
  source_description text not null,
  imported_at timestamptz not null default now(),
  check (object_path = 'materials/' || scope || '/' || id ||
    case when content_type = 'video/mp4' then '/video.mp4' else '/data.csv' end),
  check ((kind = 'reference_video') = (content_type = 'video/mp4')),
  check (kind <> 'human_ratings' or scope <> 'shared')
);

alter table public.research_material enable row level security;
revoke all on public.research_material from anon, authenticated;
grant select on public.research_material to authenticated;
create policy "Research users can read authorized companion materials"
  on public.research_material for select to authenticated
  using (exists (
    select 1 from public.research_access membership
    where membership.user_id = (select auth.uid())
      and (research_material.scope = 'shared' or membership.study = research_material.scope)
  ));

create policy "Research users can read authorized companion objects"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'research-chi25'
    and exists (
      select 1 from public.research_material material
      where material.object_path = name
    )
  );
