# Security incident runbook

For XiYouQuest's stack: Next.js on Vercel, Supabase Postgres, Storage and Edge
Functions, Better Auth with HKUST Microsoft Entra ID, iFLYTEK, and OpenRouter.
It follows HKUST ITSO's Cybersecurity Incident Handling Policy (report,
initial containment, impact assessment and recovery, review) and its
Escalation Procedure for Extensive / Widespread incidents.

ITSO defines an incident as a violation or imminent threat of violation of
security policies or standard practices, including leaks of high-risk data. A
personal data incident must also be reported to the University Data Privacy
Officer.

## 1. Detection sources

| Source | Catches | Where |
|---|---|---|
| Posture check v2 (weekly in CI, daily session Loop, ad hoc) | Privilege or RLS regressions (DB-1 to DB-5), stored plaintext tokens (DB-6), security-log tampering rights (DB-7), non-image objects in public buckets (DB-9), Auth settings (AUTH-1, AUTH-2), SSL enforcement and backups (PLAT-1, PLAT-2), edge rollbacks and boot failures (PLAT-3, EDGE-1), anonymous access (ANON-1 to ANON-4), headers, CSRF guard, TLS and database TLS | [posture-diary.md](posture-diary.md); CI job summary |
| Security event log (`public.security_events`, after OA-5) | Bursts of refused sign-ins, rate-limit refusals, unexpected exports or deletions | SQL editor as the database owner |
| CodeQL, Gitleaks, `npm audit` | Code vulnerabilities, committed secrets, vulnerable dependencies | GitHub Actions |
| Tests in CI | Regressions in route authentication, ownership scoping, rate-limit coverage, headers, CSRF guard | GitHub Actions |
| Supabase and Vercel dashboards | Traffic anomalies, error spikes, configuration changes | Provider consoles (logs kept 1 hour to 1 day on current plans) |
| Reports from users, ITSO or third parties | Anything else | `security@ust.hk`, `/.well-known/security.txt` |

## 2. Impact levels (ITSO)

| Level | ITSO description | Examples here |
|---|---|---|
| Extensive / Widespread | Unscheduled interruption of a critical service, or a severe breach with data loss, financial loss or reputational damage | Confirmed unauthorised read of student records; database compromise |
| Significant / Large | Disruption of teaching-related systems or compromise without student or staff records | XiYouQuest unavailable during a course's PSC practice period; an edge function compromised without data access |
| Moderate / Limited | A system found vulnerable or suspected compromised, with no confirmed damage | A posture FAIL on DB-2, DB-3 or ANON-*; an exposed credential with no evidence of use |
| Minor / Localised | Non-critical, localised, remote chance of harm | A single header regression; a failing CI scan on an unmerged branch |

Treat any privilege regression (DB-2, DB-3, ANON-*) that coincides with open
Supabase Auth sign-up (AUTH-1 WARN) as at least Moderate: that combination was
the exploitable state found on 2026-09-24.

## 3. Containment by class

### 3.1 Database privilege or RLS regression (DB-1 to DB-5, ANON-*)

1. Re-run `node scripts/security/posture-check.mjs --json` for the exact rows.
2. Re-apply `supabase/migrations/20260924090000_lockdown_client_roles.sql`
   (client roles) or `20260924091000_storage_server_only_writes.sql` (storage
   policies) in the SQL editor. Do not wait for a deployment.
3. If there is any sign the gap was used, rotate the service key (section 3.2).

### 3.2 Credential exposure (database keys, signing secrets, API keys)

1. Identify the credential's blast radius. The legacy HS256 JWT secret and the
   service key grant full database access; iFLYTEK and OpenRouter keys grant
   paid API use; `BETTER_AUTH_SECRET` signs sessions.
2. Rotate or revoke at the provider. For Supabase, move to the new API keys and
   revoke the legacy secret as in [owner-actions.md](owner-actions.md), OA-1.
   For `BETTER_AUTH_SECRET`, generate a new value in Vercel and redeploy; every
   session ends.
3. Update Vercel environment variables and edge secrets
   (`supabase secrets set --env-file ... --project-ref yfoifmqjhavxidomgids`),
   then redeploy.
4. A committed secret stays in git history: rotation is mandatory, history
   rewriting is optional and never a substitute.
5. Prefer the action that makes the exposure moot (rotation) over removing
   traces (deleting logs or transcripts).

### 3.3 Identity (Entra app, sign-in abuse)

1. A spike of `auth.sign_in_denied` events with `reason = tenant_not_allowed`
   or `id_token_verification_failed` indicates probing: record it; no action
   is needed unless a success follows.
2. If the Entra app registration may be compromised, ITSO owns it: report
   immediately and ask ITSO to rotate the client secret or restrict assignment.

### 3.4 Edge function abuse or failure (EDGE-1, PLAT-3, rate-limit bursts)

1. Check `rate_limit.exceeded` events for the bucket and user.
2. To stop a function at once: Supabase dashboard, Edge Functions, select the
   function, disable it. Or deploy a lower limit in both
   `src/lib/rate-limit.ts` and `supabase/functions/_shared/rate-limit.ts` (they
   must stay identical).
3. A PLAT-3 failure means a function was rolled back below the hardened
   release; redeploy from the branch or tag and re-run the posture check.

### 3.5 Header, TLS or CSRF-guard regression (HDR-*, TLS-*, CSRF-1)

Check Vercel's status page first. If the regression came with the last deploy,
use Vercel's instant rollback to the previous deployment, then fix forward.

## 4. Reporting

- **HKUST ITSO:** `security@ust.hk`, ITSO help line +852 2358 6200, or the
  Service Desk. Report promptly; contain in parallel. Do not wait for the
  investigation to finish.
- **University Data Privacy Officer:** for any actual or suspected
  unauthorised access to personal data (any store in
  [data-register.md](data-register.md)), in addition to ITSO: `ispdpo@ust.hk`
  and the Data Privacy Office's incident reporting page on `dataprivacy.ust.hk`.
- **Repository owner and maintainer:** in parallel, so containment can run.
- **Extensive / Widespread:** ITSO escalates to university management within
  24 hours of confirmation. Preserve all logs and hand evidence to ITSO as
  requested; do not alter affected systems beyond containment.

A draft report for the credential issue tracked as OA-1 is held privately
by the maintainer for the owner.

## 5. Evidence preservation

- Before changing state, snapshot the relevant catalog metadata (ACLs,
  policies, settings) with read-only queries, as in
  `evidence/2026-09-24-prod-lockdown.md`.
- Export the provider log window at once: Supabase keeps logs for 1 day and
  Vercel for 1 hour to 1 day on the current plans.
- Export the relevant `security_events` rows (database owner).
- Never read student row content to build evidence; metadata and counts are
  enough, and keep the evidence itself out of personal-data scope.
- Record everything in `evidence/<date>-<short-name>.md`.

## 6. Review and closure

For Significant or Extensive incidents, write a review with ITSO: what
happened, remedial actions, impact, and longer-term actions. Append a dated
entry to [posture-diary.md](posture-diary.md) with the posture run that shows
the control restored. An incident is closed when the posture rows PASS again,
evidence is preserved, and the required reports (section 4) have been sent.
