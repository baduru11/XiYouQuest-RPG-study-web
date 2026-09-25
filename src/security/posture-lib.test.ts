import { describe, expect, it } from "vitest";

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
} from "../../scripts/security/posture-lib.mjs";

describe("legacy TLS / weak cipher offers", () => {
  it("fails when the server accepts the offer", () => {
    expect(classifyLegacyOffer({ handshake: true, protocol: "TLSv1.1" }).status).toBe(STATUS.FAIL);
  });

  it("passes only when the server itself refuses", () => {
    expect(classifyLegacyOffer({ handshake: false, code: "ERR_SSL_TLSV1_ALERT_PROTOCOL_VERSION" }).status).toBe(STATUS.PASS);
  });

  // Regression: v1 scored this client-side refusal as PASS.
  it.each(["ERR_SSL_NO_PROTOCOLS_AVAILABLE", "ERR_SSL_NO_CIPHER_MATCH"])(
    "never passes when the client could not make the offer (%s)",
    (code) => {
      expect(classifyLegacyOffer({ handshake: false, code }).status).toBe(STATUS.SKIP);
    },
  );

  it.each(["ENOTFOUND", "ETIMEDOUT", "TIMEOUT", "ECONNREFUSED"])("skips an unreachable host (%s)", (code) => {
    expect(classifyLegacyOffer({ handshake: false, code }).status).toBe(STATUS.SKIP);
  });

  it("does not pass an unrecognised outcome", () => {
    expect(classifyLegacyOffer({ handshake: false, code: "SOMETHING_NEW" }).status).toBe(STATUS.WARN);
  });
});

describe("modern and database TLS", () => {
  it("requires a completed modern handshake", () => {
    expect(classifyModernTls({ handshake: true, protocol: "TLSv1.3" }).status).toBe(STATUS.PASS);
    expect(classifyModernTls({ handshake: false, code: "ERR_SSL_SSLV3_ALERT_HANDSHAKE_FAILURE" }).status).toBe(STATUS.FAIL);
    expect(classifyModernTls({ handshake: false, code: "ENOTFOUND" }).status).toBe(STATUS.SKIP);
  });

  it("fails a database chain that does not verify against the pinned CA", () => {
    expect(classifyDatabaseTls({ ok: true, protocol: "TLSv1.3" }).status).toBe(STATUS.PASS);
    expect(classifyDatabaseTls({ ok: false, code: "SELF_SIGNED_CERT_IN_CHAIN" }).status).toBe(STATUS.FAIL);
    expect(classifyDatabaseTls({ ok: false, code: "SSL_NOT_SUPPORTED" }).status).toBe(STATUS.FAIL);
  });
});

describe("anonymous PostgREST probes", () => {
  it("passes an RPC only on a privilege refusal", () => {
    expect(classifyAnonRpc({ status: 401, body: { code: "42501" } }).status).toBe(STATUS.PASS);
  });

  // Regression: v1 scored this signature miss as PASS.
  it("fails a signature miss, which never tested the grant", () => {
    expect(classifyAnonRpc({ status: 404, body: { code: "PGRST202" } }).status).toBe(STATUS.FAIL);
  });

  it("fails an executed anonymous call", () => {
    expect(classifyAnonRpc({ status: 200, body: [] }).status).toBe(STATUS.FAIL);
  });

  it("distinguishes a privilege refusal from an RLS-filtered empty read", () => {
    expect(classifyAnonRead({ status: 401, body: { code: "42501" } }).status).toBe(STATUS.PASS);
    expect(classifyAnonRead({ status: 403, body: { code: "42501" } }).status).toBe(STATUS.PASS);
    expect(classifyAnonRead({ status: 200, body: [] }).status).toBe(STATUS.WARN);
    expect(classifyAnonRead({ status: 200, body: [{ id: 1 }] }).status).toBe(STATUS.FAIL);
  });

  // Negative control: a key the gateway rejects (disabled legacy key, typo)
  // never reaches the database, so a 401 alone proves nothing about grants.
  it("does not pass a read the gateway refused before the database", () => {
    expect(classifyAnonRead({ status: 401, body: { message: "Invalid API key" } }).status).toBe(STATUS.WARN);
    expect(classifyAnonRead({ status: 401, body: null }).status).toBe(STATUS.WARN);
  });

  it("fails an anonymous storage listing that returns objects", () => {
    expect(classifyAnonList({ status: 200, body: [] }).status).toBe(STATUS.PASS);
    expect(classifyAnonList({ status: 200, body: [{ name: "a.png" }] }).status).toBe(STATUS.FAIL);
  });

  it("does not pass a storage listing refused before it ran", () => {
    expect(classifyAnonList({ status: 401, body: { message: "Invalid Compact JWS" } }).status).toBe(STATUS.WARN);
    expect(classifyAnonList({ status: 403, body: null }).status).toBe(STATUS.WARN);
  });
});

describe("edge functions", () => {
  it("treats 401 as a booted, gated function and 5xx as a failure", () => {
    expect(classifyEdgeAuthGate(401).status).toBe(STATUS.PASS);
    expect(classifyEdgeAuthGate(503).status).toBe(STATUS.FAIL);
    expect(classifyEdgeAuthGate(200).status).toBe(STATUS.FAIL);
  });

  it("fails a rollback below the hardened manifest", () => {
    const manifest = { "ai-feedback": 15, "tts-speak": 16 };
    expect(classifyEdgeVersions([{ slug: "ai-feedback", version: 15 }, { slug: "tts-speak", version: 17 }], manifest).status)
      .toBe(STATUS.PASS);
    expect(classifyEdgeVersions([{ slug: "ai-feedback", version: 14 }, { slug: "tts-speak", version: 17 }], manifest).status)
      .toBe(STATUS.FAIL);
    expect(classifyEdgeVersions([{ slug: "ai-feedback", version: 15 }], manifest).detail).toContain("tts-speak missing");
  });
});

describe("catalog counts and headers", () => {
  it("maps counts to PASS, pending (WARN) and FAIL", () => {
    expect(classifyCount(0).status).toBe(STATUS.PASS);
    expect(classifyCount(-1).status).toBe(STATUS.WARN);
    expect(classifyCount(3).status).toBe(STATUS.FAIL);
  });

  it("checks every security header", () => {
    const good = new Headers({
      "content-security-policy": "script-src 'self' 'nonce-abc' 'strict-dynamic'; frame-ancestors 'none'",
      "strict-transport-security": "max-age=63072000; includeSubDomains",
      "x-content-type-options": "nosniff",
      "referrer-policy": "strict-origin-when-cross-origin",
      "permissions-policy": "camera=()",
    });
    expect(headerChecks(good).every((r) => r.status === STATUS.PASS)).toBe(true);
    const weak = new Headers({ "strict-transport-security": "max-age=600" });
    expect(headerChecks(weak).filter((r) => r.status === STATUS.FAIL)).toHaveLength(6);
  });
});

describe("summary", () => {
  const rows = [
    { id: "A", control: "a", status: STATUS.PASS, detail: "" },
    { id: "B", control: "b", status: STATUS.WARN, detail: "", owner: "OA-2" },
  ];

  it("fails on WARN only in strict mode", () => {
    expect(summarize(rows).failed).toBe(false);
    expect(summarize(rows, { strict: true }).failed).toBe(true);
  });

  it("renders owner actions and escapes pipes", () => {
    const md = toMarkdown("2026-09-25T00:00:00Z", "target", [
      ...rows,
      { id: "C", control: "x|y", status: STATUS.FAIL, detail: "a|b" },
    ]);
    expect(md).toContain("| B | b | WARN |  | OA-2 |");
    expect(md).toContain("x\\|y");
    expect(md).toContain("— FAIL");
  });
});
