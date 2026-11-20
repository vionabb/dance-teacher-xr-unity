-- Write-once upload area in the private research-chi25 bucket.
--
-- Members with the 'editor' or 'admin' role for a study may add new objects
-- under uploads/<study>/... (for example source files such as collaborator
-- rating sheets that a cloud agent should keep next to the study data).
-- Any member of that study may read them. Nobody but the service role may
-- overwrite or delete them: there are no update or delete policies, so an
-- upload is write-once and a new version needs a new path.
--
-- The catalogued objects (research_media, research_material) keep their own
-- read-only policies; this migration does not let anyone write to them.

update storage.buckets
set allowed_mime_types = array[
  'video/mp4',
  'text/csv',
  'application/csv',
  'application/json',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/octet-stream'
]
where id = 'research-chi25';

create policy "Research editors can add study uploads"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'research-chi25'
    and (storage.foldername(name))[1] = 'uploads'
    and array_length(storage.foldername(name), 1) >= 2
    and exists (
      select 1 from public.research_access membership
      where membership.user_id = (select auth.uid())
        and membership.study = (storage.foldername(name))[2]
        and membership.role in ('editor', 'admin')
    )
  );

create policy "Research users can read study uploads"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'research-chi25'
    and (storage.foldername(name))[1] = 'uploads'
    and exists (
      select 1 from public.research_access membership
      where membership.user_id = (select auth.uid())
        and membership.study = (storage.foldername(name))[2]
    )
  );

-- Link an unrated analysis recording to its existing human rating.
--
-- The original import joined ratings on condition too, and the ratings file's
-- Study 2 conditions are rotated for three dances (see
-- documentation/chi25-study-design.md), so those recordings were left with no
-- rating. scripts/relinkChi25Ratings.mjs computes each link and its new
-- input_version exactly as scripts/importChi25Analysis.mjs would, and calls this
-- function as an editor. The function only fills an empty link, and only when
-- the rating belongs to the same study, dance, participant and clip, is
-- eligible, and no other recording shares that key. It never changes a
-- recording that already has a rating, so existing observations are untouched.
create function public.research_link_human_rating(
  p_recording_id text,
  p_study text,
  p_expected_input_version text,
  p_human_rating_id text,
  p_input_version text
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  recording public.research_analysis_recording%rowtype;
  rating public.research_human_rating%rowtype;
begin
  if not exists (
    select 1 from public.research_access membership
    where membership.user_id = (select auth.uid())
      and membership.study = p_study
      and membership.role in ('editor', 'admin')
  ) then
    raise insufficient_privilege using message = 'Linking ratings needs the editor role for this study';
  end if;
  if p_input_version !~ '^[a-f0-9]{64}$' or p_input_version = p_expected_input_version then
    raise check_violation using message = 'A link needs a new input version';
  end if;
  select * into recording from public.research_analysis_recording
    where id = p_recording_id and study = p_study
    for update;
  if not found or recording.input_version <> p_expected_input_version then
    raise check_violation using message = 'The recording changed or does not exist';
  end if;
  if recording.human_rating_id is not null then
    raise check_violation using message = 'The recording already has a rating';
  end if;
  select * into rating from public.research_human_rating
    where id = p_human_rating_id and study = p_study;
  if not found or not rating.segment_eligible
     or rating.dance <> recording.dance
     or rating.participant_id <> recording.participant_id::text
     or rating.source_segment <> recording.clip_number::text then
    raise check_violation using message = 'The rating does not belong to this recording';
  end if;
  if exists (
    select 1 from public.research_analysis_recording other
    where other.study = recording.study and other.dance = recording.dance
      and other.participant_id = recording.participant_id
      and other.clip_number = recording.clip_number and other.id <> recording.id
  ) then
    raise check_violation using message = 'Another recording shares this participant, dance and clip';
  end if;
  update public.research_analysis_recording
    set human_rating_id = p_human_rating_id, input_version = p_input_version
    where id = p_recording_id and study = p_study;
end;
$$;
revoke all on function public.research_link_human_rating(text, text, text, text, text) from public, anon;
grant execute on function public.research_link_human_rating(text, text, text, text, text) to authenticated;
