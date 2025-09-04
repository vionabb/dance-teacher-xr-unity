SET session_replication_role = replica;

--
-- PostgreSQL database dump
--

-- Dumped from database version 15.1 (Ubuntu 15.1-1.pgdg20.04+1)
-- Dumped by pg_dump version 15.4 (Ubuntu 15.4-2.pgdg20.04+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Data for Name: audit_log_entries; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

INSERT INTO "auth"."audit_log_entries" ("instance_id", "id", "payload", "created_at", "ip_address") VALUES
	('00000000-0000-0000-0000-000000000000', 'ac576678-45b6-42aa-b89b-3b6eb319377c', '{"action":"user_signedup","actor_id":"66301ae0-04ae-41ec-8746-c4d24d348c68","actor_username":"j55blanchet+dev@gmail.com","actor_via_sso":false,"log_type":"team","traits":{"provider":"email"}}', '2025-09-04 14:01:15.737618+00', ''),
	('00000000-0000-0000-0000-000000000000', '1da63a4b-9f2c-4ee4-80d4-88b2124df6e3', '{"action":"login","actor_id":"66301ae0-04ae-41ec-8746-c4d24d348c68","actor_username":"j55blanchet+dev@gmail.com","actor_via_sso":false,"log_type":"account","traits":{"provider":"email"}}', '2025-09-04 14:01:15.740983+00', '');


--
-- Data for Name: flow_state; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: users; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

INSERT INTO "auth"."users" ("instance_id", "id", "aud", "role", "email", "encrypted_password", "email_confirmed_at", "invited_at", "confirmation_token", "confirmation_sent_at", "recovery_token", "recovery_sent_at", "email_change_token_new", "email_change", "email_change_sent_at", "last_sign_in_at", "raw_app_meta_data", "raw_user_meta_data", "is_super_admin", "created_at", "updated_at", "phone", "phone_confirmed_at", "phone_change", "phone_change_token", "phone_change_sent_at", "email_change_token_current", "email_change_confirm_status", "banned_until", "reauthentication_token", "reauthentication_sent_at", "is_sso_user", "deleted_at") VALUES
	('00000000-0000-0000-0000-000000000000', '66301ae0-04ae-41ec-8746-c4d24d348c68', 'authenticated', 'authenticated', 'j55blanchet+dev@gmail.com', '$2a$10$dpBi7vJ4d3KHPreba0NUNOQu4QL65rYzNkw3C8IQ9qfjcCuzUYaui', '2025-09-04 14:01:15.739769+00', NULL, '', NULL, '', NULL, '', '', NULL, '2025-09-04 14:01:15.741248+00', '{"provider": "email", "providers": ["email"]}', '{}', NULL, '2025-09-04 14:01:15.732959+00', '2025-09-04 14:01:15.742984+00', NULL, NULL, '', '', NULL, '', 0, NULL, '', NULL, false, NULL);


--
-- Data for Name: identities; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

INSERT INTO "auth"."identities" ("id", "user_id", "identity_data", "provider", "last_sign_in_at", "created_at", "updated_at") VALUES
	('66301ae0-04ae-41ec-8746-c4d24d348c68', '66301ae0-04ae-41ec-8746-c4d24d348c68', '{"sub": "66301ae0-04ae-41ec-8746-c4d24d348c68", "email": "j55blanchet+dev@gmail.com", "email_verified": false, "phone_verified": false}', 'email', '2025-09-04 14:01:15.736904+00', '2025-09-04 14:01:15.736919+00', '2025-09-04 14:01:15.736919+00');


--
-- Data for Name: instances; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: sessions; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

-- INSERT INTO "auth"."sessions" ("id", "user_id", "created_at", "updated_at", "factor_id", "aal", "not_after", "refreshed_at", "user_agent", "ip") VALUES
-- 	('37ca1ae1-3f48-47b3-a563-cf9eb06574d3', 'ec04f95d-1aea-4d8c-b98d-d476718f2a42', '2023-10-20 14:14:06.015678+00', '2023-10-20 14:14:06.015678+00', NULL, 'aal1', NULL, NULL, NULL, NULL),
-- 	('9ba4484a-bb7a-4110-9961-cd67384715bf', '66301ae0-04ae-41ec-8746-c4d24d348c68', '2025-09-04 14:01:15.741326+00', '2025-09-04 14:01:15.741326+00', NULL, 'aal1', NULL, NULL, 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15', '192.168.65.1');


--
-- Data for Name: mfa_amr_claims; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

-- INSERT INTO "auth"."mfa_amr_claims" ("session_id", "created_at", "updated_at", "authentication_method", "id") VALUES
-- 	('37ca1ae1-3f48-47b3-a563-cf9eb06574d3', '2023-10-20 14:14:06.019979+00', '2023-10-20 14:14:06.019979+00', 'magiclink', '27f28219-6e46-416d-b2f9-7464610802d3'),
-- 	('9ba4484a-bb7a-4110-9961-cd67384715bf', '2025-09-04 14:01:15.743165+00', '2025-09-04 14:01:15.743165+00', 'password', '376d2611-1a8a-4774-a207-7f6fae58a5a1');


--
-- Data for Name: mfa_factors; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: mfa_challenges; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: refresh_tokens; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

-- INSERT INTO "auth"."refresh_tokens" ("instance_id", "id", "token", "user_id", "revoked", "created_at", "updated_at", "parent", "session_id") VALUES



--
-- Data for Name: sso_providers; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: saml_providers; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: saml_relay_states; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: sso_domains; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: profiles; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."profiles" ("id", "updated_at", "username", "full_name", "avatar_url") VALUES
	('66301ae0-04ae-41ec-8746-c4d24d348c68', '2025-09-04 14:01:49.266+00', 'jbb55', 'Jules Blanchet', NULL);


--
-- Data for Name: motion_video; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: motion_segmentation; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: motion_userstate; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: buckets; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--

INSERT INTO "storage"."buckets" ("id", "name", "owner", "created_at", "updated_at", "public", "avif_autodetection", "file_size_limit", "allowed_mime_types", "owner_id", "type") VALUES
	('avatars', 'avatars', NULL, '2023-10-20 14:10:01.149245+00', '2023-10-20 14:10:01.149245+00', false, false, NULL, NULL, NULL, 'STANDARD'),
	('holisticdata', 'holisticdata', NULL, '2025-08-28 20:15:29.464286+00', '2025-08-28 20:15:29.464286+00', true, false, NULL, NULL, NULL, 'STANDARD'),
	('pose2ddata', 'pose2ddata', NULL, '2025-08-28 20:15:29.464286+00', '2025-08-28 20:15:29.464286+00', true, false, NULL, NULL, NULL, 'STANDARD'),
	('sourcevideos', 'sourcevideos', NULL, '2025-08-28 20:15:29.464286+00', '2025-08-28 20:15:29.464286+00', true, false, NULL, NULL, NULL, 'STANDARD'),
	('thumbnails', 'thumbnails', NULL, '2025-08-28 20:15:29.464286+00', '2025-08-28 20:15:29.464286+00', true, false, NULL, NULL, NULL, 'STANDARD');


--
-- Data for Name: buckets_analytics; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--



--
-- Data for Name: iceberg_namespaces; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--



--
-- Data for Name: iceberg_tables; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--



--
-- Data for Name: objects; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--



--
-- Data for Name: prefixes; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--



--
-- Data for Name: s3_multipart_uploads; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--



--
-- Data for Name: s3_multipart_uploads_parts; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--



--
-- Data for Name: hooks; Type: TABLE DATA; Schema: supabase_functions; Owner: supabase_functions_admin
--



--
-- Name: refresh_tokens_id_seq; Type: SEQUENCE SET; Schema: auth; Owner: supabase_auth_admin
--

SELECT pg_catalog.setval('"auth"."refresh_tokens_id_seq"', 12, true);


--
-- Name: motion_segmentation_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('"public"."motion_segmentation_id_seq"', 1, false);


--
-- Name: motion_video_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('"public"."motion_video_id_seq"', 1, false);


--
-- Name: hooks_id_seq; Type: SEQUENCE SET; Schema: supabase_functions; Owner: supabase_functions_admin
--

SELECT pg_catalog.setval('"supabase_functions"."hooks_id_seq"', 1, false);


--
-- PostgreSQL database dump complete
--

RESET ALL;
