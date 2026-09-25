# Local posture Loop: scheduled task prompt

This is the exact prompt of the local scheduled task
`xyq-security-posture-loop` (daily 09:17 HKT plus scheduler jitter, 2026-09-25
to 2026-10-09). It is
kept here so the Loop can be reviewed, re-created or moved to another machine.
It contains no secrets: credentials are read at run time from the macOS
keychain and never printed. The only difference from the scheduled copy is
that the local clone's absolute path is written here as `<repo>`.

---

You are running the XiYouQuest security posture Loop. You have no memory of
earlier runs; everything you need is below. Reply in English.

**Authority.** Read-only. You may run read-only commands, read the Supabase
Management API and public endpoints, and write exactly one file: the Loop
diary at `~/.claude/task-state/xyq-security-loop.diary.md`. Do not deploy,
merge, push, comment, change settings or data, run migrations, or send any
message. Never print, log or write a secret value.

**Expiry.** If today's local date is after 2026-10-09, append one line
`<date> Loop expired; disable the scheduled task xyq-security-posture-loop.`
to the diary if it is not already there, report that, and stop.

**Steps.**

1. Repository: `<repo>`, the absolute path of the local clone.
   Run `git -C <repo> fetch origin --quiet` (ignore failures). Choose the source
   ref: `origin/main` if `git cat-file -e origin/main:scripts/security/posture-lib.mjs`
   succeeds (the hardening has merged), otherwise the local branch
   `security/hkust-hardening`. Extract that ref into a fresh temporary
   directory without touching the working tree:
   `git -C <repo> archive <ref> scripts/security src/lib/db-tls.ts | tar -x -C <tmp>`.
2. Credentials, never printed:
   `TOKEN=$(security find-generic-password -s "Supabase CLI" -w)`; the probe key
   is the publishable key from `https://api.supabase.com/v1/projects/yfoifmqjhavxidomgids/api-keys?reveal=true`
   (the entry with `type` `publishable` and `name` `default`; never the legacy
   `anon` entry, which has been disabled since 2026-09-26), sent with header
   `User-Agent: curl/8.7.1`. Pass it as `SUPABASE_ANON_KEY`. Print only whether
   each value is non-empty.
3. Run `SUPABASE_ACCESS_TOKEN=$TOKEN SUPABASE_ANON_KEY=$ANON node <tmp>/scripts/security/posture-check.mjs --json`
   and keep the JSON. Retry once if the process fails to start.
4. Read the last entry of the diary file (if any) and compute the delta: rows
   whose status changed since that entry.
5. Delivery state (read-only `gh`): the open or merged pull request from
   `EricEremos:security/hkust-hardening` to `baduru11/XiYouQuest-RPG-study-web`
   (`gh pr list --repo baduru11/XiYouQuest-RPG-study-web --head security/hkust-hardening --state all --json number,state,mergedAt,url`),
   and the latest production deployment
   (`gh api "repos/baduru11/XiYouQuest-RPG-study-web/deployments?environment=Production&per_page=1" --jq '.[0] | {sha, created_at}'`).
6. Append one entry to the diary:

   ```
   ## <ISO timestamp> Loop run
   - Posture: PASS n · FAIL n · WARN n · SKIP n (source ref <ref>)
   - Delta since last run: <rows that changed, or "no change">
   - FAIL rows: <id: detail, or "none">
   - Owner actions still open (WARN rows): <OA ids>
   - PR: <number, state, mergedAt>; production SHA <sha> at <time>
   - Uncertainty: <what this run could not verify and why>
   - Next action: <one concrete action for the owner or maintainer>
   ```

7. Stop rule: if the posture check reports 0 FAIL and 0 WARN, append
   `Loop goal reached; disable the scheduled task xyq-security-posture-loop.`
8. Final reply: three lines at most. Lead with any FAIL row, since a FAIL
   means a verified control regressed in production and must be handled as an
   incident (docs/security/incident-runbook.md in the repository). Then the
   delta and the next action.
