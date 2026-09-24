# Personal data and processor register

Data classification: **High-Risk** (personal records of identified HKUST staff
and students) with **Sensitive (High Protection)** assessment data (mock-exam
results, pronunciation scores). See `SECURITY.md` §1 for the ITSO classification
citation. This register supports the draft PIA
(`docs/security/pia-draft.md`) and the privacy-notice obligations under the
Personal Data (Privacy) Ordinance (PDPO).

Last verified against code: 2026-09-24. Table/column names below are cited from
`supabase/migrations/*.sql` and `src/lib/auth.ts`; where a field's exact schema
was not re-read for this document, it is marked "not re-verified."

## 1. Data subjects

HKUST staff (`@ust.hk`) and students (`@connect.ust.hk`) who sign in via HKUST
Entra ID. As of 2026-09-24, **28 Better Auth users**
(`docs/security/evidence/2026-09-24-prod-lockdown.md` context) plus **2 legacy
Supabase Auth accounts** (Google sign-in, July 2026, pre-dating the SSO
migration — not deleted, owner decision pending; see `SECURITY.md` §7.4). No
external (non-HKUST) user population exists yet; the prior SECURITY.md flagged
this as planned but undecided, and this register does not cover it until it
ships.

## 2. Personal data inventory

| Store | Fields | Sensitivity | Source | Evidence |
|---|---|---|---|---|
| `better_auth.user` | email, name, image (avatar URL) | Identity (High-Risk) | HKUST Entra ID claims (`email`, `name`/`preferred_username`, `picture`) at sign-in | `src/lib/auth.ts` `getUserInfo` return value |
| `better_auth.session` | IP address, user agent | Identity/technical (High-Risk, session-linkable) | Captured by Better Auth on session creation | Not re-verified in this session — standard Better Auth session table fields; not independently confirmed against this project's schema in this review |
| `better_auth.account` | HKUST Entra OAuth tokens (access/refresh/id token), encrypted at rest as of the 2026-09-24 release | Credential-adjacent (High-Risk) | OIDC token exchange | `src/lib/auth.ts` (`encryptOAuthTokens: true`); `supabase/migrations/20260924103000_purge_stored_oauth_tokens.sql` purged the prior plaintext values |
| `public.profiles` | display_name (from Entra `name`), username, friend_code, XP, level, last_login_date, streak, avatar_url | Identity + usage profile | Populated at account creation (`src/lib/auth.ts` `user.create.after`) and by gameplay | `src/lib/auth.ts`; `src/app/api/leaderboard/route.ts` (selects `display_name`, `avatar_url`, `current_level`) |
| `public.practice_sessions` / `practice_details` | Per-question practice attempts, scores, timing | Sensitive (High Protection) — assessment-adjacent | App gameplay | Referenced by `src/app/api/auth/delete-account/route.ts` deletion order |
| `public.mock_exam_results` | Full mock PSC exam results, AI feedback | Sensitive (High Protection) | App gameplay + LLM feedback | `src/app/api/mock-exam/save/route.ts` (ownership test in `src/app/api/authz-cross-user.test.ts`) |
| `public.quest_progress`, `public.user_progress` | Gamification/progress state | Usage profile | App gameplay | `src/app/api/auth/delete-account/route.ts` |
| `public.learning_plans` / `learning_nodes` / `learning_checkpoints` | AI-generated personalized study plan and progress checkpoints | Usage profile + assessment-adjacent | AI generation (OpenRouter) + gameplay | `src/app/api/learning/*`; `src/app/api/authz-cross-user.test.ts` |
| `public.chat_sessions` / `chat_messages` | Roleplay chat transcripts, **speech transcripts**, pronunciation scores | Sensitive (High Protection) — includes assessment data and free-text/spoken content | Chat + speech-assessment features | `src/app/api/chat/*`; `src/lib/iflytek-speech/client.ts` (pronunciation scoring) |
| `public.user_characters`, `public.user_achievements` | Owned in-game characters, unlocked achievements | Usage profile | Gameplay | `src/app/api/auth/delete-account/route.ts` |
| `public.rate_limit_counters` | user_id, bucket, hit counts per time window | Technical/operational, no content | Rate limiting | `supabase/migrations/20260924100000_rate_limit_counters.sql` |
| `storage.objects` (bucket `avatars`) | User-uploaded avatar images | Identity (image) | User upload | `supabase/migrations/004_security_hardening.sql` (public=true bucket) |
| `storage.objects` (bucket `chat-images`) | AI-generated or user-related chat images | Usage content | Chat feature | `supabase/migrations/004_security_hardening.sql` (public=true bucket) |

**Public-read storage:** both `avatars` and `chat-images` buckets are
`public=true` (object display bypasses storage RLS entirely for reads); writes
are server-only as of the 2026-09-24 migration. See `SECURITY.md` §3 and §10.

**Audio:** raw speech audio recorded for pronunciation assessment is sent to
iFlytek for scoring and is not written to any XiYouQuest-controlled storage —
verified by the absence of a storage-write call in the iFlytek client paths
(`src/lib/iflytek-speech/client.ts`, `src/lib/iflytek-speech/asr-config.ts`).
This was not confirmed by an automated test in this review; it is a code-reading
conclusion, not a proven invariant.

## 3. Data flows (summary)

```
HKUST Entra ID  --OIDC (id_token)-->  Better Auth (Vercel, Next.js server)
                                            |
                                            v
                                   Supabase Postgres (Mumbai)
                                   [better_auth.*, public.*]
                                            |
                    +-----------------------+------------------------+
                    v                       v                        v
            iFlytek (Singapore)      OpenRouter (routing)     Supabase Storage
       raw speech audio, scored,    text prompts + AI          (avatars,
       not stored by app            responses; provider        chat-images,
                                     policy denies data          public-read)
                                     collection, PRC excluded
                                            |
                                            v
                              DeepSeek v4 flash (non-PRC host)
                              or Google Gemini (fallback + image gen)
```

## 4. Processor / sub-processor register

| Processor | Role | Region | Data received | Encryption in transit | Contract/audit status |
|---|---|---|---|---|---|
| **Supabase** | Database (Better Auth + app tables), Storage, edge functions | `ap-south-1` (Mumbai) — per `supabase projects list` against project `yfoifmqjhavxidomgids` | All personal data in §2 except audio | TLS (managed platform) | **Unknown** — no SOC2 Type 2 report or DPA reference found in this repository; CSP checklist not completed (`SECURITY.md` §7.6) |
| **Vercel** | Application hosting, edge network, environment/secret storage | Not independently re-verified in this review; team "XYQ," production domain `cle-xyq.hkust.edu.hk` | All request traffic; holds env vars including `SUPABASE_SERVICE_ROLE_KEY` and `BETTER_AUTH_SECRET` | TLS (managed platform, HSTS enforced — `next.config.ts`) | **Unknown** — SOC2 Type 2 report not on file in this repository |
| **iFlytek** | Speech recognition (ASR/IST), pronunciation assessment (ISE), text-to-speech (TTS) | Singapore (`ise-api-sg.xf-yun.com`, `iat-api-sg.xf-yun.com`, `ist-api-sg.xf-yun.com`, `tts-api-sg.xf-yun.com` — `src/lib/iflytek-speech/asr-config.ts`, `src/lib/iflytek-speech/client.ts`, `src/lib/voice/client.ts`). **Corrects the prior SECURITY.md**, which stated "mainland China" | Raw speech audio (transient, not stored by iFlytek per this app's usage — not independently confirmed against iFlytek's own retention policy) | TLS (host is `*.xf-yun.com` over HTTPS) | **Unknown** — no DPA or retention commitment on file in this repository; this is a cross-border transfer (Singapore, outside Hong Kong) and must be disclosed in the privacy notice/PIA regardless of iFlytek's own retention claims |
| **OpenRouter** | LLM request routing to DeepSeek v4 flash (primary) and Google Gemini (fallback, plus image generation) | Routing layer; underlying model host varies by provider policy | Chat/learning-plan prompts (user-authored chat content sits in the user-message position per `SECURITY.md` §2) and AI-generated responses | TLS | Provider policy enforced in-code: `data_collection: "deny"`, PRC providers (`streamlake, siliconflow, alibaba, baidu`) excluded — `OPENROUTER_PROVIDER_POLICY`, verified identical across all 4 OpenRouter call sites by `src/lib/rate-limit.test.ts`. **No separate DPA/SOC2 report on file** in this repository |
| **Google Gemini** | LLM fallback; image generation for scene art | Google Cloud, region not pinned in this app's configuration | Same content class as OpenRouter, routed via OpenRouter's provider policy | TLS | **Unknown** — covered only indirectly via the OpenRouter provider policy, not a direct Google DPA on file |

**Open register gap:** none of the four processors above has a SOC2 Type 2
report, DPA, or sub-processor list confirmed on file in this repository. The ITSO
Cloud Service Provider checklist (`SECURITY.md` §7.6) is the mechanism to close
this gap and has not been completed.

## 5. Retention and erasure

- **No time-based retention policy exists.** Data persists indefinitely absent
  user action.
- **User-initiated deletion:** `DELETE /api/auth/delete-account`
  (`src/app/api/auth/delete-account/route.ts`) removes, in FK-safe order:
  learning nodes/checkpoints/plans, chat messages/sessions, achievements,
  practice details/sessions, progress, characters, quest progress, friendships,
  and the profile row; then best-effort removes avatar and chat-image storage
  objects (log-and-continue, does not block identity deletion); then deletes the
  `better_auth.user` row, which cascades to `better_auth.session` and
  `better_auth.account` by foreign key. The route aborts (leaving the identity
  intact) if any relational delete fails, specifically to avoid orphaning data
  under a deleted identity.
- **No retention/destruction schedule for processor-held copies** (Supabase
  backups, Vercel logs, OpenRouter/iFlytek transient processing logs if any) is
  documented in this repository — unknown, and a required field in the CSP
  checklist and PIA.
- **Legacy Supabase Auth accounts (2, from July 2026)** are not covered by the
  Better Auth deletion path described above (different auth system, different
  table); an owner decision is pending on whether to delete them directly.

## 6. Data subject rights

- **Access/portability:** no self-service export exists in the app; not
  evaluated further in this document.
- **Erasure:** `/api/auth/delete-account`, as above. Self-service, owner-scoped
  (operates only on the caller's own id — `getSessionUser()` binds `userId`), no
  admin action required.
- **Correction:** profile fields (display name, avatar) are user-editable via
  existing profile routes; other fields (XP, history) are system-derived and not
  user-editable, which is expected for a gamified learning record.

## 7. Cross-border transfer disclosure

Under this inventory, data leaves Hong Kong / the HKUST network boundary to:

- Supabase (Mumbai, India)
- Vercel (region not re-verified in this review)
- iFlytek (Singapore) — audio only, transient
- OpenRouter / DeepSeek / Google Gemini (routing/inference, non-PRC providers by
  policy, exact hosting region not independently confirmed)

Each of these must be named in the privacy notice and the PIA
(`docs/security/pia-draft.md`) as a cross-border transfer under the PDPO,
regardless of whether the receiving processor is contractually a "sub-processor"
in the strict sense — the PDPO's cross-border transfer provisions look at where
the data physically goes, not at contract labels.
