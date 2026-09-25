# Privileged account inventory (to complete, OA-9)

ITSO's Acceptable Practices for Privilege Account Management require
need-to-know access, an ongoing inventory with regular validation, strong
passwords or MFA, password changes every 90 days where MFA is not in place,
no sharing, and logging of administrative sign-ins. Record roles and handles
here, not personal email addresses.

| System | Account / role | Holder | Why needed | MFA on? | Last reviewed |
|---|---|---|---|---|---|
| Supabase organisation "baduru11's Org" | Owner | baduru11 (assumed; confirm) | Organisation settings, billing, Auth config | [ ] | |
| Supabase organisation | Member (developer role; auth settings return 403) | Maintainer account | Migrations, edge deploys, posture checks | [ ] | |
| Supabase Management API token | Personal token in the maintainer's macOS keychain | Maintainer | CLI deploys and posture checks; can run SQL on production | n/a (token) | 2026-09-25 |
| Vercel team `xyq` | Members | [list] | Deployments, environment variables | [ ] | |
| GitHub `baduru11/XiYouQuest-RPG-study-web` | Owner | baduru11 | Merge rights | [ ] | |
| GitHub | Contributor (fork PRs, no push) | EricEremos | Development | [ ] | |
| iFLYTEK Open Platform console | Developer account | [holder] | Speech API credentials | [ ] | |
| OpenRouter | Account holding the API key | [holder] | LLM routing, billing | [ ] | |
| Microsoft Entra app registration (client `ce4cb5e3-...`) | Owners | ITSO / [holder] | Redirect URIs, client secret | [ ] | |
| CI secret `SUPABASE_ACCESS_TOKEN` (planned) | Environment `security-posture` | Repository owner | Weekly posture check | n/a | |

Remove any account without a current need, and repeat this review at least
every six months.
