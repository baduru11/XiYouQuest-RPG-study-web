-- Restrict the public chat-images bucket to the raster types the app writes.
--
-- The avatars bucket already carries a 2 MB limit and an image MIME allowlist;
-- chat-images had no MIME restriction at the bucket level. Every write path
-- (Next route and edge function) normalises generated images to one of these
-- four types, and all 82 stored objects are image/png (checked 2026-09-25), so
-- this only removes the possibility of serving an executable type (HTML, SVG)
-- from a public bucket if a future code path or policy regression allowed it.
UPDATE storage.buckets
SET allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/gif', 'image/webp']
WHERE id = 'chat-images';
