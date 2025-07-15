--
-- PostgreSQL database dump
--

-- Dumped from database version 15.1 (Ubuntu 15.1-1.pgdg20.04+1)
-- Dumped by pg_dump version 15.4 (Ubuntu 15.4-1.pgdg20.04+1)

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
	('00000000-0000-0000-0000-000000000000', 'b80f24b1-db23-480d-b9ef-7dd38e0647a6', '{"action":"user_confirmation_requested","actor_id":"ec04f95d-1aea-4d8c-b98d-d476718f2a42","actor_username":"j55blanchet@gmail.com","actor_via_sso":false,"log_type":"user","traits":{"provider":"email"}}', '2023-10-19 01:32:16.680093+00', ''),
	('00000000-0000-0000-0000-000000000000', '55019041-d873-443c-97ce-45fd2f0ec719', '{"action":"user_signedup","actor_id":"ec04f95d-1aea-4d8c-b98d-d476718f2a42","actor_username":"j55blanchet@gmail.com","actor_via_sso":false,"log_type":"team"}', '2023-10-19 01:32:32.133475+00', ''),
	('00000000-0000-0000-0000-000000000000', '70783409-d01a-4ee2-b72b-17d6a3e7b669', '{"action":"login","actor_id":"ec04f95d-1aea-4d8c-b98d-d476718f2a42","actor_username":"j55blanchet@gmail.com","actor_via_sso":false,"log_type":"account","traits":{"provider_type":"email"}}', '2023-10-19 01:32:32.591489+00', ''),
	('00000000-0000-0000-0000-000000000000', '988f44f6-302a-45cd-96f0-7529a4f1a2ab', '{"action":"user_recovery_requested","actor_id":"ec04f95d-1aea-4d8c-b98d-d476718f2a42","actor_username":"j55blanchet@gmail.com","actor_via_sso":false,"log_type":"user"}', '2023-10-19 01:39:16.578894+00', ''),
	('00000000-0000-0000-0000-000000000000', '4e6eb217-de3f-45f3-b2f5-df21c9cc557f', '{"action":"login","actor_id":"ec04f95d-1aea-4d8c-b98d-d476718f2a42","actor_username":"j55blanchet@gmail.com","actor_via_sso":false,"log_type":"account"}', '2023-10-19 01:39:28.748811+00', ''),
	('00000000-0000-0000-0000-000000000000', '6851b509-6d06-4fdf-8305-8e2e11c1b36a', '{"action":"login","actor_id":"ec04f95d-1aea-4d8c-b98d-d476718f2a42","actor_username":"j55blanchet@gmail.com","actor_via_sso":false,"log_type":"account","traits":{"provider_type":"magiclink"}}', '2023-10-19 01:39:29.017008+00', ''),
	('00000000-0000-0000-0000-000000000000', '12381923-b375-46d2-8dff-efa336234fcd', '{"action":"token_refreshed","actor_id":"ec04f95d-1aea-4d8c-b98d-d476718f2a42","actor_username":"j55blanchet@gmail.com","actor_via_sso":false,"log_type":"token"}', '2023-10-20 13:24:44.724762+00', ''),
	('00000000-0000-0000-0000-000000000000', 'e7ed17ad-5233-4106-bdf3-ac4535a689ce', '{"action":"token_revoked","actor_id":"ec04f95d-1aea-4d8c-b98d-d476718f2a42","actor_username":"j55blanchet@gmail.com","actor_via_sso":false,"log_type":"token"}', '2023-10-20 13:24:44.72931+00', ''),
	('00000000-0000-0000-0000-000000000000', '8d32bb8b-3f3e-46d7-a9c6-672061d03d0a', '{"action":"logout","actor_id":"ec04f95d-1aea-4d8c-b98d-d476718f2a42","actor_username":"j55blanchet@gmail.com","actor_via_sso":false,"log_type":"account"}', '2023-10-20 14:13:47.438239+00', ''),
	('00000000-0000-0000-0000-000000000000', 'b41316a7-9546-4ce5-a0b9-5a00faa7ddda', '{"action":"user_recovery_requested","actor_id":"ec04f95d-1aea-4d8c-b98d-d476718f2a42","actor_username":"j55blanchet@gmail.com","actor_via_sso":false,"log_type":"user"}', '2023-10-20 14:13:56.60904+00', ''),
	('00000000-0000-0000-0000-000000000000', 'd53a1fcf-7572-4163-9e3a-7fc2b8bb5625', '{"action":"login","actor_id":"ec04f95d-1aea-4d8c-b98d-d476718f2a42","actor_username":"j55blanchet@gmail.com","actor_via_sso":false,"log_type":"account"}', '2023-10-20 14:14:05.815492+00', ''),
	('00000000-0000-0000-0000-000000000000', '3ac88a68-4e0e-4421-a529-0746da41839b', '{"action":"login","actor_id":"ec04f95d-1aea-4d8c-b98d-d476718f2a42","actor_username":"j55blanchet@gmail.com","actor_via_sso":false,"log_type":"account","traits":{"provider_type":"magiclink"}}', '2023-10-20 14:14:06.014888+00', ''),
	('00000000-0000-0000-0000-000000000000', '88094e49-746c-4013-aad7-f26521dd6479', '{"action":"token_refreshed","actor_id":"ec04f95d-1aea-4d8c-b98d-d476718f2a42","actor_username":"j55blanchet@gmail.com","actor_via_sso":false,"log_type":"token"}', '2023-10-20 17:47:36.596316+00', ''),
	('00000000-0000-0000-0000-000000000000', '68575076-ecda-4a8d-9a7a-90fee4f08656', '{"action":"token_revoked","actor_id":"ec04f95d-1aea-4d8c-b98d-d476718f2a42","actor_username":"j55blanchet@gmail.com","actor_via_sso":false,"log_type":"token"}', '2023-10-20 17:47:36.597012+00', ''),
	('00000000-0000-0000-0000-000000000000', '9caed728-deb6-4750-98da-fbe39ba93cac', '{"action":"token_refreshed","actor_id":"ec04f95d-1aea-4d8c-b98d-d476718f2a42","actor_username":"j55blanchet@gmail.com","actor_via_sso":false,"log_type":"token"}', '2023-10-20 17:47:36.61382+00', ''),
	('00000000-0000-0000-0000-000000000000', '19a0ac5b-8459-4552-8d2d-99ffcb58f0c2', '{"action":"token_revoked","actor_id":"ec04f95d-1aea-4d8c-b98d-d476718f2a42","actor_username":"j55blanchet@gmail.com","actor_via_sso":false,"log_type":"token"}', '2023-10-20 17:47:36.614823+00', ''),
	('00000000-0000-0000-0000-000000000000', '701141f6-b307-4c9a-a753-9f62e80be10e', '{"action":"token_refreshed","actor_id":"ec04f95d-1aea-4d8c-b98d-d476718f2a42","actor_username":"j55blanchet@gmail.com","actor_via_sso":false,"log_type":"token"}', '2023-10-20 17:47:36.632414+00', ''),
	('00000000-0000-0000-0000-000000000000', '33a0b230-fd5c-44e2-a783-6355570d1d61', '{"action":"token_revoked","actor_id":"ec04f95d-1aea-4d8c-b98d-d476718f2a42","actor_username":"j55blanchet@gmail.com","actor_via_sso":false,"log_type":"token"}', '2023-10-20 17:47:36.632985+00', ''),
	('00000000-0000-0000-0000-000000000000', '46878bc9-8a27-4198-8cfa-90fb6fb4499b', '{"action":"token_refreshed","actor_id":"ec04f95d-1aea-4d8c-b98d-d476718f2a42","actor_username":"j55blanchet@gmail.com","actor_via_sso":false,"log_type":"token"}', '2023-10-20 17:47:36.6447+00', ''),
	('00000000-0000-0000-0000-000000000000', 'c4bebb7a-25fb-44f0-b4a4-a2001039a173', '{"action":"token_revoked","actor_id":"ec04f95d-1aea-4d8c-b98d-d476718f2a42","actor_username":"j55blanchet@gmail.com","actor_via_sso":false,"log_type":"token"}', '2023-10-20 17:47:36.645464+00', ''),
	('00000000-0000-0000-0000-000000000000', '36a8874d-7599-471c-95c0-67b513591dde', '{"action":"token_refreshed","actor_id":"ec04f95d-1aea-4d8c-b98d-d476718f2a42","actor_username":"j55blanchet@gmail.com","actor_via_sso":false,"log_type":"token"}', '2023-10-20 17:47:36.676316+00', ''),
	('00000000-0000-0000-0000-000000000000', '94516200-2f23-4568-8f8d-f5d3ef277c07', '{"action":"token_revoked","actor_id":"ec04f95d-1aea-4d8c-b98d-d476718f2a42","actor_username":"j55blanchet@gmail.com","actor_via_sso":false,"log_type":"token"}', '2023-10-20 17:47:36.677005+00', ''),
	('00000000-0000-0000-0000-000000000000', '9af79e69-7e91-4a18-b668-69ba54e20134', '{"action":"token_refreshed","actor_id":"ec04f95d-1aea-4d8c-b98d-d476718f2a42","actor_username":"j55blanchet@gmail.com","actor_via_sso":false,"log_type":"token"}', '2023-10-30 21:11:46.197669+00', ''),
	('00000000-0000-0000-0000-000000000000', 'a638bb82-0564-41eb-8670-8fa80f123fa5', '{"action":"token_revoked","actor_id":"ec04f95d-1aea-4d8c-b98d-d476718f2a42","actor_username":"j55blanchet@gmail.com","actor_via_sso":false,"log_type":"token"}', '2023-10-30 21:11:46.199223+00', ''),
	('00000000-0000-0000-0000-000000000000', '08f6046b-4f27-42d2-89d7-e90e30e0017f', '{"action":"token_refreshed","actor_id":"ec04f95d-1aea-4d8c-b98d-d476718f2a42","actor_username":"j55blanchet@gmail.com","actor_via_sso":false,"log_type":"token"}', '2023-10-30 22:28:29.092137+00', ''),
	('00000000-0000-0000-0000-000000000000', 'e0668628-4c1f-4f06-a0bb-6d69792d66df', '{"action":"token_revoked","actor_id":"ec04f95d-1aea-4d8c-b98d-d476718f2a42","actor_username":"j55blanchet@gmail.com","actor_via_sso":false,"log_type":"token"}', '2023-10-30 22:28:29.092821+00', '');


--
-- Data for Name: flow_state; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: users; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

INSERT INTO "auth"."users" ("instance_id", "id", "aud", "role", "email", "encrypted_password", "email_confirmed_at", "invited_at", "confirmation_token", "confirmation_sent_at", "recovery_token", "recovery_sent_at", "email_change_token_new", "email_change", "email_change_sent_at", "last_sign_in_at", "raw_app_meta_data", "raw_user_meta_data", "is_super_admin", "created_at", "updated_at", "phone", "phone_confirmed_at", "phone_change", "phone_change_token", "phone_change_sent_at", "email_change_token_current", "email_change_confirm_status", "banned_until", "reauthentication_token", "reauthentication_sent_at", "is_sso_user", "deleted_at") VALUES
	('00000000-0000-0000-0000-000000000000', 'ec04f95d-1aea-4d8c-b98d-d476718f2a42', 'authenticated', 'authenticated', 'j55blanchet@gmail.com', '$2a$10$ovOxKFTRClifRm.Bx/AIhedo1e5NazVUWoxy0Xux0OTltHQmbKzfi', '2023-10-19 01:32:32.134087+00', NULL, '', '2023-10-19 01:32:16.682303+00', '', '2023-10-20 14:13:56.611516+00', '', '', NULL, '2023-10-20 14:14:06.015598+00', '{"provider": "email", "providers": ["email"]}', '{}', NULL, '2023-10-19 01:32:16.672927+00', '2023-10-30 22:28:29.09501+00', NULL, NULL, '', '', NULL, '', 0, NULL, '', NULL, false, NULL);


--
-- Data for Name: identities; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

INSERT INTO "auth"."identities" ("id", "user_id", "provider_id", "identity_data", "provider", "last_sign_in_at", "created_at", "updated_at") VALUES
	('ec04f95d-1aea-4d8c-b98d-d476718f2a42', 'ec04f95d-1aea-4d8c-b98d-d476718f2a42', 'ec04f95d-1aea-4d8c-b98d-d476718f2a42', '{"sub": "ec04f95d-1aea-4d8c-b98d-d476718f2a42", "email": "j55blanchet@gmail.com"}', 'email', '2023-10-19 01:32:16.678817+00', '2023-10-19 01:32:16.678856+00', '2023-10-19 01:32:16.678856+00');


--
-- Data for Name: instances; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: sessions; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

INSERT INTO "auth"."sessions" ("id", "user_id", "created_at", "updated_at", "factor_id", "aal", "not_after", "refreshed_at", "user_agent", "ip") VALUES
	('37ca1ae1-3f48-47b3-a563-cf9eb06574d3', 'ec04f95d-1aea-4d8c-b98d-d476718f2a42', '2023-10-20 14:14:06.015678+00', '2023-10-20 14:14:06.015678+00', NULL, 'aal1', NULL, NULL, NULL, NULL);


--
-- Data for Name: mfa_amr_claims; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

INSERT INTO "auth"."mfa_amr_claims" ("session_id", "created_at", "updated_at", "authentication_method", "id") VALUES
	('37ca1ae1-3f48-47b3-a563-cf9eb06574d3', '2023-10-20 14:14:06.019979+00', '2023-10-20 14:14:06.019979+00', 'magiclink', '27f28219-6e46-416d-b2f9-7464610802d3');


--
-- Data for Name: mfa_factors; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: mfa_challenges; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: refresh_tokens; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

INSERT INTO "auth"."refresh_tokens" ("instance_id", "id", "token", "user_id", "revoked", "created_at", "updated_at", "parent", "session_id") VALUES
	('00000000-0000-0000-0000-000000000000', 5, 'cxLYkqgq-C5ll60HcyDkzA', 'ec04f95d-1aea-4d8c-b98d-d476718f2a42', false, '2023-10-20 17:47:36.599104+00', '2023-10-20 17:47:36.599104+00', '1sIZaxIfDGkdesP70wiY_Q', '37ca1ae1-3f48-47b3-a563-cf9eb06574d3'),
	('00000000-0000-0000-0000-000000000000', 7, 'yXsS2uZe7Exhjvk5PfmHug', 'ec04f95d-1aea-4d8c-b98d-d476718f2a42', false, '2023-10-20 17:47:36.633899+00', '2023-10-20 17:47:36.633899+00', '1sIZaxIfDGkdesP70wiY_Q', '37ca1ae1-3f48-47b3-a563-cf9eb06574d3'),
	('00000000-0000-0000-0000-000000000000', 8, 'HPCAw6Bob6O5uGViT2BX3A', 'ec04f95d-1aea-4d8c-b98d-d476718f2a42', false, '2023-10-20 17:47:36.646731+00', '2023-10-20 17:47:36.646731+00', '1sIZaxIfDGkdesP70wiY_Q', '37ca1ae1-3f48-47b3-a563-cf9eb06574d3'),
	('00000000-0000-0000-0000-000000000000', 4, '1sIZaxIfDGkdesP70wiY_Q', 'ec04f95d-1aea-4d8c-b98d-d476718f2a42', true, '2023-10-20 14:14:06.01666+00', '2023-10-20 17:47:36.67763+00', NULL, '37ca1ae1-3f48-47b3-a563-cf9eb06574d3'),
	('00000000-0000-0000-0000-000000000000', 9, '8GmZ91X_phtoFlpMgMQ1HQ', 'ec04f95d-1aea-4d8c-b98d-d476718f2a42', false, '2023-10-20 17:47:36.677997+00', '2023-10-20 17:47:36.677997+00', '1sIZaxIfDGkdesP70wiY_Q', '37ca1ae1-3f48-47b3-a563-cf9eb06574d3'),
	('00000000-0000-0000-0000-000000000000', 6, 'GsHSsIIdXQox9qd7dJlLxQ', 'ec04f95d-1aea-4d8c-b98d-d476718f2a42', true, '2023-10-20 17:47:36.616242+00', '2023-10-30 21:11:46.199769+00', '1sIZaxIfDGkdesP70wiY_Q', '37ca1ae1-3f48-47b3-a563-cf9eb06574d3'),
	('00000000-0000-0000-0000-000000000000', 10, 'fNeFe_0tuxE9_u0BL-4EUA', 'ec04f95d-1aea-4d8c-b98d-d476718f2a42', true, '2023-10-30 21:11:46.201037+00', '2023-10-30 22:28:29.093343+00', 'GsHSsIIdXQox9qd7dJlLxQ', '37ca1ae1-3f48-47b3-a563-cf9eb06574d3'),
	('00000000-0000-0000-0000-000000000000', 11, '6M_63sCE1FNsm6AeJlJeFQ', 'ec04f95d-1aea-4d8c-b98d-d476718f2a42', false, '2023-10-30 22:28:29.093853+00', '2023-10-30 22:28:29.093853+00', 'fNeFe_0tuxE9_u0BL-4EUA', '37ca1ae1-3f48-47b3-a563-cf9eb06574d3');


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
-- Data for Name: key; Type: TABLE DATA; Schema: pgsodium; Owner: supabase_admin
--



--
-- Data for Name: profiles; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."profiles" ("id", "updated_at", "username", "full_name", "avatar_url") VALUES
	('ec04f95d-1aea-4d8c-b98d-d476718f2a42', '2023-10-20 14:17:23.412+00', 'j55blanchet', 'Jules Blanchet', NULL);


--
-- Data for Name: buckets; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--

INSERT INTO "storage"."buckets" ("id", "name", "owner", "created_at", "updated_at", "public", "avif_autodetection", "file_size_limit", "allowed_mime_types", "owner_id") VALUES
	('avatars', 'avatars', NULL, '2023-10-20 14:10:01.149245+00', '2023-10-20 14:10:01.149245+00', false, false, NULL, NULL, NULL);


--
-- Data for Name: objects; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--



--
-- Data for Name: secrets; Type: TABLE DATA; Schema: vault; Owner: supabase_admin
--



--
-- Name: refresh_tokens_id_seq; Type: SEQUENCE SET; Schema: auth; Owner: supabase_auth_admin
--

SELECT pg_catalog.setval('"auth"."refresh_tokens_id_seq"', 11, true);


--
-- Name: key_key_id_seq; Type: SEQUENCE SET; Schema: pgsodium; Owner: supabase_admin
--

SELECT pg_catalog.setval('"pgsodium"."key_key_id_seq"', 1, false);


--
-- PostgreSQL database dump complete
--

RESET ALL;

INSERT INTO storage.buckets (id, name, public)
    SELECT 'holisticdata', 'holisticdata', true
    WHERE NOT EXISTS (
        SELECT 1 FROM storage.buckets WHERE name = 'holisticdata'
    );

INSERT INTO storage.buckets (id, name, public)
    SELECT 'pose2ddata', 'pose2ddata', true
    WHERE NOT EXISTS (
        SELECT 1 FROM storage.buckets WHERE name = 'pose2ddata'
    );

INSERT INTO storage.buckets (id, name, public)
    SELECT 'sourcevideos', 'sourcevideos', true
    WHERE NOT EXISTS (
        SELECT 1 FROM storage.buckets WHERE name = 'sourcevideos'
    );

INSERT INTO storage.buckets (id, name, public)
    SELECT 'thumbnails', 'thumbnails', true
    WHERE NOT EXISTS (
        SELECT 1 FROM storage.buckets WHERE name = 'thumbnails'
    );


