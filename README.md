# BAUGMENT

**Content & Analytics Desk** — the internal social media planning and analytics application for **Baugment** (PT Baugment Teknologi Edukasi), Graha Mampang Lt.3, Jakarta Selatan. *Be and Augment.*

A web application. It runs in a browser and nowhere else — no Electron, no installer, no native shell.

---

## Run it

There is no build step, no `npm install`, no bundler.

**Simplest:** open `index.html` in a browser. Everything works except the Excel reader/writer, which pulls SheetJS from a CDN.

**Better, for local development:**

```bash
cd baugment
python3 -m http.server 3000
# or: npx serve -l 3000
```

Then open <http://localhost:3000>.

Serving over `http://localhost` or HTTPS also enables `crypto.subtle`, so passwords are hashed with SHA-256 instead of the weaker fallback used on `file://`.

**Deploying:** it's static. Drag the folder into Netlify, point Vercel or Cloudflare Pages at the repo, drop it in an S3 bucket, or copy it to any web root. No server runtime, no environment variables, no database to provision.

### Signing in

Local-only mode uses `admin` / `beandaugment`. Change it at **Settings → Account** before BAUGMENT goes on a shared machine.

Once a Supabase project is connected, that credential stops applying — sign in with the email and password set up for you under Authentication → Users.

The login page doesn't advertise which mode it's in beyond the field label (**Username** vs **Email**), since the page is publicly reachable.

---

## What's in the box

| Section | What it does |
|---|---|
| **Dashboard** | Twelve executive KPIs with period-on-period deltas, reach/engagement trend, platform comparison, pillar mix, a day × hour posting heatmap, posting frequency, and best/worst post. |
| **Analytics** | Every published post in a sortable, paginated table. Metric picker across every registered metric, four chart modes, a platform radar, and engagement rate by media type. **Add or edit posts by hand** — reach, impressions, reactions, saves and the rest typed straight from the platform's insights, with engagement rate and CTR computed live. |
| **Reports** | Weekly / monthly / quarterly / yearly. Step backwards and forwards through periods. Written summary, platform breakdown, pillar ranking, top ten, campaign attainment. Prints to PDF. |
| **Idea Bank** | Everything upstream of a scheduled post — rough ideas, brainstorm notes, half-drafts. Quick capture, a raw → developing → ready board, cards and table views, and a one-click **Send to planner**. See below. |
| **Content Calendar** | Month, week, day and list views. Drag any card onto another day to reschedule it. |
| **Content Planner** | Kanban by status plus a table view. Full brief per post: platform, media type, objective, audience, CTA, hashtags, keywords, thumbnail, owner, reviewer, priority. |
| **Content Pillars** | Twenty pillars with posts, reach, engagement, average performance, growth, and the best post in each. Target share vs actual share. |
| **Campaigns** | One KPI target per campaign, measured against the posts tagged to it. Attainment chart, objective mix, budget in rupiah. |
| **Media Library** | Grid with preview, search, tags, categories and kind filters. Drag files in to add them. Files are stored properly — see below. |
| **Import Data** | The Buffer-compatible importer. See below. |
| **Export Data** | CSV, Excel, JSON, PDF. Column picker, live preview, and separate exports for the idea bank, planner, campaigns, pillars and a full backup. |
| **Settings** | Password change, connection, theme, language, time zone, platform toggles, social accounts with follower history, custom metrics, demo-data controls, backup/restore/reset. |

Global search (**⌘K** / **Ctrl+K**) covers posts, planned content, ideas, campaigns, pillars, captions, hashtags and accounts.

---

## The Idea Bank

The rest of the app assumes you already know what you're making. The Idea Bank is for when you don't.

It has two jobs, in this order.

**Make writing an idea down cheaper than losing it.** One capture line sits at the top of the section: type a sentence, press Enter, and it's saved as a raw idea with no further decisions. No modal, no required fields, no platform to pick. You can add all of that later, or never.

**Give an idea somewhere to mature.** Each idea carries free-text notes — the angle, the hook, what the data would be, who it's for — plus tags, a source link, a pillar, a likely platform, a potential rating and where it came from (a sales call, a DM, a competitor, a webinar). It moves through four stages:

```
raw  →  developing  →  ready  →  used
                 parked
```

*Raw* is one line someone shouted across the room. *Developing* means somebody is working on the angle. *Ready* means it could be scheduled tomorrow. *Parked* is the honest place for a good idea that isn't for now — better than deleting it and better than letting it clog the board.

**Send to planner** is the only exit that matters. It opens the normal planned-post editor pre-filled from the idea — title, notes as the caption draft, pillar, campaign, owner, and priority derived from the potential rating — and once you save, the idea is marked *used* and keeps a link to the post it became. Nothing is moved or deleted, so the bank stays an honest record of what was thought of, not just what got made.

Three views: **Board** (drag between stages), **Cards** (a wall of them, sorted by recency, potential or title) and **Table** (everything at once, for a cull). The KPI strip counts what's ready to plan, what arrived this month, what's been promoted, and what's *going stale* — raw ideas nobody has touched in sixty days, which is the number that tells you whether the bank is a pipeline or a graveyard.

---

## Sharing data across devices (Supabase)

**If you skip this, BAUGMENT stores everything in the browser you're using and nowhere else.** That's why a pillar created on the office PC is missing on a laptop: they're two separate copies of the app with no link between them. Nothing was lost — it's still in the PC's browser — but there was never a channel for it to travel down.

Connecting a Supabase project gives every device one shared Postgres database, with edits appearing live.

### Setup, once

1. **Create a project** at [supabase.com](https://supabase.com). The free tier is more than enough.

2. **Run the schema.**

   Open the file `supabase/schema.sql` from this repo in a text editor (or on GitHub, click the file then the **Raw** button). Select **all of its contents** — starting with `-- BAUGMENT — Supabase schema` — and copy them.

   Then in Supabase: Dashboard → SQL Editor → New query → paste → **Run**.

   > Paste the file's *contents*, not its name. Typing `supabase/schema.sql` into the editor gives you
   > `ERROR: 42601: syntax error at or near "supabase"` — Postgres is trying to execute the filename.

   It creates eleven tables, indexes them, and turns on Row Level Security. Safe to run more than once.

   Then run **`supabase/media-storage.sql`** the same way. That one creates the private Storage bucket uploaded images and videos live in. Without it the app still works, but media stays on whichever device uploaded it.

3. **Create your accounts.** Authentication → Users → Add user. Real email addresses, and tick *Auto Confirm User* so nobody waits on a verification email.

4. **Turn public signup off.** Authentication → Sign In / Providers → Email → disable *Allow new users to sign up*. If your site is public, without this anyone who finds the URL can create an account and read Baugment's numbers.

5. **Fill in `assets/js/config.js`** and push. Two values:

   **Project URL** — Settings → **Data API**. It's also just your project id as a subdomain, and the id is on Settings → General:
   ```
   https://<project-id>.supabase.co
   ```

   **Key** — Settings → **API Keys**. Supabase is mid-rename here, so you'll see one of two things:

   | Tab | Key | Looks like | Use it? |
   |---|---|---|---|
   | API Keys | **Publishable key** | `sb_publishable_…` | ✅ prefer this |
   | Legacy API Keys | **anon** / public | `eyJhbGciOi…` | ✅ works, deprecated end of 2026 |
   | API Keys | Secret keys | `sb_secret_…` | ❌ never |
   | Legacy API Keys | service_role | `eyJhbGciOi…` | ❌ never |

   If the API Keys tab shows a **Create new API keys** button, your project is still on legacy keys only. Creating them is safe and additive — or just use the legacy anon key for now.

   Publishable and anon behave identically here: low privilege, RLS still applies. BAUGMENT accepts either, shows which one is in use on the Connection tab, and refuses a secret key outright.

   This file is committed on purpose. There's no server to hold environment variables, so the connection details have to travel with the code — otherwise the second device wouldn't know where the database is and you'd be back where you started.

   **It ships empty.** Until you fill it in, BAUGMENT runs happily in local-only mode.

6. **Open BAUGMENT on the machine that has work in it** and sign in.

   If Supabase is empty and this browser isn't, BAUGMENT stops and asks before doing anything: *push this device's data up*, or *start empty*. Choosing push makes your existing pillars, campaigns, ideas and posts the shared starting point. It also keeps a pre-sync snapshot either way, downloadable and restorable from **Settings → Connection**.

   You can also run it manually any time: **Settings → Connection → Push this device's data up**. It merges by id — matching records updated, new ones added, nothing in Supabase deleted.

7. **Open the second device.** Sign in with the same email. Everything is there.

### Is it safe to publish the key?

Yes — that's what a publishable/anon key is for. It identifies your project; it doesn't grant access. What grants access is Row Level Security, and the policies in `schema.sql` require a signed-in user for every read and every write. An anonymous visitor to your URL gets empty responses.

Two things to hold onto:

- **Never put a secret or `service_role` key in `config.js`.** They bypass RLS completely. On a public site that hands your database to anyone who opens DevTools. BAUGMENT detects both formats — including reading the `role` claim out of a legacy JWT — refuses them in the override form, and shows a red banner on the Connection tab if one ends up in `config.js`.
- **Run the RLS section of `schema.sql`.** Without it the key really would be an open door. **Settings → Connection → Run diagnostics** checks this specifically and shouts if it finds tables readable without a session.

### What changes once you're connected

| | Local only | Connected |
|---|---|---|
| Sign-in | `admin` / `beandaugment`, stored in the browser | Real Supabase Auth accounts, by email |
| Data lives | In one browser | In Postgres, shared |
| Colleague edits | Never visible | Appear live, no refresh |
| Topbar chip | *This device only* | *Synced*, *Syncing…*, *Offline*, or a queue count |

The local password gate stops applying once a project is configured — with a shared database, a client-side password would be theatre. Real accounts and RLS do the work instead.

### The first connection

Hydrating from Postgres replaces the local working set, which is correct every time except one: the very first connection, when Supabase is empty and the browser holds work nobody has pushed yet. A plain pull would replace real records with nothing.

BAUGMENT detects that case — remote empty, local work present — and asks rather than guessing. Dismissing the dialog defaults to keeping your data. A snapshot of the pre-sync state is stored regardless and stays available under **Settings → Connection** until you discard it.

Demo records don't count as work, so a device that has only ever shown the seed data connects silently.

### Losing connection

Edits apply to the screen immediately and queue for sending. If the wifi drops, the chip turns amber and the queue keeps its place; when you're back, it drains on its own, or you can force it with **Settings → Connection → Retry queued changes**. Repeated edits to the same record collapse to the last one, so a long offline stretch doesn't turn into a long replay.

### One thing that does *not* sync

- **Local password changes.** In connected mode, passwords are changed in Supabase Auth (the Account tab handles this) — the browser-stored one is no longer consulted.

---

## Where uploaded media actually lives

Media *records* — name, kind, size, tags, category — are rows in Postgres like everything else. Media *bytes* can't be: a base64 image inside a table row blows past the request size limit, and a handful of them would blow past the browser's 5 MB localStorage quota too. So the bytes get their own two-tier home.

**IndexedDB**, on each device. No practical size limit, survives a refresh, works with the wifi off. This is what a thumbnail reads first, so previews paint instantly and without a network round trip.

**Supabase Storage**, in a private bucket called `baugment-media`, created by `supabase/media-storage.sql`. This is what makes a file uploaded on the office PC appear on a laptop. The `media.storage_path` column is the pointer.

Resolution order for any thumbnail: local blob → signed URL from Storage (and quietly warm the local cache for next time) → nothing.

The bucket is **private**, not public. A public bucket would make every uploaded file readable by anyone who guessed the URL, which would defeat the Row Level Security in `schema.sql`. The app mints a short-lived signed URL per thumbnail instead. Limit is 25 MB per file, enforced in the browser and again by the bucket.

**"No file" cards.** Some records have no bytes anywhere, and the card says so rather than showing a placeholder that looks like a thumbnail:

- *Seeded demo items* never had a file — their tile is decorative by design, and they carry no marker.
- *Anything uploaded before the Storage bucket existed* lost its bytes on the first refresh, because they were only ever held in that browser session. Open the record and choose **Attach a file…** to give it the picture back; the record, its tags and its category are all kept.

---

## Buffer compatibility

This was the requirement that shaped the data model, so it's worth being specific about how it works.

Buffer's analytics export has moved between their Publish and Analyze products over the years, and the headers differ by network. BAUGMENT therefore does **not** match on one exact spelling per field. Each field carries a list of every header we've seen point at it, and matching is case- and punctuation-insensitive with an exact pass first, then a substring pass:

```
published_date  ← date · sent date · post date · published date · date sent · created at · …
platform        ← service · channel type · network · platform · social network · …
account         ← channel · profile · account · channel name · profile name · page · …
caption         ← text · post text · caption · content · message · post content · copy
link_clicks     ← clicks · link clicks · url clicks · website clicks · post clicks
reach           ← reach · post reach · accounts reached · unique reach · people reached
…
```

The full table is in the app: **Import Data → See recognised headers**.

**What it handles without you touching anything:**

- CSV (comma, semicolon, tab or pipe — the delimiter is sniffed), XLSX/XLS, and JSON
- UTF-8 BOMs, quoted fields, escaped quotes, and newlines inside quoted captions
- Dates as `2026-07-18`, `18/07/2026`, `18 Jul 2026`, or an Excel serial number
- Numbers with thousands separators (`18,400`) and trailing percent signs
- Network names as `Instagram`, `instagram`, `IG`, `Shorts`, `Twitter`, `X`, …
- Campaign names that don't exist yet — a campaign record is created for them
- Pillar names that don't exist — flagged as a warning, left unassigned rather than guessed

**What it does before writing anything:** shows the parsed preview, shows what each column mapped to, lets you change any mapping, and requires only two fields — a date and a platform. Rows missing either are skipped and listed.

**Duplicates** are identified by platform + post ID, falling back to platform + date + caption. You choose skip, replace, or add anyway. Re-importing a refreshed export with *replace* updates the metrics in place without growing the row count.

Every run is logged to import history with added / replaced / skipped / warning counts, and the warning list downloads as a CSV.

`Import Data → Template CSV` gives you a Buffer-shaped file with three example rows if you want to see the expected shape.

---

## Entering numbers by hand

Importing a Buffer export is the fast path, but not everything arrives that way — a Story that never made the export, a post from before you started, a figure you're reading off the phone.

**Analytics → Add post** opens a full editor: the post itself (platform, media type, caption, date, pillar, campaign), then its numbers, grouped the way a platform's own insights screen groups them. Only the metrics that platform actually reports are shown, so there's no Saves box on a LinkedIn post. Engagement rate, CTR, total engagements and net followers recalculate as you type, which makes a mistyped Reach obvious before you save.

**Account handle** is a dropdown, not a text box. It lists the accounts registered under Settings → Platforms → Connected accounts, filtered to the platform currently selected — choosing Instagram never offers a LinkedIn page. Add an account in Settings and it appears here immediately; switch platform and the list rebuilds. Where a platform has exactly one account it's preselected, because there is nothing to choose. An **Other…** option reveals a text box, so a handle that arrived in an import and was never registered survives being edited, and nobody is blocked when an account hasn't been set up yet.

Saving matches the chosen handle back to its account record, so `account_id` is right even when a platform has two accounts. The importer does the same: where a Buffer export names a channel it's matched against your registered accounts; where it doesn't and the platform has exactly one account, that's the only answer it can be; where it has two or more, the row is flagged in the import warnings rather than attributed to a guess.

Clicking any existing row opens the same editor, so imported posts can be corrected too.

## Follower counts and growth

Buffer's post export doesn't carry follower totals, so BAUGMENT keeps its own.

**Settings → Platforms → Connected accounts** is where Baugment's accounts live — add, edit or remove them, and record a follower reading whenever you check.

Each reading is stored **against its date**, not just overwritten. That gives a real history: the **Followers** button on each account shows a trend chart and every reading with its change, and the dashboard's 30-day and 7-day growth figures use those readings rather than inferring growth from per-post follower deltas. With no history yet, it falls back to the per-post estimate and says so under the number.

One reading per account per day — entering the same day twice corrects it rather than duplicating. Back-filling an older date is fine and won't overwrite today's current count.

## Custom metrics

The brief asked for new metrics to be addable without changing the core database. The metric registry in `assets/js/data.js` is the mechanism: metrics are data, not columns. Adding one at **Settings → Custom metrics** makes it available immediately in the import mapper, the analytics table, the chart picker, campaign KPI targets, and every export. Values live in a `custom` object on each record, so the stored shape never changes.

---

## Architecture

```
baugment/
├── index.html                  Login
├── app.html                    Application shell
├── supabase/
│   ├── schema.sql              Tables, indexes, RLS policies, realtime
│   └── media-storage.sql       Private Storage bucket + its access policies
└── assets/
    ├── css/baugment.css        Design tokens + every component
    ├── img/                    Brand mark, favicons, wordmark SVG
    └── js/
        ├── config.js           Supabase URL + anon key (committed on purpose)
        ├── remote.js           Sync layer: pull, push queue, realtime, diagnostics
        ├── media-files.js      Media bytes: IndexedDB cache + Supabase Storage
        ├── core.js             Utilities · storage · icons · toast/modal/skeleton
        ├── charts.js           SVG chart library (line, area, bar, donut,
        │                       heatmap, radar, sparkline, horizontal bars)
        ├── data.js             Schema · metric registry · Buffer dictionary · seed
        ├── store.js            State, filters, selectors, aggregation, writes
        ├── auth.js             Hashing, sessions, credential changes
        ├── app.js              Router, nav rail, topbar, filter bar, search
        ├── views-analytics.js  Dashboard · Analytics · Reports
        ├── views-content.js    Calendar · Planner · Pillars · Campaigns · Media
        ├── views-ideas.js      Idea Bank
        └── views-data.js       Parsers · exporter · Import · Export · Settings
```

**No dependencies.** The charts are hand-written SVG, the CSV parser is hand-written, the icons are inline. SheetJS is the single exception, fetched from a CDN only when someone actually touches an `.xlsx` file — and both the reader and the writer degrade to CSV with a clear message if it can't be reached. Everything else works offline. (The two brand webfonts also come from Google Fonts; without a connection the app falls back to the system sans and stays entirely usable.)

**Classic scripts, not ES modules.** Modules can't load from `file://` because of CORS, and the app should survive being double-clicked. Everything hangs off one `BAUGMENT` namespace.

**Every view registers itself** on `BAUGMENT.views` with `{ title, lede, filters, actions, wireActions, render }`. The router paints the header and filter bar, then hands the view a container. Adding a section is one object and one entry in the `NAV` array in `app.js` — which is exactly how the Idea Bank was added.

**One store.** Every number on screen comes from `BAUGMENT.store`, and every mutation goes back through it, so persistence and re-render stay in one place.

### Storage

Two modes, decided by whether `config.js` is filled in.

**Local only** — `localStorage`, with a transparent in-memory fallback. Where storage is blocked (private mode, a sandboxed iframe, some `file://` configurations) BAUGMENT still runs and warns once that changes are session-only.

**Connected** — Postgres is the source of truth. The in-memory store is still the working copy, so every view stays synchronous and none of them know sync exists; `remote.js` keeps the two in agreement. Boot pulls everything, mutations push in the background through a durable queue, and realtime patches the store when a colleague changes something. A repaint triggered by a remote change is held back while a modal is open, so the page never redraws under someone mid-edit.

Uploaded media bytes never go through `localStorage` — see *Where uploaded media actually lives* above. Seeded media items are drawn from their record rather than stored as images.

---

## Things worth knowing

**The local sign-in is access control, not security.** In local-only mode credentials live in the browser, so anyone with the device and DevTools can read the data. It stops someone wandering past the desk from browsing the numbers, nothing more. Connecting Supabase replaces it with real authentication and database-enforced policies — which is the right answer the moment the site is on a public URL.

**Multi-user works once connected.** Add colleagues under Authentication → Users in Supabase and they sign in with their own email. Every signed-in user currently sees and edits everything, which matches how one shared social media desk works; to go finer-grained, change the `using`/`with check` expressions in `schema.sql` — no app code needs to move.

**The demo data is generated, not real.** 500 analytics records, 100 planned posts, 44 ideas, 50 campaigns, 20 pillars and 20 media items across LinkedIn, Instagram, YouTube and TikTok, built from a fixed seed so it's identical on every machine. It follows patterns a B2B learning brand would actually see — midweek working hours outperform, weekends collapse, carousels and documents beat everything on LinkedIn, and roughly one post in thirty escapes the follower graph entirely. Follower counts are in the region of a mid-size Indonesian training provider.

---

## Getting rid of the demo data

While any seeded records remain, an amber **Demo data** chip sits in the topbar. Click it to land on **Settings → Data**, where three controls do different jobs:

**Remove demo data** — deletes only the generated records. Anything you imported or created is left alone, so the usual sequence works: import your real Buffer export first, confirm it looks right, then remove the demo set. You pick which collections to clear; content pillars are unticked by default, since your own posts may already be filed under them.

**Clear everything** — empties the collections you select, imported records included. A blank BAUGMENT.

**Reset to demo data** — throws away everything stored and rebuilds the full seeded set.

Seeded records are tagged `source: 'seed'` at generation, and recognised by id shape as a fallback, so the split between demo and real is exact rather than a guess. Every view has an empty state, so a cleared BAUGMENT reads as a fresh start rather than a broken one.

If you'd rather never see the demo set at all, delete the `build()` call fallback in `store.load()` — the app initialises an empty store just as happily.

**Roadmap hooks already in place.** Facebook, Threads, X and Pinterest are fully wired in the data model and hidden behind the platform toggles in Settings. The `language` setting is stored so Bahasa Indonesia becomes a string-table change rather than a refactor. Custom dashboard widgets, KPI goals, AI caption suggestions and activity logs all sit on top of the existing store without schema changes.

---

## Design

The interface follows the Baugment brand guidelines v1.0, and takes one idea from them: **the blueprint grid**. The identity is built on a measured 48px rule and a dot matrix over deep navy, and learning is modular — a programme is tiles on a grid, assembled in order. That geometry is the sign-in stage, the nav rail and the module strip, and nowhere else. Everything around it is deliberately flat and quiet so the grid is the only loud thing.

- **Logo** — typographic, exactly as the guidelines set it: Plus Jakarta Sans ExtraBold, *Baug* in the foreground colour and *ment* in Royal Blue. It's set as live text rather than shipped as an image, so it stays crisp at any size and recolours correctly in both themes from one definition. `assets/img/baugment-wordmark.svg` is the same lockup as a file. The rounded-blue **B** in the 38px rail slot and the favicons are a square reduction — a placeholder until the official emblem lands, since the guidelines don't specify one. Swap `assets/img/favicon-*.png` and the `.brandmark` rule in the CSS and nothing else moves.
- **Palette** — Royal Blue `#1B4FD8` (lightened to `#3B6FFF` on dark, where the primary is too low-contrast against navy), the neutral ramp from `#0F172A` to `#F1F5F9`, and the guideline accent set — Sky `#38BDF8`, Indigo `#6366F1`, Emerald `#10B981`, Amber `#F59E0B` — as the categorical chart palette. Rose is reserved: it means *decline* everywhere in the app, so it never doubles as a neutral category colour.
- **Type** — Plus Jakarta Sans for display, headings and the wide-caps labels the guidelines specify; Inter for interface and body copy. No third typeface is introduced. Where digits need to align — IDs, timestamps, deltas — a **system** monospace stack is used rather than adding an unapproved font, and big KPI numbers use tabular figures so columns of digits line up when you scan them.
- **Dark by default**, light mode fully supported and switchable in the topbar or Settings. Both were checked against the guidelines' WCAG AA requirement.
- Responsive to mobile, keyboard focus visible throughout, `prefers-reduced-motion` respected, and a print stylesheet so reports come out clean.

---

*PT Baugment Teknologi Edukasi · Graha Mampang Lt.3, Jakarta Selatan, DKI Jakarta · training@baugment.com · baugment.com*
