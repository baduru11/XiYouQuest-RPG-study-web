# XiYouQuest Security Posture

This document states how XiYouQuest is classified under HKUST ITSO policy, its
trust boundaries, and a control-by-control mapping to the HKUST Minimum Security
Standard (MSS), MSS for SaaS on Cloud, and the Application Development
Guidelines. Every row in the control matrix cites the file, test, or evidence
document that proves the control, or is marked `Gap` / `Owner action` where no
such evidence exists.

Detailed supporting documents:

- [docs/security/README.md](docs/security/README.md) — the posture-check operating
  procedure (Goal → Loop → Diary → Verify)
- [docs/security/data-register.md](docs/security/data-register.md) — personal data
  inventory and processor/sub-processor register
- [docs/security/incident-runbook.md](docs/security/incident-runbook.md) —
  detection, containment, and reporting runbook
- [docs/security/pia-draft.md](docs/security/pia-draft.md) — draft Personal Data
  Privacy Impact Assessment for `seccomp@ust.hk`
- [docs/security/evidence/2026-09-24-prod-lockdown.md](docs/security/evidence/2026-09-24-prod-lockdown.md)
  — live findings and remediation from the 2026-09-24 production audit
- [docs/security/posture-diary.md](docs/security/posture-diary.md) — append-only
  log of posture-check runs

## 1. Scope and classification

XiYouQuest is a Putonghua Shuiping Ceshi (PSC) study web application for HKUST
staff and students. It is classified **High-Risk** under the HKUST ITSO Risk
Classification, which names "staff/student/alumni/donor personal records" as
High-Risk data, and it holds data that the ITSO Data Classification names
**Sensitive (High Protection)** — course-adjacent assessment records (mock-exam
results, practice scores, pronunciation assessments) tied to an identified HKUST
person. Where the High-Risk MSS column and the Application Development
Guidelines diverge, the stricter High-Risk requirement applies throughout this
document.

Citations (read 2026-09-24, `itso.hkust.edu.hk`):

- Minimum Security Standard — Application Systems:
  `https://itso.hkust.edu.hk/services/departmental-it-management/information-security-guidelines/mss-app-systems`
- Minimum Security Standard — SaaS on Cloud:
  `https://itso.hkust.edu.hk/services/departmental-it-management/information-security-guidelines/mss-saas-cloud`
- Application Development Guidelines:
  `https://itso.hkust.edu.hk/services/departmental-it-management/information-security-guidelines/application-development`
- Risk Classification / Data Classification:
  `https://itso.hkust.edu.hk/services/it-governance-and-risk-management/data-classification`
- TLS Cipher guideline, privileged account management, handling High-Risk data,
  cloud provider guideline: linked from the same ITSO Information Security
  Guidelines index.
- **Not read:** the ITSO logging guideline page is behind HKUST CAS login and was
  not accessed in this review. Section 6 logging rows are therefore evaluated
  against what the codebase and Supabase platform actually emit, not against the
  ITSO logging guideline's specific retention/field requirements.

## 2. Architecture and trust boundaries

- **Identity.** HKUST Microsoft Entra ID via a self-hosted **Better Auth**
  instance (`src/lib/auth.ts`). Sign-in uses Microsoft's multi-tenant
  `/organizations/` endpoint because staff (`@ust.hk`) and students
  (`@connect.ust.hk`) live in two separate Entra tenants. `getUserInfo` pins the
  token's `tid` to an allow-list of the two known HKUST tenant ids
  (`HKUST_TENANT_ISSUERS`), verifies the id_token's RS256 signature against that
  tenant's own JWKS with `issuer`/`audience`/`algorithm` pinned, and rejects any
  email outside `ust.hk` / `connect.ust.hk` (`ALLOWED_EMAIL_DOMAINS`) — on every
  sign-in, not only account creation. Email/password and social login are
  disabled (`emailAndPassword: { enabled: false }`; no other provider mounted).
- **Session boundary.** `src/proxy.ts` gates every request except `/`, `/login`,
  and `/api/auth/*`: an unauthenticated API request gets a JSON 401, an
  unauthenticated page request redirects to `/login`. Every API route additionally
  calls `getSessionUser()` itself (`src/lib/supabase/server.ts`); this is proven
  for the whole route tree by `src/app/api/authz-matrix.test.ts`, which discovers
  every `route.ts` under `src/app/api` (excluding the Better Auth catch-all) and
  asserts each exported HTTP method returns 401 for an unauthenticated caller.
- **Data boundary.** Browsers never talk to Supabase PostgREST or Storage
  directly for mutations. `createClient()` (`src/lib/supabase/server.ts`) issues a
  **service-role** client once a Better Auth session is verified, and every route
  handler scopes its own queries to the verified session user id — never to a
  client-supplied id. `src/app/api/authz-cross-user.test.ts` proves this for a
  representative set of ownership-checked routes (chat history/delete/resume,
  learning node/checkpoint/report, mock-exam save, social remove/respond): each
  test asserts the ownership filter binds to the session user, not to the
  attacker-supplied resource id, and that a cross-user request is refused (404/403)
  before any mutating call.
- **Client-role boundary.** As of the 2026-09-24 migrations
  (`supabase/migrations/20260924090000_lockdown_client_roles.sql`,
  `20260924091000_storage_server_only_writes.sql`), the `anon` and `authenticated`
  Postgres roles hold **zero** privileges on any `public`-schema table, sequence,
  or function, and **zero** storage policies remain for either role. This means
  the data boundary above is enforced twice: by the service-role-only application
  architecture, and independently by Postgres GRANTs, so a bug that let an
  end-user request reach PostgREST directly (as `anon` or `authenticated`) would
  still be refused at the database. Evidence:
  `docs/security/evidence/2026-09-24-prod-lockdown.md` (live table/function ACL
  snapshots before and after) and posture checks DB-2/DB-3 in
  `scripts/security/posture-check.mjs` (passing as of
  `docs/security/posture-diary.md`).
- **Edge functions.** `supabase/functions/*` (chat, speech, TTS, learning-plan
  generation) verify the Better Auth JWT independently (`verifyUser(req)`) and
  enforce the same rate limits as the Next.js routes via a shared Postgres
  function; see §5.

## 3. Access control

| ITSO requirement | Control in XiYouQuest | Evidence | Status |
|---|---|---|---|
| Access control on sensitive locations (App Dev Guidelines) | Every server route authenticates before touching data; unauthenticated callers get 401 on every discovered route | `src/proxy.ts`; `src/app/api/authz-matrix.test.ts` (asserts 401 for every route file, ≥39 routes) | Met |
| Access control on sensitive functions | Ownership filters bind to the verified session user id, never to client input, across chat/learning/mock-exam/social routes | `src/app/api/authz-cross-user.test.ts` | Met (representative route sample, not exhaustive) |
| Row-Level Security on user data | RLS enabled on every `public` table | posture-check DB-1 (`scripts/security/posture-check.mjs`), PASS in `docs/security/posture-diary.md` | Met |
| Least privilege for the client-facing DB roles | `anon`/`authenticated` hold no table privileges and no EXECUTE on any public function | `supabase/migrations/20260924090000_lockdown_client_roles.sql`; posture-check DB-2/DB-3, PASS in posture diary | Met |
| SECURITY DEFINER functions do not become a privilege-escalation path | Every `SECURITY DEFINER` function pins `search_path`; EXECUTE is granted only to `service_role` (not `anon`/`authenticated`) | posture-check DB-4/DB-3; `supabase/migrations/20260924090000_lockdown_client_roles.sql` | Met |
| Storage access control | `avatars` and `chat-images` are public-read buckets (`bucket_id … public=true`, `supabase/migrations/004_security_hardening.sql`); all writes are server-side after session verification, and no client-role storage policy remains | `supabase/migrations/20260924091000_storage_server_only_writes.sql`; posture-check DB-5 | Met for writes. Public-read of both buckets is a deliberate product choice (avatars/chat images must render without a signed URL) — see §7 residual risk |
| Remove test data / accounts before production | No email/password path exists; only HKUST OIDC | `src/lib/auth.ts` (`emailAndPassword: { enabled: false }`) | Met for the app's own auth. **Gap:** Supabase Auth (the legacy, now-unused auth system in the same project) still holds 2 legacy Google-sign-in accounts from July 2026 and sign-up is technically open — see §6 | Partial |

## 4. Authentication and identity

| ITSO requirement | Control | Evidence | Status |
|---|---|---|---|
| University authentication infrastructure / SSO (MSS SaaS, credential management) | HKUST Entra ID (Microsoft Entra), tenant-pinned to the two HKUST tenants, no local password store | `src/lib/auth.ts` (`HKUST_TENANT_ISSUERS`, `isAllowedEmail`, `getUserInfo`) | Met |
| Token/session integrity | ES256-signed JWTs served at `/api/auth/jwks`; Supabase third-party auth verifies against that JWKS | `src/lib/auth.ts` (`jwt({ jwks: … })`) | Met |
| Domain-scoped authorization on every sign-in, not just account creation | Email domain re-checked in `getUserInfo` (every OIDC exchange) and again in the `user.create.before` database hook | `src/lib/auth.ts` lines ~224-226 and ~306-313 | Met |
| Boot-time secret validation | Production build throws if `BETTER_AUTH_DATABASE_URL` or `BETTER_AUTH_SECRET` is absent | `src/lib/auth.ts` lines ~30-37, ~69-73 | Met |
| Anti-CSRF (App Dev Guidelines) | Better Auth's `trustedOrigins` is pinned to the app's own origin, so a cross-site OAuth/session request is rejected at the origin check | `src/lib/auth.ts` (`trustedOrigins: [baseURL]`) | Met for origin validation. Session-cookie attributes (`HttpOnly`, `SameSite`) are **not explicitly set** in `src/lib/auth.ts` — they rely on Better Auth v1.6.23's library default, which is not pinned in this repository and not covered by a repo test | Partial |
| MFA on end-user identity | Provided by HKUST Entra (institutional identity provider), outside this application's control | Not verifiable from this repository | Unverified (owned by HKUST IT/Entra config) |

## 5. Transport, input validation, and rate limiting

| ITSO requirement | Control | Evidence | Status |
|---|---|---|---|
| TLS everywhere; TLS 1.2+ only (TLS Cipher guideline) | Vercel and Supabase both terminate TLS on managed infrastructure | posture-check TLS-1/TLS-2 (`scripts/security/posture-check.mjs`), PASS in posture diary against `cle-xyq.hkust.edu.hk` | Met, verified externally against the live app. Cipher suite detail (no DES/3DES/RC4) is a platform (Vercel/Supabase) configuration, not independently enumerated by this repo's checks | Partial evidence (TLS version proven; cipher suite not enumerated here) |
| HSTS, CSP, frame protection, MIME sniffing protection | `Strict-Transport-Security` (2-year, `includeSubDomains; preload`), per-request nonce CSP with `strict-dynamic`, `frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy` | `next.config.ts`; `src/proxy.ts` (`buildCsp`); `src/proxy.headers.test.ts`; posture-check HDR-1..HDR-6, all PASS in posture diary | Met |
| Input validation (type, syntax, length, charset, range) | Zod schemas for every API route body/query: UUIDs, numeric ranges, enumerated actions, bounded string lengths, bounded voice-id format | `src/lib/validations.ts` | Met |
| No SQL injection surface | All data access uses the Supabase query builder (parameterized); user-controlled `ILIKE` search input has its wildcard/escape characters escaped before use | `src/app/api/social/search/route.ts` line 46 (`.replace(/[%_\\]/g, "\\$&")`) | Met |
| Rate limiting on abuse-prone / paid endpoints | Per-user fixed-window limits (hourly + daily) enforced in Postgres, shared by Next.js routes and Supabase edge functions via one `consume_rate_limit` function; fails open (with a logged error) if the counter is unreachable | `src/lib/rate-limit.ts`; `supabase/migrations/20260924100000_rate_limit_counters.sql`; `src/lib/rate-limit.test.ts` (proves every paid edge function calls `enforceRateLimit` after `verifyUser`, and proves the Next/edge `RATE_LIMITS` constants stay identical) | Met |
| Rate limiting present on **every** API route (not just paid ones) | Not applied — only the buckets in `RATE_LIMITS` (`speech`, `ai-text`, `ai-image`, `tts`, `social-search`) are limited | `src/lib/rate-limit.ts` | Gap: unauthenticated/low-cost routes rely on the session gate and per-route logic only, not a rate limiter |
| Audio not persisted | Speech audio is sent to iFlytek for scoring; the app does not write it to storage | `src/lib/iflytek-speech/client.ts`, `src/lib/iflytek-speech/asr-config.ts` (no storage write call in these paths) | Met, verified by code inspection; not covered by an automated test |

## 6. Secrets and cryptography

| ITSO requirement | Control | Evidence | Status |
|---|---|---|---|
| No secrets in source control | Only `.env.example` (placeholder) is tracked; real values are environment variables in Vercel | `.env.example`; `.github/workflows/security.yml` (Gitleaks secret scan on every push/PR and weekly) | Met |
| Service-role key never reaches the client | `SUPABASE_SERVICE_ROLE_KEY()` is a server-only accessor, imported only by server modules (`src/lib/supabase/server.ts`, `src/lib/rate-limit.ts`) | `src/lib/env.ts` | Met |
| Encryption of sensitive data at rest / in the DB | Better Auth OAuth tokens (access/refresh/id token) are encrypted (AES-256-GCM, keyed on `BETTER_AUTH_SECRET`) going forward; the historical plaintext values were purged | `src/lib/auth.ts` (`account: { encryptOAuthTokens: true }`); `supabase/migrations/20260924103000_purge_stored_oauth_tokens.sql`; posture-check DB-6, PASS in posture diary | Met. **Caveat:** DB-6 was checked against the *already-migrated* database; the posture-diary note in this repo records that the purge needs re-verification once the corresponding application release (which turns on `encryptOAuthTokens`) is actually deployed, so a sign-in between the DB migration and the code deploy could re-write a plaintext token — see owner action in §7 |
| Dependency vulnerability management | `npm audit --omit=dev --audit-level=high` runs in CI; CodeQL (`security-extended`) runs on every push/PR and weekly; Dependabot open for npm and GitHub Actions (weekly) | `.github/workflows/ci.yml`; `.github/workflows/security.yml`; `.github/dependabot.yml` | Met |
| Security/source-code scanning before deployment and after major changes | CodeQL and Gitleaks run on every push and PR (not only before a tagged release) | `.github/workflows/security.yml` | Met for source scanning. **Gap:** no evidence in this repository of an independent web-application vulnerability scan (the ITSO annual February exercise) having been run against the deployed app | Gap: VA scan (owner action, §7) |

## 7. Owner actions and residual risks

These are tracked outside application code — in the Supabase/Vercel dashboards,
or as an explicit institutional/product decision — and are not controls this
repository can assert:

1. **Supabase Auth sign-up is still technically open.** `disable_signup=false`
   and the Email/Google/Discord providers remain enabled on the legacy Supabase
   Auth system (separate from Better Auth, in the same project). A self-registered
   `authenticated` principal now holds zero table/function privileges (§3), so
   this is a residual exposure, not a data-access path — confirmed by posture-check
   AUTH-1 (`WARN`, not `FAIL`, in `docs/security/posture-diary.md`). Fix requires
   an organization Owner/Admin: the operator account's `PATCH
   /v1/projects/{ref}/config/auth` returned 403 (`docs/security/evidence/2026-09-24-prod-lockdown.md`).
2. **`GITHUB_PERSONAL_ACCESS_TOKEN` in Vercel env.** A repository-wide search
   found no reference to this variable in application code; if it is set in
   Vercel Production/Preview, it should be removed as unused.
3. **Preview environment points at a deleted Supabase project** (`xyq-preview`).
   Needs re-pointing or the preview deployment path documented as non-functional.
4. **Two legacy Supabase Auth accounts** (Google sign-in, created 2026-07-14 and
   2026-07-20, no sign-in since, predating the HKUST SSO migration) exist and have
   not been deleted — owner decision required.
5. **Leaderboard and friend search expose real names.** `display_name` sourced
   from the Entra `name` claim (`src/lib/auth.ts`, `user.create.after`) is visible
   to all students in the global leaderboard scope (`src/app/api/leaderboard/route.ts`)
   and to any authenticated searcher (`src/app/api/social/search/route.ts`). No
   pseudonym or opt-out exists today — a product/privacy decision, not a
   vulnerability, but it affects the PIA (`docs/security/pia-draft.md`).
6. **ITSO compliance register items not yet completed:** Personal Data Privacy
   Impact Assessment submission to `seccomp@ust.hk` (draft at
   `docs/security/pia-draft.md`), IT Resource Record / CITARS registration, Cloud
   Service Provider checklist with Supabase and Vercel SOC2 Type 2 reports, and
   the ITSO annual vulnerability-scan exercise.
7. **Weekly posture-check CI is not yet running with real credentials.**
   `SUPABASE_ACCESS_TOKEN` (read-only if the Management API supports a scoped
   token) and `SUPABASE_ANON_KEY` need to be set as CI secrets — see
   [docs/security/README.md](docs/security/README.md).
8. **OAuth-token purge re-verification.** Re-run posture-check DB-6 after the
   `encryptOAuthTokens` release is confirmed live, per §6.
9. **MFA on provider admin accounts** (Supabase, Vercel, GitHub organization
   owners) is an ITSO privileged-account-management requirement and is not
   verifiable from this repository — confirm directly in each provider's admin
   console.
10. **CORS on Supabase edge functions is `*`.** Edge functions authenticate every
    call with a bearer token (`verifyUser(req)`, §5) rather than cookies, so a
    permissive CORS origin does not by itself grant cross-site access to another
    user's session; the accepted risk is that any origin can *attempt* a call
    with a token it does not have. This is an accepted-risk decision, not a
    control gap, and should be reviewed if edge functions ever move to
    cookie-based auth.
11. **PSC audio and iFlytek.** iFlytek's ISE/ASR/TTS endpoints used by this app
    are the Singapore hosts (`*-api-sg.xf-yun.com`; see
    `src/lib/iflytek-speech/asr-config.ts`, `src/lib/iflytek-speech/client.ts`,
    `src/lib/voice/client.ts`), not mainland China. This corrects an earlier
    version of this document (see below).

## 8. Corrections to the prior version of this document

The previous SECURITY.md (superseded by this rewrite, 2026-09-24) was checked
line-by-line against the current codebase. One factual claim did not hold and is
corrected here:

- **iFlytek region.** The prior document stated iFlytek processing happens "in
  mainland China." The hosts this app actually calls are the Singapore endpoints
  (`ise-api-sg.xf-yun.com`, `iat-api-sg.xf-yun.com`, `ist-api-sg.xf-yun.com`,
  `tts-api-sg.xf-yun.com`), confirmed in `src/lib/iflytek-speech/asr-config.ts`,
  `src/lib/iflytek-speech/client.ts`, and `src/lib/voice/client.ts`. This does not
  change the PDPO cross-border-transfer disclosure requirement (Singapore is
  still outside Hong Kong), but the specific jurisdiction named in the prior
  document was wrong and is corrected in `docs/security/data-register.md`.
- **"Anon-key client restricted to public reference data" is now stale.** The
  prior document (and `src/lib/supabase/server.ts`'s own comment) describe an
  unauthenticated request receiving an anon-key Supabase client that RLS
  "restricts to public reference data." As of the 2026-09-24 lockdown
  (`supabase/migrations/20260924090000_lockdown_client_roles.sql`), the `anon`
  role holds **zero** privileges on any `public` table — including the reference
  tables (`characters`, `chat_scenarios`, etc.) the old text described as
  readable. In the current architecture this is moot in practice (unauthenticated
  requests never reach a data-fetching route past `src/proxy.ts`'s gate), but the
  literal claim that anon-key reads are "restricted to" reference data is no
  longer accurate — they are refused entirely at the database. `src/lib/supabase/server.ts`'s
  comment should be updated to match; flagged here as documentation, not code, per
  this task's scope.

## 9. Vulnerability reporting

Report a security vulnerability to:

- **HKUST ITSO Service Desk:** `security@ust.hk` / +852 2358 6200 (see
  [docs/security/incident-runbook.md](docs/security/incident-runbook.md) for the
  full incident process, including the University Data Privacy Officer for any
  personal-data incident)
- **Repository owner:** open a private report to the repository maintainer
  (`admin@meliedu.com` / EricEremos on GitHub). Do not open a public GitHub issue
  for a security vulnerability.

## 10. Residual risks (summary)

- Supabase Auth sign-up remains technically open pending an organization
  Owner/Admin change (§7.1).
- Public-read storage buckets mean any URL holder — not just authenticated users
  — can view an avatar or chat image if the URL is known or guessed
  (`supabase/migrations/004_security_hardening.sql`); object names are UUIDs, not
  sequential, which limits enumerability but does not eliminate it.
- No time-based data retention policy exists; deletion is user-initiated only via
  `/api/auth/delete-account` (`src/app/api/auth/delete-account/route.ts`) — see
  `docs/security/data-register.md`.
- The PIA, IT Resource Record, and CSP checklist are not yet submitted (§7.6);
  until they are, the application is operating ahead of its own compliance
  register.
