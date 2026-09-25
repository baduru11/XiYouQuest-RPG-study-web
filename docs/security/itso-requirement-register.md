# HKUST ITSO requirement register: XiYouQuest

Every HKUST ITSO requirement that applies to XiYouQuest, how the system meets
it, the evidence, and who closes what is still open. Requirements are
paraphrased and anchored to the row identifiers of the source documents
(linked in section 2), which remain the authority.

- **Status date:** 2026-09-25.
- **Code:** branch `security/hkust-hardening`. "Branch" in the Evidence column
  means the control is in this branch and not yet in production.
- **Production:** web app = upstream `main` 66d4824 (deployed 2026-09-05,
  before this hardening). Edge functions = the hardened release from this
  branch, deployed 2026-09-25 (versions in `scripts/security/edge-manifest.json`).
- **Live posture (2026-09-25 02:29Z):** 23 PASS, 0 FAIL, 7 WARN, 2 SKIP; every
  WARN maps to an owner action. Details: [posture-diary.md](posture-diary.md).

## 1. Classification

| Question | Answer | Source |
|---|---|---|
| Risk category | **High-risk.** Student and staff personal records are high-risk data, and an application system handling high-risk data is a high-risk application. | Risk Classification, "Data Level" and "Application System Level" |
| Data classification | **Sensitive (high protection)** for identity (PII) and assessment-related records (practice and mock-exam scores, pronunciation results). | Data Classification Guidelines, typical types: PII, academic records |
| Consequence | The High column of every Minimum Security Standard table applies; high-risk data handling practices are mandatory. | MSS preamble; Acceptable Practices preamble |

Where this register and a looser reading could differ, the High-risk
requirement is applied (Risk Classification: "apply the stronger protection
measure if in doubt").

## 2. Sources

All read on 2026-09-24/25 from `itso.hkust.edu.hk` unless noted.

| Short name | Document | Status when read |
|---|---|---|
| RC | [Risk Classification Examples](https://itso.hkust.edu.hk/it-policies-guidelines/risk-classification) | Read |
| HRD | [Acceptable Practices for Handling High Risk Data](https://itso.hkust.edu.hk/it-policies-guidelines/acceptable-practices-for-handling-restricted-and-confidential-data) | Read |
| MSS | [Minimum Security Standard](https://itso.hkust.edu.hk/it-policies-guidelines/minimum-security-standard) (Endpoints, Servers, Application Systems, SaaS on Cloud) | Read |
| DC | [HKUST Data Classification Guidelines](https://itso.hkust.edu.hk/it-policies-guidelines/hkust-data-classification-guidelines/) | Read |
| ADG | [Application Development Guidelines](https://itso.hkust.edu.hk/it-policies-guidelines/application-development) | Read |
| WASG | Guidelines on Web Application Security v2.1 (15 Oct 2025), PDF linked from ADG | Read |
| PIA | Personal Data Privacy Impact Assessment Form (PDF linked from ADG) | Read |
| CSP | [Guidelines on choosing Cloud Service Provider](https://itso.hkust.edu.hk/services/cyber-security/guidelines-choosing-cloud-service-provider) and `CSP_checklist.xlsx` | Read |
| PAM | [Acceptable Practices for Privilege Account Management](https://itso.hkust.edu.hk/it-policies-guidelines/acceptable-practices-for-privilege-account-management/) | Read |
| PATCH | [Acceptable Practices for Server Patch Management](https://itso.hkust.edu.hk/it-policies-guidelines/acceptable-practices-for-server-patch-management/) (revised 27 Nov 2024) | Read |
| TLS | [TLS Cipher Hardening Guideline](https://itso.hkust.edu.hk/services/cyber-security/cipherguideline) | Read |
| INC | [Cybersecurity Incident Handling Policy](https://itso.hkust.edu.hk/it-policies-guidelines/cyber-security-incident-handling-policy/) and [Escalation Procedure](https://itso.hkust.edu.hk/it-policies-guidelines/escalation-procedure-cybersecurity-incident/) | Read |
| DD | [Data Destruction Policy](https://itso.hkust.edu.hk/it-policies-guidelines/data-destruction-policy) | Read |
| GAI | [Generative AI Usage Guidelines](https://itso.hkust.edu.hk/services/general-it-services/generative-ai-tools/guidelines) | Read |
| GOV | [Cybersecurity Policy](https://itso.hkust.edu.hk/it-policies-guidelines/cyber-security-policy/), [CITARS](https://itso.hkust.edu.hk/cyber-security/citars), [Adoption of New Technologies Policy](https://itso.hkust.edu.hk/it-policies-guidelines/adoption-new-technologies-policy), [Health Check](https://itso.hkust.edu.hk/services/cyber-security/web-application-health-check-scanning) | Read |
| PPS | [University Data Privacy Policy Statement](https://dataprivacy.ust.hk/university-data-privacy-policy-statement/) | Read |
| (gap) | Logging Application Enhancements; Change Management | HTTP 500 on 2026-09-24 and 2026-09-25; not assessed |
| (gap) | Common Vulnerabilities (KPMG audit summary) | HKUST staff login required; not assessed (OA-8) |

The corpus also covers the PCPD guidance on cloud computing (January 2025) and
on privacy impact assessments, which ITSO's documents cite.

## 3. Status legend

- **Met**: the control exists and the evidence column proves it.
- **Met (branch)**: implemented and tested in this branch, live after OA-6.
- **Partial**: some of the requirement is met; the rest is named.
- **Gap**: not met; an owner action closes it.
- **Deviation**: deliberately different from the letter of the guideline, with
  the reason; needs ITSO acceptance (OA-8).
- **Provider**: met by a managed platform (Vercel, Supabase); evidence is the
  provider's attestation, collected through the CSP checklist.
- **N-A**: does not apply, with the reason.

## 4. Minimum Security Standard: Application Systems (High column)

| ID | Requirement | Status | Evidence | Open item |
|---|---|---|---|---|
| MSS-APP-1 | Keep an up-to-date IT resource record (CITARS) | Gap | None registered | OA-8 (CITARS) |
| MSS-APP-2 | Apply security fixes within 28 days, or configure protection | Partial | `npm audit --omit=dev` shows 0 high/critical; CI audit and weekly Dependabot (`.github/workflows/ci.yml`, `.github/dependabot.yml`); edge imports pinned to the tested versions and enforced by `src/lib/rate-limit.test.ts` | CI does not run upstream until OA-6/OA-7 |
| MSS-APP-3 | HTTPS for logon pages and high-risk data | Met | HSTS 2 years with preload; TLS 1.0/1.1 refused by the server (posture TLS-1, genuine server alert); TLS 1.3 negotiated (TLS-2) | Database leg: see WASG-3.3 |
| MSS-APP-4 | Ongoing security fixes available for third-party software | Met | Next.js 16.3.6 (current), React 19, Better Auth 1.6, supabase-js 2.95, Node 22 LTS; managed platforms patched by providers | |
| MSS-APP-5 | Regular backup of data | Gap | Supabase Free plan: 0 backups, PITR off (posture PLAT-2) | OA-3 |
| MSS-APP-6 | Development follows the Application Development Guidelines | Partial | Sections 9 and 10 below | Items listed there |
| MSS-APP-7 | Vulnerability scan before deployment and regularly after | Partial | Weekly read-only posture check v2 (privileges, TLS, headers, edge gates, storage); CodeQL on push and PR (branch) | No DAST yet: ITSO Acunetix health check, OA-8 |
| MSS-APP-8 | Source code scanning before deployment and after major changes | Met (branch) | CodeQL `security-extended` and Gitleaks on every push and PR (`.github/workflows/security.yml`); two independent adversarial code reviews of this branch | Runs upstream after OA-6; ITSO Coverity scan requested in OA-8 |
| MSS-APP-9 | Security designed in from the initial phase | Partial | This register, the posture check, the PIA draft and the threat review were produced after launch | Retroactive; recorded as such in the PIA |

## 5. Minimum Security Standard: SaaS on Cloud (High column)

XiYouQuest runs on cloud services (Vercel, Supabase) and sends data to cloud
processors (iFLYTEK, OpenRouter and its model hosts). Per-provider detail is in
[csp-checklists.md](csp-checklists.md).

| ID | Requirement | Status | Evidence | Open item |
|---|---|---|---|---|
| MSS-SAAS-1 | Select providers following "Choosing Cloud Service Provider" | Partial | Assessment drafted per provider in csp-checklists.md | Endorsement and submission, OA-8 |
| MSS-SAAS-2 | Keep an up-to-date IT resource record | Gap | Not in CITARS | OA-8 |
| MSS-SAAS-3 | Integrate with ITSO SSO; review admin accounts regularly; ITSO password rules otherwise | Partial | Users sign in only through HKUST Microsoft Entra ID (OIDC), tenant-pinned and signature-verified (`src/lib/auth.ts`); email/password disabled | Admin account review OA-9; Supabase Auth's unused password sign-up OA-2 |
| MSS-SAAS-4 | TLS transport encryption | Met (branch for DB) | Browser to Vercel and Supabase: TLS 1.2+ (TLS-1, TLS-2). Vercel to database: pinned-CA verification in `src/lib/db-tls.ts`, verified live (DBTLS-1) | Live with OA-6; enforce with OA-4 |
| MSS-SAAS-5 | Enable MFA where the vendor provides it | Partial | Student and staff sign-in inherits HKUST Entra MFA policy | Administrator consoles unverified, OA-9 |
| MSS-SAAS-6 | Enable application logging that would support a forensic investigation | Met (branch) | Append-only `security_events` (sign-ins with IP and agent, refused sign-ins, exports, deletions, avatar uploads, rate-limit refusals), 180-day retention, app cannot read or alter it (`supabase/migrations/20260925090000_security_events.sql`, PGlite tests) | Table live in production since 2026-09-25 (OA-5 done); web-app events start with the release (OA-6); platform logs keep only 1 hour to 1 day (OA-3) |
| MSS-SAAS-7 | Contract that HKUST data is purged when the agreement ends | Partial | Supabase DPA: deletion within 30 days of termination | Vercel DPA covers Enterprise terms only; OpenRouter DPA not reviewed; iFLYTEK has none. OA-13 |
| MSS-SAAS-8 | Submit the CSP checklist and the provider's SOC 2 Type 2 report to ITSO before deployment | Gap | Deployed without it; checklists drafted | OA-8, OA-13; Supabase's report needs the Team plan (OA-3) |

## 6. Minimum Security Standard: Servers (High column)

There is no server under the project's control: Vercel runs the web app
(serverless) and Supabase runs Postgres and the edge functions. Operating-system
controls are the providers', evidenced through their attestations.

| ID | Requirement | Status | Evidence | Open item |
|---|---|---|---|---|
| MSS-SRV-1 | IT resource record | Gap | | OA-8 (one CITARS record covers the application) |
| MSS-SRV-2 | Supported OS | Provider | Managed runtimes; Postgres 17.6 | |
| MSS-SRV-3 | Patch management (NVD high within 1 week, others within 4 weeks) | Provider | Platform-managed | Application dependencies: MSS-APP-2 |
| MSS-SRV-4 | Malware protection | Provider | | |
| MSS-SRV-5 | OS hardening | Provider, plus database hardening | Client roles hold no table, column or function privilege (posture DB-1 to DB-5) | |
| MSS-SRV-6 | Privileged account management | Gap | | OA-9 |
| MSS-SRV-7 | Secure data centre | Provider | AWS ap-south-1 (Supabase), Vercel | |
| MSS-SRV-8 | Trained system administrator assigned | Gap | No named administrator | OA-14 |
| MSS-SRV-9 | Regular OS vulnerability scans (October exercise) | N-A for OS | No OS under our control; the exposed surface is covered by posture v2 | |
| MSS-SRV-10 | Encrypted backup | Gap | No backups | OA-3 |
| MSS-SRV-11 | Forward logs to a remote log server | Partial | Security events stored in the database (branch) | No log drain on current plans; OA-3 |
| MSS-SRV-12 | Destroy disk content on disposal | Provider | | |

## 7. Minimum Security Standard: Endpoints (High column)

Applies to every computer that stores production credentials or high-risk data
or reaches the admin consoles. Assessed on the maintainer Mac on 2026-09-24;
firewall re-checked on 2026-09-25.

| ID | Requirement | Status | Evidence | Open item |
|---|---|---|---|---|
| MSS-END-1 | Department inventory | Gap | | OA-12 |
| MSS-END-2 | Enrolled in Microsoft Intune | Gap | Not MDM-enrolled | OA-12 (decision with ITSO) |
| MSS-END-3 | Host firewall on | Met | Application firewall on since 2026-09-25 (`socketfilterfw --getglobalstate`: State = 1) | |
| MSS-END-4 | OS fixes within 7 days | Met | Automatic install on; no pending updates | |
| MSS-END-5 | Antivirus with real-time protection | Partial | macOS XProtect, Gatekeeper, SIP on; no Defender for Endpoint | OA-12 |
| MSS-END-6 | Vendor-supported OS | Met | macOS 27.0 | |
| MSS-END-7 | Logon required | Met | Screen lock immediate; FileVault on | |
| MSS-END-8 | Secure location | Owner attestation | | OA-12 |
| MSS-END-9 | Destroy disk content before disposal | Met in practice | FileVault full-disk encryption makes erase effective | OA-12 attestation |

## 8. Acceptable Practices for Handling High Risk Data

| ID | Practice | Status | Evidence | Open item |
|---|---|---|---|---|
| HRD-S1 | Avoid storing high-risk data on end-user devices; if unavoidable, minimise fields, encrypt, delete after use | Partial | This review read catalog metadata and aggregate counts only, never student rows; no student data file exists on the maintainer device | Credentials that can read production sit on the device: OA-12 |
| HRD-T1 | Encrypt high-risk data sent by email | Process | Runbook forbids emailing exports; the export file goes only to its data subject | |
| HRD-T2 | No transmission through public cloud except ITSO OneDrive, Teams, SharePoint | Deviation | Hosting a high-risk application on cloud services is governed by MSS for SaaS (section 5), which requires ITSO approval. That approval is missing | OA-8 |
| HRD-T3 | No public terminals | Process | Maintainer rule; student-side guidance in the privacy notice is not required | |
| HRD-T4 | Home computers: security software and VPN | Partial | See section 7 | OA-12 |
| HRD-D1 | Degauss or wipe disks before disposal | Owner attestation | | OA-12 |

## 9. Application Development Guidelines

| ID | Requirement | Status | Evidence | Open item |
|---|---|---|---|---|
| ADG-1 | Access control on sensitive locations and functions | Met | Proxy gate on every non-public path (`src/proxy.ts`); every route authenticates (`src/app/api/authz-matrix.test.ts`, 40 routes); ownership filters bound to the session user (`authz-cross-user.test.ts`); second review found no unscoped client-supplied id | Implicit account linking risk, OA-11 |
| ADG-2 | Encrypt sensitive data on public networks | Met (branch for DB) | See MSS-SAAS-4 | OA-4, OA-6 |
| ADG-3 | Validate input: type, syntax, length, characters, range | Met (branch) | zod schemas for every body and query (`src/lib/validations.ts` and the edge twin, parity-tested); bounds added for AI prompt inputs, progress counters, paging and report ids | |
| ADG-4 | Fix critical flaws found by security testing | Met (branch) | All confirmed review findings fixed or dispositioned (section 15) | Health-check findings once run, OA-8 |
| ADG-5 | Remove unused services and functions | Partial | Unreferenced content files removed from the web root | Unused GraphQL schema OA-15; Supabase Auth providers OA-2 |
| ADG-6 | Remove test data and accounts before production | Partial | All 28 application accounts are HKUST-domain users; the preview project holds no learner rows | Two dormant Supabase Auth accounts, OA-14 |
| ADG-7 | Design against the OWASP Top 10 | Partial | Section 10, Appendix A mapping | |
| ADG-8 | TLS; SSLv2/v3 disabled | Met | TLS-1 | |
| ADG-9 | Mitigate the common vulnerabilities from the KPMG audit | Unverified | Document requires HKUST staff login | OA-8 |
| ADG-10 | Anti-CSRF protection | Met (branch) | SameSite=Lax session cookies, plus refusal of cross-site API writes (`src/proxy.ts`, `src/proxy.csrf.test.ts`, posture CSRF-1), plus Better Auth's own origin checks | |
| ADG-11 | Submit the PIA to `seccomp@ust.hk` before publishing | Gap | App published without it | OA-8 (draft ready) |

## 10. Guidelines on Web Application Security v2.1

Grouped by section; every bullet of the guideline is covered by a row.

| ID | Requirement (bullets) | Status | Evidence | Open item |
|---|---|---|---|---|
| WASG-1.1 | Privacy and compliance check (PIA) before publication | Gap | | OA-8 |
| WASG-2.0 | Simple structure; validation; allowlists; boundary checks; safe temporary files; no dynamic globals; structured debugging | Met | TypeScript strict; allowlists for MIME types, voices, buckets and routes; no temporary files (serverless); structured logs and security events | |
| WASG-2.1 | Sanitise responses: protect cookie contents, no sensitive data or logic comments in HTML, no internal details or verbose errors, unpredictable session IDs stored in cookies | Met | Session cookie holds an opaque random token (HttpOnly, SameSite=Lax, Secure); generic error messages; no HKID or phone collected | |
| WASG-2.2a | Do not trust or echo HTTP headers or hidden parameters; keep session values on the server | Met | Headers only ever refuse (Sec-Fetch-Site, Origin); user identity comes from the verified session, never the request body | |
| WASG-2.2b | Use POST only to send requests | Deviation | REST semantics: GET for idempotent reads, POST/PATCH/DELETE for changes | ITSO acceptance, OA-8 |
| WASG-2.2c | Protect session IDs; one per connection; sensitive pages not cached | Met | Dynamic pages send `Cache-Control: private, no-cache, no-store` (checked live); export sends `no-store` | |
| WASG-2.2d | No data, temporary or backup files in web directories | Met (branch) | Campaign source documents moved out of `public/` | |
| WASG-2.2e | Use Java or .NET server-side | Deviation | TypeScript on Next.js and Deno | ITSO acceptance, OA-8 |
| WASG-3.1 | Secure design; secure the weakest link | Partial | This register and two adversarial reviews | Retroactive (MSS-APP-9) |
| WASG-3.2 | Least-privilege processes and accounts; unused services off; SSL for all client-server data | Partial | Client database roles hold nothing; only the server holds the service key | OA-2, OA-15 |
| WASG-3.3 | Encrypt sensitive data in storage and transit; mask in display and testing | Partial | At rest: AES-256 by Supabase (provider). In transit: TLS everywhere, database leg pinned on the branch (DBTLS-1) and to be enforced (OA-4). Tests use synthetic data | No application-level encryption of chat transcripts: accepted risk, recorded in the PIA |
| WASG-3.4 | Web services: authorise clients, validate, encode output, encrypt, virus-scan attachments, limit message size | Partial | Edge functions verify a signed JWT (ES256, issuer and audience pinned) before any work; request and audio size caps | Uploaded avatars are not antivirus-scanned (see WASG-4.8) |
| WASG-3.5 | Secure deployment review | Met | This register; posture check | |
| WASG-4.1 | Input validation: lengths, ranges, central validation, charset, SQL-injection defences, secure parsing, strong typing, content types | Partial | zod everywhere; parameterised queries only; LIKE wildcards (including PostgREST's `*`) neutralised | Content-Type is not enforced per route (cross-site text/plain is blocked by the proxy guard); validation failures are not logged centrally |
| WASG-4.2 | Output encoding; correct Content-Type; CSP | Met | React escaping; JSON serialiser; per-request nonce CSP with `strict-dynamic` (HDR-1) | The only raw-HTML use injects static chart styles (`src/components/ui/chart.tsx`) |
| WASG-4.3 | Password policy, lockout, reset, secure storage | N-A | No passwords: HKUST SSO only | Supabase Auth password sign-up disabled by OA-2 |
| WASG-4.4 | Session management: server-created, >128-bit random, inactivity timeout, invalidated at logout, SSL, regenerated on sign-in | Met (branch) | Better Auth sessions; 8-hour inactivity timeout (`src/lib/session-policy.ts`, was 7 days); sign-out deletes the session server-side; edge JWTs live 15 minutes | |
| WASG-4.5 | Authorisation: anti-farming, method allowlists, protected privileged actions, CSRF tokens, contextual (IDOR) checks, no credentials in URLs | Met (branch) | Per-user rate limits on 28 handlers (`src/app/api/rate-limit-coverage.test.ts`); route handlers export explicit methods; ownership checks per request | Anti-CSRF uses Fetch Metadata and SameSite instead of tokens (OWASP-accepted alternative) |
| WASG-4.6 | Access control centralised, enforced on every request, least privilege for database accounts | Partial | Central session gate and helpers; per-route ownership checks proven by tests | The server uses the service role, which bypasses row-level security by design; client roles hold nothing |
| WASG-4.7 | CSRF tokens; clickjacking protection | Met | See WASG-4.5; `X-Frame-Options: DENY` and `frame-ancestors 'none'` (HDR-2) | |
| WASG-4.8 | File uploads: type and size limits, server-chosen names, separate domain, correct content type, image rewriting, malware scanning | Partial | Avatar: 4-type allowlist, magic-byte check, 2 MB limit, server-generated path, served from the Supabase domain; chat images restricted to raster types (bucket allowlist, applied 2026-09-25) | No antivirus scan and no image re-encoding: recorded as accepted risk (raster-only content, served as images from a separate origin) |
| WASG-4.9 | Login, logout and authenticated pages over HTTPS; HSTS | Met | HDR-3 | |
| WASG-4.10 | Hidden parameters and environment variables are not trusted | Met | | |
| WASG-4.11 | Error handling and logging: generic messages, custom error page, no sensitive data in errors or logs, restricted log access | Partial | Generic messages; `not-found` page and route error pages; security events | No global error page (Next's default shows no details in production); log retention short, OA-3 |
| WASG-4.12 | Restrict upload types; scan for viruses | Partial | See WASG-4.8 | |
| WASG-5 | Security testing: valid and invalid data, authorisation on every page, no production data in tests, crucial operations logged | Met (branch) | 500+ unit and route tests, including cross-user and route-coverage tests; PGlite migration tests | |
| WASG-6 | Change control: approved requests, approval before change, testing | Met | Pull requests reviewed and merged only by the repository owner; CI on every PR (after OA-6/OA-7) | |

**Appendix A (OWASP Top 10 2021).** A01 Broken access control: Met (ADG-1).
A02 Cryptographic failures: Partial (WASG-3.3). A03 Injection: Met (WASG-4.1).
A04 Insecure design: Partial (MSS-APP-9). A05 Security misconfiguration: Partial
(OA-2, OA-4, OA-15). A06 Vulnerable components: Met (MSS-APP-2). A07
Identification and authentication failures: Met (WASG-4.4). A08 Software and
data integrity: Partial (actions pinned to commit SHAs, edge imports pinned; no
Deno lockfile). A09 Logging and monitoring: Partial (MSS-SAAS-6). A10 SSRF: Met
(no server-side fetch of user-supplied URLs).

## 11. TLS Cipher Hardening Guideline

| ID | Requirement | Status | Evidence |
|---|---|---|---|
| TLS-G1 | Disable SSLv2, SSLv3, TLS 1.0 | Met | Posture TLS-1: server sends a protocol-version alert to a TLS 1.0/1.1 offer (probe validated against a host that accepts TLS 1.1) |
| TLS-G2 | Use TLS 1.2 or later | Met | TLS-2: TLS 1.3 negotiated |
| TLS-G3 | Disable DES, 3DES and RC4 | Partial evidence | The server answered a LibreSSL 3.3.6 handshake offering only `DES-CBC3-SHA` at TLS 1.2 with a handshake-failure alert; the positive control was inconclusive and current OpenSSL clients cannot offer these ciphers. Confirm with an external scanner (SSL Labs) |

## 12. Privilege accounts, incidents, destruction, classification, generative AI, governance

| ID | Requirement | Status | Evidence | Open item |
|---|---|---|---|---|
| PAM-1 | Privileged access on need-to-know; used only for duties; inventory and regular validation | Gap | | OA-9 |
| PAM-2 | Strong admin passwords, MFA, 90-day change without MFA, no sharing, log admin sign-ins and failures | Unverified | Provider consoles | OA-9 |
| INC-1 | Report incidents promptly to ITSO; personal-data incidents also to the DPO | Met (process) | [incident-runbook.md](incident-runbook.md) | |
| INC-2 | Contain, assess impact at ITSO's four levels, eradicate, review | Met (process) | Runbook uses ITSO's Extensive / Significant / Moderate / Minor levels | |
| INC-3 | Preserve logs; forensically sound handling for Extensive incidents | Partial | Security events kept 180 days (branch) | Platform logs 1 hour to 1 day, OA-3 |
| DD-1 | Cloud data destruction handled through provider selection | Partial | Supabase DPA deletion clause | OA-13 |
| DD-2 | Wipe or degauss devices before disposal | Owner attestation | | OA-12 |
| DC-1 | Sensitive (high protection) data accessible only after authentication | Met | Every non-public path is gated (ADG-1) | |
| DC-2 | Sensitive (high protection) data not disclosed even within a workgroup | Gap | Other students see names, levels and the top-20 accuracy ranking; friends see per-component average scores | OA-10 |
| DC-3 | Encrypt in transmission; encrypt storage on non-central equipment | Met (branch for DB) | Provider AES-256 at rest; TLS in transit | |
| GAI-1 | Avoid entering personal or sensitive data into generative AI tools unless desensitised | Partial | Prompts carry only what the feature needs (student ids and joined objects stripped before the insights prompt); OpenRouter routing: zero data retention, no data collection, no providers in mainland China (`src/lib/gemini/client.ts`, parity-tested); disclosed in the privacy notice | Learner content (chat, transcripts) still reaches the model: DPO decision in the PIA, OA-8 and OA-10 |
| GAI-2 | Fact-check and label AI output | Met | Prompts forbid official PSC claims; feedback is labelled as practice feedback | |
| GOV-1 | Risk assessment and classification of the IT resource | Met | Section 1 | |
| GOV-2 | Register in CITARS through the departmental Cybersecurity Coordinator | Gap | | OA-8, OA-14 |
| GOV-3 | Tell ITSO when adopting new technologies | Gap | | OA-8 (draft notice) |
| GOV-4 | Deviations go through ITSO's exception process | Gap | Deviations: WASG-2.2b, WASG-2.2e, HRD-T2 | OA-8 |

## 13. Personal Data (Privacy) Ordinance via the HKUST PIA form

Covered in [pia-draft.md](pia-draft.md), which follows the ITSO form's Parts 1
to 4 and the six Data Protection Principles. Principal open items: data user
not yet named (OA-14), retention schedule not approved (OA-14), visibility to
other students (OA-10), cross-border transfers to India, Singapore and the
United States (disclosed in the privacy notice), and no processor contract for
iFLYTEK (OA-13).

## 14. Summary

Counted from the tables in sections 4 to 12 (101 rows):

| Status | Rows |
|---|---|
| Met or Met (branch) | 38 |
| Partial | 28 |
| Gap | 17 |
| Deviation | 3 |
| Unverified | 2 |
| Provider, N-A, process or owner attestation | 13 |

The code-level gaps within the maintainer's authority are closed on this
branch. Every remaining gap is an owner decision, a platform setting, a paid
plan, or an ITSO submission, and each is in [owner-actions.md](owner-actions.md).

## 15. Review findings and their dispositions

Two independent adversarial reviews (2026-09-24, 2026-09-25) examined this
branch. Every finding below was reproduced before it was acted on.

| Finding | Disposition |
|---|---|
| Posture TLS-1 could never fail (client-side refusal; unreachable host scored PASS) | Fixed: posture v2, regression-tested |
| Posture ANON-3 tested a signature miss, not the grant | Fixed: full-signature probe; live 401 / 42501 |
| Unmetered paid LLM route (learning checkpoint) | Fixed: rate limit plus coverage test for all routes |
| Unbounded prompt inputs (insights, mock-exam feedback) | Fixed in both runtimes; student ids no longer sent |
| Edge voice-id validation weaker than the Next twin | Fixed |
| Unpinned edge dependencies | Fixed: exact versions, parity test; no Deno lockfile (no Deno toolchain) |
| Cross-site POST via same-site pages (SameSite=Lax only) | Fixed: proxy guard |
| Progress counters unbounded; accuracy above 100% | Fixed: bounds, clamp |
| Entra id_token stored in plaintext despite token encryption | Fixed: no provider token is stored |
| Friend-code lookup unmetered (1,048,576 codes) | Fixed: rate limit |
| Rejected friend request could be deleted and re-sent | Fixed |
| PostgREST `*` wildcard bypassed search escaping | Fixed |
| Account erasure left usage counters (and relied on a cascade for mock exams) | Fixed |
| Chat deletion left public scene images | Fixed |
| Paging and report ids not validated | Fixed |
| Missing `name` claim fell back to the UPN (an email) as display name | Fixed |
| Implicit email-based account linking | Owner decision, OA-11 |
| Posture token in CI can run SQL | Protected environment added; OA-7 |
| Evidence note overstated an anonymous write path (the function's own guard refused it) | Corrected in the evidence record |
| SECURITY.md claimed Supabase verifies Better Auth tokens | Corrected |
