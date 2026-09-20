/*
 * What sleep usually looks like at a given age.
 *
 * These are population ranges, not targets: healthy babies sit outside them
 * all the time. The app uses them to label things sensibly ("bedtime", not
 * "nap") and to show how a week compares — never to tell anyone what to do.
 *
 * Lengths are in minutes. `bedtime` is the exception: a pair of clock times
 * as minutes from midnight, so 1110 is 18:30. It is only used when the family
 * has asked the guide to follow the charts rather than their own night start
 * (the "Bedtime guide" setting); `null` means a settled bedtime does not mean
 * much at that age. Bands are [from, to) in whole months.
 *
 * Where the numbers come from, and which wins where they disagree:
 *   - Night sleep and naps: the HSE, Ireland's health service, which publishes
 *     figures per age - 10-11h a night and three naps at 6 months, 10-12h and
 *     two naps at 9 months and at a year, 11-12h and one nap from 18 months.
 *     This family is in Ireland and these are the figures their public health
 *     nurse works from, so where the HSE gives a number for an age, it is the
 *     one used here.
 *   - Total sleep per 24 hours: American Academy of Sleep Medicine consensus
 *     (Paruthi et al., J Clin Sleep Med 2016) - 12-16h at 4-12 months,
 *     11-14h at 1-2 years, 10-13h at 3-5 years. Under four months the AASM
 *     found the evidence too thin to recommend anything, so the HSE's 9-18h
 *     stands there instead.
 *   - Night wakings are normal at every age here: Galland et al. (2012),
 *     a systematic review of 34 observational studies.
 *   - Wake windows and bedtime ranges: the consistent middle of published
 *     parenting charts (Huckleberry, Little Ones, Baby Sleep Site), because no
 *     health service publishes them. They are convention, not guidance, and
 *     the sources list in the app says so.
 *   - NHS guidance was cross-checked throughout and agrees with the HSE.
 *
 * Every range below is wide enough to contain what all of these call usual.
 * That is deliberate: the app colours days against these, and a band narrower
 * than the published guidance would flag a baby the HSE would call ordinary.
 *
 * Wake windows are a DAYTIME tool: they describe the gap between naps and
 * before bed. They say nothing about a waking at 2am, which is why the app
 * never runs this clock at night.
 */
(function(){
  var BANDS = [
    {
      from: 0, to: 2, label: 'newborn',
      wake: { first: [30, 60], mid: [45, 75], last: [45, 90] },
      naps: [4, 6], daySleep: [300, 480], nightSleep: [480, 600], total: [540, 1080],
      bedtime: null,
      note: 'Sleep is spread around the clock at this age, so there is no real bedtime yet.'
    },
    {
      from: 2, to: 3, label: '2 months',
      wake: { first: [60, 90], mid: [60, 105], last: [75, 120] },
      naps: [4, 5], daySleep: [240, 360], nightSleep: [540, 660], total: [540, 1080],
      bedtime: [1200, 1320]
    },
    {
      from: 3, to: 4, label: '3 months',
      wake: { first: [75, 105], mid: [75, 120], last: [90, 135] },
      naps: [4, 5], daySleep: [180, 300], nightSleep: [600, 720], total: [720, 840],
      bedtime: [1170, 1260]
    },
    {
      from: 4, to: 6, label: '4-5 months',
      wake: { first: [90, 120], mid: [105, 150], last: [120, 165] },
      naps: [3, 4], daySleep: [180, 270], nightSleep: [600, 720], total: [720, 960],
      bedtime: [1110, 1170]
    },
    {
      from: 6, to: 7, label: '6 months',
      wake: { first: [120, 150], mid: [135, 180], last: [150, 195] },
      naps: [2, 3], daySleep: [150, 360], nightSleep: [600, 720], total: [720, 960],
      bedtime: [1110, 1170]
    },
    {
      from: 7, to: 9, label: '7-8 months',
      wake: { first: [150, 180], mid: [150, 195], last: [180, 225] },
      naps: [2, 3], daySleep: [120, 240], nightSleep: [600, 720], total: [720, 960],
      bedtime: [1110, 1170],
      note: 'Waking more often around now is common: crawling, pulling up and separation anxiety all land together.'
    },
    {
      from: 9, to: 11, label: '9-10 months',
      wake: { first: [150, 180], mid: [180, 210], last: [210, 240] },
      naps: [2, 2], daySleep: [120, 240], nightSleep: [600, 720], total: [720, 960],
      bedtime: [1110, 1170]
    },
    {
      from: 11, to: 13, label: '11-12 months',
      wake: { first: [180, 210], mid: [180, 240], last: [210, 270] },
      naps: [2, 2], daySleep: [120, 240], nightSleep: [600, 720], total: [660, 960],
      bedtime: [1110, 1170]
    },
    {
      from: 13, to: 18, label: '13-17 months',
      wake: { first: [180, 240], mid: [210, 270], last: [240, 300] },
      naps: [1, 2], daySleep: [90, 240], nightSleep: [600, 720], total: [660, 840],
      bedtime: [1110, 1200],
      note: 'The drop from two naps to one usually happens somewhere in here, and it is rarely tidy.'
    },
    {
      from: 18, to: 24, label: '18-23 months',
      wake: { first: [270, 330], mid: [300, 360], last: [300, 360] },
      naps: [1, 1], daySleep: [60, 150], nightSleep: [660, 720], total: [660, 840],
      bedtime: [1140, 1200]
    },
    {
      from: 24, to: 36, label: '2 years',
      wake: { first: [300, 360], mid: [300, 360], last: [300, 390] },
      naps: [0, 1], daySleep: [0, 120], nightSleep: [660, 720], total: [660, 840],
      bedtime: [1140, 1200]
    },
    {
      from: 36, to: 999, label: '3 years and up',
      wake: { first: [330, 390], mid: [360, 420], last: [360, 420] },
      naps: [0, 1], daySleep: [0, 90], nightSleep: [600, 780], total: [600, 780],
      bedtime: [1140, 1230]
    }
  ];

  function bandFor(months){
    if (months == null || isNaN(months)) return null;
    for (var i = 0; i < BANDS.length; i++){
      if (months >= BANDS[i].from && months < BANDS[i].to) return BANDS[i];
    }
    return BANDS[BANDS.length - 1];
  }

  // The gap before the next sleep, given where it falls in the day:
  // 'first' before the first nap, 'last' before bed, 'mid' in between.
  function wakeGap(band, position){
    if (!band) return null;
    return band.wake[position] || band.wake.mid;
  }

  // What the app shows behind the info button, so the figures can be checked
  // rather than taken on trust. Anything without a link is convention rather
  // than guidance, and says so.
  var SOURCES = [
    {
      name: 'HSE: a child’s sleep needs, 6 months to 2 years',
      what: 'Night sleep and naps at 6 and 9 months, a year, 18 months and 2 years. Ireland’s health service, and the figures a public health nurse works from — where the HSE gives a number for an age, this app uses it.',
      url: 'https://www2.hse.ie/babies-children/sleep/childs-sleep-needs-6-months-2-years/'
    },
    {
      name: 'HSE: a newborn’s sleep needs, 0 to 3 months',
      what: 'About 9 to 18 hours a day, averaging around 14.',
      url: 'https://www2.hse.ie/babies-children/sleep/newborns/'
    },
    {
      name: 'HSE: a baby’s sleep needs, 3 to 6 months',
      what: '12 to 14 hours across the day and night, with about 3 to 4 hours of it in naps.',
      url: 'https://www2.hse.ie/babies-children/sleep/babys-sleep-needs-3-6-months/'
    },
    {
      name: 'HSE: naps for babies and toddlers',
      what: 'How many naps at each age — down to two between 6 and 9 months, and to one between 12 and 15 months.',
      url: 'https://www2.hse.ie/babies-children/sleep/naps-babies-and-toddlers/'
    },
    {
      name: 'American Academy of Sleep Medicine consensus (Paruthi et al., 2016)',
      what: 'Total sleep in 24 hours: 12 to 16 hours at 4 to 12 months, 11 to 14 at 1 to 2 years, 10 to 13 at 3 to 5. Endorsed by the American Academy of Pediatrics. Under 4 months it found the evidence too thin to recommend anything.',
      url: 'https://jcsm.aasm.org/doi/10.5664/jcsm.5866'
    },
    {
      name: 'Galland et al. (2012), Sleep Medicine Reviews',
      what: 'A review of 34 observational studies. It is the reason this app treats night waking as ordinary at every age it covers. The summary is free to read; the full paper is behind a journal paywall.',
      url: 'https://doi.org/10.1016/j.smrv.2011.06.001'
    },
    {
      name: 'NHS: helping your baby to sleep',
      what: 'Cross-checked against for what to expect and for bedtime routines. It agrees with the HSE.',
      url: 'https://www.nhs.uk/baby/caring-for-a-newborn/helping-your-baby-to-sleep/'
    },
    {
      name: 'Published parenting charts',
      what: 'Wake windows and bedtime ranges only, taken from the consistent middle of Huckleberry, Little Ones and the Baby Sleep Site. No health service publishes these, so treat them as convention rather than guidance.',
      url: ''
    }
  ];

  window.CillySleepModel = {
    bands: BANDS,
    bandFor: bandFor,
    wakeGap: wakeGap,
    sourceList: SOURCES,
    sources: 'Night sleep and naps follow HSE guidance for each age, and the 24-hour totals the AASM consensus.'
  };
})();
