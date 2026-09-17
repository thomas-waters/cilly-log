# Cilly Log — working notes for Claude

A baby tracker (sleep, milk, solids) used daily by two parents on their phones.
It holds real family records: treat the live data with care.

## What it is

- Plain HTML/CSS/JS, no build step. `index.html` is the shell, `css/app.css`
  the styles, `js/app.js` the app, `js/store.js` the storage adapters,
  `js/config.js` the public client config.
- Data lives in Supabase (project `hopvsalkhtgrqbbkioqn`), schema in
  `supabase/schema.sql`. Access is row-level security: only emails in
  `allowed_users` can read or write. Sign-in is an emailed magic link.
- State changes are expressed as ops (`upsert`, `delete`, `status`,
  `settings`) applied to an in-memory state and persisted through the store;
  see `applyOps` and `commit` in `js/app.js`. Keep new features on that model.
- Night sleep vs naps, the nap-window guide and time-to-settle are all
  computed from settings stored in the database, not hard-coded.

## Branches and deploys

- `main` is the live app: https://thomas-waters.github.io/cilly-log/ via
  GitHub Pages. Every push to `main` goes live within a minute — treat a push
  to `main` as a release.
- `staging` (when present) deploys to `…/cilly-log/staging/` and points at a
  separate Supabase project with throwaway data. Try features there first.
- Repo: `thomas-waters/cilly-log` (public). Never commit anything under
  `local/`, secrets, or personal data such as email addresses or notes.

## Rules

- Never drive the live app's UI (clicks or keystrokes) to read or change
  data. Use SQL in the Supabase editor, or ask Thomas. Confirm before any
  write to real data.
- The Supabase **secret** key must never appear in the repo, chat or config.
  Only the publishable key belongs in `js/config.js`.
- Ask before installing software or creating anything public.

## Machine notes

- Git and GitHub CLI are installed but not on this app's PATH. Call them as
  `C:\Program Files\Git\cmd\git.exe` and `C:\Program Files\GitHub CLI\gh.exe`,
  or prepend both directories to `$env:Path` first (gh needs git on PATH).
- The repo sits inside a Google Drive folder; if git reports lock or index
  errors, Drive sync is the first suspect.
- Local preview: `python -m http.server 8080 --bind 127.0.0.1` in the repo
  root, then open http://127.0.0.1:8080/ (`file://` won't work). Supabase
  Auth must list that URL in its redirect list for sign-in to work locally.
- Creating public repos or Pages sites from here is blocked by the app's
  permission layer; hand those commands to Thomas to run in the Terminal tab.

## Style

- Keep the code plain and dependency-free; the only external script is the
  Supabase client from jsDelivr.
- Tokens on `:root` define the palette; each section (`.view-sleep`,
  `.view-milk`, `.view-solids`) overrides `--accent`. Both light and dark
  themes must keep working.
- Copy is written for a tired parent: short, concrete, no jargon.
