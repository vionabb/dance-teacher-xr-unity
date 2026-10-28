-- Synthetic fixture suite for scripts/verifyHostedAnalysisSchema.mjs only.
-- Runs against its disposable database and fixture accounts; never run against production.
select set_config('research.test_owner', (select user_id::text from public.research_access order by user_id limit 1), true);
select set_config('research.test_other', (select id::text from auth.users where id::text <> current_setting('research.test_owner') order by id limit 1), true);
do $$ begin
 if nullif(current_setting('research.test_owner'),'') is null or nullif(current_setting('research.test_other'),'') is null then raise exception 'Test requires two existing accounts'; end if;
end $$;
delete from public.research_access where user_id in (current_setting('research.test_owner')::uuid,current_setting('research.test_other')::uuid);
insert into public.research_access(user_id,study,role) values
 (current_setting('research.test_owner')::uuid,'chi25_study1','editor'),
 (current_setting('research.test_other')::uuid,'chi25_study1','editor');
insert into public.research_reference_segment(id,dance,clip_number,pose_material_id,video_material_id,start_seconds,mirrored,fps,source_version)
 select repeat('e1',12),'synthetic-test',1,id,id,0,false,30,'test-only' from public.research_material where scope='shared' limit 1;
insert into public.research_metric_release values (repeat('a',64),'test-only','{}','row-index-truncate-shorter','participant-segment-video-seconds');
insert into public.research_human_rating(id,study,dance,participant_id,source_segment,condition,human_rating,segment_eligible,source_sha256,source_row,material_id,human,original_row)
 select repeat('f1',12),'chi25_study1','synthetic-test','42','1','control',3,true,repeat('b',64),1,id,'{"human_rating":3}','{}' from public.research_material where scope='chi25_study1' limit 1;
insert into public.research_analysis_recording(id,study,legacy_segment_id,performance_id,participant_id,dance,workflow_id,condition,clip_number,duration_seconds,width,height,reference_id,human_rating_id,input_version,metric_release_id,source_context)
 select id,study,repeat('d1',12),repeat('c1',12),42,'synthetic-test','test-only','control',1,2,640,480,repeat('e1',12),repeat('f1',12),repeat('c',64),repeat('a',64),'{"trustedSource":"registry"}'
 from public.research_media where study='chi25_study1' limit 1;
insert into public.research_analysis_recording(id,study,legacy_segment_id,performance_id,participant_id,dance,workflow_id,condition,clip_number,duration_seconds,width,height,input_version,metric_release_id,source_context)
 select id,study,repeat('d2',12),repeat('c2',12),42,'synthetic-test','test-only','control',1,2,640,480,repeat('d',64),repeat('a',64),'{}'
 from public.research_media where study='chi25_study2' limit 1;
select set_config('request.jwt.claims', json_build_object('sub',current_setting('research.test_owner'),'role','authenticated')::text,true);
set local role authenticated;
do $$ declare recording text; observation public.research_discrepancy_observation%rowtype; begin
 if (select count(*) from public.research_analysis_recording) <> 1 then raise exception 'Cross-study registry access'; end if;
 select id into strict recording from public.research_analysis_recording;
 insert into public.research_discrepancy_observation(owner_id,mutation_id,recording_id,study,input_version,start_seconds,end_seconds,note,direction,tags,metric,diagnostic_client_context,context,created_at)
 values(auth.uid(),'1921d785-1bfb-4102-a889-0c4df550e75c',recording,'chi25_study1',repeat('c',64),0,1,' synthetic test ','Uncertain','{}','qijia2d','{"trustedSource":"forged"}','{"trustedSource":"forged"}','2000-01-01') returning * into observation;
 if observation.context->>'trustedSource' <> 'registry' or observation.context->>'inputVersion' <> repeat('c',64) or observation.note <> 'synthetic test' or observation.created_at < now()-interval '1 minute' then raise exception 'Provenance was not overwritten'; end if;
 begin
  insert into public.research_discrepancy_observation(owner_id,mutation_id,recording_id,study,input_version,start_seconds,end_seconds,note,direction,tags,metric,diagnostic_client_context)
  values(auth.uid(),'1921d785-1bfb-4102-a889-0c4df550e75c',recording,'chi25_study1',repeat('c',64),0,1,'retry','Uncertain','{}','qijia2d','{}');
  raise exception 'Duplicate retry accepted'; exception when unique_violation then null;
 end;
 begin
  insert into public.research_discrepancy_observation(owner_id,mutation_id,recording_id,study,input_version,start_seconds,end_seconds,note,direction,tags,metric,diagnostic_client_context)
  values(auth.uid(),gen_random_uuid(),recording,'chi25_study1',repeat('c',64),0,3,'invalid interval','Uncertain','{}','qijia2d','{}');
  raise exception 'Invalid interval accepted'; exception when check_violation then null;
 end;
 begin
  insert into public.research_discrepancy_observation(owner_id,mutation_id,recording_id,study,input_version,start_seconds,end_seconds,note,direction,tags,metric,diagnostic_client_context)
  values(auth.uid(),gen_random_uuid(),recording,'chi25_study1',repeat('0',64),0,1,'stale version','Uncertain','{}','qijia2d','{}');
  raise exception 'Stale version accepted'; exception when check_violation then null;
 end;
 begin
  update public.research_discrepancy_observation set note='changed'; raise exception 'Update allowed'; exception when insufficient_privilege then null;
 end;
 begin
  delete from public.research_discrepancy_observation; raise exception 'Delete allowed'; exception when insufficient_privilege then null;
 end;
end $$;
reset role;
select set_config('request.jwt.claims', json_build_object('sub',current_setting('research.test_other'),'role','authenticated')::text,true);
set local role authenticated;
do $$ declare recording text; begin
 if (select count(*) from public.research_discrepancy_observation) <> 0 then raise exception 'Another owner sees observations'; end if;
 select id into strict recording from public.research_analysis_recording;
 begin
  insert into public.research_discrepancy_observation(owner_id,mutation_id,recording_id,study,input_version,start_seconds,end_seconds,note,direction,tags,metric,diagnostic_client_context)
  values(current_setting('research.test_owner')::uuid,gen_random_uuid(),recording,'chi25_study1',repeat('c',64),0,1,'forged owner','Uncertain','{}','qijia2d','{}');
  raise exception 'Forged owner accepted'; exception when insufficient_privilege then null;
 end;
end $$;
reset role;
update public.research_access set role='viewer' where user_id=current_setting('research.test_owner')::uuid;
select set_config('request.jwt.claims', json_build_object('sub',current_setting('research.test_owner'),'role','authenticated')::text,true);
set local role authenticated;
do $$ declare recording text; begin
 if (select count(*) from public.research_analysis_recording) <> 1 then raise exception 'Viewer cannot read'; end if;
 select id into strict recording from public.research_analysis_recording;
 begin
  insert into public.research_discrepancy_observation(owner_id,mutation_id,recording_id,study,input_version,start_seconds,end_seconds,note,direction,tags,metric,diagnostic_client_context)
  values(auth.uid(),gen_random_uuid(),recording,'chi25_study1',repeat('c',64),0,1,'viewer write','Uncertain','{}','qijia2d','{}');
  raise exception 'Viewer wrote an observation'; exception when insufficient_privilege then null;
 end;
end $$;
reset role;
delete from public.research_access where user_id=current_setting('research.test_owner')::uuid;
set local role authenticated;
do $$ begin
 if (select count(*) from public.research_discrepancy_observation) <> 0 or (select count(*) from public.research_analysis_recording) <> 0 then raise exception 'Revoked membership retains access'; end if;
end $$;
reset role;
select 'owner isolation, editor/viewer/revocation, study scope, version/interval checks, append-only permissions, authoritative provenance and retry uniqueness passed' as test_result;
