# Security posture: operating procedure

This is the Goal → Loop → Diary → Verify procedure for XiYouQuest's security
posture. It exists so the control matrix in [../../SECURITY.md](../../SECURITY.md)
stays a statement of *checked* fact, not a statement of intent.

## Goal

Keep the controls in `SECURITY.md` §3–§6 true in the live Supabase project and
the live Vercel deployment, continuously, not only at the moment they were first
implemented. A control that regresses (a re-granted table privilege, a dropped
security header, an expired TLS config) must be caught within one week and shown
in `docs/security/posture-diary.md`.

## Loop: `scripts/security/posture-check.mjs`

The posture check is a **read-only** probe. It never writes to the database, never
reads a student row (only catalog metadata, aggregate counts, and HTTP response
headers), and never prints a secret. Every check either fails closed (`FAIL`
blocks a false PASS) or degrades to `SKIP` when its required input is absent — it
never silently reports PASS for a check it could not actually run.

### What it checks

| ID | Control | Source |
|---|---|---|
| DB-1 | RLS enabled on every `public` table | Supabase Management API `database/query` |
| DB-2 | No `anon`/`authenticated` table privilege | same |
| DB-3 | No `anon`/`authenticated` function EXECUTE | same |
| DB-4 | `SECURITY DEFINER` functions pin `search_path` | same |
| DB-5 | No client-role storage policies | same |
| DB-6 | No plaintext OAuth tokens in `better_auth.account` | same |
| AUTH-1 | Supabase Auth sign-up / social providers disabled | Management API `config/auth` |
| ANON-1..3 | Anonymous PostgREST reads/RPC calls are refused | live PostgREST requests with the public anon key |
| HDR-0..6 | App reachable; CSP nonce, framing, HSTS, MIME-sniff, referrer, permissions headers | live HTTP request to `${APP_URL}/login` |
| TLS-1/2 | Legacy TLS (1.0/1.1) refused; modern TLS succeeds | raw TLS handshake against the app host |

### Running it locally

```bash
node scripts/security/posture-check.mjs
```

Env vars (all optional — a missing one turns its checks into `SKIP`, not a false
`PASS`):

| Var | Purpose | Default |
|---|---|---|
| `SUPABASE_ACCESS_TOKEN` | Management API token for the DB-\* and AUTH-1 checks | none (those checks `SKIP`) |
| `SUPABASE_PROJECT_REF` | Supabase project ref | `yfoifmqjhavxidomgids` |
| `SUPABASE_ANON_KEY` | Public anon key, for the ANON-\* refusal probes | none (those checks `SKIP`) |
| `APP_URL` | App origin for the HDR-\* and TLS-\* checks | `https://cle-xyq.hkust.edu.hk` |

`SUPABASE_ACCESS_TOKEN` only needs read access to the target project's Management
API (catalog queries and the auth config read); it does not need to be an
organization-owide token. Scope it to the minimum the Management API allows.

Flags:

- `--json` — machine-readable output instead of the Markdown table.
- `--diary <file>` — append a dated Markdown entry to `<file>` (this is how
  `docs/security/posture-diary.md` is written; see below).

Exit code: **1** if any check reports `FAIL`, else **0**. A `WARN` or `SKIP` does
not fail the run — `WARN` is a known, accepted residual (for example AUTH-1: sign-up
is open but the signed-up principal holds zero privileges, per
`SECURITY.md` §7.1); `SKIP` means the check could not run, which is itself worth
noticing but is not treated as a regression.

### Diary

Every run that supplies `--diary docs/security/posture-diary.md` appends one
dated section (stamp, target, PASS/FAIL/WARN/SKIP counts, and the full per-check
table) to that file. The diary is **append-only** — never edit or delete a past
entry; a correction is a new entry. This gives a chronological record of when a
control regressed and when it was fixed, which is what an ITSO or auditor request
for evidence actually needs.

## Weekly CI schedule

`.github/workflows/security.yml` runs CodeQL and Gitleaks on every push, PR, and
weekly. The Loop itself is `.github/workflows/posture.yml`: every Monday 01:17 UTC
(09:17 HKT) and on manual dispatch it runs `scripts/security/posture-check.mjs`
read-only, fails the job on any FAIL (exit code 1), writes the diary entry to the
job summary, and keeps it as a 90-day artifact (`posture-diary-<run id>`). CI does
not push to the repository; entries worth keeping in the canonical
`docs/security/posture-diary.md` are appended by the operator after review, which
keeps the workflow at `contents: read`.

Before this workflow can run with full coverage (not `SKIP` on DB-\* and AUTH-1),
two repository secrets must be set (owner action, tracked in `SECURITY.md` §7.7):

- `SUPABASE_ACCESS_TOKEN` — scoped as narrowly as the Supabase Management API
  permits for this project.
- `SUPABASE_ANON_KEY` — the public anon key (not a secret by design, but kept as
  a CI secret so it is not hardcoded in the workflow file).

Until those secrets exist, a scheduled run will still execute and still catch
HDR-\*/TLS-\*/ANON-\* regressions (which need no Supabase Management API access),
just not the DB-\*/AUTH-1 rows.

## What a FAIL triggers

A `FAIL` in the posture check means a previously-verified control has regressed
in production — treat it as a security incident, not a housekeeping item:

1. Read the failing row's `Detail` column and the diary entry.
2. Open [docs/security/incident-runbook.md](docs/security/incident-runbook.md) and
   follow the containment steps for the affected control class (DB-\* → database
   role/RLS regression; AUTH-1 escalating from `WARN` to something worse →
   Supabase Auth config; HDR-\*/TLS-\* → deployment/edge config).
2. Do not wait for the next scheduled run to confirm a fix — re-run
   `posture-check.mjs` locally (or via `workflow_dispatch`) immediately after
   applying the fix, and append that run to the diary too, so the diary shows
   both the regression and the resolution.
3. File the incident per `docs/security/incident-runbook.md`'s reporting section
   if the FAIL indicates actual (not merely potential) unauthorized access —
   report to `security@ust.hk` and, for any personal-data exposure, the
   University Data Privacy Officer.

A `WARN` (currently only AUTH-1) does not trigger the incident runbook by itself;
it is a tracked, accepted residual until the corresponding owner action in
`SECURITY.md` §7 is completed. If a `WARN` control's context changes (for example,
DB-2/DB-3 ever go from `PASS` back to `FAIL` while AUTH-1 is still `WARN`), the
combination is now a real exposure and must be treated as a `FAIL`-level incident,
not two independent warnings.

## Cadence and stop rules

- **Cadence:** weekly, via the CI schedule above, plus an ad hoc run after any
  change to RLS policies, table/function GRANTs, storage policies, the Supabase
  Auth config, `src/proxy.ts`, `next.config.ts`, or `src/lib/auth.ts`.
- **Stop rule for the Loop itself:** the posture check is unconditionally
  read-only and bounded (each HTTP/TLS probe has a fixed timeout); it does not
  need a run-count or expiry stop condition the way an open-ended agentic loop
  would. The thing that *does* need a stop condition is incident response
  triggered by a FAIL — see the runbook's own stop/escalation criteria.
- **Do not loop on a WARN.** Re-running the posture check repeatedly to "clear" a
  known, owner-action-pending WARN produces no new evidence; the diary already
  shows it. Only re-run after an actual change (a fix landed, a schedule tick, or
  a suspected regression).
