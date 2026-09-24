import { NextResponse } from "next/server";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import { enforceRateLimit } from "@/lib/rate-limit";

export async function POST() {
  const supabase = await createClient();
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const limited = await enforceRateLimit(user.id, "write");
  if (limited) return limited;

  try {
    // Find active plan
    const { data: plan } = await supabase
      .from("learning_plans")
      .select("id")
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle();

    if (!plan) {
      return NextResponse.json({ error: "No active plan" }, { status: 404 });
    }

    // Delete nodes and checkpoints first, then abandon plan
    await supabase
      .from("learning_nodes")
      .delete()
      .eq("plan_id", plan.id);

    await supabase
      .from("learning_checkpoints")
      .delete()
      .eq("plan_id", plan.id);

    await supabase
      .from("learning_plans")
      .update({ status: "abandoned" })
      .eq("id", plan.id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Reset plan error:", error);
    return NextResponse.json(
      { error: "Failed to reset learning plan" },
      { status: 500 }
    );
  }
}
