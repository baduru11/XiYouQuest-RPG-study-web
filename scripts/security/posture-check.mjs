#!/usr/bin/env node
// Read-only security posture check for XiYouQuest (the "Loop" in
// docs/security/README.md). Every probe is a read: catalog metadata, auth
// settings, response headers, TLS negotiation, and anonymous requests that
// must be refused. It never reads student rows and never prints a secret.
//
// Env (all optional; a missing input turns its checks into SKIP, not PASS):
//   SUPABASE_ACCESS_TOKEN  Management API token (catalog + auth config reads)
//   SUPABASE_PROJECT_REF   default yfoifmqjhavxidomgids
//   SUPABASE_ANON_KEY      public anon key (anonymous refusal probes)
//   APP_URL                default https://cle-xyq.hkust.edu.hk
//
// Flags: --json (machine output), --diary <file> (append a dated entry).
// Exit code: 1 if any check FAILs, else 0.

import { appendFileSync, existsSync, writeFileSync } from "node:fs";
import tls from "node:tls";

const REF = process.env.SUPABASE_PROJECT_REF || "yfoifmqjhavxidomgids";
const APP_URL = process.env.APP_URL || "https://cle-xyq.hkust.edu.hk";
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN || "";
const ANON = process.env.SUPABASE_ANON_KEY || "";
// Cloudflare in front of api.supabase.com rejects default runtime user agents.
const UA = "xiyouquest-posture-check/1.0 (curl-compatible)";
const ONE_YEAR = 31536000;

const TIMEOUT_MS = 20000;

const results = [];
const record = (id, control, status, detail) =>
  results.push({ id, control, status, detail });

async function sql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
      "User-Agent": UA,
    },
    body: JSON.stringify({ query }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`database/query HTTP ${res.status}`);
  return res.json();
}

const CATALOG_CHECKS = [
  {
    id: "DB-1",
    control: "RLS enabled on every public table",
    query: `select count(*)::int n from pg_class c
      where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
        and not c.relrowsecurity`,
  },
  {
    id: "DB-2",
    control: "No anon/authenticated privilege on public tables",
    query: `select count(*)::int n from pg_class c
      where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','v','m')
        and (has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE')
          or has_table_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,DELETE'))`,
  },
  {
    id: "DB-3",
    control: "No anon/authenticated EXECUTE on public functions",
    query: `select count(*)::int n from pg_proc p
      where p.pronamespace = 'public'::regnamespace
        and (has_function_privilege('anon', p.oid, 'EXECUTE')
          or has_function_privilege('authenticated', p.oid, 'EXECUTE'))`,
  },
  {
    id: "DB-4",
    control: "SECURITY DEFINER functions pin search_path",
    query: `select count(*)::int n from pg_proc p
      where p.pronamespace = 'public'::regnamespace and p.prosecdef
        and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c
                        where c like 'search_path=%')`,
  },
  {
    id: "DB-5",
    control: "No client-role storage policies (uploads are server-only)",
    query: `select count(*)::int n from pg_policies
      where schemaname = 'storage'
        and (roles && array['anon','authenticated','public']::name[])`,
  },
  {
    id: "DB-6",
    control: "No plaintext OAuth tokens stored",
    // Mirrors better-auth's isLikelyEncrypted(): "$ba$" envelope or even-length hex.
    query: `select count(*)::int n from better_auth.account a,
        unnest(array[a."accessToken", a."refreshToken", a."idToken"]) t
      where t is not null and t !~ '^[$]ba[$]'
        and not (length(t) % 2 = 0 and t ~* '^[0-9a-f]+$')`,
  },
];

async function checkCatalog() {
  if (!TOKEN) {
    for (const c of CATALOG_CHECKS) record(c.id, c.control, "SKIP", "SUPABASE_ACCESS_TOKEN not set");
    return;
  }
  for (const c of CATALOG_CHECKS) {
    try {
      const [row] = await sql(c.query);
      record(c.id, c.control, row.n === 0 ? "PASS" : "FAIL", `violations=${row.n}`);
    } catch (e) {
      record(c.id, c.control, "FAIL", `query failed: ${e.message}`);
    }
  }
}

async function checkAuthConfig() {
  const control = "Supabase Auth sign-up disabled (identity is HKUST SSO only)";
  if (!TOKEN) return record("AUTH-1", control, "SKIP", "SUPABASE_ACCESS_TOKEN not set");
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/config/auth`, {
    headers: { Authorization: `Bearer ${TOKEN}`, "User-Agent": UA },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) return record("AUTH-1", control, "WARN", `cannot read auth config (HTTP ${res.status})`);
  const cfg = await res.json();
  const open = [];
  if (!cfg.disable_signup) open.push("disable_signup=false");
  for (const p of ["email", "google", "discord", "github", "phone", "anonymous_users"]) {
    if (cfg[`external_${p}_enabled`]) open.push(`${p} provider on`);
  }
  // Severity note: with DB-2/DB-3 passing, a self-registered principal holds
  // no privileges, so an open sign-up is residual (WARN), not an exposure.
  record("AUTH-1", control, open.length ? "WARN" : "PASS", open.join(", ") || "closed");
}

async function checkAnonProbes() {
  const base = `https://${REF}.supabase.co/rest/v1`;
  const probes = [
    ["ANON-1", "Anonymous read of profiles refused", "GET", `${base}/profiles?select=id&limit=1`],
    ["ANON-2", "Anonymous read of chat_messages refused", "GET", `${base}/chat_messages?select=id&limit=1`],
    ["ANON-3", "Anonymous call to record_practice_progress refused", "POST", `${base}/rpc/record_practice_progress`],
  ];
  for (const [id, control, method, url] of probes) {
    if (!ANON) {
      record(id, control, "SKIP", "SUPABASE_ANON_KEY not set");
      continue;
    }
    const res = await fetch(url, {
      method,
      headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, "Content-Type": "application/json" },
      body: method === "POST" ? JSON.stringify({ p_user_id: "00000000-0000-0000-0000-000000000000" }) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const refused = [401, 403, 404].includes(res.status);
    record(id, control, refused ? "PASS" : "FAIL", `HTTP ${res.status}`);
  }
}

async function checkHeaders() {
  let res;
  // One retry: a single dropped connection should not read as a posture failure.
  for (let attempt = 1; attempt <= 2 && !res; attempt++) {
    try {
      res = await fetch(`${APP_URL}/login`, {
        redirect: "manual",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (e) {
      if (attempt === 2) return record("HDR-0", `App reachable at ${APP_URL}`, "FAIL", e.message);
    }
  }
  const h = (n) => res.headers.get(n) || "";
  const csp = h("content-security-policy");
  const hsts = /max-age=(\d+)/.exec(h("strict-transport-security"));
  const checks = [
    ["HDR-1", "CSP with per-request nonce", /'nonce-[^']+'/.test(csp)],
    ["HDR-2", "CSP blocks framing (frame-ancestors or X-Frame-Options DENY)",
      /frame-ancestors 'none'/.test(csp) || h("x-frame-options").toUpperCase() === "DENY"],
    ["HDR-3", "HSTS max-age >= 1 year", !!hsts && Number(hsts[1]) >= ONE_YEAR],
    ["HDR-4", "X-Content-Type-Options nosniff", h("x-content-type-options") === "nosniff"],
    ["HDR-5", "Referrer-Policy set", !!h("referrer-policy")],
    ["HDR-6", "Permissions-Policy set", !!h("permissions-policy")],
  ];
  for (const [id, control, ok] of checks) record(id, control, ok ? "PASS" : "FAIL", `status ${res.status}`);
}

function tlsHandshake(host, maxVersion) {
  return new Promise((resolve) => {
    const socket = tls.connect({ host, port: 443, servername: host, minVersion: "TLSv1", maxVersion }, () => {
      socket.end();
      resolve(true);
    });
    socket.setTimeout(TIMEOUT_MS, () => { socket.destroy(); resolve(false); });
    socket.on("error", () => resolve(false));
  });
}

async function checkTls() {
  const host = new URL(APP_URL).hostname;
  const legacy = await tlsHandshake(host, "TLSv1.1");
  record("TLS-1", "TLS 1.0/1.1 refused (HKUST TLS guideline: TLS 1.2+)", legacy ? "FAIL" : "PASS",
    legacy ? "legacy handshake accepted" : "legacy handshake refused");
  const modern = await tlsHandshake(host, "TLSv1.3");
  record("TLS-2", "Modern TLS handshake succeeds", modern ? "PASS" : "FAIL", "");
}

function toMarkdown(stamp) {
  const count = (s) => results.filter((r) => r.status === s).length;
  const lines = [
    `## ${stamp} posture check — ${count("FAIL") ? "FAIL" : "PASS"}`,
    "",
    `Target: ${APP_URL}, project ${REF}. PASS ${count("PASS")} · FAIL ${count("FAIL")} · WARN ${count("WARN")} · SKIP ${count("SKIP")}`,
    "",
    "| ID | Control | Status | Detail |",
    "|---|---|---|---|",
    ...results.map((r) => `| ${r.id} | ${r.control} | ${r.status} | ${r.detail} |`),
    "",
  ];
  return lines.join("\n");
}

async function main() {
  const args = process.argv.slice(2);
  await checkCatalog();
  await checkAuthConfig();
  await checkAnonProbes();
  await checkHeaders();
  await checkTls();

  const stamp = new Date().toISOString().replace(/\.\d+Z$/, "Z");
  const md = toMarkdown(stamp);
  if (args.includes("--json")) console.log(JSON.stringify({ stamp, results }, null, 2));
  else console.log(md);

  const diaryIdx = args.indexOf("--diary");
  if (diaryIdx !== -1 && args[diaryIdx + 1]) {
    const file = args[diaryIdx + 1];
    if (!existsSync(file)) {
      writeFileSync(file, "# Security posture diary\n\nAppend-only. One entry per posture-check pass (docs/security/README.md).\n\n");
    }
    appendFileSync(file, md + "\n");
  }
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);

  process.exitCode = results.some((r) => r.status === "FAIL") ? 1 : 0;
}

main().catch((e) => {
  console.error(`posture-check crashed: ${e.message}`);
  process.exitCode = 1;
});
