# Production lockdown evidence — 2026-09-24

Project: XiyouQuest (`yfoifmqjhavxidomgids`). Method: Supabase Management API
`/database/query` (catalog reads and the two migrations below) and live PostgREST
requests. No student rows were read; only catalog metadata and aggregate counts.

## Findings verified live before the change

| ID | Finding | Evidence |
|---|---|---|
| C1 | Supabase Auth sign-up open (`disable_signup=false`, email provider on, `mailer_autoconfirm=true`, no CAPTCHA, 6-char passwords; Google and Discord still enabled). Any self-registered `authenticated` principal could read every `profiles` row (Entra real names, friend codes, XP, last login). | auth config snapshot below; `profiles` SELECT policy was `auth.role() = 'authenticated'` |
| C2 | `record_practice_progress(p_user_id, …)` is SECURITY DEFINER and was EXECUTE-granted to `anon`: anyone with the public anon key could write practice/XP records for any student. `deduct_xp_if_sufficient`, `update_profile_with_streak`, `count_user_chat_messages` (DEFINER, caller-supplied `p_user_id`) were granted to `authenticated`. | function ACL snapshot below. Root cause: migration `20260822150000` ran `REVOKE … FROM PUBLIC`, which does not remove Supabase's explicit role grants. |
| H3 | `anon`/`authenticated` held table privileges (incl. write on `mock_exam_results`, `scenario_backgrounds` for anon). | table ACL snapshot below |
| M4 | `authenticated` could upload into the public `avatars` / `chat-images` buckets. | storage policies (5) |

Supabase Auth held 2 legacy accounts (Google, gmail.com, created 2026-07-14 and
2026-07-20, no sign-in since) — predating the HKUST SSO migration. Not deleted;
owner decision.

## Changes applied

1. `supabase/migrations/20260924090000_lockdown_client_roles.sql` — revoke all
   public-schema table/sequence/function privileges from `anon`/`authenticated`,
   re-grant function EXECUTE to `service_role`, fix default privileges, owner-only
   SELECT on `profiles` / `user_characters`.
2. `supabase/migrations/20260924091000_storage_server_only_writes.sql` — drop the
   five `authenticated` storage policies (all uploads are server-side).

Both recorded in `supabase_migrations.schema_migrations`.

## Verification after the change

- Catalog: tables with any anon/authenticated privilege = 0; public functions
  executable by anon/authenticated = 0; tables or functions missing service_role = 0;
  tables with RLS off = 0; remaining storage policies = 0.
- Live PostgREST as `anon`: `POST /rpc/record_practice_progress` → 404 (not
  exposed); `GET /profiles` → 401; `GET /chat_messages` → 401.
- Live PostgREST as `service_role`: `HEAD /question_banks` → 206, 20,369 rows.

## Not changed (needs an organization Owner/Admin)

`PATCH /v1/projects/{ref}/config/auth` returned 403 for the operator account.
Sign-up remains technically open, but a self-registered principal now holds no
privileges. Owner action: Dashboard → Authentication → Sign In / Providers →
disable "Allow new users to sign up", and disable Email, Google and Discord.

## Rollback snapshot (pre-change)

### Auth config
```json
{
 "disable_signup": false,
 "external_email_enabled": true,
 "external_google_enabled": true,
 "external_discord_enabled": true,
 "mailer_autoconfirm": true,
 "site_url": "https://www.xiyouquest.com",
 "uri_allow_list": "http://localhost:3000/**,https://pcs-web-tool.vercel.app/api/auth/callback,https://www.xiyouquest.com/api/auth/callback"
}
```

### Table ACLs
| table | relacl |
|---|---|
| achievements | `{postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres,authenticated=r/postgres}` |
| character_expressions | `{postgres=arwdDxtm/postgres,anon=rxtm/postgres,authenticated=rxtm/postgres,service_role=arwdDxtm/postgres}` |
| character_skins | `{postgres=arwdDxtm/postgres,anon=rxtm/postgres,authenticated=rxtm/postgres,service_role=arwdDxtm/postgres}` |
| characters | `{postgres=arwdDxtm/postgres,anon=rxtm/postgres,authenticated=rxtm/postgres,service_role=arwdDxtm/postgres}` |
| chat_messages | `{postgres=arwdDxtm/postgres,anon=rxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}` |
| chat_scenarios | `{postgres=arwdDxtm/postgres,anon=rxtm/postgres,authenticated=rxtm/postgres,service_role=arwdDxtm/postgres}` |
| chat_sessions | `{postgres=arwdDxtm/postgres,anon=rxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}` |
| friendships | `{postgres=arwdDxtm/postgres,anon=rxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}` |
| learning_checkpoints | `{postgres=arwdDxtm/postgres,anon=rxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}` |
| learning_nodes | `{postgres=arwdDxtm/postgres,anon=rxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}` |
| learning_plans | `{postgres=arwdDxtm/postgres,anon=rxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}` |
| mock_exam_results | `{postgres=arwdDxtm/postgres,anon=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}` |
| practice_details | `{postgres=arwdDxtm/postgres,anon=rxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}` |
| practice_sessions | `{postgres=arwdDxtm/postgres,anon=rxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}` |
| profiles | `{postgres=arwdDxtm/postgres,anon=rxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}` |
| quest_progress | `{postgres=arwdDxtm/postgres,anon=rxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}` |
| question_banks | `{postgres=arwdDxtm/postgres,anon=rxtm/postgres,authenticated=rxtm/postgres,service_role=arwdDxtm/postgres}` |
| scenario_backgrounds | `{postgres=arwdDxtm/postgres,anon=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}` |
| user_achievements | `{postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres,authenticated=ar/postgres}` |
| user_characters | `{postgres=arwdDxtm/postgres,anon=rxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}` |
| user_progress | `{postgres=arwdDxtm/postgres,anon=rxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}` |

### Function ACLs
| function(args) | proacl |
|---|---|
| count_user_chat_messages(p_user_id uuid) | `{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}` |
| deduct_xp_if_sufficient(p_user_id uuid, p_cost integer) | `{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}` |
| enforce_exactly_one_default_character() | `{postgres=X/postgres,service_role=X/postgres}` |
| generate_friend_code() | `{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}` |
| handle_unlock_defaults() | `{postgres=X/postgres,service_role=X/postgres}` |
| record_practice_progress(p_user_id uuid, p_character_id uuid, p_client_attempt_id uuid, p_component smallint, p_score real, p_xp_earned integer, p_duration_seconds integer, p_questions_attempted integer, p_questions_correct integer, p_best_streak integer, p_today date, p_daily_bonus_base integer) | `{postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}` |
| sample_question_bank(p_component integer, p_n integer) | `{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}` |
| update_profile_with_streak(p_user_id uuid, p_today date, p_xp_to_add integer, p_daily_bonus_base integer) | `{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}` |
| upsert_user_progress(p_user_id uuid, p_component integer, p_questions_attempted integer, p_questions_correct integer, p_best_streak integer, p_duration_seconds integer) | `{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}` |
