-- Synthetic fixture suite for scripts/verifyHostedAnalysisSchema.mjs only.
-- Runs against its disposable database and fixture accounts; never run against production.
select set_config('research.test_owner', '11111111-1111-4111-8111-111111111111', true);
select set_config('research.test_other', '22222222-2222-4222-8222-222222222222', true);
insert into auth.users values ('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222') on conflict do nothing;
insert into public.research_material(id,scope,kind,label,object_path,content_type,sha256,bytes,source_description)
 values (repeat('a1',12),'shared','reference_video','synthetic','materials/shared/'||repeat('a1',12)||'/video.mp4','video/mp4',repeat('1',64),1,'synthetic')
 on conflict do nothing;
delete from public.research_access;
insert into public.research_access(user_id,study,role) values
 (current_setting('research.test_owner')::uuid,'chi25_study1','editor'),
 (current_setting('research.test_other')::uuid,'chi25_study2','viewer');
insert into public.research_reference_segment(id,dance,clip_number,pose_material_id,video_material_id,start_seconds,mirrored,fps,source_version)
 select repeat('e2',12),'synthetic-dance',1,id,id,0,true,30,'test-only' from public.research_material where kind='reference_video' limit 1;
select set_config('request.jwt.claims', json_build_object('sub',current_setting('research.test_owner'),'role','authenticated')::text,true);
set local role authenticated;
do $$ declare
  video text := repeat('a1',12);
  first public.research_reference_key_move_revision%rowtype;
  second public.research_reference_key_move_revision%rowtype;
  move jsonb := '{"id":"1921d785-1bfb-4102-a889-0c4df550e75c","trackId":"moves","startFrame":10,"endFrame":40,"name":"arm wave","description":"both arms sweep up","viewMirrored":false}';
  tracks jsonb := '[{"id":"moves","label":"Key moves"}]';
begin
 insert into public.research_reference_key_move_revision(owner_id,mutation_id,dance,video_material_id,video_sha256,fps,frame_count,schema_version,tracks,moves,created_at)
 values(auth.uid(),gen_random_uuid(),'synthetic-dance',video,repeat('9',64),30,100,1,tracks,jsonb_build_array(move),'2000-01-01') returning * into first;
 if first.video_sha256 <> repeat('1',64) or first.created_at < now()-interval '1 minute' then raise exception 'Provenance was not overwritten'; end if;
 insert into public.research_reference_key_move_revision(owner_id,mutation_id,base_revision_id,dance,video_material_id,video_sha256,fps,frame_count,schema_version,tracks,moves)
 values(auth.uid(),gen_random_uuid(),first.id,'synthetic-dance',video,repeat('1',64),30,100,1,tracks,'[]') returning * into second;
 begin -- a stale tab still based on the first revision
  insert into public.research_reference_key_move_revision(owner_id,mutation_id,base_revision_id,dance,video_material_id,video_sha256,fps,frame_count,schema_version,tracks,moves)
  values(auth.uid(),gen_random_uuid(),first.id,'synthetic-dance',video,repeat('1',64),30,100,1,tracks,'[]');
  raise exception 'Forked history accepted'; exception when unique_violation then null;
 end;
 begin -- a second "first" revision
  insert into public.research_reference_key_move_revision(owner_id,mutation_id,dance,video_material_id,video_sha256,fps,frame_count,schema_version,tracks,moves)
  values(auth.uid(),gen_random_uuid(),'synthetic-dance',video,repeat('1',64),30,100,1,tracks,'[]');
  raise exception 'Second root accepted'; exception when unique_violation then null;
 end;
 begin
  insert into public.research_reference_key_move_revision(owner_id,mutation_id,base_revision_id,dance,video_material_id,video_sha256,fps,frame_count,schema_version,tracks,moves)
  values(auth.uid(),gen_random_uuid(),second.id,'synthetic-dance',video,repeat('1',64),30,100,1,tracks,jsonb_build_array(move || '{"endFrame":100}'));
  raise exception 'Move past the last frame accepted'; exception when check_violation then null;
 end;
 begin
  insert into public.research_reference_key_move_revision(owner_id,mutation_id,base_revision_id,dance,video_material_id,video_sha256,fps,frame_count,schema_version,tracks,moves)
  values(auth.uid(),gen_random_uuid(),second.id,'synthetic-dance',video,repeat('1',64),30,100,1,tracks,
   jsonb_build_array(move, move || '{"id":"2921d785-1bfb-4102-a889-0c4df550e75c","startFrame":40,"endFrame":50}'));
  raise exception 'Overlapping moves in one track accepted'; exception when check_violation then null;
 end;
 begin
  insert into public.research_reference_key_move_revision(owner_id,mutation_id,base_revision_id,dance,video_material_id,video_sha256,fps,frame_count,schema_version,tracks,moves)
  values(auth.uid(),gen_random_uuid(),second.id,'synthetic-dance',video,repeat('1',64),30,100,1,tracks,jsonb_build_array(move || '{"trackId":"other"}'));
  raise exception 'Move on an unknown track accepted'; exception when check_violation then null;
 end;
 begin
  insert into public.research_reference_key_move_revision(owner_id,mutation_id,base_revision_id,dance,video_material_id,video_sha256,fps,frame_count,schema_version,tracks,moves)
  values(auth.uid(),gen_random_uuid(),second.id,'synthetic-dance',video,repeat('1',64),30,100,1,tracks,jsonb_build_array(move || '{"extra":1}'));
  raise exception 'Unexpected move field accepted'; exception when check_violation then null;
 end;
 begin
  insert into public.research_reference_key_move_revision(owner_id,mutation_id,dance,video_material_id,video_sha256,fps,frame_count,schema_version,tracks,moves)
  values(auth.uid(),gen_random_uuid(),'other-dance',video,repeat('1',64),30,100,1,tracks,'[]');
  raise exception 'Unregistered dance accepted'; exception when check_violation then null;
 end;
 begin
  insert into public.research_reference_key_move_revision(owner_id,mutation_id,dance,video_material_id,video_sha256,fps,frame_count,schema_version,tracks,moves)
  values(current_setting('research.test_other')::uuid,gen_random_uuid(),'synthetic-dance',video,repeat('1',64),30,100,1,tracks,'[]');
  raise exception 'Revision for another owner accepted'; exception when insufficient_privilege then null;
 end;
 begin
  update public.research_reference_key_move_revision set moves='[]' where id=first.id;
  raise exception 'Update accepted'; exception when insufficient_privilege then null;
 end;
end $$;
-- A viewer reads every revision but cannot append.
select set_config('request.jwt.claims', json_build_object('sub',current_setting('research.test_other'),'role','authenticated')::text,true);
do $$ begin
 if (select count(*) from public.research_reference_key_move_revision) <> 2 then raise exception 'Viewer cannot read revisions'; end if;
 begin
  insert into public.research_reference_key_move_revision(owner_id,mutation_id,dance,video_material_id,video_sha256,fps,frame_count,schema_version,tracks,moves)
  values(auth.uid(),gen_random_uuid(),'synthetic-dance',repeat('a1',12),repeat('1',64),30,100,1,'[{"id":"moves","label":"Key moves"}]','[]');
  raise exception 'Viewer append accepted'; exception when insufficient_privilege then null;
 end;
end $$;
reset role;
select 'reference key-move schema tests passed' as test_result;
