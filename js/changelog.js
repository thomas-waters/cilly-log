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
    version: '1.15.0',
    date: '2026-09-19',
    title: 'Light or dark, your choice',
    notes: [
      'Settings is now in two parts: Shared, which both phones see, and Just for you, which is kept on your account and changes nothing on the other phone.',
      'Appearance: System, Light or Dark. System is what the app has always done — it follows whatever your phone is set to. Light and dark are both proper themes; this just lets you pick one and stay there.',
      'The choice takes effect as you tap it, and the app opens in it next time rather than flashing the other one first.',
      'Night mode still takes over between your night times, whichever you choose.'
    ]
  },
  {
    version: '1.14.0',
    date: '2026-09-19',
    title: 'A month at a glance',
    notes: [
      'Summary has a calendar of the month, each day green, amber or red: green if he got the sleep usual for his age, amber within an hour of it, red further below. A day with nothing logged is left empty rather than marked red, and today is not judged until the night has finished.',
      'Every day shows its hours as well as its colour, and under the grid is the month in a line: how many days were enough, how many were short, and the average.',
      'Colour by total sleep, night sleep or naps. A run of short nights is easier to see than to remember.',
      'Tap a day to see that day in full — night, naps, feeds, meals and every sleep with its notes — then open it in the log to change anything.',
      'Arrows or a swipe move between months, back as far as the first thing logged. Printing the Summary now includes the month.'
    ]
  },
  {
    version: '1.13.0',
    date: '2026-09-19',
    title: 'Night mode is now your choice',
    notes: [
      'Night mode has moved into Settings, and it starts off. Until you switch it on, the app looks the same at 3am as it does at noon.',
      'Switched on, it works as before: between your night times the screen dims and the Sleep page drops to the toggle and the card, with "Show the rest" to bring everything back.',
      'The choice is shared, like every other setting, so both phones follow it.'
    ]
  },
  {
    version: '1.12.1',
    date: '2026-09-19',
    title: 'Blank screen at night fixed',
    notes: [
      'Opening a sleep during night hours showed a dark, empty screen instead of the form. Tapping asleep did the same. The rule that strips the Sleep page back at night was also hiding the form itself.'
    ]
  },
  {
    version: '1.12.0',
    date: '2026-09-19',
    title: 'The consultant log as a Word file',
    notes: [
      'Save as Word writes a real .docx with the table in it, ready to attach to an email.',
      'The log is now strictly the two columns she asks for: every row is one event, the date and time on the left and what happened on the right. The per-day heading rows have gone; the day totals are still on the Summary page.'
    ]
  },
  {
    version: '1.11.0',
    date: '2026-09-19',
    title: 'A log for the sleep consultant',
    notes: [
      'Summary has a Consultant log: the last 3, 7 or 14 days written out as a table, a line per event in order, saying what happened and what the notes say about how he was.',
      'Print it, save it as a PDF, or copy it and paste it straight into the document with its columns intact.',
      'It says how many sleeps in the stretch have no settling or waking note, since those lines come out as times only.'
    ]
  },
  {
    version: '1.10.1',
    date: '2026-09-19',
    title: 'Doses in millilitres',
    notes: [
      'The dose on a medicine entry is a number of millilitres rather than free text, so "2.5" and "2.5ml" and "2.5 ML" cannot all mean the same thing. Anything already logged keeps its number.'
    ]
  },
  {
    version: '1.10.0',
    date: '2026-09-19',
    title: 'Medicine is on',
    notes: [
      'The Medicine page is now switched on here: doses, and when the next one may be given, shared between both phones.'
    ]
  },
  {
    version: '1.9.0',
    date: '2026-09-19',
    title: 'Medicine, longer trends, food history and a night mode',
    notes: [
      'Medicine: a page for what was given, with the next dose worked out from the gap you enter. It shows both of you the same times, so nobody gives a second dose too early. Switched on per environment once its table exists.',
      'Summary covers 1 week, 4 weeks or 12 weeks. Longer stretches show a row a week rather than a row a day, which is where a change of pattern shows up.',
      'Solids has a Foods so far list: every food, when it was last given and how many times, with a search box for "when did he last have egg?".',
      'Night mode: between your night times the app dims and the Sleep page drops to the toggle and the card. "Show the rest" brings everything back.'
    ]
  },
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
