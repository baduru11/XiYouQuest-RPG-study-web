/**
 * TLS for the Better Auth Postgres pool (src/lib/auth.ts).
 *
 * Why this module exists: node-postgres lets an `sslmode` in the connection
 * string silently override an explicit `ssl` option. `sslmode=require` becomes
 * verify-full against the system CA store (which rejects Supabase's private CA)
 * and `sslmode=disable` turns TLS off, so the only reliable way to pin
 * verification is to strip every TLS parameter from the URL and set `ssl`
 * ourselves. Verified empirically against pg 8.22 / pg-connection-string 2.14.
 *
 * The pinned root is Supabase's published database CA ("Supabase Root 2021 CA",
 * valid to 2031-04-26), downloaded from
 * https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt
 * and verified on 2026-09-24 to anchor the ap-south-1 pooler chain
 * (TLS 1.3, psql sslmode=verify-full reached password authentication).
 */

export const SUPABASE_ROOT_CA_2021 = `-----BEGIN CERTIFICATE-----
MIIDxDCCAqygAwIBAgIUbLxMod62P2ktCiAkxnKJwtE9VPYwDQYJKoZIhvcNAQEL
BQAwazELMAkGA1UEBhMCVVMxEDAOBgNVBAgMB0RlbHdhcmUxEzARBgNVBAcMCk5l
dyBDYXN0bGUxFTATBgNVBAoMDFN1cGFiYXNlIEluYzEeMBwGA1UEAwwVU3VwYWJh
c2UgUm9vdCAyMDIxIENBMB4XDTIxMDQyODEwNTY1M1oXDTMxMDQyNjEwNTY1M1ow
azELMAkGA1UEBhMCVVMxEDAOBgNVBAgMB0RlbHdhcmUxEzARBgNVBAcMCk5ldyBD
YXN0bGUxFTATBgNVBAoMDFN1cGFiYXNlIEluYzEeMBwGA1UEAwwVU3VwYWJhc2Ug
Um9vdCAyMDIxIENBMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAqQXW
QyHOB+qR2GJobCq/CBmQ40G0oDmCC3mzVnn8sv4XNeWtE5XcEL0uVih7Jo4Dkx1Q
DmGHBH1zDfgs2qXiLb6xpw/CKQPypZW1JssOTMIfQppNQ87K75Ya0p25Y3ePS2t2
GtvHxNjUV6kjOZjEn2yWEcBdpOVCUYBVFBNMB4YBHkNRDa/+S4uywAoaTWnCJLUi
cvTlHmMw6xSQQn1UfRQHk50DMCEJ7Cy1RxrZJrkXXRP3LqQL2ijJ6F4yMfh+Gyb4
O4XajoVj/+R4GwywKYrrS8PrSNtwxr5StlQO8zIQUSMiq26wM8mgELFlS/32Uclt
NaQ1xBRizkzpZct9DwIDAQABo2AwXjALBgNVHQ8EBAMCAQYwHQYDVR0OBBYEFKjX
uXY32CztkhImng4yJNUtaUYsMB8GA1UdIwQYMBaAFKjXuXY32CztkhImng4yJNUt
aUYsMA8GA1UdEwEB/wQFMAMBAf8wDQYJKoZIhvcNAQELBQADggEBAB8spzNn+4VU
tVxbdMaX+39Z50sc7uATmus16jmmHjhIHz+l/9GlJ5KqAMOx26mPZgfzG7oneL2b
VW+WgYUkTT3XEPFWnTp2RJwQao8/tYPXWEJDc0WVQHrpmnWOFKU/d3MqBgBm5y+6
jB81TU/RG2rVerPDWP+1MMcNNy0491CTL5XQZ7JfDJJ9CCmXSdtTl4uUQnSuv/Qx
Cea13BX2ZgJc7Au30vihLhub52De4P/4gonKsNHYdbWjg7OWKwNv/zitGDVDB9Y2
CMTyZKG3XEu5Ghl1LEnI3QmEKsqaCLv12BnVjbkSeZsMnevJPs1Ye6TjjJwdik5P
o/bKiIz+Fq8=
-----END CERTIFICATE-----
`;

/** SHA-256 fingerprint of SUPABASE_ROOT_CA_2021, checked by db-tls.test.ts. */
export const SUPABASE_ROOT_CA_2021_SHA256 =
  "80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA";

// Every connection-string parameter that node-postgres maps onto `ssl`.
const TLS_URL_PARAMS = [
  "ssl",
  "sslmode",
  "sslrootcert",
  "sslcert",
  "sslkey",
  "sslcrl",
  "sslnegotiation",
  "uselibpqcompat",
];

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export type AuthPoolTls =
  | false
  | { ca: string; rejectUnauthorized: true };

export interface AuthPoolConnection {
  connectionString: string;
  ssl: AuthPoolTls;
}

/**
 * Normalises the Better Auth database URL and decides its TLS settings.
 *
 * - Forces the Supabase transaction pooler port (6543): the session pooler
 *   (5432) caps at 15 clients and is exhausted under serverless concurrency.
 * - Removes every TLS query parameter so it cannot override `ssl`.
 * - Local development hosts get plain TCP (local Supabase has no TLS);
 *   every other host must present a chain that verifies against the pinned
 *   Supabase root, with hostname verification left on.
 */
export function buildAuthPoolConnection(rawUrl: string): AuthPoolConnection {
  const url = new URL(rawUrl.replace(/:5432\/(?=[^/]*$)/, ":6543/"));
  for (const param of TLS_URL_PARAMS) url.searchParams.delete(param);

  const ssl: AuthPoolTls = LOCAL_HOSTS.has(url.hostname)
    ? false
    : { ca: SUPABASE_ROOT_CA_2021, rejectUnauthorized: true };

  return { connectionString: url.toString(), ssl };
}
