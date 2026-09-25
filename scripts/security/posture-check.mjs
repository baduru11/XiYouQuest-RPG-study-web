#!/usr/bin/env node
// Read-only security posture check for XiYouQuest, v2 (the "Loop" in
// docs/security/README.md). Every probe is a read: catalog metadata, platform
// settings, response headers, TLS negotiation, and anonymous requests that must
// be refused. It never reads a student row and never prints a secret.
//
// v2 exists because v1 reported PASS for probes that could not fail (see
// posture-lib.mjs). Rules live in posture-lib.mjs and are unit-tested with
// negative controls; this file only gathers evidence and reports it.
//
// Env (all optional; a missing input turns its checks into SKIP, never PASS):
//   SUPABASE_ACCESS_TOKEN  Management API token (catalog + platform settings)
//   SUPABASE_PROJECT_REF   default yfoifmqjhavxidomgids
//   SUPABASE_ANON_KEY      public anon key (anonymous refusal probes)
//   APP_URL                default https://cle-xyq.hkust.edu.hk
//   POSTURE_DB_HOST        pooler host, default aws-1-ap-south-1.pooler.supabase.com
//
// Flags: --json, --diary <file> (append a dated entry), --strict (WARN fails).
// Exit code: 1 on any FAIL (or WARN with --strict), else 0.

import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  STATUS,
  classifyAnonList,
  classifyAnonRead,
  classifyAnonRpc,
  classifyCount,
  classifyDatabaseTls,
  classifyEdgeAuthGate,
  classifyEdgeVersions,
  classifyLegacyOffer,
  classifyModernTls,
  headerChecks,
  summarize,
  toMarkdown,
} from "./posture-lib.mjs";
import { fetchRetry, jsonBody, postgresTls, tlsOffer, TIMEOUT_MS } from "./posture-probes.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const REF = process.env.SUPABASE_PROJECT_REF || "yfoifmqjhavxidomgids";
const APP_URL = (process.env.APP_URL || "https://cle-xyq.hkust.edu.hk").replace(/\/$/, "");
const DB_HOST = process.env.POSTURE_DB_HOST || "aws-1-ap-south-1.pooler.supabase.com";
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN || "";
const ANON = process.env.SUPABASE_ANON_KEY || "";
// Cloudflare in front of api.supabase.com rejects default runtime user agents.
const UA = "xiyouquest-posture-check/2.0 (curl-compatible)";
const MGMT = `https://api.supabase.com/v1/projects/${REF}`;

// Owner actions referenced by WARN rows; defined in docs/security/owner-actions.md.
const OA = {
  legacyJwt: "OA-1",
  signUp: "OA-2",
  backups: "OA-3",
  sslEnforcement: "OA-4",
  migrations: "OA-5",
  release: "OA-6",
};

const results = [];
const record = (id, control, verdict, owner) =>
  results.push({ id, control, status: verdict.status, detail: verdict.detail, ...(owner && verdict.status !== STATUS.PASS ? { owner } : {}) });
const skip = (id, control, why) => record(id, control, { status: STATUS.SKIP, detail: why });

async function management(pathname, init = {}) {
  const res = await fetchRetry(`${MGMT}${pathname}`, {
    ...init,
    headers: { Authorization: `Bearer ${TOKEN}`, "User-Agent": UA, "Content-Type": "application/json", ...init.headers },
  });
  if (!res.ok) throw new Error(`${pathname} HTTP ${res.status}`);
  return res.json();
}

const sql = async (query) => (await management("/database/query", { method: "POST", body: JSON.stringify({ query }) }))[0];

const CATALOG = [
  ["DB-1", "RLS enabled on every public table", `select count(*)::int n from pg_class c
    where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','p') and not c.relrowsecurity`],
  ["DB-2", "No anon/authenticated privilege on any table, view or column (public, better_auth)", `select (
      (select count(*) from pg_class c
        where c.relnamespace in ('public'::regnamespace, 'better_auth'::regnamespace)
          and c.relkind in ('r','v','m','p','f')
          and (has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
            or has_table_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')))
    + (select count(*) from pg_attribute a join pg_class c on c.oid = a.attrelid
        cross join lateral aclexplode(a.attacl) x
        where c.relnamespace in ('public'::regnamespace, 'better_auth'::regnamespace)
          and a.attacl is not null
          and x.grantee in ('anon'::regrole, 'authenticated'::regrole))
    )::int n`],
  ["DB-3", "No anon/authenticated EXECUTE on public functions", `select count(*)::int n from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and (has_function_privilege('anon', p.oid, 'EXECUTE') or has_function_privilege('authenticated', p.oid, 'EXECUTE'))`],
  ["DB-4", "SECURITY DEFINER functions pin search_path", `select count(*)::int n from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.prosecdef
      and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')`],
  ["DB-5", "No client-role storage policies (uploads are server-only)", `select count(*)::int n from pg_policies
    where schemaname = 'storage' and (roles && array['anon','authenticated','public']::name[])`],
  ["DB-6", "No plaintext OAuth tokens stored", `select count(*)::int n from better_auth.account a,
      unnest(array[a."accessToken", a."refreshToken", a."idToken"]) t
    where t is not null and t !~ '^[$]ba[$]' and not (length(t) % 2 = 0 and t ~* '^[0-9a-f]+$')`],
  ["DB-7", "Security event log is append-only for the app (service_role holds no table privilege)", `select (case
      when to_regclass('public.security_events') is null then -1
      when has_table_privilege('service_role', 'public.security_events', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') then 1
      else 0 end)::int n`, OA.migrations],
  ["DB-8", "Public chat-images bucket restricted to raster image types", `select coalesce((select case
      when allowed_mime_types is null then -1 else 0 end from storage.buckets where id = 'chat-images'), 0)::int n`,
    OA.migrations],
  ["DB-9", "No non-image objects in the public buckets", `select count(*)::int n from storage.objects
    where bucket_id in ('avatars', 'chat-images')
      and coalesce(metadata->>'mimetype', '') not in ('image/png', 'image/jpeg', 'image/gif', 'image/webp')`],
];

async function checkCatalog() {
  for (const [id, control, query, owner] of CATALOG) {
    if (!TOKEN) {
      skip(id, control, "SUPABASE_ACCESS_TOKEN not set");
      continue;
    }
    try {
      record(id, control, classifyCount((await sql(query)).n), owner);
    } catch (error) {
      record(id, control, { status: STATUS.FAIL, detail: `query failed: ${error.message}` });
    }
  }
}

async function checkPlatform() {
  const controls = {
    "AUTH-1": "Supabase Auth sign-up and providers disabled (identity is HKUST SSO only)",
    "AUTH-2": "Legacy HS256 JWT secret no longer verifies tokens",
    "PLAT-1": "Database rejects non-TLS connections (SSL enforcement)",
    "PLAT-2": "Database backups exist",
    "PLAT-3": "Deployed edge functions not rolled back below the hardened release",
  };
  if (!TOKEN) {
    for (const [id, control] of Object.entries(controls)) skip(id, control, "SUPABASE_ACCESS_TOKEN not set");
    return;
  }
  const guarded = async (id, owner, fn) => {
    try {
      record(id, controls[id], await fn(), owner);
    } catch (error) {
      record(id, controls[id], { status: STATUS.WARN, detail: `could not read: ${error.message}` }, owner);
    }
  };

  await guarded("AUTH-1", OA.signUp, async () => {
    const cfg = await management("/config/auth");
    const open = [];
    if (!cfg.disable_signup) open.push("disable_signup=false");
    for (const p of ["email", "google", "discord", "github", "phone", "anonymous_users"]) {
      if (cfg[`external_${p}_enabled`]) open.push(`${p} on`);
    }
    return open.length ? { status: STATUS.WARN, detail: open.join(", ") } : { status: STATUS.PASS, detail: "closed" };
  });

  await guarded("AUTH-2", OA.legacyJwt, async () => {
    const body = await management("/config/auth/signing-keys");
    const keys = Array.isArray(body) ? body : body.keys ?? [];
    const live = keys.filter((k) => k.algorithm === "HS256" && k.status !== "revoked");
    return live.length
      ? { status: STATUS.WARN, detail: `HS256 key status: ${live.map((k) => k.status).join(", ")}` }
      : { status: STATUS.PASS, detail: "no HS256 key accepted" };
  });

  await guarded("PLAT-1", OA.sslEnforcement, async () => {
    const body = await management("/ssl-enforcement");
    return body?.currentConfig?.database
      ? { status: STATUS.PASS, detail: "enforced" }
      : { status: STATUS.WARN, detail: "not enforced" };
  });

  await guarded("PLAT-2", OA.backups, async () => {
    const body = await management("/database/backups");
    const count = (body.backups ?? []).length;
    return count > 0 || body.pitr_enabled
      ? { status: STATUS.PASS, detail: `${count} backup(s), PITR ${body.pitr_enabled ? "on" : "off"}` }
      : { status: STATUS.WARN, detail: "no backups and no point-in-time recovery" };
  });

  await guarded("PLAT-3", undefined, async () => {
    const manifest = JSON.parse(readFileSync(path.join(ROOT, "scripts/security/edge-manifest.json"), "utf8"));
    return classifyEdgeVersions(await management("/functions"), manifest.minimumVersions);
  });
}

async function checkAnonymous() {
  const rest = `https://${REF}.supabase.co`;
  const zero = "00000000-0000-0000-0000-000000000000";
  const probes = [
    ["ANON-1", "Anonymous read of profiles refused", "GET", "/rest/v1/profiles?select=id&limit=1", undefined, classifyAnonRead],
    ["ANON-2", "Anonymous read of chat_messages refused", "GET", "/rest/v1/chat_messages?select=id&limit=1", undefined, classifyAnonRead],
    // The FULL signature: a partial one is a PostgREST signature miss that
    // never reaches the grant (the v1 false PASS).
    ["ANON-3", "Anonymous call to record_practice_progress refused by privilege", "POST", "/rest/v1/rpc/record_practice_progress", {
      p_user_id: zero, p_character_id: zero, p_client_attempt_id: zero, p_component: 1, p_score: 0,
      p_xp_earned: 0, p_duration_seconds: 0, p_questions_attempted: 0, p_questions_correct: 0,
      p_best_streak: 0, p_today: "2026-01-01", p_daily_bonus_base: 0,
    }, classifyAnonRpc],
    ["ANON-4", "Anonymous listing of the avatars bucket returns nothing", "POST", "/storage/v1/object/list/avatars",
      { prefix: "", limit: 1 }, classifyAnonList],
  ];
  for (const [id, control, method, pathname, body, classify] of probes) {
    if (!ANON) {
      skip(id, control, "SUPABASE_ANON_KEY not set");
      continue;
    }
    try {
      const res = await fetchRetry(`${rest}${pathname}`, {
        method,
        // New-format keys (sb_publishable_...) go in apikey only; legacy anon
        // keys are JWTs and are also sent as the bearer token.
        headers: {
          apikey: ANON,
          ...(ANON.startsWith("sb_") ? {} : { Authorization: `Bearer ${ANON}` }),
          "Content-Type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      record(id, control, classify({ status: res.status, body: await jsonBody(res) }));
    } catch (error) {
      skip(id, control, `unreachable: ${error.message}`);
    }
  }
}

async function checkEdgeGates() {
  const control = "Every edge function boots and refuses unauthenticated calls";
  const { minimumVersions } = JSON.parse(readFileSync(path.join(ROOT, "scripts/security/edge-manifest.json"), "utf8"));
  const outcomes = [];
  for (const slug of Object.keys(minimumVersions)) {
    try {
      const res = await fetchRetry(`https://${REF}.supabase.co/functions/v1/${slug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      outcomes.push([slug, classifyEdgeAuthGate(res.status)]);
    } catch (error) {
      outcomes.push([slug, { status: STATUS.SKIP, detail: error.message }]);
    }
  }
  const failed = outcomes.filter(([, v]) => v.status === STATUS.FAIL);
  const skipped = outcomes.filter(([, v]) => v.status === STATUS.SKIP);
  if (failed.length) {
    record("EDGE-1", control, { status: STATUS.FAIL, detail: failed.map(([s, v]) => `${s}: ${v.detail}`).join("; ") });
  } else if (skipped.length === outcomes.length) {
    record("EDGE-1", control, { status: STATUS.SKIP, detail: "functions unreachable" });
  } else {
    record("EDGE-1", control, { status: STATUS.PASS, detail: `${outcomes.length - skipped.length}/${outcomes.length} returned 401` });
  }
}

async function checkWeb() {
  let login;
  try {
    login = await fetchRetry(`${APP_URL}/login`, { redirect: "manual" });
  } catch (error) {
    record("WEB-0", `App reachable at ${APP_URL}`, { status: STATUS.WARN, detail: `unreachable from this runner: ${error.message}` });
    for (const id of ["HDR-1", "HDR-2", "HDR-3", "HDR-4", "HDR-5", "HDR-6", "DEPLOY-1", "CSRF-1"]) skip(id, id, "app unreachable");
    return;
  }
  record("WEB-0", `App reachable at ${APP_URL}`, { status: STATUS.PASS, detail: `HTTP ${login.status}` });
  for (const row of headerChecks(login.headers)) record(row.id, row.control, row);

  let released = false;
  try {
    const res = await fetchRetry(`${APP_URL}/.well-known/security.txt`);
    released = res.ok && /^Contact:/m.test(await res.text());
    record("DEPLOY-1", "Hardened release is live (security.txt served)",
      released ? { status: STATUS.PASS, detail: "served" } : { status: STATUS.WARN, detail: `HTTP ${res.status}` }, OA.release);
  } catch (error) {
    skip("DEPLOY-1", "Hardened release is live (security.txt served)", error.message);
  }

  const csrf = "Cross-site API write refused before authentication";
  if (!released) return skip("CSRF-1", csrf, "hardened release not live yet");
  try {
    const res = await fetchRetry(`${APP_URL}/api/progress/update`, {
      method: "POST",
      headers: { "Sec-Fetch-Site": "cross-site", "Content-Type": "text/plain" },
      body: "{}",
    });
    record("CSRF-1", csrf, res.status === 403
      ? { status: STATUS.PASS, detail: "HTTP 403" }
      : { status: STATUS.FAIL, detail: `HTTP ${res.status} (guard missing)` });
  } catch (error) {
    skip("CSRF-1", csrf, error.message);
  }
}

async function checkTls() {
  const host = new URL(APP_URL).hostname;
  // SECLEVEL=0 lets this client actually offer TLS 1.0/1.1; without it Node's
  // OpenSSL refuses locally and nothing about the server is learned.
  record("TLS-1", "TLS 1.0/1.1 refused by the server",
    classifyLegacyOffer(await tlsOffer({ host, minVersion: "TLSv1", maxVersion: "TLSv1.1", ciphers: "DEFAULT:@SECLEVEL=0" })));
  record("TLS-2", "Modern TLS (1.2+) handshake with a valid certificate",
    classifyModernTls(await tlsOffer({ host, minVersion: "TLSv1.2", maxVersion: "TLSv1.3" })));
  record("TLS-3", "3DES cipher refused (ITSO TLS cipher guideline)",
    classifyLegacyOffer(await tlsOffer({ host, minVersion: "TLSv1.2", maxVersion: "TLSv1.2", ciphers: "DES-CBC3-SHA:@SECLEVEL=0" })));

  const source = readFileSync(path.join(ROOT, "src/lib/db-tls.ts"), "utf8");
  const ca = source.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/)?.[0];
  const control = `Database pooler chain verifies against the pinned Supabase CA (${DB_HOST})`;
  if (!ca) return record("DBTLS-1", control, { status: STATUS.FAIL, detail: "pinned CA not found in src/lib/db-tls.ts" });
  record("DBTLS-1", control, classifyDatabaseTls(await postgresTls({ host: DB_HOST, ca })));
}

async function main() {
  const args = process.argv.slice(2);
  const strict = args.includes("--strict");
  await checkCatalog();
  await checkPlatform();
  await checkAnonymous();
  await checkEdgeGates();
  await checkWeb();
  await checkTls();

  const stamp = new Date().toISOString().replace(/\.\d+Z$/, "Z");
  const target = `${APP_URL}, project ${REF}, timeout ${TIMEOUT_MS / 1000}s`;
  const md = toMarkdown(stamp, target, results, { strict });
  console.log(args.includes("--json") ? JSON.stringify({ stamp, target, results }, null, 2) : md);

  const diaryIdx = args.indexOf("--diary");
  if (diaryIdx !== -1 && args[diaryIdx + 1]) {
    const file = args[diaryIdx + 1];
    if (!existsSync(file)) {
      writeFileSync(file, "# Security posture diary\n\nAppend-only. One entry per posture-check pass (docs/security/README.md).\n\n");
    }
    appendFileSync(file, `${md}\n`);
  }
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
  process.exitCode = summarize(results, { strict }).failed ? 1 : 0;
}

main().catch((error) => {
  console.error(`posture-check crashed: ${error.message}`);
  process.exitCode = 1;
});
