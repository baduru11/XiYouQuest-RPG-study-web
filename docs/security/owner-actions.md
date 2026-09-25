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
| OA-1 | Retire the legacy JWT secret and legacy API keys | Supabase org owner + Vercel XYQ member | 2026-09-26 | AUTH-2 |
| OA-2 | Close Supabase Auth sign-up and providers | Supabase org owner | 2026-09-26 | AUTH-1 |
| OA-3 | Arrange database backups (plan decision) | Responsible unit + Supabase org owner | 2026-10-09 | PLAT-2 |
| OA-4 | Enforce TLS on database connections | Supabase org owner | Same day as OA-6 | PLAT-1 |
| OA-5 | Apply the two pending migrations | Supabase org owner or maintainer with approval | Done 2026-09-25 | DB-7, DB-8 |
| OA-6 | Review, merge and deploy the hardening PR | Repository owner + Vercel XYQ member | 2026-10-02 | DEPLOY-1, CSRF-1 |
| OA-7 | Protect CI secrets and repository settings | Repository owner | 2026-10-02 | Workflow run |
| OA-8 | ITSO submissions (PIA, CSP checklists, CITARS, health check) | Responsible unit + maintainer | See below | Register rows |
| OA-9 | Privileged-account inventory and MFA | All account owners | 2026-10-02 | submissions/privileged-accounts.md |
| OA-10 | Decide what other students may see | Responsible unit + DPO | 2026-10-16 | PIA Part 4 |
| OA-11 | Decide on implicit account linking | Responsible unit, after asking ITSO | 2026-10-16 | Register ADG-1 |
| OA-12 | Secure every maintainer computer | Each maintainer | 2026-09-26 | Register END rows |
| OA-13 | Processor contracts and assurance reports | Responsible unit | 2026-10-16 | csp-checklists.md |
| OA-14 | Name the data user; approve retention; legacy accounts | Responsible unit + DPO | 2026-10-09 | PIA Part 1 |
| OA-15 | Remove the unused GraphQL API schema | Supabase org owner | 2026-10-02 | Register WASG-3.3 |
| OA-16 | Give the auth pool a least-privilege database role | Supabase org owner + Vercel XYQ member | 2026-10-09 | Register MSS-SAAS-6 |

---

## OA-1: Retire the legacy JWT secret and legacy API keys

**Why.** The project already signs tokens with an ES256 key, but the legacy
HS256 secret is still in "previously used" state, so tokens it signs keep
verifying, and anyone holding it could mint a `service_role` token with full
database access. Retiring it removes a standing high-value credential. The
background is recorded privately; the maintainer gives it to the owner directly.

The app's legacy `anon` and `service_role` API keys are themselves HS256 JWTs,
so revoking the secret without switching keys first would break every database
call. The code on the hardening branch accepts the new keys when they are set
(`src/lib/env.ts`, `supabase/functions/_shared/env.ts`).

**Steps.**

1. Supabase dashboard, project XiyouQuest: Project Settings, API Keys. Confirm
   the publishable and secret keys named `default` exist. Optionally create a
   dedicated secret key for the app and use it below.
2. Vercel, team `xyq`, project `xi-you-quest-rpg-study-web`: Settings,
   Environment Variables. For Production and Preview add:
   - `SUPABASE_SECRET_KEY` = the secret key
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` = the publishable key
   This takes effect with the release that contains the hardening branch (OA-6).
3. Edge function secrets. Put the two values in a local file, set them, and
   delete the file so the values stay out of shell history:

   ```bash
   supabase secrets set --env-file ./xyq-new-keys.env --project-ref yfoifmqjhavxidomgids
   ```

   The file contains two lines, `XYQ_SUPABASE_SECRET_KEY=...` and
   `XYQ_SUPABASE_PUBLISHABLE_KEY=...`. Edge secrets cannot start with
   `SUPABASE_`, which is why these names differ from Vercel's.
4. Verify with a real sign-in: open a practice session, a companion chat and
   the profile page. Then run the posture check; every ANON, EDGE and DB row
   must still pass.
5. Supabase dashboard: Project Settings, JWT Keys. Revoke the legacy HS256 key
   (status "previously used"). Then Project Settings, API Keys, and disable
   the legacy API keys.
6. Replace the CI secret `SUPABASE_ANON_KEY` with the publishable key (OA-7).
7. Run the posture check. AUTH-2 must report PASS.

**Report.** A draft incident report for ITSO is held privately by the
maintainer for the owner. Sending it is the responsible unit's decision.

## OA-2: Close Supabase Auth sign-up and providers

Supabase's built-in Auth is unused (identity is HKUST SSO through Better Auth),
but sign-up is open with Email, Google and Discord enabled, no CAPTCHA and a
6-character minimum password. A self-registered account currently holds no
privilege (posture DB-2, DB-3), so this is a residual risk, not an open door.

Supabase dashboard: Authentication, Sign In / Providers. Turn off "Allow new
users to sign up", then disable the Email, Google and Discord providers.
Posture AUTH-1 must report PASS.

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

Supabase currently accepts unencrypted database connections. The hardening
branch makes the Better Auth pool verify Supabase's CA (posture DBTLS-1), so
enforcement is safe only after that release is live (OA-6). On the same day:

Supabase dashboard: Database, Settings, SSL Configuration. Turn on "Enforce SSL
on incoming connections". Sign in once to confirm, then run the posture check;
PLAT-1 must report PASS. To roll back, turn the setting off.

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

Production still serves upstream `main` from 2026-09-05, so most web-app fixes
are not live. The edge functions were deployed from the branch on 2026-09-25.
After the merge and Vercel deployment, posture DEPLOY-1 and CSRF-1 must report
PASS. Vercel asks a team member to approve each commit of a fork PR before it
builds a preview; the approval is not needed to merge.

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

PostgREST exposes `graphql_public` in addition to `public`. The app does not
use GraphQL. Supabase dashboard: Project Settings, Data API, Exposed schemas:
keep `public` only.

## OA-16: Give the auth pool a least-privilege database role

**Why.** The Better Auth pool (`src/lib/auth.ts`) connects as `postgres`, the
database owner. On 2026-09-25 it was the only login role available to the
project. Anyone who obtains `BETTER_AUTH_DATABASE_URL` from the Vercel
environment therefore controls the whole database, including the security event
log, which is append-only only for the service key. The pre-merge security
review found this on 2026-09-25.

**What the pool needs.** Read from the code:

- all five tables in schema `better_auth` (`user`, `session`, `account`,
  `verification`, `jwks`): read, insert, update and delete;
- `public.profiles`: insert only, for the sign-up hook, which uses
  `ON CONFLICT DO NOTHING`.

**Steps.**

1. Supabase SQL editor: create a login role for the pool. The owner generates
   its long random password and never stores it in the repository. Grant it:
   - `USAGE` on schema `better_auth`;
   - `SELECT, INSERT, UPDATE, DELETE` on the five tables;
   - `USAGE` on schema `public` and `INSERT` on `public.profiles`.

   Row-level security is on for `profiles` and the role must not bypass it, so
   also add an insert policy for that role.
2. Vercel, Production and Preview: set `BETTER_AUTH_DATABASE_URL` to the
   transaction pooler URL for the new role (user name
   `<role>.yfoifmqjhavxidomgids`, port 6543), then redeploy.
3. Verify:
   - sign in as a new user and as an existing user;
   - run a data export and a test account deletion;
   - run the posture check, which must still pass.
4. Reset the `postgres` database password (Project Settings, Database), because
   the old one has been in the Vercel environment.
