-- pgjwt is unsupported on newer Supabase Postgres versions and blocks the
-- Postgres upgrade. Nothing in the schema uses it (no functions depend on it).
DROP EXTENSION IF EXISTS "pgjwt";
