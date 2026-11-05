-- The old policy covered every bucket except userPerformanceVideos, including
-- future private buckets. Limit its replacement to buckets marked public.
drop policy if exists "Allow access to all public buckets" on storage.objects;
create policy "Allow access to public buckets"
  on storage.objects for select
  using (bucket_id in (select id from storage.buckets where public = true));

create table public.research_access (
  user_id uuid not null references auth.users(id) on delete cascade,
  study text not null check (study in ('chi25_study1', 'chi25_study2')),
  role text not null default 'viewer' check (role in ('viewer', 'editor', 'admin')),
  granted_at timestamptz not null default now(),
  primary key (user_id, study)
);

alter table public.research_access enable row level security;
revoke all on public.research_access from anon, authenticated;
grant select on public.research_access to authenticated;
create policy "Research users can see their own access"
  on public.research_access for select to authenticated
  using (user_id = (select auth.uid()));

create table public.research_media (
  id text primary key check (id ~ '^[a-f0-9]{24}$'),
  study text not null check (study in ('chi25_study1', 'chi25_study2')),
  source_stem text not null,
  video_path text not null unique,
  pose_path text not null unique,
  video_sha256 text not null check (video_sha256 ~ '^[a-f0-9]{64}$'),
  pose_sha256 text not null check (pose_sha256 ~ '^[a-f0-9]{64}$'),
  video_bytes bigint not null check (video_bytes > 0),
  pose_bytes bigint not null check (pose_bytes > 0),
  source_description text not null,
  imported_at timestamptz not null default now(),
  unique (study, source_stem),
  check (video_path = study || '/' || id || '/video.mp4'),
  check (pose_path = study || '/' || id || '/pose2d.raw.csv')
);

alter table public.research_media enable row level security;
revoke all on public.research_media from anon, authenticated;
grant select on public.research_media to authenticated;
create policy "Research users can read authorized study media"
  on public.research_media for select to authenticated
  using (exists (
    select 1 from public.research_access membership
    where membership.user_id = (select auth.uid())
      and membership.study = research_media.study
  ));

insert into storage.buckets (id, name, public, allowed_mime_types)
values ('research-chi25', 'research-chi25', false,
        array['video/mp4', 'text/csv', 'application/csv', 'application/octet-stream'])
on conflict (id) do update set public = false;

create policy "Research users can read authorized private objects"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'research-chi25'
    and exists (
      select 1 from public.research_media media
      where media.study = (storage.foldername(name))[1]
        and name in (media.video_path, media.pose_path)
    )
  );
