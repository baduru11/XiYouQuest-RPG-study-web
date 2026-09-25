# Application health check request (draft, not sent)

ITSO's Web Application Health Check offers Coverity (static analysis of
submitted source code) and Acunetix (dynamic scan, self-help, preferably in a
sandbox). ITSO's remediation windows: Coverity High within 28 days and Medium
within 56 days; Acunetix High within 28 days, Medium reviewed. The MSS for
high-risk application systems requires source code scanning before deployment
and after major changes, and a vulnerability scan before deployment and
regularly afterwards.

**To:** webscan@ust.hk
**Subject:** Application health check request: XiYouQuest (high-risk web application)

Dear ITSO Cybersecurity Team,

We would like to request an application health check for XiYouQuest, a
Putonghua Proficiency Test practice web application for HKUST students and
staff, classified as a high-risk application because it holds student personal
records.

1. Coverity static analysis. The source code (TypeScript, Next.js 16 and Deno
   edge functions) is attached as a zip file of the reviewed release.
2. Acunetix dynamic scan. We would prefer a sandbox scan. Production is
   https://cle-xyq.hkust.edu.hk; every page except sign-in requires HKUST single
   sign-on, so an authenticated scan would need a test account agreed with you.

Contact: [name, department, email]

Kind regards,
[Name]
[Responsible unit]

Attachments: source zip of the release commit (prepare from the merged main
branch after OA-6, excluding `.env*` files).
