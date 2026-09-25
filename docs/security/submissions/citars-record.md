# CITARS registration record (draft)

ITSO's Critical IT Asset Registration System (CITARS) is where a department's
Cybersecurity Coordinator registers high, moderate and low risk applications;
registered assets are subject to ITSO compliance checks against the Minimum
Security Standard. CITARS itself requires HKUST login, so its exact form fields
were not visible; the fields below are the ones the MSS and this register
already establish. For the Cybersecurity Coordinator to enter (OA-8).

| Field | Value |
|---|---|
| Asset name | XiYouQuest (西游Quest) PSC practice web application |
| Asset type | Web application (software as a service on cloud platforms) |
| URL | https://cle-xyq.hkust.edu.hk |
| Risk classification | High-risk (student and staff personal records; Sensitive (high protection) data) |
| Owning department | [Responsible unit, OA-14] |
| System owner | [Name and email] |
| System administrator | [Name; must receive ITSO administrator training (MSS servers, item 8)] |
| Cybersecurity Coordinator | [Departmental CSC] |
| Hosting | Vercel (web, United States); Supabase (database, storage, edge functions; Mumbai, India) |
| External processors | iFLYTEK Open Platform (Singapore); OpenRouter and zero-data-retention model hosts |
| Authentication | HKUST Microsoft Entra ID (OIDC); no local passwords |
| Personal data | Identity from SSO, learning and assessment records, chat and speech transcripts, security log |
| Users | HKUST staff and students; 28 accounts on 2026-09-24 |
| Source repository | https://github.com/baduru11/XiYouQuest-RPG-study-web |
| Security documentation | docs/security/ in the repository |
