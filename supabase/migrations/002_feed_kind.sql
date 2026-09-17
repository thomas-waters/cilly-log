-- Tell breast feeds and bottle feeds apart.
-- Run once per database (staging and live), in the Supabase SQL editor.
-- Safe to run more than once.

alter table public.feeds add column if not exists kind text;

-- Existing rows: an amount meant a bottle, no amount meant a breast feed.
update public.feeds
   set kind = case when amount_ml is not null and amount_ml > 0 then 'bottle' else 'breast' end
 where kind is null;
