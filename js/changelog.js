/*
 * What changed, in the order it reached the live app.
 *
 * Newest first. Every push to main is a release, so add an entry here in the
 * same change that ships it, written for whoever is reading it at 3am: what
 * they will notice, not what was refactored. Where a release changed nothing
 * they can see, say that plainly rather than dressing it up.
 *
 * Versions are semantic versioning 2.0.0 (https://semver.org). The spec asks
 * for a declared public API; nobody calls this app from code, so its public
 * API is what a parent can do in it and the shape of the records both phones
 * read:
 *
 *   MAJOR  something a parent could do stops working the way it did - a way
 *          in, a screen, a field or a figure is taken away or changes meaning
 *          - or older builds can no longer read the stored records.
 *   MINOR  something is added and everything already there still works.
 *   PATCH  a fix, or a change nobody using the app can see.
 *
 * There has been no major yet. The nearest thing was 1.3.1, where the emailed
 * sign-in link was hidden: it had stopped working — Supabase rate-limited it
 * — so taking it away fixed a dead end rather than removing something that
 * worked. Judge it that way next time too: a way out that was already broken
 * is a fix, a working one being removed is a major.
 */
window.CILLY_CHANGELOG = [
  {
    version: '1.8.2',
    date: '2026-09-19',
    title: 'Version numbers now mean something',
    notes: [
      'Versions follow semantic versioning: the first number changes when something you could do stops working the way it did, the second when something is added, the third for fixes.',
      'Every past release has been renumbered to match, so the numbers in this list have changed. Nothing about the app itself changed with this update.'
    ]
  },
  {
    version: '1.8.1',
    date: '2026-09-19',
    title: 'Staying where you were',
    notes: [
      'Opening a sleep, feed or meal from a log no longer throws the page behind it back to the top. Saving or cancelling leaves you where you were reading.'
    ]
  },
  {
    version: '1.8.0',
    date: '2026-09-19',
    title: 'Settling times',
    notes: [
      'A put-down time that cannot come before the sleep is now refused when you save, rather than quietly producing no settling time at all.',
      'A put-down more than three hours before they fell asleep asks whether that is right before saving it.',
      'A sleep already saved with times that do not fit says so on the entry, so it can be found and corrected.',
      'A sleep with no put-down time says "No put-down" rather than showing nothing, and the form says what a put-down time is for. It is still optional.',
      'Time to settle adds up all the settling in a day instead of averaging it. Settings can switch it back to the average per sleep.'
    ]
  },
  {
    version: '1.7.0',
    date: '2026-09-18',
    title: 'This change log',
    notes: [
      'Settings has a Change log button listing every update so far.'
    ]
  },
  {
    version: '1.6.0',
    date: '2026-09-18',
    title: 'What the age comparison rests on',
    notes: [
      '"Usual for his age" now says how many of the last 7 days it is based on.',
      'Each row shows its own day count, and below three days gives no verdict at all rather than one it cannot support.'
    ]
  },
  {
    version: '1.5.0',
    date: '2026-09-18',
    title: 'One way to log, and a check before deleting',
    notes: [
      'Milk and solids now open from a card at the top of the page, the same as sleep.',
      'Every form opens over the page instead of scrolling to it.',
      'Saving shows a short confirmation naming what was logged, then closes the form.',
      'Deleting asks first, and says what is about to go.'
    ]
  },
  {
    version: '1.4.0',
    date: '2026-09-18',
    title: 'The sleep guide learned about night',
    notes: [
      'Wake windows no longer run during night hours. A night waking shows night sleep so far and says to settle them back, rather than counting down to a sleep three hours away.',
      'After 45 minutes awake at night it shows what was logged that day, since a long waking usually starts with too much day sleep or a late last nap.',
      'Sleep ranges now come from a by-age model, with separate gaps before the first nap, between naps and before bed.',
      'Bedtime is aimed at your night start, or at the usual range for his age. New choice in Settings.',
      'Summary compares the week with the usual night, nap and total sleep for his age.'
    ]
  },
  {
    version: '1.3.2',
    date: '2026-09-18',
    title: 'Bedtime, not a nap',
    notes: [
      'A sleep window falling inside night hours is called bedtime rather than a nap, and a daytime window stops at night start.'
    ]
  },
  {
    version: '1.3.1',
    date: '2026-09-18',
    title: 'Google sign-in only',
    notes: [
      'The emailed sign-in link is hidden. Google is the only way in, which stopped the rate-limit errors.'
    ]
  },
  {
    version: '1.3.0',
    date: '2026-09-17',
    title: 'Sleep edits and bottle feeds',
    notes: [
      'Edit a sleep while it is still running, without ending it.',
      'A wake time earlier than the asleep time is now refused.',
      'Feeds are breast by default, with a Bottle feed tick box and an amount in ml or fl oz.',
      'Settings opens as a blurred overlay with a close button.',
      'The milk column in the day-by-day table counts feeds rather than adding millilitres.'
    ]
  },
  {
    version: '1.2.3',
    date: '2026-09-17',
    title: 'Behind the scenes',
    notes: [
      'Nothing to see. An automatic check now blocks any email address or key from reaching the public code.'
    ]
  },
  {
    version: '1.2.2',
    date: '2026-09-17',
    title: 'Fairer averages',
    notes: [
      'Day-by-day averages skip days with nothing logged, so a missed day no longer drags the average down.'
    ]
  },
  {
    version: '1.2.1',
    date: '2026-09-17',
    title: 'Blank Summary fixed',
    notes: [
      'An update could leave a phone running a new page with old code, which showed Summary as a blank screen. Each release now carries its own version.'
    ]
  },
  {
    version: '1.2.0',
    date: '2026-09-17',
    title: 'Summary and export',
    notes: [
      'Weekly summary, with each figure compared against the week before.',
      'Export to a spreadsheet, or print the page for the health visitor or GP.',
      'Every entry shows whether Mum or Dad logged it.'
    ]
  },
  {
    version: '1.1.1',
    date: '2026-09-17',
    title: 'Text fix',
    notes: [
      'Fixed the odd characters that were showing up in place of dashes and quotation marks.'
    ]
  },
  {
    version: '1.1.0',
    date: '2026-09-17',
    title: 'Sign in with Google',
    notes: [
      'Added Continue with Google, alongside the emailed link.'
    ]
  },
  {
    version: '1.0.0',
    date: '2026-09-17',
    title: 'First version',
    notes: [
      'Sleep, milk and solids in one app, shared between both phones.',
      'One tap for asleep and awake, with notes on how settling and waking went.',
      'Sleep trend and time-to-settle charts.',
      'Installs on the home screen and keeps working offline.'
    ]
  }
];
