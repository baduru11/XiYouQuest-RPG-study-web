# Security incident runbook

This runbook is specific to XiYouQuest's stack: Next.js on Vercel, Supabase
Postgres/Storage/Edge Functions, Better Auth (HKUST Entra ID), iFlytek, and
OpenRouter. It is invoked whenever `docs/security/README.md`'s posture check
reports a `FAIL`, or any other detection source below indicates a real or
suspected security incident.

## 1. Detection sources

| Source | What it catches | Where to look |
|---|---|---|
| `scripts/security/posture-check.mjs` (weekly + ad hoc) | RLS/GRANT regression, storage policy regression, plaintext token reappearance, sign-up reopened, missing security headers, weak TLS | `docs/security/posture-diary.md` |
| CodeQL (`.github/workflows/security.yml`) | New code-level vulnerability (injection, unsafe deserialization, etc.) | GitHub Security tab, on every push/PR and weekly |
| Gitleaks (`.github/workflows/security.yml`) | Committed secret | GitHub Actions run log, on every push/PR |
| `npm audit --omit=dev --audit-level=high` (`.github/workflows/ci.yml`) | High/critical dependency CVE in production dependencies | CI run log, on every push/PR |
| `src/app/api/authz-matrix.test.ts`, `src/app/api/authz-cross-user.test.ts`, `src/proxy.headers.test.ts`, `src/lib/rate-limit.test.ts` (CI `npm test`) | Regression in per-route auth, ownership scoping, security headers, or rate-limit wiring, caught before merge | CI run log |
| Supabase platform logs (Dashboard → Logs) | Anomalous query volume, repeated 401/403, auth config changes | Supabase Dashboard (not automated in this repo) |
| Vercel deployment/runtime logs | 5xx spikes, unexpected env var changes | Vercel Dashboard |
| A report from a user, HKUST ITSO, or a third party | Anything not caught above | `security@ust.hk`, repository maintainer |

## 2. Severity

| Severity | Definition | Example |
|---|---|---|
| **Critical** | Confirmed unauthorized access to personal data, or a live path for it | A posture-check DB-2/DB-3 `FAIL` while Supabase Auth sign-up is open (AUTH-1 `WARN` or worse) — a self-registered principal can now read data |
| **High** | A control is broken but exploitation is not confirmed, or exposure is bounded | A single posture-check `FAIL` (e.g., HDR-1 CSP regression) with no evidence of active exploitation |
| **Medium** | A gap that increases risk but requires another failure to be exploitable | AUTH-1 `WARN` alone (sign-up open, but zero privileges — current accepted state per `SECURITY.md` §7.1) |
| **Low** | Hygiene/process gap, no direct exposure | Missing SOC2 report on file for a processor (`docs/security/data-register.md` §4) |

Escalate to Critical immediately if **any** database-privilege control (DB-2,
DB-3, DB-5) fails *at the same time* Supabase Auth sign-up is open (AUTH-1 is
`WARN` or `FAIL`) — that combination is exactly the 2026-09-24 pre-lockdown state
documented in `docs/security/evidence/2026-09-24-prod-lockdown.md`, and it is
known to be exploitable.

## 3. Containment steps, by control class

### 3.1 Database privilege / RLS regression (DB-1..DB-6 FAIL)

1. Re-run `node scripts/security/posture-check.mjs --json` to get the exact
   violating tables/functions.
2. If `anon` or `authenticated` regained table/function privileges: re-apply
   `supabase/migrations/20260924090000_lockdown_client_roles.sql` (or the
   equivalent `REVOKE`) directly via the Supabase SQL editor or Management API —
   do not wait for a full migration deploy cycle during active containment.
3. If a storage policy reappeared: re-apply
   `supabase/migrations/20260924091000_storage_server_only_writes.sql`'s `DROP
   POLICY` statements.
4. If a plaintext OAuth token reappeared (DB-6): confirm
   `encryptOAuthTokens: true` is actually deployed (`src/lib/auth.ts`), then
   re-run the purge (`supabase/migrations/20260924103000_purge_stored_oauth_tokens.sql`
   pattern) against current rows.
5. Rotate the **Supabase service-role key** (Dashboard → Project Settings → API)
   if there is any indication the exposure was actually used, not merely
   present — a regressed GRANT with no matching traffic anomaly in Supabase logs
   does not by itself require a key rotation, but err toward rotating if in
   doubt.
6. Update every Vercel environment (`SUPABASE_SERVICE_ROLE_KEY`) with the
   rotated key and redeploy.

### 3.2 Auth / identity compromise

1. If `BETTER_AUTH_SECRET` may be exposed (leaked in a log, a Gitleaks hit, a
   compromised CI runner): generate a new one (`openssl rand -base64 32`), set it
   in Vercel, and redeploy. This invalidates **all** existing sessions and
   encrypted OAuth tokens (`account.encryptOAuthTokens` is keyed on this secret)
   — treat it as a full session reset, not a silent rotation.
2. If the HKUST Entra app registration (`HKUST_XYQ_CLIENT_ID` /
   `HKUST_XYQ_CLIENT_SECRET`) may be compromised: rotate the client secret in the
   Entra app registration (coordinate with HKUST ITSO/IT, since this is an
   institutional Entra app, not one this repository's maintainer solely owns),
   then update the Vercel env vars.
3. If Supabase Auth (the legacy, dormant system) shows sign-in activity from the
   2 legacy accounts or any new self-registered account with any data access:
   treat as Critical per §2, disable Supabase Auth sign-up and all providers
   immediately (requires organization Owner/Admin — see `SECURITY.md` §7.1), and
   escalate to a data-privacy incident per §5 if any personal data was read.

### 3.3 Environment / secret exposure (Vercel, Gitleaks hit)

1. Identify the exposed secret's blast radius from `src/lib/env.ts`'s accessor
   list (`IFLYTEK_*`, `OPENROUTER_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
   `NEXT_PUBLIC_SUPABASE_*` — the `NEXT_PUBLIC_*` values are not secrets by
   design and do not need rotation).
2. Rotate the specific credential at its provider (Supabase, iFlytek console,
   OpenRouter dashboard) — never rotate broadly "just in case" beyond the
   identified scope, since an unrelated rotation can itself cause an outage.
3. Update the corresponding Vercel environment variable(s) and redeploy.
4. If the exposure was a **committed** secret (Gitleaks hit), treat the value as
   permanently compromised even after removal from the working tree (it remains
   in git history) — rotation is mandatory, history-scrubbing is optional and
   does not substitute for rotation.

### 3.4 Edge function / rate-limit abuse

1. Confirm via `src/lib/rate-limit.test.ts`'s coverage list which edge functions
   enforce `enforceRateLimit` and which bucket.
2. If a specific bucket is being abused (cost exhaustion on iFlytek/OpenRouter):
   tighten the relevant limit in `src/lib/rate-limit.ts` **and** its edge twin
   `supabase/functions/_shared/rate-limit.ts` — they must stay identical
   (enforced by `src/lib/rate-limit.test.ts`) or the Next.js and edge paths for
   the same feature diverge.
3. As an immediate stopgap while a code fix deploys, an edge function can be
   disabled directly in the Supabase Dashboard (Edge Functions → the specific
   function → disable), which stops that attack surface without a full
   deployment.
4. Re-enable only after the rate-limit fix is deployed and verified.

### 3.5 Header / TLS regression (HDR-\*, TLS-\* FAIL)

1. Confirm the regression is in the app's own config (`next.config.ts`,
   `src/proxy.ts`) rather than a Vercel platform incident — check Vercel's status
   page first.
2. If app-side: the change is almost certainly in the last deploy; roll back to
   the previous Vercel deployment while a fix is prepared, rather than leaving a
   degraded security header set live.

## 4. Reporting

- **HKUST ITSO Service Desk:** `security@ust.hk`, +852 2358 6200. Report any
  confirmed or suspected security incident affecting this application.
- **University Data Privacy Officer:** required **in addition to** ITSO for any
  incident involving actual or suspected unauthorized access to, or disclosure
  of, personal data (any row in `docs/security/data-register.md` §2) —
  contact through the HKUST Data Privacy Officer's designated channel per HKUST
  policy (not independently re-verified as part of this repository; consult the
  ITSO/university privacy office contact page directly rather than relying on a
  contact address cached here).
- **Repository maintainer:** notify in parallel so the containment steps in §3
  can be executed against the actual deployment (`admin@meliedu.com` /
  EricEremos).
- **Contain first, report as soon as containment is underway** — do not delay
  the `security@ust.hk` report to finish a full investigation; ITSO's own
  guidance is to report promptly and contain in parallel.

## 5. Evidence preservation

- Before applying any containment step that changes state (revoking a grant,
  rotating a key, disabling a function), capture a snapshot the way
  `docs/security/evidence/2026-09-24-prod-lockdown.md` did: the exact
  table/function ACLs, auth config, or header values *before* the change, via
  read-only Management API / SQL queries. Write it to
  `docs/security/evidence/<date>-<short-description>.md` following that file's
  format (findings verified live, changes applied, verification after the
  change, rollback snapshot).
- Never read student row content as part of evidence capture — catalog metadata
  and aggregate counts are sufficient (`docs/security/evidence/2026-09-24-prod-lockdown.md`
  explicitly notes "No student rows were read"); preserve that constraint for
  every future incident, both for privacy and to keep the evidence itself out of
  PDPO scope.
- Preserve the relevant Supabase/Vercel log window (export or screenshot) before
  it rotates out of the platform's retention window, if the incident involves
  suspected active exploitation.

## 6. Post-incident diary entry

After containment and before closing the incident, append an entry to
`docs/security/posture-diary.md` (or a new dated file under
`docs/security/evidence/` for anything beyond a routine posture-check run)
recording:

- What regressed or was exploited, and since when (if determinable).
- The containment action taken and when.
- The `posture-check.mjs` run confirming the control is restored (PASS).
- Any owner action now required as a result (add to `SECURITY.md` §7 if new).
- Whether `security@ust.hk` / the Data Privacy Officer were notified, and when.

## 7. Stop / escalation

- **Stop condition:** the incident is closed when the relevant posture-check
  control(s) show `PASS` in a fresh run, evidence is preserved per §5, and (for
  any personal-data-involving incident) the required external reports in §4 have
  been sent.
- **Escalate to HKUST ITSO immediately, do not attempt to resolve alone,** if the
  incident involves: suspected compromise of the Entra app registration itself
  (not just this app's secrets), a legal/regulatory notification obligation under
  the PDPO, or any uncertainty about whether personal data was actually accessed
  by an unauthorized party — that judgment belongs to ITSO and the Data Privacy
  Officer, not to this repository's maintainer alone.
