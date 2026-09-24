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

