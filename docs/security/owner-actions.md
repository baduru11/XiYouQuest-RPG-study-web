# Owner actions

Gaps that only an account owner, the repository owner, or HKUST can close. Each
action names its owner, a proposed due date, the exact steps, and the posture
check row that proves it done (`node scripts/security/posture-check.mjs`; see
[README.md](README.md)). Due dates are proposals from 2026-09-25 until the
owners confirm them.

Roles used below:

- **Supabase org owner**: an Owner/Admin of "baduru11's Org" (the maintainer
  account gets HTTP 403 on these settings).
- **Vercel XYQ member**: a member of the Vercel team `xyq`.
- **Repository owner**: `baduru11` (the only account that can merge upstream).
- **Maintainer**: the developer running this hardening work.
- **Responsible unit**: the HKUST department that operates XiYouQuest and acts
  as data user; not yet confirmed in writing (OA-14).
- **DPO**: University Data Privacy Officer, `ispdpo@ust.hk`.

| ID | Action | Owner | Due | Verified by |
|---|---|---|---|---|
| OA-1 | Retire the legacy JWT secret and legacy API keys | Supabase org owner + Vercel XYQ member | Done 2026-09-26 | AUTH-2 |
| OA-2 | Close Supabase Auth sign-up and providers | Supabase org owner | Done 2026-09-25 | AUTH-1 |
| OA-3 | Arrange database backups (plan decision) | Responsible unit + Supabase org owner | 2026-10-09 | PLAT-2 |
| OA-4 | Enforce TLS on database connections | Supabase org owner | Done 2026-09-25 | PLAT-1 |
| OA-5 | Apply the two pending migrations | Supabase org owner or maintainer with approval | Done 2026-09-25 | DB-7, DB-8 |
| OA-6 | Review, merge and deploy the hardening PR | Repository owner + Vercel XYQ member | Done 2026-09-25 | DEPLOY-1, CSRF-1 |
| OA-7 | Protect CI secrets and repository settings | Repository owner | 2026-10-02 | Workflow run |
| OA-8 | ITSO submissions (PIA, CSP checklists, CITARS, health check) | Responsible unit + maintainer | See below | Register rows |
| OA-9 | Privileged-account inventory and MFA | All account owners | 2026-10-02 | submissions/privileged-accounts.md |
| OA-10 | Decide what other students may see | Responsible unit + DPO | 2026-10-16 | PIA Part 4 |
| OA-11 | Decide on implicit account linking | Responsible unit, after asking ITSO | 2026-10-16 | Register ADG-1 |
| OA-12 | Secure every maintainer computer | Each maintainer | 2026-09-26 | Register END rows |
| OA-13 | Processor contracts and assurance reports | Responsible unit | 2026-10-16 | csp-checklists.md |
| OA-14 | Name the data user; approve retention; legacy accounts | Responsible unit + DPO | 2026-10-09 | PIA Part 1 |
| OA-15 | Remove the unused GraphQL API schema | Supabase org owner | Done 2026-09-26 | Register ADG-5 |
| OA-16 | Give the auth pool a least-privilege database role | Supabase org owner + Vercel XYQ member | Done 2026-09-26 | Register MSS-SAAS-6 |

---

## OA-1: Retire the legacy JWT secret and legacy API keys

**Done 2026-09-26**, in this order, each step verified before the next:

1. An owner ran `scripts/security/rotate-app-credentials.sh`, which copied the
   project's `default` secret and publishable keys into Vercel
   (`SUPABASE_SECRET_KEY`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, Production and
   Preview) without printing them. The maintainer never handled a key value.
2. The web app was redeployed. The edge functions were redeployed with a helper
   that reads the keys Supabase injects into every function
   (`SUPABASE_SECRET_KEYS`, `SUPABASE_PUBLISHABLE_KEYS`), so no edge secret had
   to be copied. Minimum versions are in `scripts/security/edge-manifest.json`.
3. The legacy `anon` and `service_role` keys were disabled (reversible). About
   a minute later the gateway refused the legacy anon key ("Legacy API keys are
   disabled") while the publishable key still reached the database.
4. The owner signed in and used practice, companion chat and the profile page;
   production logs showed no error or 5xx for that session.
5. The legacy HS256 signing key was revoked (irreversible), after checking that
   the ES256 key was in use. Posture AUTH-2 reports PASS ("no HS256 key
   accepted").

Why it mattered: anyone holding the legacy secret could mint a `service_role`
token with full database access. The background is recorded privately; the
maintainer gives it to the owner directly.

The weekly CI posture job should use the publishable key as its
`SUPABASE_ANON_KEY` secret when OA-7 creates it. The legacy anon key is now
refused, and the posture check reports that as WARN, not PASS.

**Report.** A draft incident report for ITSO is held privately by the
maintainer for the owner. Sending it is the responsible unit's decision.

## OA-2: Close Supabase Auth sign-up and providers

Supabase's built-in Auth is unused (identity is HKUST SSO through Better Auth),
but sign-up is open with Email, Google and Discord enabled, no CAPTCHA and a
6-character minimum password. A self-registered account currently holds no
privilege (posture DB-2, DB-3), so this is a residual risk, not an open door.

**Done 2026-09-25.** The maintainer, an organisation Administrator since that
day, set `disable_signup` and turned the Email, Google and Discord providers
off through the Management API's auth configuration, and read the four flags
back. Posture AUTH-1 reports PASS (closed).

For another environment: Supabase dashboard, Authentication, Sign In /
Providers. Turn off "Allow new users to sign up", then disable the Email,
Google and Discord providers. Posture AUTH-1 must report PASS.

## OA-3: Arrange database backups

The organisation is on Supabase's Free plan: no backups exist, point-in-time
recovery is off, logs are kept for one day, and the project pauses after a
week without traffic. HKUST MSS for application systems requires regular
backups for High-risk systems.

Options for the responsible unit:

- **Supabase Pro** (from US$25/month): daily backups kept 7 days; point-in-time
  recovery is an add-on (US$100/month per 7 days). Does not include the SOC 2
  report (see OA-13).
- **Supabase Team** (from US$599/month): daily backups kept 14 days, 28-day
  logs, and access to the SOC 2 Type 2 and ISO 27001 reports needed for the CSP
  checklist.
- **Scheduled logical backups** to HKUST OneDrive (the only public cloud ITSO
  allows for High Risk data), encrypted, with a documented restore test.

Posture PLAT-2 must report PASS once backups exist.

## OA-4: Enforce TLS on database connections

**Done 2026-09-25**, after the release went live. Before enforcing, the
database's only plaintext connections were Supabase's own services (pooler,
Storage, metrics exporter), which the setting does not govern; the app's pool
already verified the pinned CA. The maintainer enforced it through the
Management API; `/api/auth/jwks`, which the app serves from the database
through that pool, still answered, and posture PLAT-1 reports PASS (enforced).
To roll back, turn the setting off in Database, Settings, SSL Configuration.

Background: until then Supabase accepted unencrypted database connections.
The hardening release makes the Better Auth pool verify Supabase's CA (posture
DBTLS-1), which is what made enforcement safe.

## OA-5: Apply the two pending migrations

**Done 2026-09-25.** The maintainer applied both files unchanged through the
Management API, with the owner's approval. Checks before applying: neither
object existed, and all 82 chat images were PNG.

Checks after applying:

- `security_events` has RLS on and no table privilege for any app role;
- both functions are SECURITY DEFINER with a pinned `search_path`, and only
  `service_role` may execute them;
- `chat-images` accepts only PNG, JPEG, GIF and WebP.

The ledger rows below were then recorded. The posture check at
2026-09-25T04:42:51Z reports DB-7 and DB-8 PASS. The steps are kept for
rebuilding another environment.

- `supabase/migrations/20260925090000_security_events.sql`: the append-only
  security event log.
- `supabase/migrations/20260925091000_chat_images_mime_allowlist.sql`: raster
  types only for the public chat-images bucket.

Apply each file's contents in the Supabase SQL editor. Do not run
`supabase db push`: the repository's early migrations are not all recorded in
the production ledger, and a push could replay them. After confirming the
objects exist (posture DB-7 and DB-8 report PASS), record the ledger rows:

```sql
insert into supabase_migrations.schema_migrations (version, name)
values ('20260925090000', 'security_events'),
       ('20260925091000', 'chat_images_mime_allowlist');
```

The application works without these migrations (logging fails soft), but the
security log records nothing until the first one is applied.

## OA-6: Review, merge and deploy the hardening PR

**Done 2026-09-25.** Pull request #9 was merged as `6ba5ef7` at 06:08Z, after
the repository owner made the maintainer a collaborator, and Vercel deployed
it from `main` within the minute. Before merging, a Vercel preview build of
the final head was made from the command line and passed; the preview build
of 2026-09-24 had failed because `.vercelignore` excluded directories that
the type check imports (fixed in the last commit, with a test). After the
deployment: `/privacy` 200, `/.well-known/security.txt` served, the
cross-site guards answer 403, `/api/auth/jwks` answers from the database, and
posture DEPLOY-1 and CSRF-1 report PASS.

Background: production had served upstream `main` from 2026-09-05. Vercel
asks a team member to approve each commit of a fork PR before it builds a
preview; the approval is not needed to merge.

## OA-7: Protect CI secrets and repository settings

On `baduru11/XiYouQuest-RPG-study-web`, Settings:

1. Environments, New environment, name `security-posture`. Deployment
   branches: `main` only. Required reviewers: the repository owner. Add the
   secrets `SUPABASE_ACCESS_TOKEN` and `SUPABASE_ANON_KEY`. The Management API
   token can run SQL against production, so use an account that is a member
   of this project only, never an account-wide personal token.
2. Code security: enable Dependabot alerts, secret scanning and push
   protection.
3. Branches: protect `main` (require a pull request and the CI workflow).

## OA-8: ITSO submissions

| Item | Draft | Send to | Due |
|---|---|---|---|
| Personal Data Privacy Impact Assessment | [pia-draft.md](pia-draft.md) | `seccomp@ust.hk` | 2026-10-09 (already required before publication) |
| Cloud service provider checklists | [csp-checklists.md](csp-checklists.md) | ITSO Cybersecurity Team, endorsed by the IT Security Officer or Head of Department | 2026-10-16 |
| CITARS registration | [submissions/citars-record.md](submissions/citars-record.md) | Departmental Cybersecurity Coordinator enters it | 2026-10-09 |
| Application health check (Coverity + Acunetix) | [submissions/health-check-request.md](submissions/health-check-request.md) | `webscan@ust.hk` | 2026-10-09; fix High findings within 28 days |
| Adoption of new technologies (AI processing) | [submissions/new-technology-notice.md](submissions/new-technology-notice.md) | ITSO | 2026-10-09 |
| Deviations needing ITSO acceptance | Register rows marked "Deviation" | ITSO exception request (`cchelp@ust.hk`) | 2026-10-16 |

Nothing has been sent. Each item is a draft for the responsible unit.

## OA-9: Privileged-account inventory and MFA

Fill in [submissions/privileged-accounts.md](submissions/privileged-accounts.md):
every administrator of Supabase, Vercel, GitHub, the iFLYTEK console,
OpenRouter and the Entra app registration, whether MFA is on, and why each
person needs the access. Remove accounts that are not needed. ITSO's
privileged-account practice requires 90-day password changes where MFA is
not available.

Also rotate the database owner (`postgres`) password in Supabase, Project
Settings, Database. The app stopped using it on 2026-09-26 (OA-16), but it sat
in the Vercel environment for months and is still valid. Tell other maintainers
first, in case a local tool of theirs uses it.

## OA-10: Decide what other students may see

Any signed-in student can find others by name and see level, avatar and
friend code; the global leaderboard shows the top 20 by XP, accuracy or
streak under real names; friends see per-component average practice scores.
HKUST's data classification treats assessment-related personal data as
Sensitive (high protection), which should not be disclosed even within a
workgroup. Options: opt-in visibility, pseudonymous display names by default,
or removing the accuracy ranking and friends' score view. Record the decision
in the PIA.

## OA-11: Decide on implicit account linking

Better Auth links a new HKUST sign-in to an existing account with the same
email address. If HKUST ever reassigns a mailbox or UPN to a different person,
that person would inherit the previous owner's account. Ask ITSO whether
addresses are ever reassigned. If they are, disable implicit linking, which
first needs account keys moved to the Entra object id so current users are not
locked out.

## OA-12: Secure every maintainer computer

A computer that holds production credentials or accesses the admin consoles is
a High-risk endpoint under the MSS. The maintainer Mac inspected on
2026-09-24 had FileVault, automatic updates, immediate screen lock and SIP
on, but no endpoint protection. Its application firewall was off; it was
turned on on 2026-09-25 and verified with `socketfilterfw --getglobalstate`.
Every other maintainer computer needs the same check. To turn the firewall on,
use System Settings, Network, Firewall, or:

```bash
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --setglobalstate on
```

Then record each maintainer device in the department inventory, and decide
with ITSO whether it must be enrolled in Microsoft Intune with Defender for
Endpoint, or whether production credentials should live only on managed
devices.

## OA-13: Processor contracts and assurance reports

See [csp-checklists.md](csp-checklists.md). In short: Supabase's DPA is
available and its SOC 2 report needs the Team plan; Vercel's DPA applies to
Enterprise agreements and its SOC 2 report is available on request;
OpenRouter references a DPA; the iFLYTEK international platform offers only
its service agreement and privacy policy. ITSO's MSS for SaaS requires the
checklist and a SOC 2 Type 2 report before deployment.

## OA-14: Name the data user; approve retention; legacy accounts

- Confirm in writing which HKUST unit is the data user and who its
  Cybersecurity Coordinator is.
- Approve or amend
  [submissions/retention-schedule-proposal.md](submissions/retention-schedule-proposal.md).
- Delete the two dormant Supabase Auth accounts created in July 2026 (Google
  sign-in, before the HKUST SSO migration), which the application no longer
  uses.

## OA-15: Remove the unused GraphQL API schema

**Done 2026-09-26.** The exposed schemas went from `public,graphql_public` to
`public`. GraphQL had already been inert: the `pg_graphql` extension was not
enabled. After the change, `POST /graphql/v1` answers `406 PGRST106 Invalid
schema: graphql_public`, and public REST behaves as before. For another
environment: Supabase dashboard, Project Settings, Data API, Exposed schemas:
keep `public` only.

## OA-16: Give the auth pool a least-privilege database role

**Done 2026-09-26.** The Better Auth pool (`src/lib/auth.ts`) connected as
`postgres`, the database owner, so `BETTER_AUTH_DATABASE_URL` in the Vercel
environment gave full control of the database. The pre-merge security review
found this on 2026-09-25.

1. `supabase/migrations/20260925110000_better_auth_app_role.sql` created the
   role `better_auth_app` without LOGIN. It holds:
   - read, insert, update and delete on the five `better_auth` tables;
   - insert of `(id, display_name)` on `public.profiles`, plus SELECT on `id`
     alone, because the sign-up hook's `ON CONFLICT (id)` needs it, and
     because with ON CONFLICT Postgres also checks SELECT policies.

   Two rolled-back tests on production proved it:
   - it can run every statement shape the pool issues;
   - it cannot read or change the security log, profile names or progress,
     chats or mock exams, and cannot create tables.
2. An owner ran `scripts/security/rotate-app-credentials.sh`. It set a random
   password, sent to the database only as a SCRAM verifier (derivation checked
   against RFC 7677). It then logged in with verified TLS through the pooler,
   and only after that wrote the new `BETTER_AUTH_DATABASE_URL` to Vercel.
3. After the redeploy, the database showed the app's connection as
   `better_auth_app` over TLS. `/api/auth/jwks` answered from the database, and
   the owner's real sign-in succeeded.

To rotate this password later, an owner runs the same script again. The
remaining step, rotating the `postgres` password itself, is under OA-9.
