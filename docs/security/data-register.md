# Personal data and processor register

Classification: **High-risk** (personal records of identified HKUST students
and staff) with **Sensitive (high protection)** assessment-related data. See
[itso-requirement-register.md](itso-requirement-register.md), section 1.
Supports the PIA ([pia-draft.md](pia-draft.md)) and the privacy notice
(`/privacy`). Last verified against code and the live project on 2026-09-25;
"branch" marks items that arrive with the hardening release (OA-6).

## 1. Data subjects

HKUST staff (`@ust.hk`) and students (`@connect.ust.hk`) who sign in through
HKUST Microsoft Entra ID: 28 accounts on 2026-09-24. Two dormant Supabase Auth
accounts from July 2026 (Google sign-in, before the SSO migration) remain in
the unused Supabase Auth system (OA-14).

## 2. Personal data inventory

| Store | Fields | Sensitivity | Source |
|---|---|---|---|
| `better_auth.user` | name, email, email-verified flag, image URL | Identity | HKUST SSO claims at sign-in (`src/lib/auth.ts`) |
| `better_auth.session` | session token, IP address, user agent, timestamps | Identity / technical | Better Auth at sign-in |
| `better_auth.account` | provider and account id; provider tokens are no longer stored (branch) | Identity | OIDC exchange |
| `public.profiles` | display name, username, friend code, XP, level, streak, last login, avatar URL, audio settings | Identity and usage | Sign-in and gameplay |
| `public.practice_sessions`, `practice_details` | Practice attempts, scores, timing | Sensitive (high protection) | Gameplay |
| `public.mock_exam_results` | Mock PSC results and AI feedback | Sensitive (high protection) | Gameplay and AI |
| `public.user_progress`, `quest_progress`, `user_characters`, `user_achievements` | Progress, unlocks, achievements | Usage | Gameplay |
| `public.learning_plans`, `learning_nodes`, `learning_checkpoints` | AI study plans and checkpoint scores | Usage, assessment-related | AI and gameplay |
| `public.chat_sessions`, `chat_messages` | Companion chat text, speech transcripts, pronunciation scores | Sensitive (high protection) | Chat and speech features |
| `public.friendships` | Requester, addressee, status | Social | Social features |
| `public.rate_limit_counters` | User id, feature bucket, window, count | Technical (usage pattern) | Rate limiting |
| `public.security_events` (branch; OA-5) | Event type, user id, IP address, user agent, small detail | Technical (security) | Sign-ins, refusals, exports, deletions, uploads, rate limits |
| Storage `avatars` | Uploaded avatar images (2 MB limit, PNG/JPEG/GIF/WebP) | Identity (image) | User upload |
| Storage `chat-images` | Generated scene images (82 objects, all PNG, 2026-09-25) | Content | Image generation |

**Not stored:** voice recordings. They go to iFLYTEK for recognition and
scoring and are not written by the application (code reading of
`src/lib/iflytek-speech/` and the edge speech functions).

## 3. Who can see what

| Data | Visible to |
|---|---|
| Display name, avatar, level, friend code | Any signed-in user (search, friend-code lookup, requests) |
| XP, accuracy or streak ranking (top 20, global) | Any signed-in user (leaderboard) |
| Total XP, streak, session count, per-component average practice scores, achievements with dates, chosen companion | Friends |
| Everything else (mock exams, chats, transcripts, plans, detailed practice history, feedback, email) | The student only |

Avatar URLs point to a public storage bucket: anyone with the URL can load the
image. Visibility of assessment-derived data to other students is an open
decision (OA-10).

## 4. Data flows

```
HKUST Entra ID --OIDC--> Better Auth on Vercel (US) --TLS, pinned CA (branch)--> Supabase (Mumbai)
Browser --JWT--> Supabase Edge Functions --> iFLYTEK (Singapore): audio, practice text
                                        \--> OpenRouter (US) --> zero-data-retention model host
```

## 5. Processors

| Processor | Role | Location | Receives | Contract and assurance |
|---|---|---|---|---|
| Supabase | Database, storage, edge functions | ap-south-1 (Mumbai, India) | All stored data | DPA (48-hour breach notice, deletion after termination, SCCs); SOC 2 Type 2 and ISO 27001, report available on Team plan and above; project on the Free plan |
| Vercel | Web hosting | United States (primary), global edge | All requests | DPA for Enterprise terms; SOC 2 Type 2 on request; ISO 27001 |
| iFLYTEK Open Platform (SYNLAN TECHNOLOGY PTE. LTD.; service agreement with IFLYTEK Co., Ltd.) | Speech recognition, pronunciation scoring, speech synthesis | Singapore | Voice recordings, practice text | Privacy policy and service agreement only; no DPA (OA-13) |
| OpenRouter, Inc. | AI request routing | United States | Prompts needed for feedback, plans and chat | Privacy policy (no training); DPA referenced; requests use zero data retention, no data collection, and exclude mainland-China hosts |
| Model hosts selected by OpenRouter | Text and image generation | Varies (for example Azure US, DeepInfra, Nextbit Spain, Google Vertex AI) | Same prompts | Zero-data-retention endpoints only |

Details per checklist item: [csp-checklists.md](csp-checklists.md).

## 6. Retention and erasure

- **Account deletion** (`DELETE /api/auth/delete-account`) removes, in order,
  learning nodes, checkpoints and plans, chat messages and sessions,
  achievements, practice details and sessions, progress, characters, quest
  progress, friendships, mock-exam results, rate-limit counters and the profile,
  then avatar and chat images (best effort), then the identity with its
  sessions and accounts. It stops before touching the identity if any record
  delete fails. Security log entries remain until they expire (180 days).
- **Deleting a chat** also removes its scene images (branch).
- **Sessions** expire after 8 hours without use (branch; 7 days before).
- **Backups:** none customer-accessible (Free plan, OA-3).
- **Proposed schedule:** [submissions/retention-schedule-proposal.md](submissions/retention-schedule-proposal.md) (OA-14).

## 7. Data subject rights

- **Access:** `GET /api/profile/export` (branch) returns all of the above for
  the signed-in user as JSON, never tokens; Profile, Your Data, Download.
- **Correction:** display name on the Profile page; other records are
  system-generated; other corrections through the DPO.
- **Erasure:** Profile, Danger Zone, Delete Account.

## 8. Cross-border transfers

All processors are outside Hong Kong: India (Supabase), United States (Vercel,
OpenRouter, most model hosts), Singapore (iFLYTEK), and other regions for some
model hosts. Disclosed in the privacy notice and the PIA.
