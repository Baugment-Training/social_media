-- ===========================================================================
-- BAUGMENT — Supabase schema
-- PT Baugment Teknologi Edukasi · Graha Mampang Lt.3, Jakarta Selatan
--
-- HOW TO RUN
--   Copy EVERYTHING in this file — all of it, from this comment block down to
--   the last line — and paste it into:
--       Supabase Dashboard → SQL Editor → New query → Run
--
--   Paste the contents, not the filename. Typing `supabase/schema.sql` into
--   the SQL editor produces: ERROR: 42601: syntax error at or near "supabase"
--
--   It is safe to run more than once.
--
-- WHAT IT DOES
--   Creates the eleven tables BAUGMENT stores, indexes the columns it filters
--   on, turns Row Level Security ON for every one of them, and writes policies
--   that require a signed-in user for every read and every write.
--
--   That last part is what makes it safe to publish the anon key in
--   assets/js/config.js. Without RLS the key would be an open door. With it,
--   an anonymous visitor to your public URL gets nothing back.
-- ===========================================================================

-- --- Ids -------------------------------------------------------------------
-- Primary keys are `text`, not uuid, so the ids BAUGMENT already generated in
-- the browser (ana_1, pil_20, idea_7, cmp_kgd7agf991b) migrate up unchanged.

-- --- 1. Tables -------------------------------------------------------------

create table if not exists public.accounts (
  id          text primary key,
  platform    text not null,
  handle      text,
  name        text,
  followers   numeric default 0,
  source      text,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id) on delete set null
);

create table if not exists public.pillars (
  id            text primary key,
  name          text not null,
  description   text,
  color         text,
  target_share  numeric default 0,
  source        text,
  updated_at    timestamptz not null default now(),
  updated_by    uuid references auth.users(id) on delete set null
);

create table if not exists public.campaigns (
  id          text primary key,
  name        text not null,
  objective   text,
  starts_on   date,
  ends_on     date,
  budget      numeric,
  platforms   jsonb default '[]'::jsonb,
  kpi_metric  text,
  kpi_target  numeric default 0,
  status      text,
  owner       text,
  notes       text,
  source      text,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id) on delete set null
);

create table if not exists public.analytics (
  id                text primary key,
  platform          text not null,
  account_id        text,
  account           text,
  post_id           text,
  post_url          text,
  caption           text,
  media_type        text,
  content_type      text,
  status            text default 'published',
  published_date    date not null,
  published_time    text,
  pillar_id         text,
  campaign_id       text,
  author            text,
  impressions       numeric default 0,
  reach             numeric default 0,
  views             numeric default 0,
  video_views       numeric default 0,
  watch_time        numeric default 0,
  avg_watch_time    numeric default 0,
  likes             numeric default 0,
  comments          numeric default 0,
  shares            numeric default 0,
  saves             numeric default 0,
  reactions         numeric default 0,
  replies           numeric default 0,
  bookmarks         numeric default 0,
  link_clicks       numeric default 0,
  profile_visits    numeric default 0,
  followers_gained  numeric default 0,
  followers_lost    numeric default 0,
  utm_source        text,
  utm_medium        text,
  utm_campaign      text,
  hashtags          text,
  mentions          text,
  location          text,
  notes             text,
  -- Custom metrics live here, so adding "Enrolments" in Settings never needs
  -- a migration. The metric registry in the app is the source of truth.
  custom            jsonb default '{}'::jsonb,
  source            text,
  imported_at       timestamptz,
  updated_at        timestamptz not null default now(),
  updated_by        uuid references auth.users(id) on delete set null
);

create table if not exists public.planner (
  id            text primary key,
  title         text not null,
  caption       text,
  platform      text,
  media_type    text,
  publish_date  date,
  publish_time  text,
  objective     text,
  audience      text,
  cta           text,
  hashtags      text,
  keywords      text,
  thumbnail_id  text,
  owner         text,
  reviewer      text,
  priority      text default 'medium',
  status        text default 'draft',
  pillar_id     text,
  campaign_id   text,
  notes         text,
  source        text,
  updated_at    timestamptz not null default now(),
  updated_by    uuid references auth.users(id) on delete set null
);

-- The Idea Bank: everything upstream of a planned post. Deliberately loose —
-- most rows are a title and a paragraph, and that is the point.
create table if not exists public.ideas (
  id           text primary key,
  title        text not null,
  notes        text,
  status       text default 'raw',        -- raw | developing | ready | used | parked
  potential    text default 'medium',     -- high | medium | low
  origin       text,                      -- where the idea came from
  platform     text,                      -- 'any' until someone decides
  pillar_id    text,
  campaign_id  text,
  tags         jsonb default '[]'::jsonb,
  source_url   text,
  owner        text,
  created_on   date,
  updated_on   date,
  -- Set when an idea is sent to the planner, so the trail from thought to
  -- published post survives. Intentionally not a foreign key: deleting the
  -- planned post should not delete the record that the idea existed.
  promoted_to  text,
  source       text,
  updated_at   timestamptz not null default now(),
  updated_by   uuid references auth.users(id) on delete set null
);

create table if not exists public.media (
  id          text primary key,
  name        text not null,
  kind        text,
  tags        jsonb default '[]'::jsonb,
  category    text,
  size        numeric,
  width       numeric,
  height      numeric,
  hue         numeric,
  uploaded    date,
  -- Deliberately no binary column. See the note at the bottom of this file.
  storage_path text,
  source      text,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id) on delete set null
);

-- accounts.followers holds the current number. This table keeps the dated
-- readings behind it, so growth is measured from what was actually recorded
-- rather than inferred from per-post follower deltas.
create table if not exists public.follower_snapshots (
  id           text primary key,
  account_id   text not null,
  captured_on  date not null,
  followers    numeric not null default 0,
  note         text,
  source       text,
  updated_at   timestamptz not null default now(),
  updated_by   uuid references auth.users(id) on delete set null
);

create table if not exists public.custom_metrics (
  key         text primary key,
  label       text not null,
  agg         text default 'sum',
  fmt         text default 'int',
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id) on delete set null
);

create table if not exists public.import_history (
  id          text primary key,
  at          timestamptz,
  file        text,
  format      text,
  total       numeric,
  added       numeric,
  replaced    numeric,
  skipped     numeric,
  warnings    numeric,
  strategy    text,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id) on delete set null
);

-- Settings are a free-form bag, and there is exactly one row.
create table if not exists public.app_settings (
  id          text primary key default 'app',
  data        jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id) on delete set null
);

insert into public.app_settings (id, data) values ('app', '{}'::jsonb)
  on conflict (id) do nothing;

-- --- 2. Indexes ------------------------------------------------------------
-- Mirrors what the app actually filters and sorts on.

create index if not exists analytics_published_date_idx on public.analytics (published_date desc);
create index if not exists analytics_platform_idx       on public.analytics (platform);
create index if not exists analytics_campaign_idx       on public.analytics (campaign_id);
create index if not exists analytics_pillar_idx         on public.analytics (pillar_id);
create index if not exists analytics_post_lookup_idx    on public.analytics (platform, post_id);
create index if not exists planner_publish_date_idx     on public.planner (publish_date);
create index if not exists planner_status_idx           on public.planner (status);
create index if not exists ideas_status_idx             on public.ideas (status);
create index if not exists ideas_updated_on_idx         on public.ideas (updated_on desc);
create index if not exists ideas_pillar_idx             on public.ideas (pillar_id);
create index if not exists campaigns_range_idx          on public.campaigns (starts_on, ends_on);
create index if not exists campaigns_status_idx         on public.campaigns (status);

-- One follower reading per account per day; entering it again corrects it.
create unique index if not exists follower_snapshots_account_day_idx
  on public.follower_snapshots (account_id, captured_on);
create index if not exists follower_snapshots_captured_idx
  on public.follower_snapshots (captured_on desc);

-- --- 3. Touch updated_at on every write ------------------------------------

create or replace function public.baugment_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['accounts','pillars','campaigns','analytics','planner','ideas',
                           'media','follower_snapshots','custom_metrics','import_history','app_settings']
  loop
    execute format('drop trigger if exists baugment_touch_trg on public.%I', t);
    execute format(
      'create trigger baugment_touch_trg before insert or update on public.%I
       for each row execute function public.baugment_touch()', t);
  end loop;
end;
$$;

-- --- 4. Row Level Security -------------------------------------------------
-- THIS IS THE PART THAT MAKES THE PUBLIC ANON KEY SAFE. Do not skip it.
--
-- Policy: any signed-in user can read and write everything. That matches how
-- one shared social media desk works — a handful of trusted colleagues.
-- Anonymous visitors get nothing at all.
--
-- To go finer-grained later (per-user rows, read-only accounts), replace the
-- `using`/`with check` expressions below; nothing in the app needs to change.

do $$
declare t text;
begin
  foreach t in array array['accounts','pillars','campaigns','analytics','planner','ideas',
                           'media','follower_snapshots','custom_metrics','import_history','app_settings']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists baugment_read on public.%I', t);
    execute format('drop policy if exists baugment_write on public.%I', t);

    execute format(
      'create policy baugment_read on public.%I
       for select to authenticated using (true)', t);

    execute format(
      'create policy baugment_write on public.%I
       for all to authenticated using (true) with check (true)', t);
  end loop;
end;
$$;

-- Belt and braces: make sure the anonymous role has no table grants at all,
-- so a misconfigured policy can never leak through.
revoke all on all tables in schema public from anon;
grant usage on schema public to authenticated;
grant all on all tables in schema public to authenticated;

-- --- 5. Realtime -----------------------------------------------------------
-- Lets an edit on one machine appear on another without a refresh.

do $$
declare t text;
begin
  foreach t in array array['accounts','pillars','campaigns','analytics','planner','ideas',
                           'media','follower_snapshots','custom_metrics','import_history','app_settings']
  loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception
      when duplicate_object then null;   -- already published, nothing to do
      when undefined_object then null;   -- publication missing on this project
    end;
  end loop;
end;
$$;

-- Realtime respects RLS, so subscribers still have to be signed in.
alter table public.analytics          replica identity full;
alter table public.planner            replica identity full;
alter table public.ideas              replica identity full;
alter table public.pillars            replica identity full;
alter table public.campaigns          replica identity full;
alter table public.follower_snapshots replica identity full;

-- ===========================================================================
-- AFTER RUNNING THIS
--
-- 1. Create your accounts.
--    Authentication → Users → Add user. Use real email addresses and tick
--    "Auto Confirm User" so nobody waits on a verification email.
--
-- 2. Turn public signup OFF.
--    Authentication → Sign In / Providers → Email → disable "Allow new users
--    to sign up". Otherwise anyone who finds your public URL can make
--    themselves an account and read Baugment's numbers.
--
-- 3. Fill in assets/js/config.js with the Project URL and the publishable
--    key, then commit and push.
--
-- 4. Open BAUGMENT, sign in, and use
--    Settings → Connection → "Push this device's data up"
--    to send up anything you already created locally.
--
-- ---------------------------------------------------------------------------
-- ON MEDIA FILES
--
-- This schema stores media *records*, not media *bytes*. Uploaded images are
-- still session-only in the browser. To share actual files across devices,
-- create a Storage bucket named `baugment-media` and set storage_path per row
-- — the column is here and waiting, but the upload path isn't wired up yet.
-- Everything else in BAUGMENT syncs fully.
-- ===========================================================================
