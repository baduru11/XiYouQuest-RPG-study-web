"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export async function login(formData: FormData) {
  const supabase = await createClient();
  const data = {
    email: formData.get("email") as string,
    password: formData.get("password") as string,
  };

  const { error } = await supabase.auth.signInWithPassword(data);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function signup(formData: FormData) {
  const supabase = await createClient();
  const data = {
    email: formData.get("email") as string,
    password: formData.get("password") as string,
  };

  const { error, data: signUpData } = await supabase.auth.signUp(data);

  if (error) {
    return { error: error.message };
  }

  // Fire-and-forget account_created achievement
  if (signUpData.user) {
    const { checkAndUnlockAchievements } = await import("@/lib/achievements/check");
    checkAndUnlockAchievements(supabase, signUpData.user.id, { type: "account_created" }).catch(() => {});
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function signInWithGoogle() {
  const supabase = await createClient();
  const headersList = await headers();
  const rawOrigin = headersList.get("origin") || process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  // Enforce HTTPS in production to prevent token leakage over plain HTTP
  const origin = process.env.NODE_ENV === "production" && !rawOrigin.startsWith("https://")
    ? rawOrigin.replace("http://", "https://")
    : rawOrigin;

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${origin}/api/auth/callback`,
    },
  });

  if (error) {
    return { error: error.message };
  }

  if (data.url) {
    redirect(data.url);
  }
}

export async function signInWithDiscord() {
  const supabase = await createClient();
  const headersList = await headers();
  const rawOrigin = headersList.get("origin") || process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  // Enforce HTTPS in production to prevent token leakage over plain HTTP
  const origin = process.env.NODE_ENV === "production" && !rawOrigin.startsWith("https://")
    ? rawOrigin.replace("http://", "https://")
    : rawOrigin;

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "discord",
    options: {
      redirectTo: `${origin}/api/auth/callback`,
      scopes: "identify email relationships.read",
    },
  });

  if (error) {
    return { error: error.message };
  }

  if (data.url) {
    redirect(data.url);
  }
}
