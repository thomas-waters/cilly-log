/*
 * What sleep usually looks like at a given age.
 *
 * These are population ranges, not targets: healthy babies sit outside them
 * all the time. The app uses them to label things sensibly ("bedtime", not
 * "nap") and to show how a week compares — never to tell anyone what to do.
 *
 * Every figure is in minutes, and clock times are minutes from midnight, so
 * 1110 is 18:30. Bands are [from, to) in whole months.
 *
 * Where the numbers come from:
 *   - Total sleep per 24 hours: American Academy of Sleep Medicine consensus
 *     (Paruthi et al., J Clin Sleep Med 2016) - 12-16h at 4-12 months,
 *     11-14h at 1-2 years, 10-13h at 3-5 years.
 *   - Night wakings are normal at every age here: Galland et al. (2012),
 *     a systematic review of 34 observational studies.
 *   - Wake windows, nap counts, day/night splits and bedtime ranges:
 *     the consistent middle of published parenting charts (Huckleberry,
 *     Little Ones, Baby Sleep Site) cross-checked against NHS guidance.
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
      naps: [4, 6], daySleep: [300, 480], nightSleep: [480, 600], total: [840, 1020],
      bedtime: null,
      note: 'Sleep is spread around the clock at this age, so there is no real bedtime yet.'
    },
    {
      from: 2, to: 3, label: '2 months',
      wake: { first: [60, 90], mid: [60, 105], last: [75, 120] },
      naps: [4, 5], daySleep: [240, 360], nightSleep: [540, 660], total: [870, 990],
      bedtime: [1200, 1320]
    },
    {
      from: 3, to: 4, label: '3 months',
      wake: { first: [75, 105], mid: [75, 120], last: [90, 135] },
      naps: [4, 5], daySleep: [240, 300], nightSleep: [600, 720], total: [870, 930],
      bedtime: [1170, 1260]
    },
    {
      from: 4, to: 6, label: '4-5 months',
      wake: { first: [90, 120], mid: [105, 150], last: [120, 165] },
      naps: [3, 4], daySleep: [180, 270], nightSleep: [600, 720], total: [840, 900],
      bedtime: [1110, 1170]
    },
    {
      from: 6, to: 7, label: '6 months',
      wake: { first: [120, 150], mid: [135, 180], last: [150, 195] },
      naps: [2, 3], daySleep: [150, 210], nightSleep: [660, 720], total: [810, 870],
      bedtime: [1110, 1170]
    },
    {
      from: 7, to: 9, label: '7-8 months',
      wake: { first: [150, 180], mid: [150, 195], last: [180, 225] },
      naps: [2, 3], daySleep: [120, 180], nightSleep: [660, 720], total: [810, 840],
      bedtime: [1110, 1170],
      note: 'Waking more often around now is common: crawling, pulling up and separation anxiety all land together.'
    },
    {
      from: 9, to: 11, label: '9-10 months',
      wake: { first: [150, 180], mid: [180, 210], last: [210, 240] },
      naps: [2, 2], daySleep: [120, 150], nightSleep: [660, 720], total: [780, 840],
      bedtime: [1110, 1170]
    },
    {
      from: 11, to: 13, label: '11-12 months',
      wake: { first: [180, 210], mid: [180, 240], last: [210, 270] },
      naps: [2, 2], daySleep: [120, 180], nightSleep: [660, 720], total: [780, 840],
      bedtime: [1110, 1170]
    },
    {
      from: 13, to: 18, label: '13-17 months',
      wake: { first: [180, 240], mid: [210, 270], last: [240, 300] },
      naps: [1, 2], daySleep: [90, 180], nightSleep: [660, 720], total: [750, 810],
      bedtime: [1110, 1200],
      note: 'The drop from two naps to one usually happens somewhere in here, and it is rarely tidy.'
    },
    {
      from: 18, to: 24, label: '18-23 months',
      wake: { first: [270, 330], mid: [300, 360], last: [300, 360] },
      naps: [1, 1], daySleep: [90, 150], nightSleep: [660, 720], total: [720, 780],
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

  window.CillySleepModel = {
    bands: BANDS,
    bandFor: bandFor,
    wakeGap: wakeGap,
    sources: 'Ranges follow the AASM consensus on sleep duration and NHS guidance, with nap and wake-window figures from published parenting charts.'
  };
})();
