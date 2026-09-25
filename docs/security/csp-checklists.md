# Cloud service provider checklists (draft)

HKUST ITSO requires, for a High-risk application on cloud services, the Cloud
Service Provider (CSP) checklist and the provider's latest SOC 2 Type 2 report,
approved by ITSO before deployment (MSS for SaaS, item 8). This file drafts the
13-item checklist from ITSO's `CSP_checklist.xlsx` for each provider that
processes XiYouQuest personal data. It is a draft for the responsible unit.
The workbook's Assessment tab asks for endorsement by the IT Security Officer or
Head of Department, and for the contracts and findings to be passed to the ITSO
Cybersecurity Team. Nothing has been submitted.

Answers: **Y** met, **P** partly met, **N** not met, **?** not found in the
provider documents reviewed, **N-A** does not apply. Each answer cites the
provider document read on 2026-09-24/25.

The 13 items, abbreviated from the ITSO checklist: (1) processes PII only per its
disclosed policies; (2) tools for end-users' access, correction and erasure;
(3) no marketing use of PII without consent; (4) breach notification; (5)
retention and destruction after the contract ends; (6) storage countries and
sub-processors disclosed; (7) notice of law-enforcement requests; (8) staff
confidentiality and training; (9) encryption in transit and at rest; (10)
independent reviews, such as a SOC 2 Type 2 report; (11) the customer's own
security is not lowered; (12) service level agreement; (13) GDPR where
applicable.

## Supabase (database, storage, edge functions)

Region: `ap-south-1` (Mumbai, India). Plan: Free ("baduru11's Org").

| # | Answer | Evidence |
|---|---|---|
| 1 | Y | [Data Processing Addendum](https://supabase.com/legal/dpa): processes customer data under the customer's instructions |
| 2 | Y | Customer controls the data; XiYouQuest offers self-service export and deletion (`/api/profile/export`, `/api/auth/delete-account`) |
| 3 | Y | DPA: processing limited to providing the service |
| 4 | Y | DPA: notice "without undue delay, and where feasible, within forty-eight (48) hours" of a Security Incident |
| 5 | Y | DPA: customer may retrieve data within 30 days of termination, after which copies are deleted |
| 6 | Y | Project region fixed to ap-south-1; [sub-processor list](https://supabase.com/legal/customer-resources/subprocessor-list) dated 1 June 2026 (AWS, Cloudflare, Google, Fly.io, Vercel, OpenAI and others), 30 days' notice of changes |
| 7 | ? | Not located in the sections read; check the DPA |
| 8 | ? | Expected in the SOC 2 report |
| 9 | Y | [Security page](https://supabase.com/security): AES-256 at rest, TLS in transit |
| 10 | P | SOC 2 Type 2 and ISO 27001 held; the report is available to Team and Enterprise customers only, so not on the Free plan (OA-3, OA-13) |
| 11 | Y | Project hardening: client roles hold no privilege; TLS verified to the database and enforced by the database since 2026-09-25 |
| 12 | N | No SLA on the Free plan |
| 13 | Y | DPA incorporates the EU Standard Contractual Clauses |

## Vercel (web hosting)

Primary processing: United States, with a global edge network. Plan of team
`xyq`: not verified from here.

| # | Answer | Evidence |
|---|---|---|
| 1 | Y | Privacy policy; [DPA](https://vercel.com/legal/dpa) (effective 31 March 2026) |
| 2 | N-A | Vercel hosts the application; end-user rights are served by the application |
| 3 | P | The DPA governs purpose limitation but "forms part of Vercel Enterprise Terms"; on other plans the terms of service apply |
| 4 | P | DPA: notice "without undue delay" of a confirmed Security Incident (Enterprise terms) |
| 5 | P | DPA section 12: termination instructs deletion (Enterprise terms) |
| 6 | Y | DPA: primary processing facilities in the United States; sub-processors with locations at security.vercel.com |
| 7 | ? | Not located in the sections read |
| 8 | Y | DPA Schedule 2: sub-processors sign confidentiality terms |
| 9 | Y | [Security page](https://vercel.com/security): AES-256 at rest, HTTPS/TLS in transit |
| 10 | Y | SOC 2 Type 2, ISO 27001, PCI DSS attestations; report available on request |
| 11 | Y | Security headers and CSP verified live (posture HDR rows) |
| 12 | ? | Depends on the plan |
| 13 | Y | GDPR; certified under the EU-US Data Privacy Framework |

## OpenRouter (AI request routing) and the model hosts it selects

OpenRouter, Inc. (United States). XiYouQuest requests carry
`data_collection: "deny"`, `zdr: true` and an exclusion of providers in mainland
China (`src/lib/gemini/client.ts` and the three twins; parity-tested). On
2026-09-25 the eligible zero-data-retention hosts were, for DeepSeek V4 Flash,
Microsoft Azure (US), DeepInfra, DigitalOcean, Mancer, Nextbit (Spain),
Novita, Open Inference, Parasail and Venice; and for the Gemini fallbacks,
Google Vertex AI.

| # | Answer | Evidence |
|---|---|---|
| 1 | Y | [Privacy policy](https://openrouter.ai/privacy), last updated 31 August 2026 |
| 2 | N-A | Students hold no OpenRouter account; prompts are not retained under zero-data-retention routing |
| 3 | Y | "OpenRouter does not use your Inputs or Outputs for model training" |
| 4 | ? | No breach-notification commitment in the privacy policy |
| 5 | P | Inputs are not persisted beyond routing except for abuse, security, billing or legal needs; hosts selected with `zdr: true` retain no prompts |
| 6 | P | OpenRouter in the US; the serving host varies per request among the hosts above |
| 7 | ? | Not stated |
| 8 | ? | Not stated |
| 9 | P | TLS in transit; at-rest encryption not stated |
| 10 | ? | No SOC 2 report located |
| 11 | Y | Routing constraints above |
| 12 | N | No SLA found |
| 13 | Y | Standard Contractual Clauses referenced |

## iFLYTEK Open Platform (speech recognition, pronunciation scoring, speech synthesis)

International platform endpoints in Singapore (`*-api-sg.xf-yun.com`). The
[privacy policy](https://global.xfyun.cn/doc/policy/privacy.html) (effective 7
November 2023) is issued by SYNLAN TECHNOLOGY PTE. LTD.; the
[service agreement](https://global.xfyun.cn/doc/policy/agreement.html) names
IFLYTEK Co., Ltd. Audio is sent for processing and is not stored by
XiYouQuest.

| # | Answer | Evidence |
|---|---|---|
| 1 | Y | Privacy policy |
| 2 | P | Requests go through the developer console; end users rely on the application |
| 3 | P | The policy asks developers to obtain end users' consent for use "for the services and purposes listed in this Privacy Policy", which is broader than scoring |
| 4 | P | Commits to inform "promptly" in line with applicable law; no time limit |
| 5 | P | Retained "for the shortest time necessary", generally until the developer account is cancelled |
| 6 | P | Stored in Singapore; may be transferred to other jurisdictions with consent |
| 7 | ? | Not stated |
| 8 | P | Agreement section 5: confidentiality of developer information |
| 9 | Y | TLS in transit; states encrypted storage of personal information |
| 10 | N | No independent audit report located |
| 11 | Y | Credentials held server-side only (edge secrets) |
| 12 | N | The agreement disclaims liability for maintenance downtime |
| 13 | ? | Not stated for the API platform |

The privacy policy also requires developers to tell end users that iFLYTEK's
services are used and how it processes data. The draft privacy notice
(`/privacy`) does so.

## Summary for ITSO

- A SOC 2 Type 2 report can be obtained for Supabase (Team plan or above) and
  Vercel (on request). None was found for OpenRouter or iFLYTEK.
- The weakest contractual position is iFLYTEK: no data processing agreement,
  broad permitted use, no breach deadline. Voice recordings of identified
  students go to it. The responsible unit should decide whether that is
  acceptable, seek a data processing agreement, or look for an alternative
  scoring provider (OA-13).
- All four providers are outside Hong Kong; the privacy notice and the PIA
  disclose these cross-border transfers.
