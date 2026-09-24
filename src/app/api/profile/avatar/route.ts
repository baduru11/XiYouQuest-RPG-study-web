import { NextResponse } from "next/server";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import { enforceRateLimit } from "@/lib/rate-limit";

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

// Extension derived from the validated MIME type, never from the filename.
const EXTENSION_BY_TYPE: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

/**
 * The declared MIME type comes from the client; confirm it against the file's
 * magic bytes so a renamed non-image cannot be stored as an image.
 */
function matchesMagicBytes(type: string, bytes: Uint8Array): boolean {
  const startsWith = (sig: number[], offset = 0) =>
    sig.every((b, i) => bytes[offset + i] === b);
  switch (type) {
    case "image/png":
      return startsWith([0x89, 0x50, 0x4e, 0x47]);
    case "image/jpeg":
      return startsWith([0xff, 0xd8, 0xff]);
    case "image/gif":
      return startsWith([0x47, 0x49, 0x46, 0x38]);
    case "image/webp":
      // RIFF....WEBP
      return startsWith([0x52, 0x49, 0x46, 0x46]) && startsWith([0x57, 0x45, 0x42, 0x50], 8);
    default:
      return false;
  }
}

/**
 * Uploads the caller's avatar to the `avatars` bucket and stores the public
 * URL on their profile. Browser code cannot talk to Supabase Storage directly
 * (auth is Better Auth, not Supabase Auth), so uploads go through this route.
 */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const limited = await enforceRateLimit(user.id, "upload");
  if (limited) return limited;

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }

  const ext = EXTENSION_BY_TYPE[file.type];
  if (!ext) {
    return NextResponse.json(
      { error: "Unsupported image type. Use PNG, JPEG, WebP, or GIF." },
      { status: 400 },
    );
  }
  if (file.size > MAX_AVATAR_BYTES) {
    return NextResponse.json(
      { error: "Image too large. Maximum size is 2MB." },
      { status: 400 },
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!matchesMagicBytes(file.type, bytes)) {
    return NextResponse.json(
      { error: "File content does not match its image type." },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const path = `${user.id}/avatar.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("avatars")
    .upload(path, bytes, { upsert: true, contentType: file.type });

  if (uploadError) {
    console.error("Avatar upload error:", uploadError);
    return NextResponse.json(
      { error: "Failed to upload avatar" },
      { status: 500 },
    );
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from("avatars").getPublicUrl(path);

  // Cache-buster so the new image shows immediately despite the public URL
  // being otherwise stable.
  const avatarUrl = `${publicUrl}?t=${Date.now()}`;

  const { error: updateError } = await supabase
    .from("profiles")
    .update({ avatar_url: avatarUrl })
    .eq("id", user.id);

  if (updateError) {
    console.error("Avatar profile update error:", updateError);
    return NextResponse.json(
      { error: "Failed to save avatar" },
      { status: 500 },
    );
  }

  // Only after the new avatar is stored AND referenced: remove avatars
  // previously saved under a different extension so the bucket holds at most
  // one per user. Doing this earlier could delete the still-referenced old
  // avatar when the upload fails. Cleanup failure is non-fatal, so just log.
  const staleAvatarPaths = Object.values(EXTENSION_BY_TYPE)
    .filter((other) => other !== ext)
    .map((other) => `${user.id}/avatar.${other}`);
  const { error: cleanupError } = await supabase.storage
    .from("avatars")
    .remove(staleAvatarPaths);
  if (cleanupError) {
    console.error("Stale avatar cleanup failed:", cleanupError);
  }

  return NextResponse.json({ avatarUrl });
}
