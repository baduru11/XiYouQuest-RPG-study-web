# DRAFT — not submitted

**This is a working draft of Personal Data Privacy Impact Assessment (PIA)
content for XiYouQuest, prepared to support submission to `seccomp@ust.hk`
before publication, per HKUST ITSO's Application Development Guidelines. It has
not been submitted, has not been reviewed by ITSO or the HKUST Data Privacy
Officer, and must not be treated as a completed PIA. Every factual statement
below is sourced from the codebase and is cited; every open question is marked
as such rather than answered speculatively.**

---

## 1. Purpose of the system

XiYouQuest is a gamified Putonghua Shuiping Ceshi (PSC) study application for
HKUST staff and students, providing practice exercises, AI-driven roleplay
conversation with speech scoring, mock exams, and a personalized AI-generated
learning plan.

## 2. Data controller and data user

- **Data controller:** [organizational unit — not determined in this review;
  confirm the responsible CLE/department before submission]
- **System maintainer:** repository owner (`admin@meliedu.com` / EricEremos on
  GitHub)

## 3. Personal data collected

See `docs/security/data-register.md` §2 for the full inventory with source
citations. Summary by category:

- **Identity data:** name, email, avatar image — sourced from HKUST Entra ID at
  sign-in (`src/lib/auth.ts`), not self-declared.
- **Usage and progress data:** XP, level, streak, achievements, quest/learning
  progress.
- **Assessment data (Sensitive / High Protection):** practice scores, mock-exam
  results and AI feedback, pronunciation assessment scores.
- **Content data:** chat/roleplay message transcripts, speech transcripts
  (text), user-uploaded avatar images, AI-generated chat images.
- **Technical data:** session metadata (IP address, user agent — `better_auth.session`,
  not independently re-verified against this project's live schema in this
  review), rate-limit counters (no content, `public.rate_limit_counters`).

**Not collected as app data:** raw speech audio is not persisted by the app; it
is transmitted to iFlytek for scoring and the app does not write it to storage
(code-reading conclusion from `src/lib/iflytek-speech/client.ts` and
`src/lib/iflytek-speech/asr-config.ts`; not covered by an automated test in this
review).

## 4. Purpose of collection and use

- Identity data: authenticate the user and attribute their study record to them.
- Assessment data: score practice/mock exams, generate personalized feedback and
  learning plans.
- Content data (chat transcripts): support the roleplay conversation feature and
  its speech-practice scoring.
- Usage data: gamification (levels, achievements, leaderboard).

**Open question for the submitting unit:** whether assessment data feeds into
any official academic record or is purely a self-study tool with no
institutional record-keeping effect. This materially affects the PDPO analysis
and is not determinable from the codebase alone.

## 5. Data flows and processors

See `docs/security/data-register.md` §3–4 for the full flow diagram and
processor table. Processors handling personal data, with region and known
transfer facts:

| Processor | Data received | Region |
|---|---|---|
| Supabase | All personal data except raw audio | Mumbai (`ap-south-1`) |
| Vercel | All request traffic, holds env secrets | Not independently re-verified in this review |
| iFlytek | Raw speech audio (transient) | Singapore |
| OpenRouter → DeepSeek v4 flash / Google Gemini | Chat/learning-plan prompts and AI responses | Non-PRC by policy (`data_collection: "deny"`, PRC providers excluded — `src/lib/gemini/client.ts` `OPENROUTER_PROVIDER_POLICY`) |

## 6. Cross-border transfer

All four processors above receive personal data outside Hong Kong. Under the
PDPO, this requires disclosure in the privacy notice regardless of the
processors' own data-handling commitments. **Open question:** whether PDPO
s.33 (cross-border transfer restriction, if and when it is brought into force)
or HKUST's own cross-border data policy imposes additional requirements beyond
disclosure — not evaluated in this draft; route to ITSO/legal for the actual
submission.

## 7. Retention and erasure

- No time-based retention policy exists; data persists until user-initiated
  deletion.
- Self-service erasure: `DELETE /api/auth/delete-account`
  (`src/app/api/auth/delete-account/route.ts`) — see
  `docs/security/data-register.md` §5 for the exact deletion order and scope.
- **Gap to resolve before submission:** no retention schedule exists for
  processor-side copies (Supabase backups, Vercel logs). This should be defined
  (or explicitly declared "indefinite, pending user deletion") before
  submission.
- **Gap to resolve before submission:** the 2 legacy Supabase Auth accounts
  (§`docs/security/data-register.md` §1) are not covered by the deletion route
  above and have no defined retention/deletion decision.

## 8. Data subject rights

- **Erasure:** supported, self-service, owner-scoped (§7 above).
- **Access/export:** not currently supported by the application. If required for
  PDPO compliance, this is a build item, not a documentation item, and should be
  tracked separately from this PIA.
- **Correction:** partially supported (profile display name/avatar are
  user-editable; system-derived fields like XP/history are not, by design).

## 9. Security controls relied on

Summarized from `SECURITY.md` (full control matrix and evidence there):

- HKUST Entra ID (SSO) is the sole identity provider; no local password store.
- Every server route authenticates the caller and scopes data access to the
  verified session user id (`SECURITY.md` §2–§3).
- Database roles reachable by an end-user client (`anon`, `authenticated`) hold
  zero privileges on any table or function; Row-Level Security is a second,
  independent layer (`SECURITY.md` §3).
- TLS in transit; OAuth tokens encrypted at rest (`SECURITY.md` §6).
- Rate limiting on paid/abuse-prone AI and speech endpoints (`SECURITY.md` §5).

## 10. Risks identified and mitigations

| Risk | Mitigation in place | Residual risk |
|---|---|---|
| Unauthorized read of personal records via the database client roles | `anon`/`authenticated` hold zero privileges (§9) | Supabase Auth sign-up is still technically open (`SECURITY.md` §7.1); mitigated to near-zero by the privilege lockdown, but not eliminated until sign-up is disabled |
| Real name exposure to other students | None specific — `display_name` (Entra name) is shown in the global leaderboard and to any authenticated searcher | Unmitigated; a pseudonym/opt-in decision is pending (`SECURITY.md` §7.5) — **this is the single highest-priority open item for this PIA** |
| Cross-border transfer of assessment/identity data | Disclosed here and in the data register; processor contractual protections not yet confirmed (no SOC2/DPA on file) | Contract/audit gap — see `docs/security/data-register.md` §4 |
| Speech audio exposure | Not persisted by the app; sent to iFlytek (Singapore) for scoring only | iFlytek's own retention/deletion practice for the audio is not confirmed by this app — a vendor-side question, not a code question |
| Account deletion leaving orphaned processor-side data | App-side deletion is transactional/ordered and aborts safely on partial failure (`src/app/api/auth/delete-account/route.ts`) | Processor backups (Supabase point-in-time recovery, Vercel logs) are not covered by the deletion route — retention question in §7 |
| Loss of the encryption key used for OAuth tokens | `BETTER_AUTH_SECRET` rotation is documented in `docs/security/incident-runbook.md` §3.2 | Key rotation invalidates stored tokens and all sessions — an operational cost, not a data-exposure risk |

## 11. Items to resolve before this draft can be submitted

1. Identify the responsible data controller / organizational unit (§2).
2. Answer the open question in §4 (does assessment data feed an official
   record?).
3. Decide and document a retention schedule, or explicitly declare indefinite
   retention pending deletion, for both app data and processor-side copies (§7).
4. Resolve the 2 legacy Supabase Auth accounts (§7, `SECURITY.md` §7.4).
5. Decide the leaderboard/search real-name exposure question (§10) — this is a
   design decision with direct PIA impact, not a pure security fix.
6. Obtain or document the absence of a Supabase and Vercel SOC2 Type 2 report /
   DPA (§9, `docs/security/data-register.md` §4) — required by the MSS SaaS
   Cloud Service Provider checklist alongside this PIA.
7. Confirm HKUST's cross-border transfer policy requirements beyond disclosure
   (§6) with ITSO/legal.
8. Complete the Supabase Auth sign-up lockdown (`SECURITY.md` §7.1) so the
   residual risk in §10 row 1 can be marked resolved rather than mitigated.

Once the above are resolved, this document should be converted to the ITSO PIA
submission format and sent to `seccomp@ust.hk` — this draft is content
preparation, not the submission itself.
