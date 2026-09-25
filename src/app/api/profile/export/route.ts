import { NextRequest, NextResponse } from "next/server";

import { exportAuthRecords } from "@/lib/auth";
import { collectUserData } from "@/lib/data-export";
import { enforceRateLimit } from "@/lib/rate-limit";
import { logSecurityEvent, requestContext } from "@/lib/security-events";
import { createClient, getSessionUser } from "@/lib/supabase/server";

/**
 * GET /api/profile/export — the signed-in user's personal data as a JSON
 * download (PDPO DPP6 data access). Scoped entirely to the session user.
 */
export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const limited = await enforceRateLimit(user.id, "export");
  if (limited) return limited;

  try {
    const supabase = await createClient();
    const [identity, data] = await Promise.all([
      exportAuthRecords(user.id),
      collectUserData(supabase, user.id),
    ]);
    await logSecurityEvent({
      type: "account.export",
      userId: user.id,
      ...requestContext(request.headers),
    });

    const day = data.exportedAt.slice(0, 10);
    return new NextResponse(JSON.stringify({ ...data, identity }, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="xiyouquest-my-data-${day}.json"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[export] failed:", error instanceof Error ? error.message : error);
    return NextResponse.json(
      { error: "Your data export could not be prepared. Please try again." },
      { status: 500 },
    );
  }
}
