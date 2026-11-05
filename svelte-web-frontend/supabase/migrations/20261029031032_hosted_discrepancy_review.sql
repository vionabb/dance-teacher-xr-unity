-- Immutable analysis inputs are administered separately from researcher notes.
alter table public.research_material drop constraint research_material_kind_check;
alter table public.research_material add constraint research_material_kind_check
  check (kind in ('reference_video', 'human_ratings', 'reviewed_pose', 'reference_pose'));
alter table public.research_media add constraint research_media_id_study_key unique (id, study);

create table public.research_reference_segment (
  id text primary key check (id ~ '^[a-f0-9]{24}$'),
  dance text not null,
  clip_number integer not null check (clip_number > 0),
  pose_material_id text not null references public.research_material(id),
  video_material_id text not null references public.research_material(id),
  start_seconds double precision not null check (start_seconds >= 0 and start_seconds < 'Infinity'),
  mirrored boolean not null,
  fps double precision not null check (fps > 0 and fps < 'Infinity'),
  source_version text not null,
  unique (dance, clip_number, source_version)
);
create index research_reference_pose_idx on public.research_reference_segment(pose_material_id);
create index research_reference_video_idx on public.research_reference_segment(video_material_id);

create table public.research_human_rating (
  id text primary key check (id ~ '^[a-f0-9]{24}$'),
  study text not null check (study in ('chi25_study1', 'chi25_study2')),
  dance text not null,
  participant_id text not null,
  source_segment text not null,
  condition text not null,
  human_rating double precision,
  segment_eligible boolean not null,
  source_sha256 text not null check (source_sha256 ~ '^[a-f0-9]{64}$'),
  source_row integer not null check (source_row > 0),
  material_id text not null references public.research_material(id),
  human jsonb not null check (jsonb_typeof(human) = 'object'),
  original_row jsonb not null check (jsonb_typeof(original_row) = 'object'),
  unique (source_sha256, source_row),
  unique (id, study)
);
create index research_human_rating_identity_idx on public.research_human_rating(study, dance, participant_id, source_segment, condition);
create index research_human_rating_material_idx on public.research_human_rating(material_id);

create table public.research_metric_release (
  id text primary key check (id ~ '^[a-f0-9]{64}$'),
  source_version text not null,
  module_hashes jsonb not null check (jsonb_typeof(module_hashes) = 'object'),
  pairing text not null check (pairing = 'row-index-truncate-shorter'),
  time_basis text not null check (time_basis = 'participant-segment-video-seconds')
);

create table public.research_analysis_recording (
  id text primary key,
  study text not null,
  legacy_segment_id text not null check (legacy_segment_id ~ '^[a-f0-9]{24}$'),
  performance_id text not null check (performance_id ~ '^[a-f0-9]{24}$'),
  participant_id integer not null check (participant_id > 0),
  dance text not null,
  workflow_id text not null,
  condition text not null,
  phase text,
  clip_number integer not null check (clip_number > 0),
  duration_seconds double precision not null check (duration_seconds > 0 and duration_seconds < 'Infinity'),
  width integer not null check (width > 0),
  height integer not null check (height > 0),
  reference_id text references public.research_reference_segment(id),
  human_rating_id text,
  input_version text not null check (input_version ~ '^[a-f0-9]{64}$'),
  metric_release_id text not null references public.research_metric_release(id),
  source_context jsonb not null check (jsonb_typeof(source_context) = 'object'),
  foreign key (id, study) references public.research_media(id, study),
  foreign key (human_rating_id, study) references public.research_human_rating(id, study),
  unique (id, study, input_version),
  unique (study, legacy_segment_id)
);
create index research_analysis_performance_idx on public.research_analysis_recording(study, performance_id, clip_number);
create index research_analysis_reference_idx on public.research_analysis_recording(reference_id);
create index research_analysis_rating_idx on public.research_analysis_recording(human_rating_id, study);
create index research_analysis_release_idx on public.research_analysis_recording(metric_release_id);

create table public.research_discrepancy_observation (
  id bigint generated always as identity primary key,
  owner_id uuid not null references auth.users(id),
  mutation_id uuid not null,
  recording_id text not null,
  study text not null,
  input_version text not null,
  start_seconds double precision not null check (start_seconds >= 0 and start_seconds < 'Infinity'),
  end_seconds double precision not null check (end_seconds >= start_seconds and end_seconds < 'Infinity'),
  note text not null check (length(btrim(note)) between 1 and 4000),
  direction text not null check (direction in ('Metric seems too harsh', 'Metric seems too generous', 'Agreement / comparison', 'Uncertain')),
  tags text[] not null check (cardinality(tags) <= 7 and tags <@ array['Tracking / occlusion','Timing / alignment','Amplitude / scale','Body region weighting','Style / expression','Human rater disagreement','Unclear / other']::text[]),
  metric text not null check (metric in ('qijia2d', 'viona2d')),
  diagnostic_client_context jsonb not null check (jsonb_typeof(diagnostic_client_context) = 'object' and octet_length(diagnostic_client_context::text) <= 12000),
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (owner_id, mutation_id),
  foreign key (recording_id, study, input_version) references public.research_analysis_recording(id, study, input_version)
);
create index research_discrepancy_recording_idx on public.research_discrepancy_observation(recording_id, study, input_version);
create index research_discrepancy_owner_study_idx on public.research_discrepancy_observation(owner_id, study, id);

alter table public.research_reference_segment enable row level security;
alter table public.research_human_rating enable row level security;
alter table public.research_metric_release enable row level security;
alter table public.research_analysis_recording enable row level security;
alter table public.research_discrepancy_observation enable row level security;
revoke all on public.research_reference_segment, public.research_human_rating,
  public.research_metric_release, public.research_analysis_recording,
  public.research_discrepancy_observation from anon, authenticated;
grant select on public.research_reference_segment, public.research_human_rating,
  public.research_metric_release, public.research_analysis_recording,
  public.research_discrepancy_observation to authenticated;
grant insert on public.research_discrepancy_observation to authenticated;
grant usage on sequence public.research_discrepancy_observation_id_seq to authenticated;
grant all on public.research_reference_segment, public.research_human_rating,
  public.research_metric_release, public.research_analysis_recording,
  public.research_discrepancy_observation to service_role;
grant usage, select on sequence public.research_discrepancy_observation_id_seq to service_role;

create policy "Members read shared analysis references" on public.research_reference_segment
  for select to authenticated using (exists (
    select 1 from public.research_access where user_id = (select auth.uid())
  ));
create policy "Members read metric releases" on public.research_metric_release
  for select to authenticated using (exists (
    select 1 from public.research_access where user_id = (select auth.uid())
  ));
create policy "Members read study ratings" on public.research_human_rating
  for select to authenticated using (exists (
    select 1 from public.research_access a where a.user_id = (select auth.uid()) and a.study = research_human_rating.study
  ));
create policy "Members read study analysis" on public.research_analysis_recording
  for select to authenticated using (exists (
    select 1 from public.research_access a where a.user_id = (select auth.uid()) and a.study = research_analysis_recording.study
  ));
create policy "Owners read their authorized observations" on public.research_discrepancy_observation
  for select to authenticated using (owner_id = (select auth.uid()) and exists (
    select 1 from public.research_access a where a.user_id = (select auth.uid()) and a.study = research_discrepancy_observation.study
  ));
create policy "Editors append their own observations" on public.research_discrepancy_observation
  for insert to authenticated with check (owner_id = (select auth.uid()) and exists (
    select 1 from public.research_access a where a.user_id = (select auth.uid()) and a.study = research_discrepancy_observation.study and a.role in ('editor', 'admin')
  ));

-- This invoker trigger sees only the same authorized inputs as its caller.
-- It overwrites authoritative provenance and timestamps even for direct API inserts.
create function public.set_research_observation_context() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare
  recording public.research_analysis_recording%rowtype;
  rating public.research_human_rating%rowtype;
  metric_release public.research_metric_release%rowtype;
begin
  select * into recording from public.research_analysis_recording
    where id = new.recording_id and study = new.study and input_version = new.input_version;
  if not found or recording.reference_id is null or recording.human_rating_id is null then
    raise check_violation using message = 'The exact analysis inputs are not available';
  end if;
  select * into rating from public.research_human_rating where id = recording.human_rating_id;
  if not found or not rating.segment_eligible then
    raise check_violation using message = 'No eligible prior-study rating';
  end if;
  if new.end_seconds > recording.duration_seconds + 0.05 then
    raise check_violation using message = 'Observation interval exceeds source video duration';
  end if;
  select * into strict metric_release from public.research_metric_release where id = recording.metric_release_id;
  new.note := btrim(new.note);
  new.created_at := now();
  new.context := recording.source_context || jsonb_build_object(
    'schemaVersion', 1,
    'metricRelease', to_jsonb(metric_release),
    'inputVersion', recording.input_version,
    'human', rating.human,
    'humanSourceSha256', rating.source_sha256,
    'humanSourceRow', rating.source_row,
    'pairing', metric_release.pairing,
    'timeBasis', metric_release.time_basis,
    'diagnosticClientContext', new.diagnostic_client_context
  );
  return new;
end;
$$;
revoke all on function public.set_research_observation_context() from public, anon, authenticated;
create trigger research_observation_context before insert on public.research_discrepancy_observation
  for each row execute function public.set_research_observation_context();
