-- Key moves marked on the CHI25 reference videos (stage 2 of the
-- rating-relevant time spans hypothesis). Each save appends one immutable
-- revision holding an annotator's whole set of tracks and moves for one dance;
-- the newest revision per (owner, dance) is current. Every research member can
-- read revisions (the reference videos are shared); editors append their own.
create table public.research_reference_key_move_revision (
  id bigint generated always as identity primary key,
  owner_id uuid not null references auth.users(id),
  mutation_id uuid not null,
  base_revision_id bigint references public.research_reference_key_move_revision(id),
  dance text not null,
  video_material_id text not null references public.research_material(id),
  video_sha256 text not null check (video_sha256 ~ '^[a-f0-9]{64}$'),
  fps double precision not null check (fps > 0 and fps <= 120),
  frame_count integer not null check (frame_count > 0 and frame_count <= 100000),
  schema_version integer not null check (schema_version = 1),
  tracks jsonb not null check (
    jsonb_typeof(tracks) = 'array' and jsonb_array_length(tracks) between 1 and 12
  ),
  moves jsonb not null check (
    jsonb_typeof(moves) = 'array' and jsonb_array_length(moves) <= 200
    and octet_length(moves::text) <= 400000
  ),
  created_at timestamptz not null default now(),
  unique (owner_id, mutation_id)
);
-- History is linear per annotator and dance: a stale tab cannot fork it.
create unique index research_key_move_linear_idx
  on public.research_reference_key_move_revision (owner_id, dance, coalesce(base_revision_id, 0));
create index research_key_move_latest_idx
  on public.research_reference_key_move_revision (owner_id, dance, id desc);
create index research_key_move_material_idx
  on public.research_reference_key_move_revision (video_material_id);
create index research_key_move_base_idx
  on public.research_reference_key_move_revision (base_revision_id);

alter table public.research_reference_key_move_revision enable row level security;
revoke all on public.research_reference_key_move_revision from anon, authenticated;
grant select, insert on public.research_reference_key_move_revision to authenticated;
grant usage on sequence public.research_reference_key_move_revision_id_seq to authenticated;
grant all on public.research_reference_key_move_revision to service_role;
grant usage, select on sequence public.research_reference_key_move_revision_id_seq to service_role;

create policy "Members read reference key moves" on public.research_reference_key_move_revision
  for select to authenticated using (exists (
    select 1 from public.research_access where user_id = (select auth.uid())
  ));
create policy "Editors append their own reference key moves" on public.research_reference_key_move_revision
  for insert to authenticated with check (owner_id = (select auth.uid()) and exists (
    select 1 from public.research_access a
    where a.user_id = (select auth.uid()) and a.role in ('editor', 'admin')
  ));

-- Invoker trigger: binds the revision to the registered reference video, takes
-- the video hash from the catalog, validates every move, and stamps the time.
create function public.check_research_key_move_revision() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare
  material public.research_material%rowtype;
  base public.research_reference_key_move_revision%rowtype;
  track jsonb;
  move jsonb;
  track_ids text[] := '{}';
  move_ids text[] := '{}';
begin
  if not exists (
    select 1 from public.research_reference_segment
    where dance = new.dance and video_material_id = new.video_material_id
  ) then
    raise check_violation using message = 'Not a registered reference video for this dance';
  end if;
  select * into strict material from public.research_material where id = new.video_material_id;
  if material.kind <> 'reference_video' then
    raise check_violation using message = 'Not a reference video';
  end if;
  new.video_sha256 := material.sha256;
  if new.base_revision_id is not null then
    select * into base from public.research_reference_key_move_revision where id = new.base_revision_id;
    if not found or base.owner_id <> new.owner_id or base.dance <> new.dance then
      raise check_violation using message = 'Base revision belongs to another annotator or dance';
    end if;
  elsif exists (
    select 1 from public.research_reference_key_move_revision
    where owner_id = new.owner_id and dance = new.dance
  ) then
    raise unique_violation using message = 'A newer revision exists';
  end if;
  for track in select * from jsonb_array_elements(new.tracks) loop
    if jsonb_typeof(track) <> 'object'
      or (select array_agg(k order by k) from jsonb_object_keys(track) k) <> array['id','label']
      or jsonb_typeof(track->'id') <> 'string' or (track->>'id') !~ '^[a-z0-9][a-z0-9-]{0,39}$'
      or jsonb_typeof(track->'label') <> 'string'
      or length(btrim(track->>'label')) not between 1 and 60
      or (track->>'id') = any(track_ids) then
      raise check_violation using message = 'Invalid track';
    end if;
    track_ids := track_ids || (track->>'id');
  end loop;
  for move in select * from jsonb_array_elements(new.moves) loop
    if jsonb_typeof(move) <> 'object'
      or (select array_agg(k order by k) from jsonb_object_keys(move) k)
        <> array['description','endFrame','id','name','startFrame','trackId','viewMirrored']
      or jsonb_typeof(move->'id') <> 'string'
      or (move->>'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      or (move->>'id') = any(move_ids)
      or jsonb_typeof(move->'trackId') <> 'string' or not ((move->>'trackId') = any(track_ids))
      or jsonb_typeof(move->'startFrame') <> 'number' or jsonb_typeof(move->'endFrame') <> 'number'
      or (move->>'startFrame') !~ '^[0-9]+$' or (move->>'endFrame') !~ '^[0-9]+$'
      or (move->>'startFrame')::bigint > (move->>'endFrame')::bigint
      or (move->>'endFrame')::bigint >= new.frame_count
      or jsonb_typeof(move->'name') <> 'string' or length(move->>'name') > 120
      or jsonb_typeof(move->'description') <> 'string' or length(move->>'description') > 4000
      or jsonb_typeof(move->'viewMirrored') <> 'boolean' then
      raise check_violation using message = 'Invalid move';
    end if;
    move_ids := move_ids || (move->>'id');
  end loop;
  if exists (
    select 1
    from jsonb_array_elements(new.moves) a, jsonb_array_elements(new.moves) b
    where a->>'id' < b->>'id' and a->>'trackId' = b->>'trackId'
      and (a->>'startFrame')::int <= (b->>'endFrame')::int
      and (b->>'startFrame')::int <= (a->>'endFrame')::int
  ) then
    raise check_violation using message = 'Moves in one track overlap';
  end if;
  new.created_at := now();
  return new;
end;
$$;
revoke all on function public.check_research_key_move_revision() from public, anon, authenticated;
create trigger research_key_move_revision_check before insert on public.research_reference_key_move_revision
  for each row execute function public.check_research_key_move_revision();
