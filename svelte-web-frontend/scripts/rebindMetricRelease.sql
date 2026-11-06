-- Re-register every CHI25 analysis recording under a new metric release when the metric math
-- is unchanged but the release fingerprint moved (see src/lib/server/chi25-metric-release.js).
-- Run once, as the database owner, after the new build is deployed. Replace the three
-- :placeholders with `node -e "import('./src/lib/server/chi25-metric-release.js')
--   .then(m => console.log(JSON.stringify(m.readMetricRelease('.'))))"` output.
-- The transaction aborts unless every stored input_version reproduces from its row first,
-- and refuses to run while any discrepancy observation is bound to an old input_version.
begin;
create function pg_temp.sj(v jsonb) returns text language sql immutable as $$
  select case jsonb_typeof(v)
    when 'object' then '{' || coalesce((select string_agg(to_jsonb(k)::text || ':' || pg_temp.sj(v->k), ',' order by k collate "C") from jsonb_object_keys(v) k), '') || '}'
    when 'array' then '[' || coalesce((select string_agg(pg_temp.sj(e), ',' order by i) from jsonb_array_elements(v) with ordinality t(e, i)), '') || ']'
    else v::text end $$;
create function pg_temp.input_version(r public.research_analysis_recording) returns text language sql stable as $$
  select encode(sha256(convert_to(pg_temp.sj(to_jsonb(r) - 'input_version' || jsonb_build_object('human',
    coalesce((select to_jsonb(h) from public.research_human_rating h where h.id = r.human_rating_id and h.study = r.study), 'null'::jsonb))), 'UTF8')), 'hex') $$;
do $$ begin
  if exists (select 1 from public.research_analysis_recording r where r.input_version <> pg_temp.input_version(r))
    then raise exception 'Stored input_version does not reproduce; stop and investigate'; end if;
  if exists (select 1 from public.research_discrepancy_observation)
    then raise exception 'Observations exist; rebinding would orphan their input_version'; end if;
end $$;
insert into public.research_metric_release (id, source_version, module_hashes, pairing, time_basis)
values (:'new_id', :'source_version', :'module_hashes'::jsonb, 'row-index-truncate-shorter', 'participant-segment-video-seconds');
update public.research_analysis_recording set metric_release_id = :'new_id' where metric_release_id = :'old_id';
update public.research_analysis_recording r set input_version = pg_temp.input_version(r);
delete from public.research_metric_release where id = :'old_id';
commit;
