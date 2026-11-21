-- Let research editors add a new, immutable human-ratings source.
--
-- The original CHI25 ratings CSV lacks some Study 2 segments (segment 1 of
-- bartender, mad-at-disney and pajama-party, and a three-rater last-christmas
-- segment 1). A supplement CSV built from the collaborator sheets
-- (motion-pipeline/adhoc_analysis/chi25_ratings/build_segment1_supplement.py)
-- carries them. scripts/addChi25RatingSource.mjs uploads the CSV to its
-- catalogued path and calls research_add_rating_source, which registers the
-- material and inserts its rows. Links to recordings then go through
-- research_link_human_rating as before.
--
-- Everything stays append-only: an editor may upload a materials object only
-- where no catalogued material exists yet, the function only inserts, and the
-- existing unique keys stop a source or row from being added twice.

create policy "Research editors can add uncatalogued rating sources"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'research-chi25'
    and name ~ '^materials/chi25_study[12]/[a-f0-9]{24}/data\.csv$'
    and not exists (
      select 1 from public.research_material material where material.object_path = name
    )
    and exists (
      select 1 from public.research_access membership
      where membership.user_id = (select auth.uid())
        and membership.study = (storage.foldername(name))[2]
        and membership.role in ('editor', 'admin')
    )
  );

create function public.research_add_rating_source(p_material jsonb, p_rows jsonb)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  material public.research_material;
  rating public.research_human_rating;
  item jsonb;
  stored_size bigint;
  added integer := 0;
begin
  material := jsonb_populate_record(null::public.research_material, p_material);
  material.imported_at := now();
  if material.kind is distinct from 'human_ratings' or material.content_type is distinct from 'text/csv'
     or material.scope not in ('chi25_study1', 'chi25_study2') then
    raise check_violation using message = 'A rating source is a human_ratings CSV for one study';
  end if;
  if not exists (
    select 1 from public.research_access membership
    where membership.user_id = (select auth.uid())
      and membership.study = material.scope
      and membership.role in ('editor', 'admin')
  ) then
    raise insufficient_privilege using message = 'Adding ratings needs the editor role for this study';
  end if;
  select (o.metadata->>'size')::bigint into stored_size from storage.objects o
    where o.bucket_id = 'research-chi25' and o.name = material.object_path;
  if stored_size is distinct from material.bytes then
    raise check_violation using message = 'Upload the source CSV to its catalogued path first';
  end if;
  insert into public.research_material select material.*;

  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise check_violation using message = 'A rating source needs rows';
  end if;
  for item in select value from jsonb_array_elements(p_rows) loop
    rating := jsonb_populate_record(null::public.research_human_rating, item);
    if rating.study is distinct from material.scope
       or rating.material_id is distinct from material.id
       or rating.source_sha256 is distinct from material.sha256
       or rating.id is distinct from left(encode(sha256(
            convert_to(rating.source_sha256, 'UTF8') || '\x00'::bytea ||
            convert_to(rating.source_row::text, 'UTF8')), 'hex'), 24)
       or rating.segment_eligible is distinct from (
            rating.source_segment ~ '^[1-9][0-9]*$'
            and rating.human_rating is not null
            and rating.human_rating between 1 and 5) then
      raise check_violation using message = 'A rating row does not belong to this source';
    end if;
    insert into public.research_human_rating select rating.*;
    added := added + 1;
  end loop;
  return added;
end;
$$;
revoke all on function public.research_add_rating_source(jsonb, jsonb) from public, anon;
grant execute on function public.research_add_rating_source(jsonb, jsonb) to authenticated;
