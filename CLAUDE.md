# Cilly Log — working notes for Claude

A baby tracker (sleep, milk, solids) used daily by two parents on their phones.
It holds real family records: treat the live data with care.

## What it is

- Plain HTML/CSS/JS, no build step. `index.html` is the shell, `css/app.css`
  the styles, `js/app.js` the app, `js/store.js` the storage adapters,
  `js/config.js` the public client config, `js/sleep-model.js` the by-age
  sleep ranges the guide is built on, and `js/docx.js` a small ZIP and
  WordprocessingML writer used by the consultant log.
- Data lives in Supabase (project `hopvsalkhtgrqbbkioqn`), schema in
  `supabase/schema.sql`. Access is row-level security: only emails in
  `allowed_users` can read or write. Sign-in is Google only; the emailed
  magic link is disabled in Supabase and hidden behind `emailSignIn` in
  `js/config.js`.
- `features` in `js/config.js` is per environment: `medicine` needs its table
  (`supabase/migrations/003_meds.sql`), so it stays off on an environment
  until that has been run there; `nightMode` needs nothing. Off means the
  tiles, pages and entries are not there at all — `applyFeatureFlags` hides
  them and `viewAllowed` keeps the page unreachable. Anything new that could
  be unwanted should go behind a flag the same way rather than being
  hard-wired in.
- A flag says whether a feature exists here; it does not say a person wants
  it. Night mode is both: the `nightMode` flag makes the Settings row exist,
  and the `nightMode` preference (off by default, one parent's own) decides
  whether the app actually dims — see `nightModeOn` in `js/app.js`. Anything
  that changes how the app looks or behaves without being asked for should
  default to off and be switchable in Settings the same way.
- State changes are expressed as ops (`upsert`, `delete`, `status`,
  `settings`, `prefs`) applied to an in-memory state and persisted through the
  store; see `applyOps` and `commit` in `js/app.js`. Keep new features on that
  model.
- **A failed save is not a lost one.** `persist` puts ops that the store
  refused into an outbox in `localStorage`, which `applyOutbox` re-applies over
  anything the database sends back so what was logged stays on screen, and
  `flushOutbox` drains in order on the next open, when the browser comes back
  online, when the tab is shown again, or after any other save succeeds. Ops
  are keyed by what they are about, so a later write of the same record or row
  replaces an earlier one instead of both being replayed. Never make a code
  path that writes straight to the store and skips this.
- **What was going on** — teething, a cold, a week away — lives in
  `state.markers`, one `app_state` row holding the lot, written by the
  `markers` op. It is a handful of entries a month, so it does not earn a
  table; if that changes, give it one. Each marker is a kind, a first and last
  date and a note, and it surfaces in three places: a dot on the calendar
  cell, a chip in the day, and an "All day" row in the consultant log, which
  is the context she asks about first.
- **Settings are shared, preferences are not.** `state.settings` is one
  `app_state` row both phones read, so anything about Cillian or about how the
  family logs belongs there. `state.prefs` is a row per person,
  `prefs:<their email>`, written by the `prefs` op — anything that is one
  parent's taste rather than a fact about the baby belongs there, and Settings
  shows the two in separate sections. Neither needs a migration: both are rows
  in the existing `app_state` table. Preferences are kept the moment they are
  tapped rather than on Save, since none of them is anyone else's to weigh up.
  `settleView` and `nightMode` were shared settings first; `personalChoice`
  falls back to the settings row where a person has never chosen, so those old
  keys are the value a phone inherits and should not be deleted. The
  appearance choice (`theme`: `system`, `light` or `dark`) sets `data-theme`
  on the root,
  and is cached in `localStorage` so the script at the top of `index.html` can
  paint the right palette before the database answers. That cache is also
  seeded into `state.prefs` at startup, or the first render would wipe it.
- Every page has the same shape: a card at the top opens a form in an overlay
  (`openOverlay` / `closeOverlay`), and saving shows a toast and closes it.
  Each overlay lives inside its own view, so only the current view's can be on
  screen. Anything new that records something should follow that, not put a
  form inline on the page.
- **The family is in Ireland, so the HSE comes first.** `js/sleep-model.js`
  takes night sleep and nap figures from the HSE's per-age pages, 24-hour
  totals from the AASM consensus (which the HSE does not state, and which does
  not cover under-4-months), and wake windows from parenting charts because no
  health service publishes them. Where sources disagree, the HSE wins for the
  ages it covers: those are the figures a public health nurse works from. Keep
  the bands wide enough to contain what the published guidance calls usual —
  narrowing them would flag a baby the HSE would call ordinary. Every source is
  listed with a link in `sourceList`, shown by the info buttons beside "Usual
  for his age" and the month grid, and anything without a link is convention
  rather than guidance and says so. Say "public health nurse", not "health
  visitor".
- Night sleep vs naps, the sleep guide and time-to-settle are all computed
  from settings stored in the database plus `js/sleep-model.js`, not
  hard-coded in the views. `isNight` decides it by where a sleep happened, not
  by the minute it began: inside the night window at its start, or most of its
  length inside it. Do not put that back to a start-time test — five minutes
  the wrong side of night start once turned 3h20 of night sleep into a nap,
  and fourteen places read that one function. The rule only ever adds night
  sleep, which is what keeps it safe. Wake windows in that model describe the day only:
  during night hours the app shows night sleep so far and says to settle
  them back, never a countdown. Keep it that way — a wake window is not a
  model of a 2am waking.
- Bedtime comes from the `bedtimeBasis` setting: `night` (the default) puts
  it half an hour either side of the night start, `age` uses the band's own
  range. Any new clock time the guide shows should come from one of those
  two, not from a constant.
- **Insights** (still `view-summary` and the `summary` view id in the code, so
  saved views and the print rules keep working) is three tabs: Overview, the
  figures and the age comparison for the chosen period; Calendar, the month
  grid; Share, the exports. Each tab holds only the control that governs it —
  a filter belongs beside what it filters, never above three blocks it does
  not touch. Everything renders whatever tab is open, so switching is instant
  and printing can unhide them all. Anything new goes in the tab whose job it
  shares, or it needs a tab of its own.
- **The shape of his days** (Overview, `renderDayBands`) is a row a day drawn
  against the clock. A row runs from one night end to the next — the same
  stretch `sleepDayKey` counts as a day — and sleep is drawn at the time it
  happened, so a night running past the morning boundary carries over to the
  left-hand end of the row below rather than being clipped. Keep it that way:
  the two edges meeting is what makes it readable as one continuous night.
- The Calendar tab's **Month at a glance** answers one question — did he get
  enough? —
  so only a shortfall is coloured: at or above the range is green, within an
  hour below is amber, further below is red (`monthDay` in `js/app.js`). The
  range comes from `js/sleep-model.js` for his age **on that day**, so older
  months are judged by the baby he was then. A day is not judged until its
  night has finished (`dayComplete`), and a day with nothing logged is a
  dotted cell, never red — the grid must never imply he slept badly when
  nobody wrote it down. Every cell prints its hours as well as its colour,
  because red and green look alike to plenty of people. Green is `--ok` /
  `--ok-soft`, defined in all four palettes; the grid is also the one thing
  that keeps its colours in print, where the rest of the page goes grey.

## Branches and deploys

- `main` is the live app: https://thomas-waters.github.io/cilly-log/ via
  GitHub Pages. Every push to `main` goes live within a minute — treat a push
  to `main` as a release.
- Every release adds an entry at the top of `js/changelog.js`, in the same
  change that ships it: bump the version, date it, and write what a parent
  will notice. Settings → Change log shows that list and the running build.
- Versions are semantic versioning 2.0.0. The public API the numbers describe
  is what a parent can do in the app plus the shape of the stored records:
  MAJOR when something they could do is taken away or changes meaning, or old
  builds can no longer read the data; MINOR when something is added and the
  rest still works; PATCH for fixes and for changes nobody can see. Taking
  away something that was already broken is a fix, not a major — that is why
  hiding the dead email sign-in link is 1.3.1. The header of
  `js/changelog.js` spells this out — keep the two in step.
- `staging` (when present) deploys to `…/cilly-log/staging/` and points at a
  separate Supabase project with throwaway data. Try features there first.
- Repo: `thomas-waters/cilly-log` (public). Never commit anything under
  `local/`, secrets, or personal data such as email addresses or notes.
- The `github-pages` environment allows deployments from `main` and
  `staging` only; a new branch needs adding to its branch policies before it
  can deploy.
- `sw.js` is the service worker. Bump `VERSION` in it whenever the precache
  list changes; other updates reach phones on the next open because HTML,
  CSS and JS are fetched network-first. Icons are generated by
  `python tools/make_icons.py`.
- All source files are UTF-8. Windows PowerShell's `Get-Content` and
  `Set-Content` default to the ANSI codepage, which turns middots, dashes and
  curly quotes into two or three Latin-1 letters (mojibake). Read and write
  with `[System.IO.File]::ReadAllText/WriteAllText` (UTF-8, no BOM), or use
  the Read/Edit/Write tools. `python tools/fix_encoding.py --check` reports
  any damage; without `--check` it repairs it. Note the checker treats such
  sequences as damage wherever it finds them, so don't paste examples of
  mojibake into the files it scans.

## Exports

There are three, all on the Share tab of Insights. The spreadsheet is one row
per event for a chosen period. Printing gives the whole of Insights — the
figures, the age comparison, the month grid and the day-by-day table —
whichever tab is open, because `@media print` unhides the other tab panels.
The **Consultant log** (`view-report`) writes the days out
instead: a two-column table, a line per event in order, in the shape a sleep
consultant asks for — what happened, what you did, how he was. Keep it to two
columns and one event per row: that is the shape the consultant keeps the log
in, and the page and the Word file are both built from `reportRows` so they
cannot drift apart. The settle and wake notes are what carry "what you did"
and "how he was", so a sleep logged without them comes out as bare times and
the page says how many of those there are. It can be printed, copied as HTML,
or saved as a .docx. Printing prints whichever view is open, not always
Insights.

## Checks

`python tools/check_leaks.py` fails on email addresses (other than the
`@example.com` placeholders), Supabase secret keys, service-role keys, JWTs,
GitHub tokens and private keys. `python tools/fix_encoding.py --check` fails on
double-encoded characters. Both run in CI before every deploy, so a push that
trips them never reaches the live site. Run them locally before committing.

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
