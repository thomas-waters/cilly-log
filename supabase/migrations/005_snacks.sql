-- Snacks.
--
-- A snack is a solid with a different label on it, not a different kind of
-- record: same foods, same notes, same "when did he last have egg?" history.
-- Keeping them in one table is what lets the Foods so far list cover both,
-- and means nothing has to be moved if a snack turns out to have been a meal.
--
-- What the app does with it: snacks are their own section and are left out of
-- the daily meal count, everywhere a meal count appears.
--
-- Existing rows become meals, which is what they were.

alter table public.solids
  add column if not exists kind text not null default 'meal';

-- Old builds keep working: they write no kind at all and the default fills it
-- in. The `snacks` flag in js/config.js stays off on an environment until this
-- has been run there, so a snack cannot be saved as a meal in the meantime.
