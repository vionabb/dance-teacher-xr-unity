-- create a table for practiceplans, 
-- primary key:
--    id (uuid)
--
-- composite unique constraint
--    user_id (references profiles(id))
--    demo_video_id (references DanceDemoVideo(id))
--    segmentation_id (references DanceSegmentation(id), can be null)
--
-- columns:
--    date created (timestamp)
--    date updated (timestamp) -- can this be modified automatically?
--    plan (jsonb)

CREATE TABLE IF NOT EXISTS practiceplan (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES profiles(id),
    demo_video_id BIGINT REFERENCES public.DanceDemoVideo(id),
    segmentation_id BIGINT REFERENCES public.DanceSegmentation(id) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    plan jsonb NOT NULL,
    UNIQUE (user_id, demo_video_id, segmentation_id)
);

ALTER TABLE "public"."practiceplan" ENABLE ROW LEVEL SECURITY;

DO $$BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policy WHERE polname = 'Enable users to insert their own practice plans' AND polrelid = 'public.practiceplan'::regclass
    ) THEN
        CREATE POLICY "Enable users to insert their own practice plans" ON public.practiceplan FOR INSERT WITH CHECK (auth.uid() = user_id);
    END IF;
END$$;

DO $$BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policy WHERE polname = 'Enable users to read their own practice plans' AND polrelid = 'public.practiceplan'::regclass
    ) THEN
        CREATE POLICY "Enable users to read their own practice plans" ON public.practiceplan FOR SELECT USING (auth.uid() = user_id);
    END IF;
END$$;

DO $$BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policy WHERE polname = 'Enable users to update their own practice plans' AND polrelid = 'public.practiceplan'::regclass
    ) THEN
        CREATE POLICY "Enable users to update their own practice plans" ON public.practiceplan FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
    END IF;
END$$;

DO $$BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policy WHERE polname = 'Enable users to delete their own practice plans' AND polrelid = 'public.practiceplan'::regclass
    ) THEN
        CREATE POLICY "Enable users to delete their own practice plans" ON public.practiceplan FOR DELETE USING (auth.uid() = user_id);
    END IF;
END$$;