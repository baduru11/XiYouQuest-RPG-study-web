// Pure rules for the security posture check: no I/O, so every PASS/FAIL rule
// is unit-tested with negative controls (src/security/posture-lib.test.ts).
//
// Why this exists: posture check v1 reported PASS for two probes that could
// never fail. Its TLS 1.0/1.1 probe was refused by Node's own OpenSSL before a
// byte reached the server, and its anonymous RPC probe sent 1 of 12 arguments,
// so PostgREST answered "no such function" (404) whatever the grants were.
// Every classifier below therefore states the evidence a PASS requires, and
// an outcome that proves nothing is SKIP or WARN, never PASS.

export const STATUS = Object.freeze({ PASS: "PASS", FAIL: "FAIL", WARN: "WARN", SKIP: "SKIP" });

const result = (status, detail) => ({ status, detail });

/** The target could not be reached: no evidence either way. */
const UNREACHABLE = new Set([
  "ENOTFOUND", "EAI_AGAIN", "ETIMEDOUT", "ECONNREFUSED", "ECONNRESET",
  "EHOSTUNREACH", "ENETUNREACH", "TIMEOUT",
]);

/** Raised by this client before anything is sent: the offer was never made. */
const CLIENT_CANNOT_OFFER = new Set([
  "ERR_SSL_NO_PROTOCOLS_AVAILABLE", "ERR_SSL_NO_CIPHER_MATCH", "ERR_SSL_NO_CIPHERS_AVAILABLE",
]);

/** The server received the offer and refused it. */
const SERVER_REFUSED = new Set([
  "ERR_SSL_TLSV1_ALERT_PROTOCOL_VERSION", "ERR_SSL_UNSUPPORTED_PROTOCOL",
  "ERR_SSL_WRONG_VERSION_NUMBER", "ERR_SSL_SSLV3_ALERT_HANDSHAKE_FAILURE",
  "ERR_SSL_TLSV1_ALERT_INSUFFICIENT_SECURITY", "ERR_SSL_NO_SHARED_CIPHER",
]);

/**
 * A legacy protocol or weak cipher offered to the server. PASS needs the server
 * to refuse it; a client that cannot make the offer is SKIP.
 * @param {{ handshake: boolean, code?: string, protocol?: string }} probe
 */
export function classifyLegacyOffer(probe) {
  if (probe.handshake) return result(STATUS.FAIL, `server accepted the offer (${probe.protocol ?? "?"})`);
  if (CLIENT_CANNOT_OFFER.has(probe.code)) {
    return result(STATUS.SKIP, `this runtime cannot make the offer (${probe.code}); verify with an external scanner`);
  }
  if (SERVER_REFUSED.has(probe.code)) return result(STATUS.PASS, `server refused (${probe.code})`);
  if (UNREACHABLE.has(probe.code)) return result(STATUS.SKIP, `host unreachable (${probe.code})`);
  return result(STATUS.WARN, `unrecognised outcome (${probe.code ?? "no code"}); not verified`);
}

/**
 * A modern handshake (TLS 1.2+) must succeed.
 * @param {{ handshake: boolean, code?: string, protocol?: string }} probe
 */
export function classifyModernTls(probe) {
  if (probe.handshake) return result(STATUS.PASS, `negotiated ${probe.protocol}`);
  if (UNREACHABLE.has(probe.code)) return result(STATUS.SKIP, `host unreachable (${probe.code})`);
  return result(STATUS.FAIL, `modern handshake failed (${probe.code ?? "no code"})`);
}

/**
 * Postgres TLS with the pinned CA: PASS needs a chain that verifies.
 * @param {{ ok: boolean, code?: string, protocol?: string }} probe
 */
export function classifyDatabaseTls(probe) {
  if (probe.ok) return result(STATUS.PASS, `chain verified against the pinned CA (${probe.protocol})`);
  if (UNREACHABLE.has(probe.code)) return result(STATUS.SKIP, `pooler unreachable (${probe.code})`);
  return result(STATUS.FAIL, `TLS to the pooler did not verify (${probe.code ?? "no code"})`);
}

/**
 * Anonymous call to a SECURITY DEFINER RPC with its FULL signature. PASS needs
 * a privilege refusal (SQLSTATE 42501). A signature miss (PGRST202) means the
 * probe never reached the function.
 * @param {{ status: number, body: unknown }} response
 */
export function classifyAnonRpc(response) {
  const code = response.body && typeof response.body === "object" ? response.body.code : undefined;
  if ((response.status === 401 || response.status === 403) && code === "42501") {
    return result(STATUS.PASS, `permission denied (HTTP ${response.status}, 42501)`);
  }
  if (code === "PGRST202") return result(STATUS.FAIL, "probe signature no longer matches the function; the grant was not tested");
  if (response.status >= 200 && response.status < 300) return result(STATUS.FAIL, `anonymous call executed (HTTP ${response.status})`);
  return result(STATUS.WARN, `unexpected response (HTTP ${response.status}, ${code ?? "no code"})`);
}

/**
 * Anonymous table read: must be refused by privilege, not merely filtered.
 * @param {{ status: number, body: unknown }} response
 */
export function classifyAnonRead(response) {
  if (response.status === 401 || response.status === 403) return result(STATUS.PASS, `HTTP ${response.status}`);
  if (response.status >= 200 && response.status < 300) {
    if (Array.isArray(response.body) && response.body.length === 0) {
      return result(STATUS.WARN, "readable but empty: filtered by RLS, not refused by privilege");
    }
    return result(STATUS.FAIL, "anonymous read returned rows");
  }
  return result(STATUS.WARN, `unexpected HTTP ${response.status}`);
}

/**
 * Anonymous storage listing must return nothing.
 * @param {{ status: number, body: unknown }} response
 */
export function classifyAnonList(response) {
  if (response.status >= 200 && response.status < 300) {
    return Array.isArray(response.body) && response.body.length > 0
      ? result(STATUS.FAIL, `anonymous listing returned ${response.body.length} object(s)`)
      : result(STATUS.PASS, "anonymous listing returned nothing");
  }
  if ([400, 401, 403, 404].includes(response.status)) return result(STATUS.PASS, `refused (HTTP ${response.status})`);
  return result(STATUS.WARN, `unexpected HTTP ${response.status}`);
}

/**
 * An edge function called without credentials. 401 proves the module booted
 * and its JWT check ran; a 5xx is a boot or runtime failure.
 * @param {number} status
 */
export function classifyEdgeAuthGate(status) {
  if (status === 401) return result(STATUS.PASS, "401");
  if (status >= 500) return result(STATUS.FAIL, `HTTP ${status} (boot or runtime error)`);
  if (status >= 200 && status < 300) return result(STATUS.FAIL, `HTTP ${status} without credentials`);
  return result(STATUS.WARN, `HTTP ${status}`);
}

/**
 * Deployed edge versions must not drop below the hardened release manifest,
 * which would mean a rollback to code without rate limits or provider policy.
 * @param {Array<{ slug: string, version: number }>} deployed
 * @param {Record<string, number>} manifest
 */
export function classifyEdgeVersions(deployed, manifest) {
  const problems = [];
  for (const [slug, minimum] of Object.entries(manifest)) {
    const fn = deployed.find((f) => f.slug === slug);
    if (!fn) problems.push(`${slug} missing`);
    else if (fn.version < minimum) problems.push(`${slug} v${fn.version} < v${minimum}`);
  }
  return problems.length
    ? result(STATUS.FAIL, problems.join("; "))
    : result(STATUS.PASS, `${Object.keys(manifest).length} functions at or above the hardened release`);
}

/**
 * A catalog count: 0 violations passes. -1 is the convention for "the object
 * this check guards does not exist yet" (an owner action is pending).
 * @param {number} n
 */
export function classifyCount(n) {
  if (n === 0) return result(STATUS.PASS, "violations=0");
  if (n < 0) return result(STATUS.WARN, "not yet applied in this project");
  return result(STATUS.FAIL, `violations=${n}`);
}

/**
 * Security headers expected on an HTML response.
 * @param {{ get(name: string): string | null }} headers
 */
export function headerChecks(headers) {
  const h = (name) => headers.get(name) ?? "";
  const csp = h("content-security-policy");
  const hsts = /max-age=(\d+)/.exec(h("strict-transport-security"));
  return [
    ["HDR-1", "CSP with per-request nonce", /'nonce-[^']+'/.test(csp)],
    ["HDR-2", "Framing blocked (frame-ancestors 'none' or X-Frame-Options DENY)",
      /frame-ancestors 'none'/.test(csp) || h("x-frame-options").toUpperCase() === "DENY"],
    ["HDR-3", "HSTS max-age >= 1 year", !!hsts && Number(hsts[1]) >= 31536000],
    ["HDR-4", "X-Content-Type-Options nosniff", h("x-content-type-options") === "nosniff"],
    ["HDR-5", "Referrer-Policy set", Boolean(h("referrer-policy"))],
    ["HDR-6", "Permissions-Policy set", Boolean(h("permissions-policy"))],
  ].map(([id, control, ok]) => ({ id, control, ...result(ok ? STATUS.PASS : STATUS.FAIL, ok ? "present" : "missing or weak") }));
}

/**
 * @param {Array<{ status: string }>} results
 * @param {{ strict?: boolean }} [options]
 */
export function summarize(results, options = {}) {
  const counts = Object.fromEntries(Object.values(STATUS).map((s) => [s, results.filter((r) => r.status === s).length]));
  const failed = counts.FAIL > 0 || (options.strict === true && counts.WARN > 0);
  return { counts, failed };
}

/**
 * @param {string} stamp
 * @param {string} target
 * @param {Array<{ id: string, control: string, status: string, detail: string, owner?: string }>} results
 * @param {{ strict?: boolean }} [options]
 */
export function toMarkdown(stamp, target, results, options = {}) {
  const { counts, failed } = summarize(results, options);
  const cell = (s) => String(s ?? "").replace(/\|/g, "\\|");
  return [
    `## ${stamp} posture check v2 — ${failed ? "FAIL" : "PASS"}`,
    "",
    `Target: ${target}. PASS ${counts.PASS} · FAIL ${counts.FAIL} · WARN ${counts.WARN} · SKIP ${counts.SKIP}${options.strict ? " (strict: WARN fails)" : ""}`,
    "",
    "| ID | Control | Status | Detail | Owner action |",
    "|---|---|---|---|---|",
    ...results.map((r) => `| ${r.id} | ${cell(r.control)} | ${r.status} | ${cell(r.detail)} | ${r.owner ?? ""} |`),
    "",
  ].join("\n");
}
