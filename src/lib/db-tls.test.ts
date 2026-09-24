// @vitest-environment node

import { X509Certificate } from "node:crypto";
import { Client } from "pg";
import { describe, expect, it } from "vitest";

import {
  SUPABASE_ROOT_CA_2021,
  SUPABASE_ROOT_CA_2021_SHA256,
  buildAuthPoolConnection,
} from "@/lib/db-tls";

const POOLER =
  "postgresql://postgres.ref:secret@aws-1-ap-south-1.pooler.supabase.com:6543/postgres";

describe("buildAuthPoolConnection", () => {
  it("pins the Supabase root CA with verification on for remote hosts", () => {
    const { ssl } = buildAuthPoolConnection(POOLER);
    expect(ssl).toEqual({ ca: SUPABASE_ROOT_CA_2021, rejectUnauthorized: true });
  });

  it.each(["require", "disable", "prefer", "no-verify", "verify-ca"])(
    "strips sslmode=%s so it cannot override the pinned TLS settings",
    (mode) => {
      const { connectionString, ssl } = buildAuthPoolConnection(
        `${POOLER}?sslmode=${mode}&sslrootcert=/tmp/x.crt&uselibpqcompat=true`,
      );
      expect(connectionString).not.toMatch(/ssl|uselibpqcompat/);
      // The real pg client must end up with exactly the pinned settings: this is
      // the regression guard for pg's "connection string overrides ssl" merge.
      // connectionParameters is pg's resolved config; it is not in the public types.
      const client = new Client({ connectionString, ssl }) as unknown as {
        connectionParameters: { ssl: unknown };
      };
      expect(client.connectionParameters.ssl).toEqual({
        ca: SUPABASE_ROOT_CA_2021,
        rejectUnauthorized: true,
      });
    },
  );

  it("keeps unrelated parameters and credentials intact", () => {
    const { connectionString } = buildAuthPoolConnection(
      `${POOLER}?application_name=xyq&sslmode=require`,
    );
    const url = new URL(connectionString);
    expect(url.username).toBe("postgres.ref");
    expect(url.password).toBe("secret");
    expect(url.searchParams.get("application_name")).toBe("xyq");
  });

  it("moves the session pooler port to the transaction pooler", () => {
    const { connectionString } = buildAuthPoolConnection(
      POOLER.replace(":6543/", ":5432/"),
    );
    expect(new URL(connectionString).port).toBe("6543");
  });

  it("uses plain TCP only for local development hosts", () => {
    expect(
      buildAuthPoolConnection("postgresql://postgres:postgres@localhost:54322/postgres").ssl,
    ).toBe(false);
    expect(
      buildAuthPoolConnection("postgresql://postgres:postgres@127.0.0.1:54322/postgres").ssl,
    ).toBe(false);
  });
});

describe("SUPABASE_ROOT_CA_2021", () => {
  it("is the published Supabase root, identified by its SHA-256 fingerprint", () => {
    const cert = new X509Certificate(SUPABASE_ROOT_CA_2021);
    expect(cert.fingerprint256).toBe(SUPABASE_ROOT_CA_2021_SHA256);
    expect(cert.subject).toContain("CN=Supabase Root 2021 CA");
    expect(cert.ca).toBe(true);
    expect(new Date(cert.validTo).getUTCFullYear()).toBe(2031);
  });
});

describe("auth.ts wiring", () => {
  it("builds the Better Auth pool from buildAuthPoolConnection", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync("src/lib/auth.ts", "utf8");
    expect(source).toContain("buildAuthPoolConnection(");
    expect(source).toMatch(/new Pool\(\{[\s\S]*?\bssl\b[\s\S]*?\}\)/);
  });
});
