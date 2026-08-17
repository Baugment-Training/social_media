-- ===========================================================================
-- BAUGMENT — media storage
--
-- Run this ONCE, after schema.sql, in:
--     Supabase Dashboard → SQL Editor → New query → paste → Run
--
-- (Paste the contents, not the filename.) Safe to run more than once.
--
-- WHY IT EXISTS
--   schema.sql stores media *records* — name, kind, size, tags, category.
--   It has never stored the *bytes*, because a base64 image inside a table row
--   blows past the request size limit. The `media.storage_path` column has
--   been sitting there empty waiting for a bucket to point at. This is it.
--
--   Without this file, an uploaded image is held in the uploading browser and
--   nowhere else: the record syncs, the picture does not, and the thumbnail
--   falls back to a placeholder tile on the next refresh.
--
-- WHAT IT DOES
--   Creates a PRIVATE bucket called `baugment-media` and four policies, so a
--   signed-in user can read, upload, replace and delete files in it — and an
--   anonymous visitor can do none of those things. The app never hands out a
--   raw file URL; it mints a short-lived signed URL per thumbnail instead.
-- ===========================================================================

-- --- 1. The bucket ---------------------------------------------------------
-- `public = false` is the important part. A public bucket would make every
-- uploaded file readable by anyone who guessed the URL, which defeats the
-- point of the Row Level Security in schema.sql.

insert into storage.buckets (id, name, public, file_size_limit)
values ('baugment-media', 'baugment-media', false, 26214400)   -- 25 MB per file
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit;

-- --- 2. Access policies ----------------------------------------------------
-- Same rule as every table: signed in means full access, anonymous means none.
-- To go finer-grained later (per-user folders, read-only accounts), tighten
-- the `using` / `with check` expressions — no app code needs to move.

drop policy if exists baugment_media_read   on storage.objects;
drop policy if exists baugment_media_insert on storage.objects;
drop policy if exists baugment_media_update on storage.objects;
drop policy if exists baugment_media_delete on storage.objects;

create policy baugment_media_read on storage.objects
  for select to authenticated
  using (bucket_id = 'baugment-media');

create policy baugment_media_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'baugment-media');

create policy baugment_media_update on storage.objects
  for update to authenticated
  using (bucket_id = 'baugment-media')
  with check (bucket_id = 'baugment-media');

create policy baugment_media_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'baugment-media');

-- ===========================================================================
-- AFTER RUNNING THIS
--
-- 1. Reload BAUGMENT and open Media Library.
--
-- 2. Records uploaded BEFORE this point have no file behind them — their
--    bytes only ever existed in one browser session. They are marked
--    "No file" on the card. Click one and choose "Attach a file…" to give it
--    the picture back; the record, its tags and its category are kept.
--
-- 3. New uploads go to the bucket automatically and appear on every device.
--
-- To check it worked: Supabase Dashboard → Storage. You should see a
-- `baugment-media` bucket with a padlock (private) next to its name.
-- ===========================================================================
