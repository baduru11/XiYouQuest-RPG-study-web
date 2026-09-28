# Reply to ITSO: risk classification and scan readiness (draft)

Answers ITSO's two questions before the security check of
`https://cle-xyq-dev.hkust.edu.hk`, and gives the scanning team what it needs.
The evidence for every statement is in this repository under
`docs/security/`; row identifiers below refer to
[itso-requirement-register.md](../itso-requirement-register.md).

---

**To:** ITSO Cybersecurity Team
**Subject:** XiYouQuest: risk classification, high-risk data handling, and the scan target cle-xyq-dev.hkust.edu.hk

Dear ITSO Cybersecurity Team,

Thank you for your reply. Our answers to your two points follow, then the
details of the environment prepared for your security check.

## 1. Is high-risk data involved?

**Yes.** Under the ITSO Risk Classification guideline, XiYouQuest handles
high-risk data and is therefore a **high-risk application system**:

- **Data level:** it keeps *student personal records* and *staff personal
  records* in electronic form: name, HKUST email address, sign-in history (IP
  address, browser), and assessment-related records (Putonghua practice and
  mock-test scores, pronunciation results, AI feedback, chat transcripts).
  These are listed as high-risk under "Data Level", and the personal data is
  protected by the Personal Data (Privacy) Ordinance.
- **Application system level:** an application system handling high-risk data
  is itself high-risk.
- Usage and access logs (moderate-risk) are also held.

**Not held:** voice recordings (sent to the speech-assessment provider for
scoring and not stored by the application), passwords (sign-in is HKUST
Microsoft Entra ID only), financial data, and Microsoft access or refresh
tokens.

We therefore apply the **High** column of the Minimum Security Standard and
treat the Acceptable Practices for Handling High Risk Data as mandatory.

## 2. Compliance with the high-risk requirements

### Acceptable Practices for Handling High Risk Data

| Practice | How XiYouQuest meets it |
|---|---|
| Storage: not on end-user devices | Data lives only in the managed database (Supabase, TLS enforced, encrypted at rest). No exports are kept on developer machines; the one self-service export goes only to the signed-in student for their own data. |
| Transmission: encrypted | HTTPS only (HSTS two years, TLS 1.2+); database connections verify the server certificate against a pinned CA, and the database refuses plaintext connections. |
| Transmission: no public cloud except ITSO-provided | **Open point for ITSO's guidance.** The application is hosted on commercial cloud services (Vercel, Supabase) and uses processors (iFLYTEK speech scoring in Singapore, OpenRouter with zero-data-retention routing). We have drafted a CSP checklist for each provider and ask ITSO to advise whether this hosting is acceptable or which ITSO service we should move to. |
| No public terminals; home computers protected | Administrator access is limited to named maintainers on managed, patched computers with firewall and disk encryption on (register END rows). |
| Disposal | No university-owned media are used. Account erasure deletes every record of a user; provider deletion terms are recorded in the CSP checklists. |

### Minimum Security Standard, Application Systems (High column)

| # | Standard | Status |
|---|---|---|
| 1 | Inventory (CITARS) | To be registered; draft record prepared |
| 2 | Security fixes within 28 days | Met: dependency audit in CI, monthly Dependabot updates, no known high or critical advisories |
| 3 | HTTPS for logon and high-risk data | Met |
| 4 | Ongoing third-party fixes | Met: all frameworks are current, supported releases |
| 5 | Backup | Met: daily encrypted physical backups on the Supabase Pro plan (latest verified 2026-09-28) |
| 6 | Application Development Guidelines | Largely met; open items listed in the register |
| 7 | Vulnerability scan before deployment and regularly | This security check; weekly automated posture check in between |
| 8 | Source code scanning | Met: CodeQL and Gitleaks on every change; we also request a Coverity scan |
| 9 | Security review | Carried out retroactively; documented in the register and PIA draft |

The SaaS table (TLS, SSO, MFA, logging, data purge, CSP checklist) is covered
row by row in the register. The open items and their owners are:
CITARS registration, CSP checklist and SOC 2 submission,
a data processing agreement with the speech provider, and a confirmed MFA
review of administrator accounts.

## 3. Before the scan: two small requests

1. **DNS (for the hostmaster of hkust.edu.hk).** `cle-xyq-dev.hkust.edu.hk`
   has been moved to a separate sandbox deployment. The hosting provider
   (Vercel) needs one more TXT value on the existing `_vercel.hkust.edu.hk`
   record to confirm the move. Please **add** (not replace) this value:

   ```
   _vercel.hkust.edu.hk.  TXT  "vc-domain-verify=cle-xyq-dev.hkust.edu.hk,b22f5f87b8b7b2b5d159"
   ```

   The CNAME for `cle-xyq-dev.hkust.edu.hk` stays as it is. Until the value is
   added, `cle-xyq-dev.hkust.edu.hk` answers 404.
2. **Scanning account.** Please assign the HKUST account your scanner will
   sign in with to the XiYouQuest Entra application (client
   `ce4cb5e3-47d6-4b1c-87cc-e83fc7cabb29`), and confirm that
   `https://cle-xyq-dev.hkust.edu.hk/api/auth/oauth2/callback/hkust` is among
   its registered redirect URIs.

## 4. The scan target

- **URL:** `https://cle-xyq-dev.hkust.edu.hk`
- **What it is:** an isolated **sandbox**: the same application code as
  production, deployed separately with its own database, storage and server
  functions. It holds **no real student or staff data**; only the accounts
  used during the scan will exist in it. You can scan it without affecting
  production (`https://cle-xyq.hkust.edu.hk`) or real users.
- **Sign-in:** HKUST single sign-on (Microsoft Entra ID) only. There is no
  password form and no test bypass: adding one would itself weaken the system
  being tested. For an authenticated scan, please sign in with an HKUST
  account that is assigned to the XiYouQuest Entra application (client
  `ce4cb5e3-47d6-4b1c-87cc-e83fc7cabb29`); we ask ITSO to assign the scanning
  account to it. After sign-in, the session is the `__Secure-better-auth.session_token`
  cookie (HttpOnly, Secure, SameSite=Lax, 8-hour inactivity timeout), which
  Acunetix can use as a login sequence or a session cookie. Only `@ust.hk` and
  `@connect.ust.hk` accounts are admitted.
- **Scope:** the web application on `cle-xyq-dev.hkust.edu.hk` (pages and
  `/api/*`) and the sandbox's server functions under
  `https://drmcdpmiwbtdyjhtbupa.supabase.co/functions/v1/*`, which the
  application calls. Please do not scan the production hosts
  (`cle-xyq.hkust.edu.hk`, `yfoifmqjhavxidomgids.supabase.co`).
- **Expected protective behaviour:** per-user rate limits return HTTP 429
  under heavy request volume; cross-site state-changing requests are refused
  with HTTP 403; unauthenticated API calls return 401. These are controls, not
  outages.
- **Contact during the scan:** [name, email, phone]

Kind regards,
[Name]
[Responsible unit]
