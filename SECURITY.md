# XiYouQuest security

XiYouQuest is a Putonghua Proficiency Test (PSC) practice web application for
HKUST staff and students. It holds personal records of identified students and
staff, so HKUST ITSO classifies it as a **High-risk** application and its
assessment-related records as **Sensitive (high protection)** data. The High
column of the ITSO Minimum Security Standard applies throughout.

This file is the summary. The evidence lives in `docs/security/`:

| Document | What it holds |
|---|---|
| [itso-requirement-register.md](docs/security/itso-requirement-register.md) | Every applicable ITSO requirement (101 rows): status, evidence, open item |
| [owner-actions.md](docs/security/owner-actions.md) | The 15 gaps only an owner or HKUST can close, with steps and due dates |
| [README.md](docs/security/README.md) | The weekly posture check (Loop) and how to run it |
| [posture-diary.md](docs/security/posture-diary.md) | Append-only results of every posture check |
| [data-register.md](docs/security/data-register.md) | Personal data inventory, processors, visibility, retention |
| [pia-draft.md](docs/security/pia-draft.md) | Privacy impact assessment in the HKUST form's structure (not submitted) |
| [csp-checklists.md](docs/security/csp-checklists.md) | ITSO cloud service provider checklist for each processor (draft) |
| [incident-runbook.md](docs/security/incident-runbook.md) | Detection, containment and reporting |
| [submissions/](docs/security/submissions/) | Drafts for ITSO: CITARS record, health check, new-technology notice, privileged accounts, retention |
| [evidence/](docs/security/evidence/) | Dated records of live checks and production changes |

## What is live and what is not (2026-09-25)

- **Production web app:** upstream `main` 66d4824 (deployed 2026-09-05). It
  does not yet contain this hardening (owner action OA-6).
- **Production edge functions:** the hardened release from branch
  `security/hkust-hardening`, deployed 2026-09-25. All AI, speech and
  text-to-speech traffic goes through them, so their rate limits, input
  bounds and model-routing policy are live.
- **Production database:** client-role lockdown and storage write lockdown
  applied 2026-09-24. Two new migrations wait for the owner (OA-5).
- **Latest posture check:** 23 PASS, 0 FAIL, 7 WARN (each an owner action),
  2 SKIP.

## Trust boundaries

- **Identity.** HKUST Microsoft Entra ID through a self-hosted Better Auth
  instance (`src/lib/auth.ts`). The id_token's signature is verified against
  the issuing tenant's keys with issuer, audience and algorithm pinned, the
  tenant must be one of HKUST's two tenants, and the email domain must be
  `ust.hk` or `connect.ust.hk`, on every sign-in. No local passwords. From
  the hardening release (OA-6), no provider token is stored
  (`src/lib/oauth-token-hygiene.ts`).
- **Sessions.** Better Auth session cookie: HttpOnly, SameSite=Lax, Secure.
  From the hardening release (OA-6), an 8-hour inactivity timeout replaces the
  7-day default (`src/lib/session-policy.ts`).
- **Request gate.** `src/proxy.ts` sends every non-public request without a
  session to sign-in (API: 401) and sets a per-request nonce Content Security
  Policy; from the hardening release (OA-6) it also refuses cross-site
  state-changing API requests. Every API
  route authenticates again itself (`src/app/api/authz-matrix.test.ts`).
- **Data.** Server code uses Supabase's service role, which bypasses row-level
  security, so every query is scoped to the signed-in user in code
  (`src/app/api/authz-cross-user.test.ts`). The roles a browser could use
  (`anon`, `authenticated`) hold no privilege on any table, view, column or
  function, so a direct PostgREST request is refused at the database (posture
  DB-2, DB-3, ANON-1 to ANON-4). Row-level security stays on as a second layer.
- **Edge functions.** Each verifies a Better Auth JWT (ES256; issuer and
  audience pinned to the app's own origin, https-only key set) before doing
  work (`supabase/functions/_shared/verify-jwt.ts`). Supabase does not verify
  these tokens itself; the functions do.
- **Database transport.** The Better Auth pool verifies the database's
  certificate chain against Supabase's published root CA with hostname
  checking (`src/lib/db-tls.ts`, posture DBTLS-1). Live after OA-6; enforced
  database-side by OA-4.

## Controls added by the 2026-09 hardening

| Area | Control | Where |
|---|---|---|
| Abuse and cost | Per-user limits on all 28 handlers that write data or call a paid provider, shared by both runtimes | `src/lib/rate-limit.ts`, `supabase/functions/_shared/rate-limit.ts`, `src/app/api/rate-limit-coverage.test.ts` |
| AI data handling | Zero-data-retention, no-collection routing; hosts in mainland China excluded; student ids stripped from prompts; prompt inputs bounded | `src/lib/gemini/client.ts` and twins; `src/lib/validations.ts` |
| CSRF | Cross-site API writes refused | `src/proxy.ts` |
| Logging | Append-only security event log (sign-ins, refusals, exports, deletions, uploads, rate limits), 180 days | `supabase/migrations/20260925090000_security_events.sql` |
| Data subject rights | Self-service export and complete erasure | `src/app/api/profile/export`, `src/app/api/auth/delete-account` |
| Transparency | Draft privacy notice at `/privacy`; `/.well-known/security.txt` | `src/app/(auth)/privacy/page.tsx` |
| Monitoring | Weekly read-only posture check with evidence-based verdicts | `scripts/security/posture-check.mjs` |
| Supply chain | CI type check, lint, tests, build and `npm audit`; CodeQL and Gitleaks; actions pinned to commit SHAs; edge imports pinned to tested versions | `.github/workflows/` |

## Open risks

The most important open items, all in [owner-actions.md](docs/security/owner-actions.md):

1. **OA-1.** The legacy database JWT signing secret is still accepted and must be
   retired (details shared privately with the owner).
2. **OA-3.** No database backups exist (Supabase Free plan).
3. **OA-8.** The PIA, cloud provider checklists and CITARS registration have not
   been submitted to ITSO, although the application is in use.
4. **OA-10.** Other students can see names, levels, the top-20 accuracy ranking,
   and (friends) per-component average scores.
5. **OA-13.** The speech provider (iFLYTEK) has no data processing agreement.

## Corrections to earlier versions of this file

- Earlier versions cited four ITSO URLs that no longer resolve; the register
  cites the current pages.
- Earlier versions said Supabase verifies the Better Auth JWKS. It does not;
  the edge functions verify the tokens.
- Earlier versions described controls from this branch as in force. Section
  "What is live" now separates them.
- The 2026-09-24 posture diary entries reported TLS-1 and ANON-3 as PASS using
  probes that could not fail; see
  [evidence/2026-09-25-deep-pass.md](docs/security/evidence/2026-09-25-deep-pass.md).

## Reporting a vulnerability

Report suspected vulnerabilities or incidents to HKUST ITSO at
`security@ust.hk` (also listed in `/.well-known/security.txt`). Please do not
open a public GitHub issue for a vulnerability. Questions about personal data go
to the University Data Privacy Officer at `ispdpo@ust.hk`.
