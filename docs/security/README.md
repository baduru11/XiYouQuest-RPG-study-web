# Security posture: Goal, Loop, Diary, Verify

This procedure keeps the controls in [../../SECURITY.md](../../SECURITY.md) and
the [requirement register](itso-requirement-register.md) true in production,
and records every check so an ITSO or audit request can be answered from
evidence rather than memory.

- **Goal:** every row of the posture check is PASS, except rows waiting on a
  named owner action ([owner-actions.md](owner-actions.md)), which are WARN
  until that action is done.
- **Loop:** the read-only posture check below, run weekly in CI and daily by a
  local scheduled session during the hardening period.
- **Diary:** each run appends a dated entry: the CI job summary and artifact,
  the local Loop diary, and, for runs worth keeping, this repository's
  [posture-diary.md](posture-diary.md) (append-only; corrections are new
  entries).
- **Verify:** a FAIL is treated as an incident
  ([incident-runbook.md](incident-runbook.md)); a WARN that clears is checked
  off in owner-actions.md.

## The posture check (v2)

`scripts/security/posture-check.mjs` gathers evidence;
`scripts/security/posture-lib.mjs` decides what it proves (unit tests with
negative controls in `src/security/posture-lib.test.ts`);
`scripts/security/posture-probes.mjs` holds the network probes. It never writes
to the database, never reads a student row (catalog metadata, aggregate counts,
headers, TLS handshakes and anonymous requests only) and never prints a secret.

A PASS requires positive evidence. v1 reported PASS for two probes that could
not fail (a TLS 1.1 offer refused by Node's own OpenSSL, and an RPC call whose
signature did not match); v2 returns SKIP or WARN when a probe proves nothing.

| ID | Control | Evidence required for PASS |
|---|---|---|
| DB-1 | RLS enabled on every public table | Catalog count 0 |
| DB-2 | No anon/authenticated privilege on any table, view, partition, foreign table or column (public, better_auth) | Catalog count 0 |
| DB-3 | No anon/authenticated EXECUTE on public functions | Catalog count 0 |
| DB-4 | SECURITY DEFINER functions pin `search_path` | Catalog count 0 |
| DB-5 | No client-role storage policies | Catalog count 0 |
| DB-6 | No plaintext OAuth tokens stored | Catalog count 0 |
| DB-7 | Security log append-only for the service key | `service_role` holds no table privilege (WARN until OA-5) |
| DB-8 | chat-images bucket limited to raster types | Bucket MIME allowlist set (WARN until OA-5) |
| DB-9 | No non-image objects in public buckets | Catalog count 0 |
| AUTH-1 | Supabase Auth sign-up closed | Auth config (WARN until OA-2) |
| AUTH-2 | Legacy HS256 secret no longer accepted | Signing-key status (WARN until OA-1) |
| PLAT-1 | Database SSL enforcement on | Platform setting (WARN until OA-4) |
| PLAT-2 | Backups exist | Backups list or PITR (WARN until OA-3) |
| PLAT-3 | No edge function below the hardened release | Versions >= `edge-manifest.json` |
| ANON-1, ANON-2 | Anonymous table reads refused | HTTP 401/403, not an empty 200 |
| ANON-3 | Anonymous RPC refused by privilege | Full 12-argument call answered 401/403 with SQLSTATE 42501 |
| ANON-4 | Anonymous bucket listing empty | No objects returned |
| EDGE-1 | Every edge function boots and refuses anonymous calls | HTTP 401 from all functions |
| WEB-0, HDR-1 to HDR-6 | App reachable; CSP nonce, framing, HSTS, nosniff, referrer, permissions headers | Headers present on `/login` |
| DEPLOY-1 | Hardened release live | `/.well-known/security.txt` served (WARN until OA-6) |
| CSRF-1 | Cross-site API write refused | HTTP 403 before authentication |
| TLS-1 | TLS 1.0/1.1 refused | The server's protocol-version alert to a real TLS 1.1 offer |
| TLS-2 | Modern TLS with a valid certificate | Completed TLS 1.2+ handshake |
| TLS-3 | 3DES refused | Server refusal (SKIP when the runtime cannot offer 3DES) |
| DBTLS-1 | Database pooler certificate chain verifies against the pinned CA | Postgres SSLRequest, then a verified TLS handshake |

### Running it

```bash
node scripts/security/posture-check.mjs
```

| Variable | Purpose | Default |
|---|---|---|
| `SUPABASE_ACCESS_TOKEN` | Management API token for DB, AUTH and PLAT rows | none: those rows SKIP |
| `SUPABASE_ANON_KEY` | Anon or publishable key for ANON rows | none: ANON rows SKIP |
| `SUPABASE_PROJECT_REF` | Project | `yfoifmqjhavxidomgids` |
| `APP_URL` | App origin | `https://cle-xyq.hkust.edu.hk` |
| `POSTURE_DB_HOST` | Pooler host for DBTLS-1 | `aws-1-ap-south-1.pooler.supabase.com` |

Flags: `--json`; `--diary <file>` appends the Markdown entry; `--strict` also
fails on WARN (use it once every owner action is closed). Exit code 1 on any
FAIL.

The Management API token can execute SQL on production. Keep it out of
repository secrets that any branch can use: CI reads it from the protected
GitHub Environment `security-posture` (OA-7).

## Weekly CI Loop

`.github/workflows/posture.yml` runs every Monday 01:17 UTC (09:17 HKT) and on
demand, in the `security-posture` environment, fails on any FAIL, writes the
entry to the job summary and keeps it as a 90-day artifact. Without the
environment's secrets it still covers the anonymous, edge, web and TLS rows.
CodeQL and Gitleaks run on every push and PR (`.github/workflows/security.yml`).

## Local session Loop (hardening period)

A local scheduled task (`xyq-security-posture-loop`) runs daily at 09:17 HKT
(the scheduler adds up to about 13 minutes of jitter) while the Claude desktop
app is open, or at the next launch if it was closed, from 2026-09-25 to 2026-10-09. Its full,
self-contained prompt is in [loop-prompt.md](loop-prompt.md). Each run is
read-only apart from its diary file: it runs the posture check, compares it with
the previous run, checks the hardening PR and the production deployment, and
records evidence, the change since the last run, remaining uncertainty and one
next action. It stops when the check passes in strict mode or the expiry date
passes.

## Cadence and stop rules

- Weekly in CI, daily locally until 2026-10-09, and after any change to grants,
  RLS, storage policies, Auth settings, `src/proxy.ts`, `next.config.ts`,
  `src/lib/auth.ts`, `src/lib/db-tls.ts` or the edge functions.
- Do not re-run to "clear" a known WARN; the diary already shows it. Re-run
  after a change.
- Incident response triggered by a FAIL has its own stop criteria in the
  runbook.
