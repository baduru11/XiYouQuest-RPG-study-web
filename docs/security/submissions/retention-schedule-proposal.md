# Retention schedule proposal (for approval, OA-14)

PDPO DPP2 requires that personal data be kept no longer than necessary; the
University Data Privacy Policy Statement commits to holding personal data only
as long as its purpose requires. Proposed periods for the responsible unit and
the DPO to approve or amend. Only the rows marked "in force" are implemented.

| Data | Proposed retention | Basis | Status |
|---|---|---|---|
| Account, profile, learning record, mock exams, study plans, chats | While the account exists; erased on self-service deletion | Needed for the service | In force |
| Inactive accounts | Notify after 18 months without sign-in; delete 30 days later | Purpose lapses when the student stops using the service | Proposed (needs a scheduled job) |
| Leavers (graduated or departed) | Deleted with the inactive-account rule; HKUST SSO blocks sign-in after departure | As above | Proposed |
| Sign-in sessions (IP, browser) | Session row expires 8 hours after last use; expired rows purged | Security | Expiry in force; purge job proposed |
| Security event log | 180 days | Forensic investigation (MSS for SaaS, logging) | In force once OA-5 applies the migration |
| Rate-limit counters | Expired windows removed after 1 day on the user's next request; erased on account deletion | Abuse prevention | In force |
| Voice recordings | Not stored by the application; iFLYTEK retains per its policy | Scoring only | In force; processor term open (OA-13) |
| AI prompts | Zero-data-retention hosts only | Feedback generation | In force |
| Backups | Follow the backup arrangement chosen in OA-3 (for example 7 or 14 days) | Recovery | Open (OA-3) |
