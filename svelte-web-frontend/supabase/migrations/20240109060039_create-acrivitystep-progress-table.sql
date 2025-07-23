
CREATE TABLE IF NOT EXISTS learningStepProgress (
    id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES profiles(id),
    timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
    dance_id TEXT NOT NULL,
    practiceplan_id TEXT NOT NULL,
    activity_id TEXT NOT NULL,
    step_id TEXT NOT NULL,
    state jsonb NOT NULL
);

ALTER TABLE "public"."learningstepprogress" ENABLE ROW LEVEL SECURITY;
DO
  $$BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policy WHERE polname = 'Enable users to insert their own progress updates' AND polrelid = 'public.learningstepprogress'::regclass
    ) THEN

        CREATE POLICY "Enable users to insert their own progress updates"
        ON public.learningstepprogress
        FOR INSERT WITH CHECK (
            auth.uid() = user_id
        );
    END IF;
END$$;

DO
  $$BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policy WHERE polname = 'Enable users to reat their own progress updates' AND polrelid = 'public.learningstepprogress'::regclass
    ) THEN

        CREATE POLICY "Enable users to reat their own progress updates"
        ON public.learningstepprogress
        FOR SELECT USING (
            auth.uid() = user_id
        );
    END IF;
END$$;

DO
$$BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policy 
        WHERE polname = 'Enable users to update their own progress' 
          AND polrelid = 'public.learningstepprogress'::regclass
    ) THEN
        CREATE POLICY "Enable users to update their own progress"
        ON public.learningstepprogress
        FOR UPDATE
        USING (auth.uid() = user_id)
        WITH CHECK (auth.uid() = user_id);
    END IF;
END$$;
