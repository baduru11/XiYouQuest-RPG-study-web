# 2026-09-28: isolated sandbox for the ITSO security check

ITSO will scan `https://cle-xyq-dev.hkust.edu.hk`. Until today that host was a
second alias of the production deployment (same Vercel project, same database
of real student records), and SSO on it failed because Better Auth sent the
callback to `cle-xyq.hkust.edu.hk`. It is now a separate sandbox.

## What exists

| Part | Production | Sandbox |
|---|---|---|
| Vercel project | `xi-you-quest-rpg-study-web` (`cle-xyq.hkust.edu.hk`) | `xyq-sandbox` (`cle-xyq-dev.hkust.edu.hk`) |
| Code | `main` `84b4abb` | the same commit, deployed from `git archive 84b4abb` |
| Supabase project | `yfoifmqjhavxidomgids` | `drmcdpmiwbtdyjhtbupa` (Pro org, ap-south-1) |
| `BETTER_AUTH_URL` | `https://cle-xyq.hkust.edu.hk` | `https://cle-xyq-dev.hkust.edu.hk` |
| Edge functions | 11 | the same 11, `verify_jwt=false` as in production (each verifies the Better Auth JWT itself); `BETTER_AUTH_JWKS_URL` points at the sandbox host |
| Secrets | own | new: Better Auth secret, `better_auth_app` password, Supabase keys. Nothing is shared with production |
| Vercel Authentication | all except custom domains | the same |

## How the database was built

1. Schema: `pg_dump --schema-only -n public -n better_auth` from production,
   taken through a temporary Supabase CLI login role with `SET ROLE postgres`
   (pg_dump runs in read-only transactions), restored into the sandbox.
2. pg_dump did not carry production's revoked grants: after the restore the
   client roles `anon` and `authenticated` held full privileges on every table
   and function, and the default privileges still granted them. The exact
   table, sequence and function ACLs were regenerated from production's
   catalog (`aclexplode`) and applied, the default privileges narrowed, and the
   two storage buckets created with production's size and type limits. No
   application was connected to the sandbox and it held no data at that point.
3. Parity check: a catalog query over RLS flags, table, column and function
   ACLs, function bodies (md5), `SECURITY DEFINER` and `search_path`, policies,
   triggers, default ACLs, schema ACLs, buckets, extensions and role flags
   returns identical output for both databases, and a second schema dump of
   the sandbox is identical to production's.
4. Data: content tables only (`question_banks` 20,369 rows, `characters`,
   `character_expressions`, `character_skins`, `achievements`,
   `chat_scenarios`, `scenario_backgrounds`). No `better_auth` rows, profiles,
   practice, chat, plan, rate-limit or security-event rows. The 32 scenario
   background images were copied into the sandbox's own `chat-images` bucket
   and their URLs repointed, so the sandbox references nothing in production.
5. SSL enforcement on; `better_auth_app` logs in through the transaction
   pooler and is refused on `public.question_banks` (least privilege, as in
   production).

## Verified on the sandbox deployment

- `/api/auth/ok` returns `{"ok":true}`; `/api/auth/jwks` serves a new ES256 key
  generated in the sandbox database.
- `/login`: HSTS two years with preload, nonce CSP, `X-Frame-Options: DENY`.
- Sign-in starts with `redirect_uri=https://cle-xyq-dev.hkust.edu.hk/api/auth/oauth2/callback/hkust`.
- Unauthenticated `/api/profile/export` returns 401; unauthenticated edge
  function calls return 401.

## Open

- `cle-xyq-dev.hkust.edu.hk` answers 404 until HKUST adds the Vercel
  verification TXT value `vc-domain-verify=cle-xyq-dev.hkust.edu.hk,b22f5f87b8b7b2b5d159`
  on `_vercel.hkust.edu.hk` (see `submissions/itso-scan-reply.md`, section 3).
  Vercel issues a new code every time the domain is added to a project, and
  the one it held under production (`0f702e8…`) lapsed when the domain left
  that project. Do not remove and re-add the domain, or this value changes
  again. Once the record exists: `npx vercel domains verify
  cle-xyq-dev.hkust.edu.hk --scope xyq`.
- A detour through a Vercel custom environment inside the production project
  was tried to avoid the DNS change; it needs a new code as well, so it was
  removed. The production project's domains and 23 environment variables are
  as they were before this work (verified by id).
- AI and speech provider keys are not set on the sandbox edge functions, so
  those features return errors there. Set them only if the scan should
  exercise them (the scanner's traffic would then be billed).
- Fixed the same day: edge functions answered `Access-Control-Allow-Origin: *`.
  They now answer only the app origin (the origin of `BETTER_AUTH_JWKS_URL`),
  deployed to both projects (production versions in `edge-manifest.json`) and
  checked with a preflight from the app origin and from a foreign origin.
  Local `npm run dev` on localhost can no longer read deployed edge responses.
- A redeploy request made through the Vercel API with a production
  `deploymentId` and a sandbox `project` override was placed in the
  production project instead. It was cancelled during the build, before any
  alias moved; production kept serving the existing deployment.
