import type { SupabaseClient } from "@supabase/supabase-js";

import { listAllEntries } from "@/lib/storage-list";

/**
 * Self-service personal-data export (PDPO DPP6 data access; CSP checklist item
 * "end-users' access rights"). Every query is scoped to the session user's id
 * or to child rows of records already fetched under that id; nothing is
 * selected by a client-supplied identifier.
 *
 * PostgREST caps a response at 1,000 rows, so every collection is paged with a
 * stable ORDER BY; a silent truncation would make the export incomplete.
 */
export const EXPORT_PAGE_SIZE = 1000;
const IN_LIST_CHUNK = 100;

type Row = Record<string, unknown>;
interface PageResult {
  data: unknown[] | null;
  error: { message: string } | null;
}
interface PageableQuery {
  order(column: string, options: { ascending: boolean }): PageableQuery;
  range(from: number, to: number): PromiseLike<PageResult>;
}

export async function fetchAllRows(
  makeQuery: () => PageableQuery,
  orderBy: readonly string[],
): Promise<Row[]> {
  const rows: Row[] = [];
  for (let from = 0; ; from += EXPORT_PAGE_SIZE) {
    let query = makeQuery();
    for (const column of orderBy) query = query.order(column, { ascending: true });
    const { data, error } = await query.range(from, from + EXPORT_PAGE_SIZE - 1);
    if (error) throw new Error(`export query failed: ${error.message}`);
    const page = (data ?? []) as Row[];
    rows.push(...page);
    if (page.length < EXPORT_PAGE_SIZE) return rows;
  }
}

const ids = (rows: Row[]): string[] => rows.map((row) => String(row.id));

export interface UserDataExport {
  format: "xiyouquest-personal-data-export/1";
  exportedAt: string;
  profile: Row | null;
  practice: { progress: Row[]; sessions: Row[]; details: Row[] };
  mockExams: Row[];
  quests: Row[];
  characters: Row[];
  achievements: Row[];
  learning: { plans: Row[]; nodes: Row[]; checkpoints: Row[] };
  chat: { sessions: Row[]; messages: Row[] };
  social: { friendships: Row[] };
  usage: { rateLimitCounters: Row[] };
  securityEvents: Row[] | { unavailable: string };
  files: { avatars: string[]; chatImages: string[] };
}

export async function collectUserData(
  supabase: SupabaseClient,
  userId: string,
): Promise<UserDataExport> {
  const owned = (table: string, orderBy: readonly string[] = ["id"]) =>
    fetchAllRows(() => supabase.from(table).select("*").eq("user_id", userId) as unknown as PageableQuery, orderBy);

  const children = async (table: string, parentColumn: string, parentIds: string[]) => {
    const rows: Row[] = [];
    for (let i = 0; i < parentIds.length; i += IN_LIST_CHUNK) {
      const chunk = parentIds.slice(i, i + IN_LIST_CHUNK);
      rows.push(
        ...(await fetchAllRows(
          () => supabase.from(table).select("*").in(parentColumn, chunk) as unknown as PageableQuery,
          ["id"],
        )),
      );
    }
    return rows;
  };

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  if (profileError) throw new Error(`export query failed: ${profileError.message}`);

  const [progress, sessions, mockExams, quests, characters, achievements, plans, chats, rateLimits, friendships] =
    await Promise.all([
      owned("user_progress"),
      owned("practice_sessions"),
      owned("mock_exam_results"),
      owned("quest_progress"),
      owned("user_characters", ["character_id"]),
      owned("user_achievements"),
      owned("learning_plans"),
      owned("chat_sessions"),
      owned("rate_limit_counters", ["window_start", "bucket", "window_seconds"]),
      fetchAllRows(
        () =>
          supabase
            .from("friendships")
            .select("*")
            .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`) as unknown as PageableQuery,
        ["id"],
      ),
    ]);

  const [details, nodes, checkpoints, messages] = await Promise.all([
    children("practice_details", "session_id", ids(sessions)),
    children("learning_nodes", "plan_id", ids(plans)),
    children("learning_checkpoints", "plan_id", ids(plans)),
    children("chat_messages", "session_id", ids(chats)),
  ]);

  const { data: events, error: eventsError } = await supabase.rpc("security_events_for_user", {
    p_user_id: userId,
  });

  return {
    format: "xiyouquest-personal-data-export/1",
    exportedAt: new Date().toISOString(),
    profile: (profile as Row | null) ?? null,
    practice: { progress, sessions, details },
    mockExams,
    quests,
    characters,
    achievements,
    learning: { plans, nodes, checkpoints },
    chat: { sessions: chats, messages },
    social: { friendships },
    usage: { rateLimitCounters: rateLimits },
    securityEvents: eventsError
      ? { unavailable: "The security event log is not enabled on this deployment yet." }
      : ((events ?? []) as Row[]),
    files: await listUserFiles(supabase, userId),
  };
}

async function listUserFiles(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ avatars: string[]; chatImages: string[] }> {
  const avatars = await listAllEntries(supabase, "avatars", userId);
  const chatImages: string[] = [];
  for (const folder of await listAllEntries(supabase, "chat-images", userId)) {
    const files = await listAllEntries(supabase, "chat-images", `${userId}/${folder.name}`);
    for (const file of files) chatImages.push(`chat-images/${userId}/${folder.name}/${file.name}`);
  }
  return {
    avatars: avatars.map((file) => `avatars/${userId}/${file.name}`),
    chatImages,
  };
}
