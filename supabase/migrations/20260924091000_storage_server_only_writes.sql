-- Storage writes are server-only.
--
-- Every upload (src/app/api/profile/avatar, src/app/api/chat/generate-image,
-- supabase/functions/chat-generate-image) runs with the service-role client
-- after the server verifies the Better Auth session, so these `authenticated`
-- policies are unused by the app. They were reachable by anyone who minted a
-- Supabase Auth session through the (then open) sign-up endpoint, turning two
-- public buckets into free anonymous file hosting. Public-read of the buckets
-- is unchanged; it does not depend on these policies.

BEGIN;

DROP POLICY IF EXISTS "Avatars: owner can list own folder" ON storage.objects;
DROP POLICY IF EXISTS "Chat images: owner can list own folder" ON storage.objects;
DROP POLICY IF EXISTS "Chat images: owner can upload to own folder" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload their own avatar" ON storage.objects;

COMMIT;
