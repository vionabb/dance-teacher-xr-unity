

insert into storage.buckets (id, name, public)
values ('userPerformanceVideos', 'userPerformanceVideos', false);

-- Enable RLS
alter table storage.objects enable row level security;

-- Policy: Only allow users to access their own files
create policy "Users can access their own performance videos"
  on storage.objects
  for select
  using (
    bucket_id = 'userPerformanceVideos'
    and (auth.uid() = owner)
  );

-- Policy: Only allow users to insert their own files
create policy "Users can upload their own performance videos"
  on storage.objects
  for insert
  with check (
    bucket_id = 'userPerformanceVideos'
    and (auth.uid() = owner)
  );

-- NOT SURE IF THIS IS NEEDED
  -- Policy: Allow access to all other buckets except userPerformanceVideos
CREATE POLICY "Allow access to all public buckets" ON storage.objects
  FOR SELECT USING (bucket_id <> 'userPerformanceVideos');
