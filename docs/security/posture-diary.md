# Security posture diary

Append-only. One entry per posture-check pass (docs/security/README.md).

## 2026-09-24T06:01:35Z posture check — FAIL

Target: https://cle-xyq.hkust.edu.hk, project yfoifmqjhavxidomgids. PASS 11 · FAIL 1 · WARN 1 · SKIP 0

| ID | Control | Status | Detail |
|---|---|---|---|
| DB-1 | RLS enabled on every public table | PASS | violations=0 |
| DB-2 | No anon/authenticated privilege on public tables | PASS | violations=0 |
| DB-3 | No anon/authenticated EXECUTE on public functions | PASS | violations=0 |
| DB-4 | SECURITY DEFINER functions pin search_path | PASS | violations=0 |
| DB-5 | No client-role storage policies (uploads are server-only) | PASS | violations=0 |
| DB-6 | No plaintext OAuth tokens stored | PASS | violations=0 |
| AUTH-1 | Supabase Auth sign-up disabled (identity is HKUST SSO only) | WARN | disable_signup=false, email provider on, google provider on, discord provider on |
| ANON-1 | Anonymous read of profiles refused | PASS | HTTP 401 |
| ANON-2 | Anonymous read of chat_messages refused | PASS | HTTP 401 |
| ANON-3 | Anonymous call to record_practice_progress refused | PASS | HTTP 404 |
| HDR-0 | App reachable at https://cle-xyq.hkust.edu.hk | FAIL | fetch failed |
| TLS-1 | TLS 1.0/1.1 refused (HKUST TLS guideline: TLS 1.2+) | PASS | legacy handshake refused |
| TLS-2 | Modern TLS handshake succeeds | PASS |  |

## 2026-09-24T06:05:32Z posture check — PASS

Target: https://cle-xyq.hkust.edu.hk, project yfoifmqjhavxidomgids. PASS 17 · FAIL 0 · WARN 1 · SKIP 0

| ID | Control | Status | Detail |
|---|---|---|---|
| DB-1 | RLS enabled on every public table | PASS | violations=0 |
| DB-2 | No anon/authenticated privilege on public tables | PASS | violations=0 |
| DB-3 | No anon/authenticated EXECUTE on public functions | PASS | violations=0 |
| DB-4 | SECURITY DEFINER functions pin search_path | PASS | violations=0 |
| DB-5 | No client-role storage policies (uploads are server-only) | PASS | violations=0 |
| DB-6 | No plaintext OAuth tokens stored | PASS | violations=0 |
| AUTH-1 | Supabase Auth sign-up disabled (identity is HKUST SSO only) | WARN | disable_signup=false, email provider on, google provider on, discord provider on |
| ANON-1 | Anonymous read of profiles refused | PASS | HTTP 401 |
| ANON-2 | Anonymous read of chat_messages refused | PASS | HTTP 401 |
| ANON-3 | Anonymous call to record_practice_progress refused | PASS | HTTP 404 |
| HDR-1 | CSP with per-request nonce | PASS | status 200 |
| HDR-2 | CSP blocks framing (frame-ancestors or X-Frame-Options DENY) | PASS | status 200 |
| HDR-3 | HSTS max-age >= 1 year | PASS | status 200 |
| HDR-4 | X-Content-Type-Options nosniff | PASS | status 200 |
| HDR-5 | Referrer-Policy set | PASS | status 200 |
| HDR-6 | Permissions-Policy set | PASS | status 200 |
| TLS-1 | TLS 1.0/1.1 refused (HKUST TLS guideline: TLS 1.2+) | PASS | legacy handshake refused |
| TLS-2 | Modern TLS handshake succeeds | PASS |  |

## 2026-09-25T02:47:49Z posture check v2 — PASS

Target: https://cle-xyq.hkust.edu.hk, project yfoifmqjhavxidomgids, timeout 20s. PASS 23 · FAIL 0 · WARN 7 · SKIP 2

| ID | Control | Status | Detail | Owner action |
|---|---|---|---|---|
| DB-1 | RLS enabled on every public table | PASS | violations=0 |  |
| DB-2 | No anon/authenticated privilege on any table, view or column (public, better_auth) | PASS | violations=0 |  |
| DB-3 | No anon/authenticated EXECUTE on public functions | PASS | violations=0 |  |
| DB-4 | SECURITY DEFINER functions pin search_path | PASS | violations=0 |  |
| DB-5 | No client-role storage policies (uploads are server-only) | PASS | violations=0 |  |
| DB-6 | No plaintext OAuth tokens stored | PASS | violations=0 |  |
| DB-7 | Security event log is append-only for the app (service_role holds no table privilege) | WARN | not yet applied in this project | OA-5 |
| DB-8 | Public chat-images bucket restricted to raster image types | WARN | not yet applied in this project | OA-5 |
| DB-9 | No non-image objects in the public buckets | PASS | violations=0 |  |
| AUTH-1 | Supabase Auth sign-up and providers disabled (identity is HKUST SSO only) | WARN | disable_signup=false, email on, google on, discord on | OA-2 |
| AUTH-2 | Legacy HS256 JWT secret no longer verifies tokens | WARN | HS256 key status: previously_used | OA-1 |
| PLAT-1 | Database rejects non-TLS connections (SSL enforcement) | WARN | not enforced | OA-4 |
| PLAT-2 | Database backups exist | WARN | no backups and no point-in-time recovery | OA-3 |
| PLAT-3 | Deployed edge functions not rolled back below the hardened release | PASS | 11 functions at or above the hardened release |  |
| ANON-1 | Anonymous read of profiles refused | PASS | HTTP 401 |  |
| ANON-2 | Anonymous read of chat_messages refused | PASS | HTTP 401 |  |
| ANON-3 | Anonymous call to record_practice_progress refused by privilege | PASS | permission denied (HTTP 401, 42501) |  |
| ANON-4 | Anonymous listing of the avatars bucket returns nothing | PASS | anonymous listing returned nothing |  |
| EDGE-1 | Every edge function boots and refuses unauthenticated calls | PASS | 11/11 returned 401 |  |
| WEB-0 | App reachable at https://cle-xyq.hkust.edu.hk | PASS | HTTP 200 |  |
| HDR-1 | CSP with per-request nonce | PASS | present |  |
| HDR-2 | Framing blocked (frame-ancestors 'none' or X-Frame-Options DENY) | PASS | present |  |
| HDR-3 | HSTS max-age >= 1 year | PASS | present |  |
| HDR-4 | X-Content-Type-Options nosniff | PASS | present |  |
| HDR-5 | Referrer-Policy set | PASS | present |  |
| HDR-6 | Permissions-Policy set | PASS | present |  |
| DEPLOY-1 | Hardened release is live (security.txt served) | WARN | HTTP 404 | OA-6 |
| CSRF-1 | Cross-site API write refused before authentication | SKIP | hardened release not live yet |  |
| TLS-1 | TLS 1.0/1.1 refused by the server | PASS | server refused (ERR_SSL_TLSV1_ALERT_PROTOCOL_VERSION) |  |
| TLS-2 | Modern TLS (1.2+) handshake with a valid certificate | PASS | negotiated TLSv1.3 |  |
| TLS-3 | 3DES cipher refused (ITSO TLS cipher guideline) | SKIP | this runtime cannot make the offer (ERR_SSL_NO_CIPHER_MATCH); verify with an external scanner |  |
| DBTLS-1 | Database pooler chain verifies against the pinned Supabase CA (aws-1-ap-south-1.pooler.supabase.com) | PASS | chain verified against the pinned CA (TLSv1.3) |  |


## 2026-09-25 correction

The 2026-09-24 entries above reported TLS-1 and ANON-3 as PASS using posture
check v1 probes that could not fail (see
[evidence/2026-09-25-deep-pass.md](evidence/2026-09-25-deep-pass.md)). Treat
those two rows as unverified. Entries from posture check v2 onward are based on
evidence-backed verdicts.
