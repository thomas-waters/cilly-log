# Cilly Log

A small web app for tracking a baby's sleep, milk feeds and solids. Built for
one-handed use at 2am: a big asleep/awake toggle, quick-pick chips for times
and amounts, and a combined daily log.

## Features

- **Sleep** – one-tap asleep/awake toggle, put-down and asleep times (time to
  settle), settling and waking notes, night vs nap split, nap-window guide
  based on age, 14-day trend charts.
- **Milk** – date, time, optional amount in ml, notes.
- **Solids** – date, time, foods (with suggestions from past meals), notes.
- **Home** – today at a glance for each section and a combined log of
  everything, newest first.

## Project layout

```
index.html            App shell, sign-in screen and markup
css/app.css           Styles (light and dark themes)
js/config.js          Public client config (Supabase URL and publishable key)
js/store.js           Storage adapters: local device store, Supabase store
js/app.js             App logic and rendering
supabase/schema.sql   Database tables, access rules and realtime setup
local/                Private data exports – gitignored, never committed
```

No build step. The app is plain HTML, CSS and JavaScript.

## Database setup (Supabase)

1. Create a Supabase project and put its URL and **publishable** key in
   `js/config.js`. Never put the secret key anywhere in this repo.
2. In the Supabase dashboard open **SQL Editor** and run `supabase/schema.sql`.
   It creates the tables, restricts access to emails listed in
   `allowed_users`, and turns on realtime so phones stay in sync.
3. Add each parent's sign-in email to `allowed_users` (lowercase):
   `insert into public.allowed_users (email) values ('name@example.com');`
4. In **Authentication → URL Configuration** set the Site URL to where the app
   is hosted and add every URL the app runs at to the redirect list, for
   example `http://127.0.0.1:8080` for local testing and
   `https://<user>.github.io/cilly-log/` for GitHub Pages.
5. To import an existing data export, run the generated `local/seed-*.sql` in
   the SQL editor.

Sign-in is by emailed magic link; no passwords are stored.

## Running locally

Serve the folder with any static server, for example:

```bash
python -m http.server 8080
```

then open <http://localhost:8080>. Opening `index.html` directly from disk also
works.

## Deploying

GitHub Actions (`.github/workflows/pages.yml`) publishes two copies of the app
to GitHub Pages on every push:

- `main` → https://thomas-waters.github.io/cilly-log/ — the live app, using
  the live database. A push to `main` is a release.
- `staging` → https://thomas-waters.github.io/cilly-log/staging/ — the test
  copy, using a separate staging database. Try changes here first, then merge
  `staging` into `main`.

`js/config.js` picks the database from the URL: only the exact live URL uses
the live project; `/staging/` and local testing use the staging project, so
experiments can never touch the real log.

## Data

Until the shared database is connected, data is stored in the browser's
local storage on each device. The `local/` folder holds private exports used
for migration and is excluded from git.
