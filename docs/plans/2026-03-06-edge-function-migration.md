# Edge Function Migration Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Migrate 8 long-running API routes from Vercel (10s timeout) to Supabase Edge Functions (150s timeout) so they work on Vercel Free tier.

**Architecture:** Keep Next.js app on Vercel for SSR/static. Move heavy API routes to Supabase Edge Functions (Deno runtime). Transparent client-side routing via modified `fetchWithRetry` — no call-site changes needed. Shared libraries ported to `supabase/functions/_shared/`.

**Tech Stack:** Deno runtime, Supabase Edge Functions, Web Crypto API (replaces Node crypto), native WebSocket (replaces `ws` npm), Zod via npm: specifier

---

## Routes to Migrate

| # | Vercel Route | Edge Function Name | External APIs | Complexity |
|---|---|---|---|---|
| 1 | `/api/ai/feedback` | `ai-feedback` | OpenRouter LLM | Low |
| 2 | `/api/ai/insights` | `ai-insights` | OpenRouter LLM | Low |
| 3 | `/api/ai/mock-exam-feedback` | `ai-mock-exam-feedback` | OpenRouter LLM | Low |
| 4 | `/api/chat/generate-image` | `chat-generate-image` | OpenRouter Image + Storage | Medium |
| 5 | `/api/learning/generate-plan` | `learning-generate-plan` | OpenRouter LLM + DB | Medium |
| 6 | `/api/chat/start` | `chat-start` | OpenRouter LLM + iFlytek TTS | High |
| 7 | `/api/chat/respond` | `chat-respond` | iFlytek ASR+ISE + OpenRouter LLM | High |
| 8 | `/api/speech/c5-assess` | `speech-c5-assess` | iFlytek ASR+ISE + OpenRouter LLM | High |

## Routes Staying on Vercel (fast, <5s)

- `/api/speech/assess` (iFlytek ISE only)
- `/api/tts/speak`, `/api/tts/companion` (iFlytek TTS only)
- All social, leaderboard, auth, progress, quest, chat/delete/end/history/resume routes

## File Structure

```
supabase/functions/
  deno.json                          # Import map
  _shared/
    cors.ts                          # CORS headers helper
    env.ts                           # Deno.env.get() wrappers
    supabase.ts                      # Supabase client from auth header
    ai-client.ts                     # Port of src/lib/gemini/client.ts
    image-gen.ts                     # Port of src/lib/image-gen/client.ts
    iflytek-auth.ts                  # Shared HMAC-SHA256 auth for iFlytek
    iflytek-ise.ts                   # Port of src/lib/iflytek-speech/client.ts
    iflytek-asr.ts                   # Port of src/lib/iflytek-speech/asr-client.ts
    iflytek-tts.ts                   # Port of src/lib/voice/client.ts
    validations.ts                   # Port of src/lib/validations.ts
    chat-prompt.ts                   # Port of src/lib/chat/build-system-prompt.ts
    c5-scoring.ts                    # Port of src/lib/scoring/c5-scoring.ts
  ai-feedback/index.ts
  ai-insights/index.ts
  ai-mock-exam-feedback/index.ts
  chat-generate-image/index.ts
  chat-start/index.ts
  chat-respond/index.ts
  speech-c5-assess/index.ts
  learning-generate-plan/index.ts
```

## Key Deno Differences from Node.js

| Node.js | Deno Replacement |
|---------|-----------------|
| `process.env.VAR` | `Deno.env.get("VAR")` |
| `import crypto from "crypto"` | Web Crypto API (`crypto.subtle`) |
| `import WebSocket from "ws"` | `globalThis.WebSocket` (native) |
| `Buffer.from(data, "base64")` | `Uint8Array` + `atob()`/`btoa()` |
| `Buffer.concat([...])` | Manual Uint8Array concat helper |
| `NextRequest/NextResponse` | `Request`/`Response` (Web standard) |
| `cookies()` for auth | `Authorization: Bearer <token>` header |
| `import { z } from "zod"` | `import { z } from "npm:zod"` |
| `import { createClient } from "@supabase/supabase-js"` | `import { createClient } from "npm:@supabase/supabase-js@2"` |

---

## Task 1: Project Setup

**Files:**
- Create: `supabase/functions/deno.json`

**Step 1:** Create deno.json with import map

```json
{
  "imports": {
    "@supabase/supabase-js": "npm:@supabase/supabase-js@2",
    "zod": "npm:zod"
  },
  "compilerOptions": {
    "strict": true
  }
}
```

**Step 2:** Verify Supabase CLI is available

```bash
npx supabase functions list --project-ref yfoifmqjhavxidomgids
```

---

## Task 2: Shared Utilities — CORS, Env, Supabase Client

**Files:**
- Create: `supabase/functions/_shared/cors.ts`
- Create: `supabase/functions/_shared/env.ts`
- Create: `supabase/functions/_shared/supabase.ts`

### cors.ts

```typescript
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function corsResponse(): Response {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function errorResponse(error: string, status: number): Response {
  return jsonResponse({ error }, status);
}
```

### env.ts

```typescript
export function requireEnv(name: string): string {
  const val = Deno.env.get(name);
  if (!val) throw new Error(`Missing env: ${name}`);
  return val;
}

// Lazy accessors (same pattern as src/lib/env.ts)
export const OPENROUTER_API_KEY = () => requireEnv("OPENROUTER_API_KEY");
export const IFLYTEK_APP_ID = () => requireEnv("IFLYTEK_APP_ID");
export const IFLYTEK_API_KEY = () => requireEnv("IFLYTEK_API_KEY");
export const IFLYTEK_API_SECRET = () => requireEnv("IFLYTEK_API_SECRET");
export const SUPABASE_SERVICE_ROLE_KEY = () => requireEnv("SUPABASE_SERVICE_ROLE_KEY");
```

### supabase.ts

```typescript
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { requireEnv, SUPABASE_SERVICE_ROLE_KEY } from "./env.ts";

/**
 * Create authenticated Supabase client from request's Authorization header.
 * Mirrors the cookie-based auth in src/lib/supabase/server.ts.
 */
export function createSupabaseClient(req: Request): SupabaseClient {
  const authHeader = req.headers.get("authorization") ?? "";
  return createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      global: { headers: { Authorization: authHeader } },
    }
  );
}

/** Admin client with service role key (bypasses RLS). */
export function createAdminClient(): SupabaseClient {
  return createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    SUPABASE_SERVICE_ROLE_KEY(),
  );
}
```

---

## Task 3: Shared Utility — AI Client (port of gemini/client.ts)

**Files:**
- Create: `supabase/functions/_shared/ai-client.ts`
- Reference: `src/lib/gemini/client.ts`

**Key changes from original:**
- Replace `import { OPENROUTER_API_KEY } from "@/lib/env"` → `import { OPENROUTER_API_KEY } from "./env.ts"`
- Replace `AbortSignal.timeout(ms)` → same (works in Deno)
- All functions use standard `fetch()` — fully Deno-compatible
- Copy ALL functions: `chatCompletion`, `quickCompletion`, `fetchCompletion`, `generateFeedback`, `chatConversation`, `analyzeC5Speaking`, `generatePhase`
- Copy ALL types: `ChatResponseEnvelope`, `GeminiC5Analysis`, `PhaseGenerationOutput`, `PhaseNodeSpec`
- Copy retry logic (3 retries, exponential backoff)
- Copy model constants and fallback messages

**This is a direct port — the only changes are import paths (use relative `.ts` extensions).**

---

## Task 4: Shared Utility — Image Generation (port of image-gen/client.ts)

**Files:**
- Create: `supabase/functions/_shared/image-gen.ts`
- Reference: `src/lib/image-gen/client.ts`

**Direct port — only change import path for env.ts. All code (fetch, regex parsing) is Deno-compatible.**

---

## Task 5: Shared Utility — iFlytek Auth Helper

**Files:**
- Create: `supabase/functions/_shared/iflytek-auth.ts`

This replaces the Node.js `crypto.createHmac` pattern used in ISE, ASR, and TTS clients.

```typescript
import { IFLYTEK_API_KEY, IFLYTEK_API_SECRET } from "./env.ts";

/**
 * Build an authenticated WebSocket URL for any iFlytek service.
 * Uses Web Crypto API (works in Deno) instead of Node.js crypto.
 */
export async function buildIflytekWsUrl(host: string, path: string): Promise<string> {
  const apiKey = IFLYTEK_API_KEY();
  const apiSecret = IFLYTEK_API_SECRET();

  const now = new Date().toUTCString();
  const signatureOrigin = `host: ${host}\ndate: ${now}\nGET ${path} HTTP/1.1`;

  // HMAC-SHA256 using Web Crypto API
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(apiSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signatureBytes = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(signatureOrigin),
  );
  const signature = btoa(String.fromCharCode(...new Uint8Array(signatureBytes)));

  const authorizationOrigin = `api_key="${apiKey}", algorithm="hmac-sha256", headers="host date request-line", signature="${signature}"`;
  const authorization = btoa(authorizationOrigin);

  const params = new URLSearchParams({
    authorization,
    date: now,
    host,
  });

  return `wss://${host}${path}?${params.toString()}`;
}
```

---

## Task 6: Shared Utilities — iFlytek ISE, ASR, TTS (port WebSocket clients)

**Files:**
- Create: `supabase/functions/_shared/iflytek-ise.ts` (port of `src/lib/iflytek-speech/client.ts`)
- Create: `supabase/functions/_shared/iflytek-asr.ts` (port of `src/lib/iflytek-speech/asr-client.ts`)
- Create: `supabase/functions/_shared/iflytek-tts.ts` (port of `src/lib/voice/client.ts`)

**Common changes for all three:**

1. Replace `import WebSocket from "ws"` → use `globalThis.WebSocket` (native Deno)
2. Replace `crypto.createHmac(...)` → use `buildIflytekWsUrl()` from `./iflytek-auth.ts`
3. Replace `Buffer.from(data, "base64")` → helper function:

```typescript
function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function concatUint8Arrays(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((sum, a) => sum + a.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) { result.set(a, offset); offset += a.length; }
  return result;
}
```

4. Replace `Buffer.concat([...])` → `concatUint8Arrays(...)`
5. Replace `buffer.subarray(start, end)` → same (Uint8Array has `.subarray()`)
6. Replace `buffer.toString("ascii", 0, 4)` → `new TextDecoder().decode(bytes.subarray(0, 4))`

**WebSocket API differences (ws npm → native):**

| ws (Node.js) | Native WebSocket (Deno) |
|---|---|
| `ws.on("open", cb)` | `ws.onopen = cb` |
| `ws.on("message", (data) => ...)` | `ws.onmessage = (ev) => { const data = ev.data; ... }` |
| `ws.on("error", cb)` | `ws.onerror = cb` |
| `ws.on("close", cb)` | `ws.onclose = cb` |
| `ws.send(data)` | `ws.send(data)` (same) |
| `ws.close()` | `ws.close()` (same) |
| Data arrives as `Buffer` | Data arrives as `string` or `Blob` |

**For each file, port the business logic directly from the source file. The only changes are the import paths, Buffer→Uint8Array, crypto→Web Crypto, and WebSocket API.**

---

## Task 7: Shared Utilities — Validations, Chat Prompt, C5 Scoring

**Files:**
- Create: `supabase/functions/_shared/validations.ts` (port of `src/lib/validations.ts`)
- Create: `supabase/functions/_shared/chat-prompt.ts` (port of `src/lib/chat/build-system-prompt.ts`)
- Create: `supabase/functions/_shared/c5-scoring.ts` (port of `src/lib/scoring/c5-scoring.ts`)

**All three are pure TypeScript with no Node.js APIs. Direct port with only import path changes:**
- `import { z } from "zod"` → `import { z } from "zod"` (resolved via deno.json import map)
- Remove any `@/*` path aliases, use relative paths

---

## Task 8: Edge Function — ai-feedback

**Files:**
- Create: `supabase/functions/ai-feedback/index.ts`
- Reference: `src/app/api/ai/feedback/route.ts`

**Pattern for all edge functions:**

```typescript
import { corsResponse, jsonResponse, errorResponse, corsHeaders } from "../_shared/cors.ts";
import { createSupabaseClient } from "../_shared/supabase.ts";
// ... other imports

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return corsResponse();

  const supabase = createSupabaseClient(req);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return errorResponse("Unauthorized", 401);

  try {
    // ... business logic (same as the Next.js route)
    return jsonResponse({ /* response data */ });
  } catch (error) {
    console.error("[ai-feedback] Error:", error);
    return errorResponse("Internal error", 500);
  }
});
```

**Port the business logic from `src/app/api/ai/feedback/route.ts` into the handler.** Key imports:
- `generateFeedback` from `../_shared/ai-client.ts`
- `aiFeedbackSchema` from `../_shared/validations.ts`
- Supabase queries for character personality_prompt and player memory

---

## Task 9: Edge Function — ai-insights

**Files:**
- Create: `supabase/functions/ai-insights/index.ts`
- Reference: `src/app/api/ai/insights/route.ts`

Simplest function. Port business logic: validate input with Zod, call `quickCompletion()`, return insights string with fallback.

---

## Task 10: Edge Function — ai-mock-exam-feedback

**Files:**
- Create: `supabase/functions/ai-mock-exam-feedback/index.ts`
- Reference: `src/app/api/ai/mock-exam-feedback/route.ts`

Port business logic: build condensed summary from componentResults, call `quickCompletion()`, return feedback string.

---

## Task 11: Edge Function — chat-generate-image

**Files:**
- Create: `supabase/functions/chat-generate-image/index.ts`
- Reference: `src/app/api/chat/generate-image/route.ts`

**Key difference:** Uses admin client for storage upload. Replace `Buffer.from(base64, "base64")` with `base64ToUint8Array()`:

```typescript
import { createSupabaseClient, createAdminClient } from "../_shared/supabase.ts";
import { generateSceneImage } from "../_shared/image-gen.ts";

// In handler:
const imageResult = await generateSceneImage({ ... });
const bytes = base64ToUint8Array(imageResult.base64);

const adminClient = createAdminClient();
const { error } = await adminClient.storage
  .from("chat-images")
  .upload(fileName, bytes, { contentType: normalizedMime, upsert: false });
```

---

## Task 12: Edge Function — learning-generate-plan

**Files:**
- Create: `supabase/functions/learning-generate-plan/index.ts`
- Reference: `src/app/api/learning/generate-plan/route.ts`

Port business logic: validate input, call `generatePhase()`, create learning plan + nodes in DB, check achievements. All Supabase queries work identically.

---

## Task 13: Edge Function — chat-start

**Files:**
- Create: `supabase/functions/chat-start/index.ts`
- Reference: `src/app/api/chat/start/route.ts`

**Key difference:** TTS audio needs base64 encoding without Buffer:

```typescript
import { synthesizeAcademic } from "../_shared/iflytek-tts.ts";

// In handler:
const audioBytes = await synthesizeAcademic({ voiceId, text });
const ttsAudio = uint8ArrayToBase64(audioBytes); // Instead of Buffer.toString("base64")
```

---

## Task 14: Edge Function — chat-respond

**Files:**
- Create: `supabase/functions/chat-respond/index.ts`
- Reference: `src/app/api/chat/respond/route.ts`

**Key differences:**
- Multipart form data: `const formData = await req.formData()`
- Audio buffer: `const audioBytes = new Uint8Array(await audioFile.arrayBuffer())`
- Uses ASR + ISE + LLM pipeline

---

## Task 15: Edge Function — speech-c5-assess

**Files:**
- Create: `supabase/functions/speech-c5-assess/index.ts`
- Reference: `src/app/api/speech/c5-assess/route.ts`

**Most complex function.** Key logic to port:
- Audio chunking (split >90s audio into chunks)
- ISE assessment per chunk with result merging
- ASR transcription
- Gemini C5 analysis
- Score calculation via `calculateC5Score()`
- All Buffer operations → Uint8Array operations

---

## Task 16: Client-Side Routing — Transparent Edge Function Routing

**Files:**
- Modify: `src/lib/fetch-retry.ts`
- Create: `src/lib/edge-routing.ts`

**This is the key integration point. Zero changes needed at call sites.**

### edge-routing.ts

```typescript
import { createClient } from "@/lib/supabase/client";

const EDGE_ROUTES: Record<string, string> = {
  "/api/ai/feedback": "ai-feedback",
  "/api/ai/insights": "ai-insights",
  "/api/ai/mock-exam-feedback": "ai-mock-exam-feedback",
  "/api/chat/generate-image": "chat-generate-image",
  "/api/chat/start": "chat-start",
  "/api/chat/respond": "chat-respond",
  "/api/speech/c5-assess": "speech-c5-assess",
  "/api/learning/generate-plan": "learning-generate-plan",
};

/**
 * If the URL matches a migrated route, rewrite to Supabase Edge Function URL
 * and inject the auth token. Returns null if not an edge route.
 */
export async function resolveEdgeRoute(
  input: string | URL | Request
): Promise<{ url: string; authHeader: string } | null> {
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  const edgeName = EDGE_ROUTES[url];
  if (!edgeName) return null;

  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token ?? "";

  return {
    url: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/${edgeName}`,
    authHeader: `Bearer ${token}`,
  };
}
```

### Modified fetch-retry.ts

Add edge routing at the top of `fetchWithRetry`:

```typescript
import { resolveEdgeRoute } from "./edge-routing";

export async function fetchWithRetry(
  input: string | URL | Request,
  init?: RequestInit,
  { maxRetries = 3, baseDelayMs = 1000 }: RetryOptions = {}
): Promise<Response> {
  // Route to Supabase Edge Function if applicable
  const edge = await resolveEdgeRoute(input);
  if (edge) {
    const headers = new Headers(init?.headers);
    headers.set("Authorization", edge.authHeader);
    input = edge.url;
    init = { ...init, headers };
  }

  // ... rest of existing retry logic unchanged
}
```

---

## Task 17: Deploy Edge Functions

**Step 1:** Set environment variables for the Supabase project:

```bash
npx supabase secrets set \
  OPENROUTER_API_KEY="..." \
  IFLYTEK_APP_ID="..." \
  IFLYTEK_API_KEY="..." \
  IFLYTEK_API_SECRET="..." \
  SUPABASE_SERVICE_ROLE_KEY="..." \
  NEXT_PUBLIC_SUPABASE_URL="..." \
  NEXT_PUBLIC_SUPABASE_ANON_KEY="..." \
  --project-ref yfoifmqjhavxidomgids
```

**Step 2:** Deploy all functions:

```bash
npx supabase functions deploy ai-feedback --project-ref yfoifmqjhavxidomgids
npx supabase functions deploy ai-insights --project-ref yfoifmqjhavxidomgids
npx supabase functions deploy ai-mock-exam-feedback --project-ref yfoifmqjhavxidomgids
npx supabase functions deploy chat-generate-image --project-ref yfoifmqjhavxidomgids
npx supabase functions deploy chat-start --project-ref yfoifmqjhavxidomgids
npx supabase functions deploy chat-respond --project-ref yfoifmqjhavxidomgids
npx supabase functions deploy speech-c5-assess --project-ref yfoifmqjhavxidomgids
npx supabase functions deploy learning-generate-plan --project-ref yfoifmqjhavxidomgids
```

**Step 3:** Commit client-side routing changes and push to Vercel

**Step 4:** Test each migrated feature end-to-end

---

## Task 18: Cleanup (after verification)

- Remove `maxDuration` exports from migrated Vercel routes (no longer needed)
- Optionally remove or stub the old Vercel route files (keep as 410 Gone or redirect)
- Update CLAUDE.md with edge function architecture notes

---

## Execution Order

1. Tasks 1-7: Setup + shared utilities (no deployment, just file creation)
2. Tasks 8-10: Simple AI functions (deploy + test first — lowest risk)
3. Task 11: Image generation (deploy + test — fixes the user's original bug)
4. Task 12: Learning plan (deploy + test)
5. Tasks 13-15: iFlytek-dependent functions (most complex, deploy + test)
6. Task 16: Client-side routing (push to Vercel)
7. Tasks 17-18: Deploy all + cleanup

**Total estimated files:** ~22 new, 1 modified
