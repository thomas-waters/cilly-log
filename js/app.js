(function(){
  var ICON = {
    pencil: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 20h4L18.5 9.5a2 2 0 0 0 0-2.8l-1.2-1.2a2 2 0 0 0-2.8 0L4 15.5V20Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
    moon: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" fill="currentColor"/></svg>',
    bottle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><path d="M10 2.5h4v2.5h-4z"/><path d="M9 5h6l1.5 3h-9z"/><path d="M8 8h8v10.5A2.5 2.5 0 0 1 13.5 21h-3A2.5 2.5 0 0 1 8 18.5z"/><path d="M8 12h8M8 15.5h8"/></svg>',
    bowl: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><path d="M3 11h18a9 9 0 0 1-18 0z"/><path d="M8 11c0-3 1.6-5 4-5s4 2 4 5"/><path d="M6 20h12"/></svg>'
  };
  ICON.pill = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><rect x="2.5" y="8.5" width="19" height="7" rx="3.5"/><path d="M12 8.5v7"/></svg>';
  var TYPE_ICON = { sleep: ICON.moon, milk: ICON.bottle, solids: ICON.bowl, meds: ICON.pill };

  // Features that can be switched off in js/config.js. Off means the pages,
  // tiles and entries for that feature are simply not there.
  var FEATURES = Object.assign(
    { medicine: false, nightMode: false },
    (window.CILLY_CONFIG || {}).features || {}
  );
  function applyFeatureFlags(){
    Array.prototype.forEach.call(document.querySelectorAll('.feature-medicine'), function(node){
      node.hidden = !FEATURES.medicine;
    });
    Array.prototype.forEach.call(document.querySelectorAll('.feature-night'), function(node){
      node.hidden = !FEATURES.nightMode;
    });
  }
  var VIEWS = ['home', 'sleep', 'milk', 'solids', 'meds', 'summary', 'report'];
  var DRAFT_KEY = 'cilly.draft', VIEW_KEY = 'cilly.view';
  var DRAFT_MAX_AGE = 30 * 60000;
  var FORM_FIELDS = {
    'entry-form': ['entry-id', 'f-date', 'f-putdown', 'f-start', 'f-end', 'f-settle', 'f-wake'],
    'milk-form': ['m-id', 'm-date', 'm-time', 'm-amount', 'm-notes'],
    'solid-form': ['s-id', 's-date', 's-time', 's-food', 's-notes'],
    'med-form': ['md-id', 'md-date', 'md-time', 'md-name', 'md-dose', 'md-notes']
  };

  var store = null;
  var state = window.CillyStore.emptyState();
  var tickInt = null;
  var readOnly = false;
  var toastTimer = null;

  // ---------- session storage (survives the reload that follows every save) ----------
  function ssGet(key){ try { var v = window.sessionStorage.getItem(key); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
  function ssSet(key, value){ try { window.sessionStorage.setItem(key, JSON.stringify(value)); } catch (e) {} }
  function ssDel(key){ try { window.sessionStorage.removeItem(key); } catch (e) {} }
  var bootDraft = ssGet(DRAFT_KEY);

  // ---------- helpers ----------
  function el(id){ return document.getElementById(id); }
  function pad(n){ return String(n).padStart(2, '0'); }
  function uid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function timeValue(d){ return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function dateKey(d){ return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function atDate(x){ return new Date(x.date + 'T' + x.time + ':00'); }
  function wait(ms){ return new Promise(function(r){ setTimeout(r, ms); }); }

  function fmtTime(d){
    var h = d.getHours(), m = d.getMinutes();
    var ap = h >= 12 ? 'PM' : 'AM';
    h = h % 12; if (h === 0) h = 12;
    return h + ':' + pad(m) + ' ' + ap;
  }

  function fmtDur(ms){
    var totalMin = Math.max(0, Math.round(ms / 60000));
    var h = Math.floor(totalMin / 60), m = totalMin % 60;
    if (h <= 0) return m + 'm';
    return h + 'h ' + m + 'm';
  }

  function plural(n, word){ return n + ' ' + word + (n === 1 ? '' : 's'); }

  function friendlyDate(key){
    var today = new Date(), todayKey = dateKey(today);
    var y = new Date(today); y.setDate(y.getDate() - 1);
    if (key === todayKey) return 'Today';
    if (key === dateKey(y)) return 'Yesterday';
    var parts = key.split('-').map(Number);
    var d = new Date(parts[0], parts[1] - 1, parts[2]);
    return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  }

  function entryStart(e){ return new Date(e.date + 'T' + e.start + ':00'); }
  function entryEnd(e){
    var start = entryStart(e);
    var end = new Date(e.date + 'T' + e.end + ':00');
    if (end <= start) end = new Date(end.getTime() + 24 * 3600000);
    return end;
  }

  // A time typed as "11:50 PM" just after midnight belongs to yesterday, not tonight.
  function timeToDateNear(timeStr, reference){
    var parts = String(timeStr).split(':');
    var d = new Date(reference.getTime());
    d.setHours(Number(parts[0]) || 0, Number(parts[1]) || 0, 0, 0);
    if (d.getTime() > reference.getTime() + 60000) d.setDate(d.getDate() - 1);
    return d;
  }

  function minutesOf(t){ var p = String(t || '').split(':'); return (Number(p[0]) || 0) * 60 + (Number(p[1]) || 0); }
  function fmtClock(minutes){ var d = new Date(); d.setHours(0, minutes, 0, 0); return fmtTime(d); }
  function nightBounds(){
    var s = state.settings || {};
    return { start: minutesOf(s.nightStart || '19:00'), end: minutesOf(s.nightEnd || '06:00') };
  }
  function startsInNight(m, b){
    return b.start > b.end ? (m >= b.start || m < b.end) : (m >= b.start && m < b.end);
  }
  // How much of a sleep landed inside the night window. The window usually
  // wraps midnight, which makes it two stretches on the same timeline: the one
  // that began this evening and the one that ended this morning.
  function nightOverlap(e){
    var b = nightBounds();
    var start = minutesOf(e.start), end = minutesOf(e.end);
    if (end <= start) end += 1440;
    function inside(from, to){ return Math.max(0, Math.min(end, to) - Math.max(start, from)); }
    return b.start > b.end
      ? inside(b.start - 1440, b.end) + inside(b.start, b.end + 1440)
      : inside(b.start, b.end) + inside(b.start + 1440, b.end + 1440);
  }
  // Night sleep is decided by where the sleep happened, not by the minute it
  // began. Starting inside the window is night sleep as it always was, which
  // keeps an early-morning resettle with the night before. Starting outside it
  // counts too when most of the sleep fell inside: he went down at 17:55 one
  // evening with night starting at 18:00, and calling all 3h20 of it a nap put
  // it in the nap totals, left that night looking empty, and had the 3am hint
  // blaming day sleep for a waking that came out of the night itself.
  //
  // The rule only ever adds night sleep, never takes it away, so nothing that
  // was counted correctly before changes. A late nap that merely runs into the
  // evening - 4pm to 7pm, an hour of it past night start - is still a nap.
  function isNight(e){
    var b = nightBounds(), start = minutesOf(e.start);
    if (startsInNight(start, b)) return true;
    var end = minutesOf(e.end);
    if (end <= start) end += 1440;
    var length = end - start;
    return length > 0 && nightOverlap(e) * 2 > length;
  }
  // Would a sleep starting at this moment count as night sleep? Used for the
  // clock rather than a record, so it can only ask about the start.
  function clockIsNight(d){
    return startsInNight(d.getHours() * 60 + d.getMinutes(), nightBounds());
  }
  // The next time night sleep begins, at or after the given moment. Built from
  // calendar parts rather than by adding 24 hours, so clock changes don't shift it.
  function nextNightStart(from){
    var b = nightBounds();
    var d = new Date(from.getFullYear(), from.getMonth(), from.getDate(), 0, b.start, 0, 0);
    if (d <= from) d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + 1, 0, b.start, 0, 0);
    return d;
  }
  // The evening a night sleep belongs to: an early-morning resettle counts toward the night before.
  function nightKey(e){
    var b = nightBounds();
    if (b.start > b.end && minutesOf(e.start) < b.end){
      var d = new Date(e.date + 'T12:00:00'); d.setDate(d.getDate() - 1); return dateKey(d);
    }
    return e.date;
  }
  // Minutes from being put down to falling asleep, wrapping over midnight so
  // "down at 23:50, asleep at 00:10" reads as 20 minutes.
  function settleGap(putDown, start){
    var d = minutesOf(start) - minutesOf(putDown);
    if (d < 0) d += 1440;
    return d;
  }
  // Over twelve hours apart the pair cannot be a settle: on a 24 hour clock
  // that is nearer to the put-down being after the sleep than before it, and
  // an hour typed as 09:15 instead of 21:15 lands exactly here. The form
  // refuses to save one, and anything already saved says so on the entry.
  var SETTLE_MAX = 720;
  // Beyond three hours the form asks whether it is really right.
  var SETTLE_CONFIRM = 180;
  // From here up it reads as a put-down after the sleep rather than a long one.
  var SETTLE_INVERTED = 1080;

  function settleMinutes(e){
    if (!e.putDown) return null;
    var d = settleGap(e.putDown, e.start);
    return d >= SETTLE_MAX ? null : d;
  }
  function ageMonths(dobStr, at){
    var dob = new Date(dobStr + 'T00:00:00');
    if (isNaN(dob.getTime())) return null;
    var months = (at.getFullYear() - dob.getFullYear()) * 12 + (at.getMonth() - dob.getMonth());
    if (at.getDate() < dob.getDate()) months--;
    return Math.max(0, months);
  }
  // Age ranges live in js/sleep-model.js, with their sources.
  var MODEL = window.CillySleepModel;
  function currentAge(){
    var s = state.settings || {};
    if (!s.dob || !MODEL) return null;
    var months = ageMonths(s.dob, new Date());
    if (months === null) return null;
    var band = MODEL.bandFor(months);
    return band ? { months: months, band: band } : null;
  }
  function lastWakeDate(){
    if (state.status.asleep || !state.entries.length) return null;
    var latest = null;
    state.entries.forEach(function(e){ var end = entryEnd(e); if (!latest || end > latest) latest = end; });
    return latest;
  }

  // Naps on a given day, and when the last one ended.
  function napsOn(key){
    var ms = 0, count = 0, lastEnd = null;
    state.entries.forEach(function(e){
      if (isNight(e) || e.date !== key) return;
      var end = entryEnd(e);
      ms += end - entryStart(e);
      count++;
      if (!lastEnd || end > lastEnd) lastEnd = end;
    });
    return { ms: ms, count: count, lastEnd: lastEnd };
  }
  function napsToday(){ return napsOn(dateKey(new Date())); }

  // The night in progress: after night start that is tonight, and in the small
  // hours it still belongs to yesterday evening.
  function currentNightKey(){
    var now = new Date(), b = nightBounds();
    var m = now.getHours() * 60 + now.getMinutes();
    if (b.start > b.end && m < b.end){
      var d = new Date(now); d.setDate(d.getDate() - 1); return dateKey(d);
    }
    return dateKey(now);
  }
  function nightSoFar(){
    var key = currentNightKey(), ms = 0, sleeps = 0, start = null;
    state.entries.forEach(function(e){
      if (!isNight(e) || nightKey(e) !== key) return;
      ms += entryEnd(e) - entryStart(e);
      sleeps++;
      var s = entryStart(e);
      if (!start || s < start) start = s;
    });
    return { key: key, ms: ms, sleeps: sleeps, start: start, wakings: Math.max(0, sleeps - 1) };
  }

  function clockAt(minutes, reference){
    var d = reference ? new Date(reference.getTime()) : new Date();
    d.setHours(0, minutes, 0, 0);
    return d;
  }
  function fmtRange(fromMin, toMin){ return fmtClock(fromMin) + ' – ' + fmtClock(toMin); }

  // Where bedtime comes from, chosen in Settings:
  //   'night' (the default) - the night start, give or take half an hour, so
  //     the guide follows whatever this family calls the start of night.
  //   'age'   - the published range for the age band, which can sit somewhere
  //     else entirely if the night times are set for tidy stats rather than
  //     as a bedtime.
  // Either way it returns null when a settled bedtime means little at this
  // age, and then the wake window is left to stand on its own.
  var BEDTIME_SPREAD = 30;
  function bedtimeBasis(){
    return (state.settings || {}).bedtimeBasis === 'age' ? 'age' : 'night';
  }
  function bedtimeRange(band){
    if (band && !band.bedtime) return null;
    if (bedtimeBasis() === 'age') return band ? band.bedtime.slice() : null;
    var b = nightBounds();
    return [b.start - BEDTIME_SPREAD, b.start + BEDTIME_SPREAD];
  }
  function bedtimeSource(){
    return bedtimeBasis() === 'age' ? 'typical for this age' : 'around the night start in Settings';
  }
  // Whether the settle chart adds a day's settling up or averages it.
  // Both of these were shared settings before they were personal ones. Where
  // someone has never chosen, the old shared value still stands in, so moving
  // them changed nobody's app on the day it shipped. Leave those old keys in
  // the settings row: they are what a new phone inherits.
  function personalChoice(name){
    var mine = (state.prefs || {})[name];
    return mine === undefined ? (state.settings || {})[name] : mine;
  }
  function settleView(){
    return personalChoice('settleView') === 'average' ? 'average' : 'total';
  }
  // Night mode is asked for, not assumed: an app that dims and hides most of a
  // page on its own is a surprise at 3am, and it only suits some people. It is
  // one person's choice too - one parent can have it while the other does not.
  function nightModeSetting(){ return personalChoice('nightMode') === true; }
  function nightModeOn(){ return FEATURES.nightMode && nightModeSetting(); }

  var POSITION_WORDS = { first: 'before the first nap', mid: 'between naps', last: 'before bed' };

  // When the next sleep is likely due, and what to call it.
  //
  // Wake windows describe the day only, so during night hours this returns
  // kind 'night' and no times at all: a baby who wakes at 2am should go back
  // down, not wait out a three-hour window.
  //
  // For the last sleep of the day the bedtime range leads and the wake window
  // adjusts it, rather than the other way round. Adding a wake window to a
  // late nap is what used to push bedtime past eight o'clock.
  function sleepWindow(){
    var last = lastWakeDate(), age = currentAge();
    if (!last || !age) return null;
    var now = new Date(), band = age.band;
    if (clockIsNight(now)) return { kind: 'night', months: age.months, band: band };

    var naps = napsToday();
    var expected = band.naps[1];
    var position = naps.count === 0 ? 'first' : (naps.count >= expected ? 'last' : 'mid');
    var gap = MODEL.wakeGap(band, position);
    var readyOpen = new Date(last.getTime() + gap[0] * 60000);
    var readyClose = new Date(last.getTime() + gap[1] * 60000);
    var open = readyOpen, close = readyClose;
    var nightAt = nextNightStart(now);
    var kind = 'nap', trimmedAt = null, shift = '', bedRange = null;

    // The next sleep is the night if no naps are left, or if the window lands
    // in night hours, or if it leaves too little of the day to be worth a nap.
    if (position === 'last' || readyOpen >= nightAt || nightAt - readyOpen < 20 * 60000){
      kind = 'bed';
      bedRange = bedtimeRange(band);
      if (bedRange){
        var from = clockAt(bedRange[0], now), to = clockAt(bedRange[1], now);
        if (readyOpen <= to && readyClose >= from){
          open = new Date(Math.max(readyOpen.getTime(), from.getTime()));
          close = new Date(Math.min(readyClose.getTime(), to.getTime()));
        } else if (readyOpen > to){
          shift = 'late'; open = to; close = readyOpen;
        } else {
          shift = 'early'; open = readyOpen; close = from;
        }
      }
    } else if (readyClose > nightAt){
      close = nightAt; trimmedAt = nightAt;
    }

    return {
      open: open, close: close, kind: kind, months: age.months, band: band,
      position: position, gap: gap, naps: naps, trimmedAt: trimmedAt,
      shift: shift, bedRange: bedRange,
      label: kind === 'bed' ? 'Bedtime window' : 'Usual nap window',
      shortLabel: kind === 'bed' ? 'bedtime' : 'nap window'
    };
  }
  function personName(record){
    var email = record && record.createdBy ? String(record.createdBy).toLowerCase() : '';
    return email ? ((state.people || {})[email] || '') : '';
  }
  function personChip(record){
    var name = personName(record);
    return name ? '<span class="who-chip">' + escapeHtml(name) + '</span>' : '';
  }

  function sleepMetaHtml(e){
    var bits = [];
    if (isNight(e)) bits.push('<span class="meta-tag">Night</span>');
    var s = settleMinutes(e);
    if (s !== null) bits.push('<span>' + (s === 0 ? 'Asleep on put-down' : 'Settled in ' + s + 'm') + '</span>');
    // A put-down that cannot produce a settling time used to show nothing at
    // all, which read as "no put-down was logged". Say which it is.
    else if (e.putDown){
      var gap = settleGap(e.putDown, e.start);
      bits.push('<span class="meta-warn">Put down at ' + fmtClock(minutesOf(e.putDown)) +
        (gap >= SETTLE_INVERTED ? ', after the asleep time' : ', ' + fmtDur(gap * 60000) + ' before') + '</span>');
    }
    // Saying so is the difference between "nothing to show" and "nobody wrote
    // it down". The entry is still perfectly valid without one.
    else bits.push('<span class="meta-quiet">No put-down</span>');
    var who = personChip(e);
    if (who) bits.push(who);
    return bits.length ? '<span class="entry-meta">' + bits.join('') + '</span>' : '';
  }

  function metaHtml(record){
    var who = personChip(record);
    return who ? '<span class="entry-meta">' + who + '</span>' : '';
  }

  function escapeHtml(s){
    return String(s).replace(/[&<>"']/g, function(c){
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function noteLines(e){
    var out = '';
    if (e.settleNotes) out += '<span class="entry-notes"><span class="note-tag">Down</span>' + escapeHtml(e.settleNotes) + '</span>';
    if (e.wakeNotes) out += '<span class="entry-notes"><span class="note-tag">Up</span>' + escapeHtml(e.wakeNotes) + '</span>';
    if (e.notes) out += '<span class="entry-notes">' + escapeHtml(e.notes) + '</span>';
    return out;
  }

  function showError(id, message, focusId){
    var errEl = el(id);
    errEl.textContent = message;
    errEl.hidden = false;
    if (focusId) el(focusId).focus();
  }
  function hideError(id){
    var errEl = el(id);
    errEl.hidden = true;
    errEl.textContent = '';
  }

  function showToast(text){
    var t = el('toast');
    t.textContent = text;
    t.hidden = false;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function(){ t.hidden = true; }, 6000);
  }

  function showNotice(text){
    var n = el('app-notice');
    n.textContent = text;
    n.hidden = false;
  }

  // ---------- overlays ----------
  // Every form opens over the page rather than further down it, so the shape
  // is the same wherever you are: tap the card at the top, fill it in, done.
  // Each one lives inside its own view, so only the current view's can show.
  // The confirm is first: it opens over the others, so Escape should reach it
  // before the form underneath.
  var OVERLAYS = ['confirm-overlay', 'changelog-overlay', 'settings-overlay', 'marker-overlay', 'day-overlay', 'entry-overlay', 'milk-overlay', 'solid-overlay', 'med-overlay'];
  function openOverlay(id){
    el(id).hidden = false;
  }
  function closeOverlay(id){
    el(id).hidden = true;
  }
  // Which overlay is actually on screen. An overlay belonging to another view
  // can still be open behind the scenes, and neither `hidden` nor the computed
  // display gives it away: a fixed element reports offsetParent null, and
  // getComputedStyle returns its own display even inside a hidden view. Client
  // rectangles are the test that accounts for the hidden ancestor.
  function openOverlayId(){
    for (var i = 0; i < OVERLAYS.length; i++){
      var node = el(OVERLAYS[i]);
      if (node && !node.hidden && node.getClientRects().length) return OVERLAYS[i];
    }
    return null;
  }

  // ---------- "are you sure?" ----------
  // Nothing is deleted on one tap. The question names what is about to go, so
  // it can be answered at 3am without opening anything else.
  var pendingConfirm = null;
  function askConfirm(opts){
    pendingConfirm = opts.onConfirm;
    el('confirm-title').textContent = opts.title;
    el('confirm-text').textContent = opts.text;
    el('confirm-yes').textContent = opts.confirmLabel || 'Delete';
    el('confirm-no').textContent = opts.keepLabel || 'Keep it';
    // Red is for the ones that throw something away. A "yes, that is right"
    // should not look like a delete.
    el('confirm-yes').className = 'btn ' + (opts.tone === 'primary' ? 'primary' : 'danger');
    openOverlay('confirm-overlay');
    el('confirm-no').focus();
  }
  function closeConfirm(){
    closeOverlay('confirm-overlay');
    pendingConfirm = null;
  }

  // A put-down has to come before the sleep it belongs to. Anything that
  // cannot is refused outright; anything unusually long is queried rather than
  // refused, because a genuinely hard night does happen.
  function guardPutDown(putDown, start, proceed){
    if (!putDown || !start){ proceed(); return; }
    var gap = settleGap(putDown, start);
    var downAt = fmtClock(minutesOf(putDown)), asleepAt = fmtClock(minutesOf(start));
    if (gap >= SETTLE_MAX){
      showError('form-error', gap >= SETTLE_INVERTED
        ? 'Put down at ' + downAt + ' is after they fell asleep at ' + asleepAt + '. Change one of them.'
        : 'Put down at ' + downAt + ' is ' + fmtDur(gap * 60000) + ' before they fell asleep at ' + asleepAt + '. Check the time.',
        'f-putdown');
      return;
    }
    if (gap > SETTLE_CONFIRM){
      askConfirm({
        title: 'That is a long settle',
        text: 'Put down at ' + downAt + ', asleep at ' + asleepAt + ' — ' + fmtDur(gap * 60000) + ' of settling. Is that right?',
        confirmLabel: 'Yes, save it',
        keepLabel: 'Go back',
        tone: 'primary',
        onConfirm: proceed
      });
      return;
    }
    proceed();
  }

  function groupByDay(items, timeOf){
    var sorted = items.slice().sort(function(a, b){ return timeOf(b) - timeOf(a); });
    var groups = [], byKey = {};
    sorted.forEach(function(it){
      var g = byKey[it.date];
      if (!g){ g = { key: it.date, items: [] }; byKey[it.date] = g; groups.push(g); }
      g.items.push(it);
    });
    return groups;
  }

  function renderDayGroups(container, groups, rowHtml, headRight, emptyHtml){
    container.innerHTML = '';
    if (!groups.length){
      var empty = document.createElement('div');
      empty.className = 'empty';
      empty.innerHTML = emptyHtml;
      container.appendChild(empty);
      return;
    }
    groups.forEach(function(g){
      var dayEl = document.createElement('div');
      dayEl.className = 'day-group';
      // Tapping a day in the month grid scrolls the log to this group.
      dayEl.dataset.day = g.key;
      var head = document.createElement('div');
      head.className = 'day-head';
      head.innerHTML = '<span>' + friendlyDate(g.key) + '</span><span class="day-total">' + headRight(g.items) + '</span>';
      dayEl.appendChild(head);
      var rows = document.createElement('div');
      rows.className = 'day-rows';
      rows.innerHTML = g.items.map(rowHtml).join('');
      dayEl.appendChild(rows);
      container.appendChild(dayEl);
    });
  }

  // ---------- navigation ----------
  function setView(view){
    el('app').dataset.view = view;
    document.body.setAttribute('data-view', view);
  }

  function goTo(view){
    if (!viewAllowed(view)) view = 'home';
    // Arriving at a page starts at the top, but opening a form on the page you
    // are already on is not arriving anywhere: editing an entry half way down
    // the log should leave the log where it was.
    var moved = el('app').dataset.view !== view;
    setView(view);
    ssSet(VIEW_KEY, view);
    hideChartTooltip();
    if (moved) window.scrollTo({ top: 0 });
  }

  function viewAllowed(v){
    if (v === 'meds') return !!FEATURES.medicine;
    return VIEWS.indexOf(v) >= 0;
  }
  function restoreView(){
    var v = ssGet(VIEW_KEY);
    setView(viewAllowed(v) ? v : 'home');
  }

  function openEditor(kind, id){
    if (readOnly){ goTo(kind); return; }
    if (kind === 'sleep'){ goTo('sleep'); openForm(id); }
    else if (kind === 'milk'){ editMilk(id, false); }
    else if (kind === 'solids'){ editSolid(id, false); }
    else if (kind === 'meds'){ editMed(id, false); }
    // Markers are edited where they are listed, on the Calendar tab, so this
    // one does not move the page first.
    else if (kind === 'marker'){ openMarkerForm(id); }
  }

  // ---------- drafts: what someone is mid-typing survives a reload ----------
  function snapshotForm(formId){
    if (!FORM_FIELDS[formId] || readOnly) return;
    var draft = ssGet(DRAFT_KEY) || {};
    var fields = {};
    FORM_FIELDS[formId].forEach(function(id){ fields[id] = el(id).value; });
    var entry = { fields: fields };
    if (formId === 'entry-form'){
      entry.mode = formMode;
      entry.title = el('form-title').textContent;
      entry.open = !el('entry-overlay').hidden;
    }
    if (formId === 'solid-form'){
      entry.foods = solidDraftFoods.slice();
      entry.open = !el('solid-overlay').hidden;
    }
    if (formId === 'milk-form'){
      entry.bottle = el('m-bottle').checked;
      entry.open = !el('milk-overlay').hidden;
    }
    if (formId === 'med-form'){
      entry.gap = medDraftGap;
      entry.open = !el('med-overlay').hidden;
    }
    draft[formId] = entry;
    draft.at = Date.now();
    ssSet(DRAFT_KEY, draft);
  }

  function clearDraft(formId){
    var draft = ssGet(DRAFT_KEY);
    if (!draft) return;
    delete draft[formId];
    var remaining = Object.keys(draft).filter(function(k){ return k !== 'at'; });
    if (remaining.length) ssSet(DRAFT_KEY, draft); else ssDel(DRAFT_KEY);
  }

  function setFields(fields){
    Object.keys(fields || {}).forEach(function(id){
      var node = el(id);
      if (node) node.value = fields[id];
    });
  }

  function restoreDrafts(){
    var draft = bootDraft;
    if (!draft) return;
    if (Date.now() - (draft.at || 0) > DRAFT_MAX_AGE){ ssDel(DRAFT_KEY); return; }

    var s = draft['entry-form'];
    if (s && s.open){
      var modeStillValid = (s.mode !== 'start' && s.mode !== 'wake') || state.status.asleep;
      if (modeStillValid){
        formMode = s.mode || 'entry';
        setFields(s.fields);
        el('form-title').textContent = s.title || 'Log a sleep session';
        applyMode();
        openOverlay('entry-overlay');
        hideError('form-error');
        snapshotForm('entry-form');
      }
    }

    var m = draft['milk-form'];
    if (m){
      var milkId = m.fields['m-id'];
      if (!milkId || editMilk(milkId, true)){
        setFields(m.fields);
        el('m-bottle').checked = !!m.bottle;
        setBottleFields();
        if (m.open) openOverlay('milk-overlay');
        snapshotForm('milk-form');
      }
    }

    var md = draft['med-form'];
    if (md){
      var medId = md.fields['md-id'];
      if (!medId || editMed(medId, true)){
        setFields(md.fields);
        if (md.gap != null) medDraftGap = md.gap;
        renderMedHelpers();
        if (md.open) openOverlay('med-overlay');
        snapshotForm('med-form');
      }
    }

    var so = draft['solid-form'];
    if (so){
      var solidId = so.fields['s-id'];
      if (!solidId || editSolid(solidId, true)){
        setFields(so.fields);
        solidDraftFoods = (so.foods || []).slice();
        renderFoodHelpers();
        if (so.open) openOverlay('solid-overlay');
        snapshotForm('solid-form');
      }
    }
  }

  // ---------- state changes are recorded as ops so they can be replayed after a conflict ----------
  function applyOps(ops){
    ops.forEach(function(op){
      if (op.type === 'upsert'){
        var list = state[op.collection];
        var idx = list.findIndex(function(x){ return x.id === op.record.id; });
        if (idx >= 0) list[idx] = op.record; else list.push(op.record);
      } else if (op.type === 'delete'){
        state[op.collection] = state[op.collection].filter(function(x){ return x.id !== op.id; });
      } else if (op.type === 'status'){
        state.status = op.status;
      } else if (op.type === 'settings'){
        state.settings = op.settings;
      } else if (op.type === 'prefs'){
        state.prefs = op.prefs;
      } else if (op.type === 'markers'){
        state.markers = op.markers;
      }
    });
  }

  async function commit(ops){
    applyOps(ops);
    renderAll();
    await persist(ops);
  }
  // ---------- render all ----------
  function renderAll(){
    applyTheme();
    applyNightMode();
    renderSleep();
    renderMilk();
    renderSolids();
    renderMeds();
    renderHome();
    renderSummary();
  }

  // ======================================================
  // SUMMARY AND EXPORT
  // ======================================================
  // A sleep counts towards the day it belongs to: night sleep towards the
  // evening it started (so a 3am resettle joins the night before), naps
  // towards their own date.
  function sleepDayKey(e){ return isNight(e) ? nightKey(e) : e.date; }

  function dayKeysEndingToday(offsetWeeks, days){
    var keys = [];
    for (var i = 0; i < days; i++){
      var d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - (offsetWeeks * days) - i);
      keys.push(dateKey(d));
    }
    return keys;
  }

  // Averages count only the days that actually have something logged: a day
  // with no entries means nobody wrote it down, not a day without sleep.
  function averageOver(byDay){
    var sum = 0, days = 0;
    Object.keys(byDay).forEach(function(k){
      if (byDay[k] > 0){ sum += byDay[k]; days++; }
    });
    return { avg: days ? sum / days : 0, days: days };
  }

  function statsFor(keys){
    var set = {};
    keys.forEach(function(k){ set[k] = true; });
    var longestNightMs = 0;
    var sleepByDay = {}, feedsByDay = {}, mealsByDay = {};

    state.entries.forEach(function(e){
      var key = sleepDayKey(e);
      if (!set[key]) return;
      var dur = entryEnd(e) - entryStart(e);
      sleepByDay[key] = (sleepByDay[key] || 0) + dur;
      if (isNight(e) && dur > longestNightMs) longestNightMs = dur;
    });
    state.feeds.forEach(function(f){
      if (!set[f.date]) return;
      feedsByDay[f.date] = (feedsByDay[f.date] || 0) + 1;
    });
    state.solids.forEach(function(s){
      if (!set[s.date]) return;
      mealsByDay[s.date] = (mealsByDay[s.date] || 0) + 1;
    });

    var sleep = averageOver(sleepByDay), milk = averageOver(feedsByDay), meals = averageOver(mealsByDay);
    return {
      days: keys.length,
      sleepPerDayMs: sleep.avg, sleepDays: sleep.days,
      feedsPerDay: milk.avg, milkDays: milk.days,
      mealsPerDay: meals.avg, mealsDays: meals.days,
      longestNightMs: longestNightMs
    };
  }

  function deltaHtml(now, before, format){
    if (!before) return '<span class="summary-delta">no figure for the ' + periodLabel() + ' before</span>';
    var diff = now - before;
    var pct = Math.round((diff / before) * 100);
    if (Math.abs(pct) < 1) return '<span class="summary-delta">about the same as the ' + periodLabel() + ' before</span>';
    var dir = diff > 0 ? 'up' : 'down';
    var arrow = diff > 0 ? '↑' : '↓';
    return '<span class="summary-delta" data-dir="' + dir + '">' + arrow + ' ' + format(Math.abs(diff)) +
      ' (' + (diff > 0 ? '+' : '−') + Math.abs(pct) + '%) vs the ' + periodLabel() + ' before</span>';
  }

  function summaryTile(label, value, now, before, format, daysCounted){
    var counted = (daysCounted != null && daysCounted > 0 && daysCounted < 7)
      ? ' <span class="summary-days">over ' + plural(daysCounted, 'day') + '</span>'
      : '';
    return '<div class="summary-tile">' +
      '<span class="summary-value">' + value + '</span>' +
      '<span class="summary-label">' + label + counted + '</span>' +
      deltaHtml(now, before, format) +
    '</div>';
  }

  // How far back the Summary looks. A week is the day-to-day view; four and
  // twelve are where a change of pattern shows up - naps dropping from three
  // to two, or nights lengthening - which a single week cannot show.
  var PERIOD_KEY = 'cilly.period';
  var summaryDays = (function(){
    var saved = Number(ssGet(PERIOD_KEY));
    return [7, 28, 84].indexOf(saved) >= 0 ? saved : 7;
  })();
  function periodLabel(){ return summaryDays === 7 ? 'week' : summaryDays === 28 ? '4 weeks' : '12 weeks'; }
  function periodName(days){
    return days === 7 ? 'the last 7 days' : 'the last ' + (days / 7) + ' weeks';
  }
  function renderPeriodChoice(){
    Array.prototype.forEach.call(el('summary-period').querySelectorAll('.unit-btn'), function(btn){
      btn.setAttribute('aria-pressed', Number(btn.dataset.days) === summaryDays ? 'true' : 'false');
    });
  }
  el('summary-period').addEventListener('click', function(ev){
    var btn = ev.target.closest('.unit-btn');
    if (!btn) return;
    summaryDays = Number(btn.dataset.days);
    ssSet(PERIOD_KEY, summaryDays);
    renderSummary();
  });

  // Insights is three jobs behind three tabs: how the last stretch went, which
  // days were good, and getting it out to somebody else. Each tab holds only
  // the control that governs it - the period toggle used to sit above a month
  // grid and an export it had nothing to do with. Everything is still rendered
  // whatever is on screen, so switching tabs never waits and printing can show
  // the lot.
  var SUMMARY_TABS = ['overview', 'calendar', 'share'];
  var TAB_KEY = 'cilly.tab';
  var summaryTab = (function(){
    var saved = ssGet(TAB_KEY);
    return SUMMARY_TABS.indexOf(saved) >= 0 ? saved : 'overview';
  })();
  function renderSummaryTabs(){
    SUMMARY_TABS.forEach(function(name){
      var on = name === summaryTab;
      el('tab-' + name).setAttribute('aria-selected', on ? 'true' : 'false');
      el('panel-' + name).hidden = !on;
    });
    el('summary-tagline').textContent =
      summaryTab === 'calendar' ? 'Every day of the month, at a glance.' :
      summaryTab === 'share' ? 'For the GP, the nurse or the sleep consultant.' :
      'The last ' + (summaryDays === 7 ? '7 days' : (summaryDays / 7) + ' weeks') + ', and how they compare.';
  }
  el('summary-tabs').addEventListener('click', function(ev){
    var btn = ev.target.closest('.tab');
    if (!btn || btn.dataset.tab === summaryTab) return;
    summaryTab = btn.dataset.tab;
    ssSet(TAB_KEY, summaryTab);
    renderSummaryTabs();
    hideChartTooltip();
    window.scrollTo({ top: 0 });
  });

  function renderSummary(){
    renderSummaryTabs();
    renderPeriodChoice();
    var thisWeek = statsFor(dayKeysEndingToday(0, summaryDays));
    var lastWeek = statsFor(dayKeysEndingToday(1, summaryDays));
    var perDay = function(v){ return (Math.round(v * 10) / 10) + ' a day'; };
    var meals = perDay;

    el('summary-grid').innerHTML =
      summaryTile('Sleep a day', thisWeek.sleepPerDayMs ? fmtDur(thisWeek.sleepPerDayMs) : '—', thisWeek.sleepPerDayMs, lastWeek.sleepPerDayMs, fmtDur, thisWeek.sleepDays) +
      summaryTile('Longest night stretch', thisWeek.longestNightMs ? fmtDur(thisWeek.longestNightMs) : '—', thisWeek.longestNightMs, lastWeek.longestNightMs, fmtDur) +
      summaryTile('Feeds a day', thisWeek.feedsPerDay ? Math.round(thisWeek.feedsPerDay * 10) / 10 : '—', thisWeek.feedsPerDay, lastWeek.feedsPerDay, perDay, thisWeek.milkDays) +
      summaryTile('Meals a day', thisWeek.mealsPerDay ? Math.round(thisWeek.mealsPerDay * 10) / 10 : '—', thisWeek.mealsPerDay, lastWeek.mealsPerDay, meals, thisWeek.mealsDays);

    renderDayBands();
    renderDayTable();
    renderNorms();
    renderMonth();
    renderMarkers();
    el('print-heading').textContent = 'Cilly Log — ' + summaryDays + ' days to ' +
      new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

    var sub = thisWeek.sleepPerDayMs
      ? fmtDur(thisWeek.sleepPerDayMs) + ' sleep a day over ' + periodName(summaryDays)
      : 'Nothing logged in ' + periodName(summaryDays);
    if (thisWeek.feedsPerDay) sub += ' · ' + perDay(thisWeek.feedsPerDay) + ' feeds';
    el('home-summary-sub').textContent = sub;
  }

  // How the chosen period sits against the ranges for their age. These are
  // population ranges, not targets, and the note under the table says so.
  function renderNorms(){
    var panel = el('norms-panel'), age = currentAge();
    if (!age){ panel.hidden = true; return; }
    panel.hidden = false;
    var band = age.band;

    var set = {};
    dayKeysEndingToday(0, summaryDays).forEach(function(k){ set[k] = true; });
    var night = {}, day = {}, naps = {}, total = {};
    state.entries.forEach(function(e){
      var key = sleepDayKey(e);
      if (!set[key]) return;
      var dur = entryEnd(e) - entryStart(e);
      total[key] = (total[key] || 0) + dur;
      if (isNight(e)) night[key] = (night[key] || 0) + dur;
      else { day[key] = (day[key] || 0) + dur; naps[key] = (naps[key] || 0) + 1; }
    });

    // Averages over two or three days say more about which days got written
    // down than about how he sleeps, so say so rather than letting the
    // comparison read as settled.
    var loggedDays = Object.keys(total).length;
    var warn = el('norms-warn');
    warn.hidden = loggedDays >= summaryDays;
    if (!warn.hidden){
      // A missed day or two is ordinary, so it is said quietly. The amber box
      // is kept for a stretch thin enough that the figures cannot carry it, or
      // it would be on screen most weeks and stop being read.
      warn.className = loggedDays >= Math.ceil(summaryDays * 0.7) ? 'note-soft' : 'warn-note';
      warn.textContent = loggedDays === 0
        ? 'Nothing logged in ' + periodName(summaryDays) + ', so there is nothing to compare yet.'
        : 'Based on ' + plural(loggedDays, 'day') + ' of the last ' + summaryDays + '. Until the whole ' +
          'stretch is logged, read these as a rough guide rather than a fair comparison.';
    }

    // Each row counts its own days: a day with naps written down but no night
    // counts towards one and not the other. Below three days there is no
    // verdict at all, because "in range" off a single night is noise.
    // The verdict sits under the figure it judges rather than in a column of
    // its own: three columns fit a phone, four do not.
    function row(label, stat, low, high, format, rangeFormat){
      var show = rangeFormat || format;
      var usual = low === high ? show(low) : show(low) + ' – ' + show(high);
      if (!stat.avg) return '<tr><td>' + label + '</td><td>—</td><td>' + usual + '</td></tr>';
      var verdict;
      if (stat.days < 3){
        verdict = '<span class="norm-flag">too few days</span>';
      } else {
        var flag = stat.avg < low ? ['down', 'below'] : stat.avg > high ? ['up', 'above'] : ['', 'in range'];
        verdict = '<span class="norm-flag"' + (flag[0] ? ' data-dir="' + flag[0] + '"' : '') + '>' + flag[1] + '</span>';
      }
      var basis = stat.days < summaryDays ? '<span class="norm-days">' + plural(stat.days, 'day') + '</span>' : '';
      return '<tr>' +
        '<td>' + label + '</td>' +
        '<td>' + format(stat.avg) + '<span class="norm-meta">' + verdict + '</span>' + basis + '</td>' +
        '<td>' + usual + '</td>' +
      '</tr>';
    }
    var hours = function(ms){ return fmtDur(ms); };
    // The age ranges are whole and half hours, and "11h – 12h" fits a phone
    // where "11h 0m – 12h 0m" does not.
    var round = function(ms){ return ms % 3600000 === 0 ? (ms / 3600000) + 'h' : fmtDur(ms); };
    var count = function(n){ return Math.round(n * 10) / 10; };
    var mins = function(m){ return m * 60000; };

    el('norms-age').textContent = band.label;
    el('norms-table').innerHTML =
      '<thead><tr><th>Sleep</th><th>Average</th><th>Usual</th></tr></thead><tbody>' +
      row('Night', averageOver(night), mins(band.nightSleep[0]), mins(band.nightSleep[1]), hours, round) +
      row('Naps', averageOver(day), mins(band.daySleep[0]), mins(band.daySleep[1]), hours, round) +
      row('Total in 24h', averageOver(total), mins(band.total[0]), mins(band.total[1]), hours, round) +
      row('Naps a day', averageOver(naps), band.naps[0], band.naps[1], count) +
      '</tbody>';

    el('norms-note').textContent = (band.note ? band.note + ' ' : '') +
      MODEL.sources + ' Every baby is different, and a week outside a range is not a problem by itself ' +
      '— it is a question for your health visitor or GP, not a verdict.';
  }

  function dayTotals(key){
    var night = 0, naps = 0, feeds = 0, meals = 0;
    state.entries.forEach(function(e){
      if (sleepDayKey(e) !== key) return;
      var dur = entryEnd(e) - entryStart(e);
      if (isNight(e)) night += dur; else naps += dur;
    });
    state.feeds.forEach(function(f){ if (f.date === key) feeds++; });
    state.solids.forEach(function(s){ if (s.date === key) meals++; });
    return { key: key, night: night, naps: naps, feeds: feeds, meals: meals };
  }

  function renderDayTable(){
    var keys = dayKeysEndingToday(0, summaryDays).slice().reverse();
    var byWeek = summaryDays > 7;
    var days = keys.map(dayTotals);
    // Twelve weeks of days is a wall of numbers, so longer periods show one
    // row a week, each holding that week's daily average rather than its
    // total: the rows stay comparable with the one-week view.
    var rows = !byWeek ? days : (function(){
      var out = [];
      for (var i = 0; i < days.length; i += 7){
        var week = days.slice(i, i + 7);
        var logged = week.filter(function(d){ return d.night + d.naps + d.feeds + d.meals > 0; }).length;
        var sum = function(pick){ return week.reduce(function(a, d){ return a + pick(d); }, 0); };
        out.push({
          key: week[0].key,
          label: 'Week to ' + friendlyDate(week[week.length - 1].key),
          night: logged ? sum(function(d){ return d.night; }) / logged : 0,
          naps: logged ? sum(function(d){ return d.naps; }) / logged : 0,
          feeds: logged ? sum(function(d){ return d.feeds; }) / logged : 0,
          meals: logged ? sum(function(d){ return d.meals; }) / logged : 0
        });
      }
      return out;
    })();

    // Each column averages over the days that have a figure in that column.
    function columnAverage(pick){
      var sum = 0, days = 0;
      rows.forEach(function(r){
        var v = pick(r);
        if (v > 0){ sum += v; days++; }
      });
      return days ? sum / days : 0;
    }
    var avg = {
      night: columnAverage(function(r){ return r.night; }),
      naps: columnAverage(function(r){ return r.naps; }),
      total: columnAverage(function(r){ return r.night + r.naps; }),
      feeds: columnAverage(function(r){ return r.feeds; }),
      meals: columnAverage(function(r){ return r.meals; })
    };
    var loggedDays = days.filter(function(r){ return r.night + r.naps + r.feeds + r.meals > 0; }).length;
    var count = function(v){ return v ? (byWeek ? Math.round(v * 10) / 10 : v) : '—'; };

    var body = rows.map(function(r){
      return '<tr>' +
        '<td>' + (r.label || friendlyDate(r.key)) + '</td>' +
        '<td>' + (r.night ? fmtDur(r.night) : '—') + '</td>' +
        '<td>' + (r.naps ? fmtDur(r.naps) : '—') + '</td>' +
        '<td>' + ((r.night + r.naps) ? fmtDur(r.night + r.naps) : '—') + '</td>' +
        '<td>' + count(r.feeds) + '</td>' +
        '<td>' + count(r.meals) + '</td>' +
      '</tr>';
    }).join('');

    el('day-table-heading').textContent = byWeek ? 'Week by week' : 'Day by day';
    el('day-table-range').textContent = 'Last ' + (byWeek ? (summaryDays / 7) + ' weeks' : '7 days');
    el('day-table').innerHTML =
      '<thead><tr><th>' + (byWeek ? 'Week' : 'Day') + '</th><th>Night</th><th>Naps</th><th>Total</th><th>Feeds</th><th>Meals</th></tr></thead>' +
      '<tbody>' + body + '</tbody>' +
      '<tfoot><tr>' +
        '<td>Average</td>' +
        '<td>' + (avg.night ? fmtDur(avg.night) : '—') + '</td>' +
        '<td>' + (avg.naps ? fmtDur(avg.naps) : '—') + '</td>' +
        '<td>' + (avg.total ? fmtDur(avg.total) : '—') + '</td>' +
        '<td>' + (avg.feeds ? Math.round(avg.feeds * 10) / 10 : '—') + '</td>' +
        '<td>' + (avg.meals ? Math.round(avg.meals * 10) / 10 : '—') + '</td>' +
      '</tr></tfoot>';

    el('day-table-note').textContent =
      (byWeek ? 'Each row is that week’s daily average, not its total. ' : '') +
      (loggedDays === summaryDays
        ? 'Averages cover all ' + summaryDays + ' days.'
        : 'Averages count only days with something logged (' + plural(loggedDays, 'day') + ' of ' + summaryDays + '). Each column counts its own days.');
  }

  // ======================================================
  // WHAT WAS GOING ON
  // ======================================================
  // Teething, a cold, a week away, the first days at nursery. Without them a
  // rough fortnight in the figures looks like a mystery when you knew exactly
  // what it was at the time - and you cannot add them afterwards, because by
  // then you have forgotten. They sit on the calendar, in the day, and in the
  // consultant log, which is the question she asks first.
  var MARKER_KINDS = [
    { id: 'teething', label: 'Teething' },
    { id: 'ill', label: 'Unwell' },
    { id: 'travel', label: 'Away from home' },
    { id: 'nursery', label: 'Nursery' },
    { id: 'jabs', label: 'Vaccinations' },
    { id: 'other', label: 'Something else' }
  ];
  function markerLabel(kind){
    for (var i = 0; i < MARKER_KINDS.length; i++){ if (MARKER_KINDS[i].id === kind) return MARKER_KINDS[i].label; }
    return 'Something else';
  }
  // Marked days are stored as a first and last date, so a week away is one
  // entry rather than seven.
  function markersOn(key){
    return (state.markers || []).filter(function(m){
      return key >= m.from && key <= (m.to || m.from);
    });
  }
  function nextDayKey(key){
    var parts = key.split('-').map(Number);
    var d = new Date(parts[0], parts[1] - 1, parts[2] + 1);
    return dateKey(d);
  }
  function markerSpan(m){
    var to = m.to || m.from;
    return m.from === to ? friendlyDate(m.from) : friendlyDate(m.from) + ' – ' + friendlyDate(to);
  }
  function markerText(m){
    return markerLabel(m.kind) + (m.note ? ' — ' + m.note : '');
  }
  function sortedMarkers(){
    return (state.markers || []).slice().sort(function(a, b){ return a.from < b.from ? 1 : a.from > b.from ? -1 : 0; });
  }

  function renderMarkers(){
    var list = sortedMarkers();
    el('marker-list').innerHTML = list.length
      ? list.map(function(m){
          return '<div class="entry-row">' +
            '<div class="entry-main">' +
              '<span class="entry-range">' + escapeHtml(markerLabel(m.kind)) + '</span>' +
              '<span class="entry-meta"><span class="meta-tag">' + escapeHtml(markerSpan(m)) + '</span></span>' +
              (m.note ? '<span class="entry-notes">' + escapeHtml(m.note) + '</span>' : '') +
            '</div>' +
            '<div class="entry-side">' +
              '<button class="icon-btn writer-only" data-edit="marker" data-id="' + m.id + '" aria-label="Edit ' + escapeHtml(markerLabel(m.kind)) + '" type="button">' + ICON.pencil + '</button>' +
            '</div>' +
          '</div>';
        }).join('')
      : '<p class="form-hint">Nothing marked yet. Add teething, a cold or a week away and it will show on the calendar and in the consultant log.</p>';
  }

  function resetMarkerForm(){
    el('mk-id').value = '';
    el('mk-kind').value = 'teething';
    el('mk-from').value = dateKey(new Date());
    el('mk-to').value = '';
    el('mk-note').value = '';
    el('marker-title').textContent = 'What was going on';
    el('mk-delete').hidden = true;
    hideError('mk-error');
  }
  function openMarkerForm(id){
    if (readOnly) return;
    resetMarkerForm();
    if (id){
      var m = (state.markers || []).filter(function(x){ return x.id === id; })[0];
      if (m){
        el('mk-id').value = m.id;
        el('mk-kind').value = m.kind;
        el('mk-from').value = m.from;
        el('mk-to').value = m.to && m.to !== m.from ? m.to : '';
        el('mk-note').value = m.note || '';
        el('marker-title').textContent = 'Edit ' + markerLabel(m.kind).toLowerCase();
        el('mk-delete').hidden = false;
      }
    }
    openOverlay('marker-overlay');
    el('mk-kind').focus();
  }
  function closeMarkerForm(){ closeOverlay('marker-overlay'); }
  el('marker-add').addEventListener('click', function(){ openMarkerForm(''); });
  el('marker-close').addEventListener('click', closeMarkerForm);
  el('mk-cancel').addEventListener('click', closeMarkerForm);
  el('marker-overlay').addEventListener('click', function(ev){ if (ev.target === el('marker-overlay')) closeMarkerForm(); });

  el('marker-form').addEventListener('submit', async function(ev){
    ev.preventDefault();
    hideError('mk-error');
    var from = el('mk-from').value, to = el('mk-to').value;
    if (!from){ showError('mk-error', 'Pick the day it started.', 'mk-from'); return; }
    if (to && to < from){ showError('mk-error', 'The last day can’t be before the first.', 'mk-to'); return; }
    var marker = {
      id: el('mk-id').value || uid(),
      kind: el('mk-kind').value,
      from: from,
      to: to || from,
      note: el('mk-note').value.trim(),
      createdBy: state.me || ''
    };
    var rest = (state.markers || []).filter(function(m){ return m.id !== marker.id; });
    showToast(el('mk-id').value ? 'Updated' : markerLabel(marker.kind) + ' marked');
    closeMarkerForm();
    await commit([{ type: 'markers', markers: rest.concat([marker]) }]);
  });

  el('mk-delete').addEventListener('click', function(){
    var id = el('mk-id').value;
    var m = (state.markers || []).filter(function(x){ return x.id === id; })[0];
    if (!m) return;
    askConfirm({
      title: 'Delete this?',
      text: markerText(m) + ', ' + markerSpan(m) + '. This cannot be undone.',
      onConfirm: async function(){
        closeMarkerForm();
        showToast('Deleted');
        await commit([{ type: 'markers', markers: (state.markers || []).filter(function(x){ return x.id !== id; }) }]);
      }
    });
  });

  // ======================================================
  // THE SHAPE OF HIS DAYS
  // ======================================================
  // A row a day, drawn against the clock, so sleep is a block of time rather
  // than a number of hours. It is the picture a sleep consultant reads first:
  // bedtime drifting later, a night breaking in two, a third nap creeping back
  // in - none of which a column of totals can show.
  //
  // A row runs from when night ends to when it ends again, which is the same
  // stretch the rest of the page counts as a day: that day's naps, and the
  // night that started that evening. Sleep is drawn at the time it actually
  // happened, so a night running past the morning boundary carries over to the
  // left-hand end of the row below - the two edges meet, as they do on paper.
  var BAND_W = 336, BAND_LEFT = 36, BAND_RIGHT = 3, BAND_TOP = 12, BAND_BOTTOM = 15;
  var BAND_MINUTES = 1440;

  function bandRowStart(key){
    var parts = key.split('-').map(Number);
    var d = new Date(parts[0], parts[1] - 1, parts[2]);
    d.setHours(0, nightBounds().end, 0, 0);
    return d.getTime();
  }

  function renderDayBands(){
    var keys = dayKeysEndingToday(0, summaryDays).slice().reverse(); // oldest at the top
    var rows = keys.length;
    // Seven days can afford a fat row; twelve weeks has to thin down to fit on
    // a screen at all, and still reads, because it is the shape that matters.
    var rowH = Math.max(4, Math.min(17, Math.round(340 / rows)));
    var gap = rowH > 8 ? 2 : 1;
    var plotW = BAND_W - BAND_LEFT - BAND_RIGHT;
    var perMin = plotW / BAND_MINUTES;
    var height = BAND_TOP + rows * (rowH + gap) + BAND_BOTTOM;
    var nightEnd = nightBounds().end;

    var body = '', anyData = false;
    keys.forEach(function(key, i){
      var top = BAND_TOP + i * (rowH + gap);
      var from = bandRowStart(key), to = from + BAND_MINUTES * 60000;
      var totals = dayTotals(key);
      var has = (totals.night + totals.naps) > 0;
      if (has) anyData = true;

      body += '<rect class="band-lane" x="' + BAND_LEFT + '" y="' + top + '" width="' + plotW + '" height="' + rowH + '" rx="2"></rect>';

      state.entries.forEach(function(e){
        var s = entryStart(e).getTime(), en = entryEnd(e).getTime();
        var a = Math.max(s, from), b = Math.min(en, to);
        if (b <= a) return;
        var x = BAND_LEFT + ((a - from) / 60000) * perMin;
        var w = Math.max(0.8, ((b - a) / 60000) * perMin);
        body += '<rect class="' + (isNight(e) ? 'chart-seg-night' : 'chart-seg-nap') +
          '" x="' + round1(x) + '" y="' + top + '" width="' + round1(w) + '" height="' + rowH + '" rx="1"></rect>';
      });

      // Twelve weeks of rows are thinner than the text, so at that height the
      // dates thin out to one a week and the rows in between are read off the
      // one above.
      if (rowH >= 9 || i % 7 === 0){
        var label = new Date(from).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' });
        body += '<text class="band-label" x="' + (BAND_LEFT - 5) + '" y="' + (top + rowH / 2) + '">' + escapeHtml(label) + '</text>';
      }
      body += '<rect class="band-hit" data-band-day="' + key + '" x="0" y="' + top + '" width="' + BAND_W + '" height="' + rowH + '"></rect>';
    });

    // Six-hourly marks, counted from the start of the row rather than from
    // midnight, so they land on whatever this family's night end is.
    var ticks = '';
    for (var m = 0; m <= BAND_MINUTES; m += 360){
      var x = BAND_LEFT + m * perMin;
      if (m > 0 && m < BAND_MINUTES){
        ticks += '<line class="chart-gridline" x1="' + round1(x) + '" y1="' + BAND_TOP + '" x2="' + round1(x) + '" y2="' + (height - BAND_BOTTOM) + '"></line>';
      }
      ticks += '<text class="band-tick" x="' + round1(x) + '" y="' + (height - 4) + '">' + fmtClock((nightEnd + m) % 1440) + '</text>';
    }

    el('band-chart').setAttribute('viewBox', '0 0 ' + BAND_W + ' ' + height);
    el('band-chart').innerHTML = ticks + body;
    el('band-empty').hidden = anyData;
    el('band-range').textContent = summaryDays === 7 ? 'Last 7 days' : 'Last ' + (summaryDays / 7) + ' weeks';
  }
  function round1(n){ return Math.round(n * 10) / 10; }

  el('band-chart').addEventListener('click', function(ev){
    var hit = ev.target.closest('[data-band-day]');
    if (hit) openDay(hit.getAttribute('data-band-day'));
  });

  // ======================================================
  // MONTH AT A GLANCE
  // ======================================================
  // A calendar month with every day coloured by whether he got the sleep his
  // age asks for. Only a shortfall is marked: the question is whether he got
  // enough, so a day above the range is as good as one inside it. Marking a
  // long day amber would teach you to ignore the colours.
  //
  // The ranges are the ones in js/sleep-model.js that "Usual for his age"
  // uses, and the band comes from his age ON THAT DAY, so scrolling back a few
  // months judges those days by the baby he was then rather than the one he is
  // now. Each cell prints its hours as well as its colour: red and green look
  // the same to plenty of people, and "how short was it" is the better
  // question anyway.
  var MONTH_AMBER_MS = 60 * 60000;
  var MONTH_METRICS = {
    total: { label: 'total sleep in 24 hours', pick: function(t){ return t.night + t.naps; }, range: function(b){ return b.total; } },
    night: { label: 'night sleep', pick: function(t){ return t.night; }, range: function(b){ return b.nightSleep; } },
    naps: { label: 'nap sleep', pick: function(t){ return t.naps; }, range: function(b){ return b.daySleep; } }
  };
  var MONTH_METRIC_KEY = 'cilly.monthMetric';
  var monthMetric = (function(){
    var saved = ssGet(MONTH_METRIC_KEY);
    return MONTH_METRICS[saved] ? saved : 'total';
  })();
  // Opens on this month, as a calendar does. It only moves when the arrows or
  // a swipe move it: a save elsewhere on the page re-renders the grid and
  // should not throw you back to today.
  var monthCursor = (function(){ var d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; })();

  function monthName(y, m){
    return new Date(y, m, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  }
  function keyOf(y, m, day){ return y + '-' + pad(m + 1) + '-' + pad(day); }
  function longDayName(key){
    var parts = key.split('-').map(Number);
    return new Date(parts[0], parts[1] - 1, parts[2])
      .toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
  }
  // The band for his age on a given day, not today's band.
  function bandOn(key){
    var s = state.settings || {};
    if (!s.dob || !MODEL) return null;
    var parts = key.split('-').map(Number);
    var months = ageMonths(s.dob, new Date(parts[0], parts[1] - 1, parts[2]));
    return months === null ? null : MODEL.bandFor(months);
  }
  // A day is not finished until its night is. The night that starts on the
  // 12th runs into the 13th, so the 12th cannot be judged until the night ends
  // the next morning - otherwise today would sit there in red all evening.
  function dayComplete(key){
    var parts = key.split('-').map(Number);
    var end = new Date(parts[0], parts[1] - 1, parts[2] + 1);
    end.setHours(0, nightBounds().end, 0, 0);
    return Date.now() >= end.getTime();
  }

  // What one cell knows about itself. States: ok / warn / bad are verdicts,
  // plain is a figure with no verdict (no date of birth), soon is a day still
  // running, none is a finished day with nothing written down, and before is a
  // date earlier than he was.
  function monthDay(key){
    var s = state.settings || {};
    var todayKey = dateKey(new Date());
    if (key > todayKey) return { key: key, state: 'future' };
    if (s.dob && key < s.dob) return { key: key, state: 'before' };
    var totals = dayTotals(key);
    var ms = MONTH_METRICS[monthMetric].pick(totals);
    var complete = dayComplete(key);
    if (!complete) return { key: key, state: 'soon', ms: ms, totals: totals };
    if (!ms) return { key: key, state: 'none', ms: 0, totals: totals };
    var band = bandOn(key);
    if (!band) return { key: key, state: 'plain', ms: ms, totals: totals };
    var range = MONTH_METRICS[monthMetric].range(band);
    var low = range[0] * 60000;
    return {
      key: key, ms: ms, totals: totals, band: band, low: low, high: range[1] * 60000,
      state: ms >= low ? 'ok' : ms >= low - MONTH_AMBER_MS ? 'warn' : 'bad'
    };
  }

  // The age ranges are whole and half hours, so "13h – 14h" reads better than
  // "13h 0m – 14h 0m". Same rounding as the norms table.
  function roundDur(ms){ return ms % 3600000 === 0 ? (ms / 3600000) + 'h' : fmtDur(ms); }
  function roundRange(range){ return roundDur(range[0] * 60000) + ' – ' + roundDur(range[1] * 60000); }

  // Hours for a cell about 40px wide, so "11h 40m" will not do.
  function shortDur(ms){
    var min = Math.max(0, Math.round(ms / 60000));
    var h = Math.floor(min / 60), m = min % 60;
    if (!h) return m + 'm';
    return m ? h + 'h' + pad(m) : h + 'h';
  }
  var MONTH_WORDS = {
    ok: 'enough', warn: 'up to an hour short', bad: 'more than an hour short',
    none: 'nothing logged', soon: 'still going', plain: 'logged', before: '', future: ''
  };

  function renderMonth(){
    var y = monthCursor.y, m = monthCursor.m;
    var todayKey = dateKey(new Date());
    var metric = MONTH_METRICS[monthMetric];

    Array.prototype.forEach.call(el('month-metric').querySelectorAll('.unit-btn'), function(btn){
      btn.setAttribute('aria-pressed', btn.dataset.metric === monthMetric ? 'true' : 'false');
    });
    el('month-label').textContent = monthName(y, m);

    // Forward stops at this month; back stops at the first thing there is to
    // look at, so the arrows never walk into empty years.
    var now = new Date();
    el('month-next').disabled = (y === now.getFullYear() && m === now.getMonth());
    var firstKey = earliestDayKey();
    el('month-prev').disabled = !firstKey || keyOf(y, m, 1) <= firstKey.slice(0, 7) + '-01';

    var days = new Date(y, m + 1, 0).getDate();
    var lead = (new Date(y, m, 1).getDay() + 6) % 7; // weeks start on Monday
    var cells = '';
    for (var i = 0; i < lead; i++) cells += '<span class="month-cell is-blank" aria-hidden="true"></span>';

    var counts = { ok: 0, warn: 0, bad: 0, none: 0 }, loggedMs = 0, loggedDays = 0;
    for (var d = 1; d <= days; d++){
      var day = monthDay(keyOf(y, m, d));
      if (counts[day.state] !== undefined) counts[day.state]++;
      if (day.ms){ loggedMs += day.ms; loggedDays++; }
      var figure = day.ms ? shortDur(day.ms) : (day.state === 'none' ? '·' : '');
      var label = longDayName(day.key) + (day.ms ? ', ' + fmtDur(day.ms) + ' ' + metric.label : '') +
        (MONTH_WORDS[day.state] ? ', ' + MONTH_WORDS[day.state] : '');
      var disabled = day.state === 'future' || day.state === 'before';
      // A marked day carries a dot, so a run of short nights and the week he
      // was teething are visible in the same glance.
      var marks = markersOn(day.key);
      if (marks.length) label += ', ' + marks.map(markerText).join(', ');
      cells += '<button type="button" class="month-cell" data-day="' + day.key + '"' +
        ' data-state="' + day.state + '"' + (day.key === todayKey ? ' data-today="true"' : '') +
        (disabled ? ' disabled' : '') + ' aria-label="' + escapeHtml(label) + '">' +
        '<span class="month-date">' + d + '</span>' +
        '<span class="month-figure">' + figure + '</span>' +
        (marks.length ? '<span class="month-mark" aria-hidden="true"></span>' : '') +
      '</button>';
    }
    el('month-grid').innerHTML = cells;

    var judged = counts.ok + counts.warn + counts.bad;
    var parts = [];
    if (judged){
      parts.push('<b>' + counts.ok + '</b> enough');
      parts.push('<b>' + counts.warn + '</b> up to an hour short');
      parts.push('<b>' + counts.bad + '</b> more than an hour short');
    }
    if (counts.none) parts.push('<b>' + counts.none + '</b> not logged');
    if (loggedDays) parts.push('<b>' + fmtDur(loggedMs / loggedDays) + '</b> a day');
    el('month-summary').innerHTML = parts.length
      ? parts.join(' <span class="month-dot">·</span> ')
      : 'Nothing logged in ' + monthName(y, m) + '.';

    // The note describes the month on screen, not today: scrolling back to
    // February should quote the ranges February was judged by. The middle of
    // the month stands for it, clamped so a part-finished or not-yet-born
    // month still has a real day to ask about.
    var probeKey = todayKey.slice(0, 7) === keyOf(y, m, 1).slice(0, 7)
      ? todayKey
      : keyOf(y, m, Math.min(15, days));
    var dobKey = (state.settings || {}).dob;
    if (dobKey && probeKey < dobKey) probeKey = dobKey;
    var band = bandOn(probeKey);
    var note;
    if (!(state.settings || {}).dob){
      note = 'Add a date of birth in Settings and each day can be judged against the sleep usual at his age. ' +
        'For now the cells just show what was logged.';
    } else if (band){
      var range = metric.range(band);
      note = 'Green is ' + roundDur(range[0] * 60000) + ' of ' + metric.label + ' or more, the bottom of the usual ' +
        roundRange(range) + ' at ' + band.label + '. Amber is within an hour of it, ' +
        'red is further below. Each day is judged by his age on that day. These are population ranges, not targets: ' +
        'a short day on its own is not a problem.';
    } else {
      note = 'Cells show the ' + metric.label + ' logged for each day.';
    }
    el('month-note').textContent = note;
  }

  function earliestDayKey(){
    var earliest = null;
    state.entries.forEach(function(e){
      var k = sleepDayKey(e);
      if (!earliest || k < earliest) earliest = k;
    });
    var dob = (state.settings || {}).dob;
    if (dob && (!earliest || dob < earliest)) earliest = dob;
    return earliest;
  }

  function shiftMonth(step){
    var d = new Date(monthCursor.y, monthCursor.m + step, 1);
    var now = new Date();
    if (d > new Date(now.getFullYear(), now.getMonth(), 1)) return;
    var firstKey = earliestDayKey();
    if (firstKey && keyOf(d.getFullYear(), d.getMonth(), 1) < firstKey.slice(0, 7) + '-01') return;
    monthCursor = { y: d.getFullYear(), m: d.getMonth() };
    renderMonth();
  }

  el('month-prev').addEventListener('click', function(){ shiftMonth(-1); });
  el('month-next').addEventListener('click', function(){ shiftMonth(1); });
  el('month-metric').addEventListener('click', function(ev){
    var btn = ev.target.closest('.unit-btn');
    if (!btn) return;
    monthMetric = btn.dataset.metric;
    ssSet(MONTH_METRIC_KEY, monthMetric);
    renderMonth();
  });

  // Swiping the grid moves the month, since this is used one-handed. A swipe
  // ends in a click on whichever cell the thumb left, so the next one is
  // swallowed.
  var touchStart = null, swiped = false;
  el('month-grid').addEventListener('touchstart', function(ev){
    var t = ev.changedTouches[0];
    touchStart = { x: t.clientX, y: t.clientY };
    swiped = false;
  }, { passive: true });
  el('month-grid').addEventListener('touchend', function(ev){
    if (!touchStart) return;
    var t = ev.changedTouches[0];
    var dx = t.clientX - touchStart.x, dy = t.clientY - touchStart.y;
    touchStart = null;
    if (Math.abs(dx) < 45 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    swiped = true;
    shiftMonth(dx < 0 ? 1 : -1);
  }, { passive: true });

  el('month-grid').addEventListener('click', function(ev){
    var cell = ev.target.closest('.month-cell');
    if (!cell || !cell.dataset.day) return;
    if (swiped){ swiped = false; return; }
    openDay(cell.dataset.day);
  });

  // ---------- a day, in full ----------
  // The colour is a verdict on a day, so tapping it has to show the day the
  // verdict was made on: the same sleeps, counted the same way. Editing still
  // belongs in the log, which is what the button at the bottom is for.
  var openDayKey = null;
  function openDay(key){
    openDayKey = key;
    var day = monthDay(key);
    var totals = day.totals || dayTotals(key);
    el('day-title').textContent = longDayName(key);

    var band = bandOn(key), metric = MONTH_METRICS[monthMetric];
    var verdict = el('day-verdict');
    if (!day.ms && day.state === 'none'){
      verdict.textContent = 'Nothing logged on this day.';
      verdict.dataset.state = 'none';
    } else if (day.state === 'soon'){
      verdict.textContent = fmtDur(day.ms) + ' of ' + metric.label + ' so far. The day is still going, so there is no verdict yet.';
      verdict.dataset.state = 'soon';
    } else if (band){
      var range = metric.range(band);
      var low = range[0] * 60000;
      verdict.textContent = day.ms >= low
        ? fmtDur(day.ms) + ' of ' + metric.label + ' — at or above the usual ' + roundRange(range) + ' at ' + band.label + '.'
        : fmtDur(day.ms) + ' of ' + metric.label + ' — ' + fmtDur(low - day.ms) + ' below the usual ' + roundRange(range) + ' at ' + band.label + '.';
      verdict.dataset.state = day.state;
    } else {
      verdict.textContent = fmtDur(day.ms) + ' of ' + metric.label + ' logged.';
      verdict.dataset.state = 'plain';
    }

    var marks = markersOn(key);
    el('day-markers').innerHTML = marks.map(function(m){
      return '<span class="day-mark">' + escapeHtml(markerText(m)) + '</span>';
    }).join('');
    el('day-markers').hidden = !marks.length;

    var sleeps = state.entries.filter(function(e){ return sleepDayKey(e) === key; })
      .sort(function(a, b){ return entryStart(a) - entryStart(b); });
    var nights = sleeps.filter(isNight).length;
    el('day-detail-table').innerHTML =
      '<tbody>' +
      '<tr><td>Night</td><td>' + (totals.night ? fmtDur(totals.night) : '—') +
        (nights > 1 ? ' <span class="norm-days">' + plural(nights - 1, 'waking') + '</span>' : '') + '</td></tr>' +
      '<tr><td>Naps</td><td>' + (totals.naps ? fmtDur(totals.naps) + ' <span class="norm-days">' + plural(sleeps.length - nights, 'nap') + '</span>' : '—') + '</td></tr>' +
      '<tr><td>Total in 24h</td><td>' + ((totals.night + totals.naps) ? fmtDur(totals.night + totals.naps) : '—') + '</td></tr>' +
      '<tr><td>Feeds</td><td>' + (totals.feeds || '—') + '</td></tr>' +
      '<tr><td>Meals</td><td>' + (totals.meals || '—') + '</td></tr>' +
      '</tbody>';

    el('day-sleeps').innerHTML = sleeps.length
      ? sleeps.map(function(e){
          return '<div class="entry-row">' +
            '<div class="entry-main">' +
              '<span class="entry-range">' + fmtTime(entryStart(e)) + '&nbsp;&ndash;&nbsp;' + fmtTime(entryEnd(e)) + '</span>' +
              sleepMetaHtml(e) + noteLines(e) +
            '</div>' +
            '<div class="entry-side"><span class="entry-dur">' + fmtDur(entryEnd(e) - entryStart(e)) + '</span></div>' +
          '</div>';
        }).join('')
      : '<p class="form-hint">No sleep written down for this day.</p>';

    // Night sleep counts towards the evening it started, so the list can hold
    // a resettle from the small hours of the next morning. Saying so stops it
    // reading as a mistake.
    el('day-sleeps-note').hidden = !nights;
    el('day-sleeps-note').textContent = 'The night that started this evening counts here, including any resettling after midnight.';

    openOverlay('day-overlay');
    el('day-close').focus();
  }
  function closeDay(){ closeOverlay('day-overlay'); }
  el('day-close').addEventListener('click', closeDay);
  el('day-overlay').addEventListener('click', function(ev){ if (ev.target === el('day-overlay')) closeDay(); });
  el('day-open-log').addEventListener('click', function(){
    var key = openDayKey;
    closeDay();
    goTo('sleep');
    // The log groups by the date written on each sleep, so this lands on the
    // day you tapped even where the night above belongs to the evening before.
    var node = document.querySelector('#log-list .day-group[data-day="' + key + '"]');
    if (!node){ showToast('Nothing logged on ' + friendlyDate(key)); return; }
    node.scrollIntoView({ block: 'center' });
    node.classList.add('is-found');
    setTimeout(function(){ node.classList.remove('is-found'); }, 1800);
  });

  function csvCell(value){
    var s = value == null ? '' : String(value);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function buildCsv(days){
    var cutoff = null;
    if (days > 0){
      var d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - (days - 1));
      cutoff = dateKey(d);
    }
    var rows = [['Type', 'Date', 'Start', 'End', 'Duration (min)', 'Night', 'Minutes to settle', 'Feed', 'Amount (ml)', 'Foods', 'Settling notes', 'Waking notes', 'Notes', 'Logged by']];

    state.entries.forEach(function(e){
      if (cutoff && e.date < cutoff) return;
      var settle = settleMinutes(e);
      rows.push(['Sleep', e.date, e.start, e.end,
        Math.round((entryEnd(e) - entryStart(e)) / 60000),
        isNight(e) ? 'yes' : 'no',
        settle === null ? '' : settle,
        '', '', '', e.settleNotes || '', e.wakeNotes || '', '', personName(e)]);
    });
    state.feeds.forEach(function(f){
      if (cutoff && f.date < cutoff) return;
      rows.push(['Milk', f.date, f.time, '', '', '', '',
        f.kind === 'bottle' ? 'bottle' : 'breast',
        f.amountMl == null ? '' : Math.round(f.amountMl),
        '', '', '', f.notes || '', personName(f)]);
    });
    state.solids.forEach(function(s){
      if (cutoff && s.date < cutoff) return;
      rows.push(['Solids', s.date, s.time, '', '', '', '', '', '', (s.foods || []).join('; '), '', '', s.notes || '', personName(s)]);
    });
    if (FEATURES.medicine){
      state.meds.forEach(function(m){
        if (cutoff && m.date < cutoff) return;
        rows.push(['Medicine', m.date, m.time, '', '', '', '', m.name || '', medDoseMl(m) == null ? '' : medDoseMl(m), '', '', '', m.notes || '', personName(m)]);
      });
    }

    var header = rows.shift();
    rows.sort(function(a, b){
      var ka = a[1] + ' ' + a[2], kb = b[1] + ' ' + b[2];
      return ka < kb ? -1 : ka > kb ? 1 : 0;
    });
    rows.unshift(header);
    return rows.map(function(r){ return r.map(csvCell).join(','); }).join('\r\n');
  }

  function downloadCsv(){
    var days = Number(el('export-range').value);
    var csv = buildCsv(days);
    // The BOM makes Excel open it as UTF-8 so notes keep their characters.
    var blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'cilly-log-' + dateKey(new Date()) + (days > 0 ? '-last-' + days + '-days' : '-all') + '.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function(){ URL.revokeObjectURL(url); }, 1000);
  }

  el('csv-btn').addEventListener('click', downloadCsv);
  el('print-btn').addEventListener('click', function(){ window.print(); });

  // ======================================================
  // SLEEP CONSULTANT LOG
  // ======================================================
  // A sleep consultant wants the days written out, not a spreadsheet: one line
  // per event, in order, saying what happened, what you did and how he was.
  // The notes fields are what carry "what you did" and "demeanour", so a sleep
  // logged without them comes out as bare times - which is worth seeing.
  var reportDays = 3;

  function reportLines(e, kind){
    var parts = [];
    if (kind === 'sleep'){
      var night = isNight(e);
      var mins = settleMinutes(e);
      parts.push((night ? 'Night sleep' : 'Nap') + ', ' + fmtDur(entryEnd(e) - entryStart(e)) + '.');
      if (e.putDown){
        parts.push('Into the cot at ' + fmtClock(minutesOf(e.putDown)) +
          (mins === null ? '.' : mins === 0 ? ', asleep straight away.' : ', asleep after ' + mins + ' minutes.'));
      }
      if (e.settleNotes) parts.push('Settling: ' + e.settleNotes);
      if (e.wakeNotes) parts.push('On waking: ' + e.wakeNotes);
    } else if (kind === 'milk'){
      parts.push(e.kind === 'bottle'
        ? 'Bottle' + (e.amountMl == null ? '.' : ', ' + fmtAmount(e) + '.')
        : 'Breast feed.');
      if (e.notes) parts.push(e.notes);
    } else if (kind === 'solids'){
      parts.push('Solids: ' + ((e.foods || []).join(', ') || 'not listed') + '.');
      if (e.notes) parts.push(e.notes);
    } else if (kind === 'meds'){
      parts.push(medTitle(e) + '.');
      if (e.notes) parts.push(e.notes);
    }
    return parts.join(' ');
  }

  // Every event in the window, oldest first, so the log reads as a diary.
  function reportEvents(days){
    var cutoff = new Date();
    cutoff.setHours(0, 0, 0, 0);
    cutoff.setDate(cutoff.getDate() - (days - 1));
    var out = [];
    state.entries.forEach(function(e){
      var at = entryStart(e);
      if (at >= cutoff) out.push({ at: at, kind: 'sleep', night: isNight(e), ms: entryEnd(e) - at,
        when: fmtTime(at) + ' – ' + fmtTime(entryEnd(e)), text: reportLines(e, 'sleep') });
    });
    state.feeds.forEach(function(f){
      var at = atDate(f);
      if (at >= cutoff) out.push({ at: at, kind: 'milk', when: fmtTime(at), text: reportLines(f, 'milk') });
    });
    state.solids.forEach(function(s){
      var at = atDate(s);
      if (at >= cutoff) out.push({ at: at, kind: 'solids', when: fmtTime(at), text: reportLines(s, 'solids') });
    });
    if (FEATURES.medicine){
      state.meds.forEach(function(m){
        var at = atDate(m);
        if (at >= cutoff) out.push({ at: at, kind: 'meds', when: fmtTime(at), text: reportLines(m, 'meds') });
      });
    }
    // Anything marked about a day opens that day. Still one event a row and
    // two columns, but with no clock: "he was teething" is a day, not a
    // moment, and it is the first thing the consultant asks about a bad week.
    (state.markers || []).forEach(function(m){
      var to = m.to || m.from;
      for (var key = m.from; key <= to; key = nextDayKey(key)){
        var at = new Date(key + 'T00:00:00');
        if (at < cutoff || at > new Date()) continue;
        out.push({ at: at, kind: 'marker', when: 'All day', text: markerText(m) });
      }
    });
    return out.sort(function(a, b){ return a.at - b.at; });
  }

  // Two columns and nothing else, which is the shape the consultant keeps the
  // log in: every row is one event, the date and time on the left, what
  // happened on the right. The page and the Word file are built from this same
  // list, so they cannot drift apart.
  var REPORT_TITLE = 'Sleep and feeding log';
  function reportRows(days){
    return reportEvents(days).map(function(ev){
      var date = ev.at.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
      return [date + '\n' + ev.when, ev.text];
    });
  }
  function reportSubtitle(days){
    var first = new Date();
    first.setDate(first.getDate() - (days - 1));
    return first.toLocaleDateString(undefined, { day: 'numeric', month: 'long' }) +
      ' to ' + new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }) +
      ', ' + plural(days, 'day') + '.';
  }
  var REPORT_TAIL = [
    { text: 'Questions, concerns and observations', bold: true },
    { text: 'Add anything you want to raise on the call here.' }
  ];

  function buildReportHtml(days){
    var rows = reportRows(days).map(function(r){
      return '<tr><td class="report-when">' + escapeHtml(r[0]).replace(/\n/g, '<br>') + '</td>' +
        '<td>' + escapeHtml(r[1]) + '</td></tr>';
    }).join('');
    if (!rows) rows = '<tr><td class="report-when">—</td><td>Nothing logged in this period.</td></tr>';
    return '<h2 class="report-title">' + REPORT_TITLE + '</h2>' +
      '<p class="report-range">' + escapeHtml(reportSubtitle(days)) + '</p>' +
      '<table class="report-table"><thead><tr><th>Time and date</th><th>What happened</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table>' +
      '<h3 class="report-title">' + REPORT_TAIL[0].text + '</h3>' +
      '<p class="report-range">' + REPORT_TAIL[1].text + '</p>';
  }

  function renderReport(){
    Array.prototype.forEach.call(el('report-range').querySelectorAll('.unit-btn'), function(btn){
      btn.setAttribute('aria-pressed', Number(btn.dataset.days) === reportDays ? 'true' : 'false');
    });
    el('report-body').innerHTML = buildReportHtml(reportDays);
    var cutoff = new Date();
    cutoff.setHours(0, 0, 0, 0);
    cutoff.setDate(cutoff.getDate() - (reportDays - 1));
    var missing = state.entries.filter(function(e){
      return entryStart(e) >= cutoff && !e.settleNotes && !e.wakeNotes;
    }).length;
    el('report-hint').textContent = missing
      ? plural(missing, 'sleep') + ' in this stretch ' + (missing === 1 ? 'has' : 'have') +
        ' no settling or waking note, so those lines are times only. The notes are what tell the ' +
        'consultant what you did and how he was.'
      : 'Every sleep in this stretch has notes on it.';
  }

  el('report-btn').addEventListener('click', function(){ goTo('report'); renderReport(); });
  el('report-range').addEventListener('click', function(ev){
    var btn = ev.target.closest('.unit-btn');
    if (!btn) return;
    reportDays = Number(btn.dataset.days);
    renderReport();
  });
  el('report-print').addEventListener('click', function(){ window.print(); });
  el('report-docx').addEventListener('click', function(){
    try {
      var bytes = window.CillyDocx.build({
        title: REPORT_TITLE,
        subtitle: reportSubtitle(reportDays),
        header: ['Time and date', 'What happened'],
        rows: reportRows(reportDays),
        tail: REPORT_TAIL
      });
      var blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'cilly-log-' + dateKey(new Date()) + '.docx';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function(){ URL.revokeObjectURL(url); }, 1000);
      showToast('Saved as a Word document.');
    } catch (err) {
      showToast('Could not build the document. Use Print or save as PDF instead.');
    }
  });
  el('report-copy').addEventListener('click', async function(){
    var html = el('report-body').innerHTML;
    var text = el('report-body').innerText;
    try {
      // Rich copy keeps the table when it is pasted into a document; the
      // plain version is there for anything that cannot take HTML.
      await navigator.clipboard.write([new window.ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([text], { type: 'text/plain' })
      })]);
      showToast('Copied. Paste it into the document or an email.');
    } catch (err) {
      try {
        await navigator.clipboard.writeText(text);
        showToast('Copied as plain text.');
      } catch (e2) {
        showToast('Copying is blocked here. Use Print or save as PDF instead.');
      }
    }
  });

  // ======================================================
  // SLEEP
  // ======================================================
  function renderSleep(){
    var card = el('status-card');
    var asleep = state.status.asleep;
    card.dataset.asleep = asleep ? 'true' : 'false';
    el('status-label').textContent = asleep ? 'Asleep' : 'Awake';
    var timerEl = el('status-timer');
    if (asleep){
      el('status-sub').textContent = 'since ' + fmtTime(new Date(state.status.since));
      timerEl.hidden = false;
      startTicking();
    } else {
      el('status-sub').textContent = readOnly ? 'Not asleep right now' : 'Tap when they fall asleep';
      timerEl.hidden = true;
      startTicking();
    }

    var noteEl = el('status-note');
    var liveNote = asleep ? (state.status.settleNotes || '') : '';
    noteEl.textContent = liveNote;
    noteEl.hidden = !liveNote;
    el('status-edit').hidden = !asleep;

    renderSleepStats();
    renderWakeCard();
    renderSleepLog();
    renderSleepTrend();
    renderSettleTrend();
  }

  function renderSleepStats(){
    var todayKey = dateKey(new Date());
    var y = new Date(); y.setDate(y.getDate() - 1); var yKey = dateKey(y);
    var napMs = 0, napCount = 0, nights = {};
    state.entries.forEach(function(e){
      var dur = entryEnd(e) - entryStart(e);
      if (isNight(e)){ var k = nightKey(e); (nights[k] = nights[k] || []).push(dur); }
      else if (e.date === todayKey){ napMs += dur; napCount++; }
    });
    el('stat-total').textContent = fmtDur(napMs);
    el('stat-total-label').textContent = napCount ? plural(napCount, 'nap') + ' today' : 'Naps today';
    var keys = Object.keys(nights).filter(function(k){ return k <= todayKey; }).sort();
    var latest = keys[keys.length - 1];
    if (latest){
      var list = nights[latest];
      var total = list.reduce(function(s, d){ return s + d; }, 0);
      var wakings = list.length - 1;
      el('stat-night').textContent = fmtDur(total);
      el('stat-night-label').textContent = (latest === todayKey ? 'Tonight so far' : latest === yKey ? 'Last night' : friendlyDate(latest)) + ' · ' + (wakings ? plural(wakings, 'waking') : 'no wakings');
    } else {
      el('stat-night').textContent = '—';
      el('stat-night-label').textContent = 'Last night';
    }
  }

  // How long a night waking runs before the app offers possible reasons.
  var SPLIT_NIGHT_MS = 45 * 60000;

  function renderWakeCard(){
    var card = el('wake-card');
    var last = lastWakeDate();
    if (!last){ card.hidden = true; return; }
    card.hidden = false;
    var now = new Date(), awake = Math.max(0, now - last);
    el('wake-timer').textContent = fmtDur(awake);
    el('wake-since').textContent = 'since ' + fmtTime(last);

    var win = sleepWindow();
    var labelEl = el('wake-window-label'), winEl = el('wake-window');
    var stEl = el('wake-state'), foot = el('wake-foot'), hint = el('wake-hint');
    hint.hidden = true;
    card.dataset.mode = win ? win.kind : 'none';

    if (!win){
      labelEl.textContent = 'Usual nap window';
      winEl.textContent = '—';
      stEl.textContent = 'Add a date of birth in Settings';
      stEl.dataset.state = 'none';
      foot.textContent = '';
      return;
    }

    // At night there is no window to count down to: they should go back down.
    if (win.kind === 'night'){
      var band = win.band, night = nightSoFar();
      var usualNight = fmtDur(band.nightSleep[0] * 60000) + '–' + fmtDur(band.nightSleep[1] * 60000);
      labelEl.textContent = 'Night so far';
      stEl.dataset.state = 'night';
      if (night.ms){
        winEl.textContent = fmtDur(night.ms);
        stEl.textContent = 'usually ' + usualNight + (night.wakings ? ' · ' + plural(night.wakings, 'waking') : '');
        foot.textContent = 'Settle them back when you can, lights low and as little fuss as possible. ' +
          'Wake windows are a daytime guide, so the app starts counting one again at ' + fmtClock(nightBounds().end) + '.';
        if (awake >= SPLIT_NIGHT_MS) renderSplitHint(win, night);
      } else {
        // Night hours, but they have not gone down yet: this is bedtime running
        // late, not a waking, so the reasons below would be the wrong ones.
        winEl.textContent = '—';
        stEl.textContent = 'not down yet';
        var bed = bedtimeRange(band);
        foot.textContent = (bed ? 'Bedtime is ' + fmtRange(bed[0], bed[1]) + ', ' + bedtimeSource() + '. ' : '') +
          'Night sleep at this age usually runs ' + usualNight + '.';
      }
      return;
    }

    labelEl.textContent = win.label;
    winEl.textContent = fmtTime(win.open) + ' – ' + fmtTime(win.close);
    if (now < win.open){ stEl.textContent = 'opens in ' + fmtDur(win.open - now); stEl.dataset.state = 'soon'; }
    else if (now <= win.close){ stEl.textContent = 'open now'; stEl.dataset.state = 'open'; }
    else { stEl.textContent = 'past the usual window'; stEl.dataset.state = 'past'; }

    var note = '';
    if (win.kind === 'bed' && win.bedRange){
      var usual = fmtRange(win.bedRange[0], win.bedRange[1]);
      if (win.shift === 'late'){
        note = 'Later than the usual ' + usual +
          (win.naps.lastEnd ? ', because the last nap ended at ' + fmtTime(win.naps.lastEnd) : '') + '. ';
      } else if (win.shift === 'early'){
        note = 'Earlier than the usual ' + usual + ', after a long stretch awake. ';
      } else {
        note = 'Bedtime is ' + usual + ', ' + bedtimeSource() + '. ';
      }
    } else if (win.trimmedAt){
      note = 'Ends at ' + fmtTime(win.trimmedAt) + ', when night sleep starts. ';
    }
    var gapRange = fmtDur(win.gap[0] * 60000) + '–' + fmtDur(win.gap[1] * 60000);
    foot.textContent = note
      ? note + 'Usual gap ' + POSITION_WORDS[win.position] + ': ' + gapRange + '. A guide, not a rule.'
      : 'The gap ' + POSITION_WORDS[win.position] + ' at ' + win.band.label + ' is usually ' + gapRange + '. A guide, not a rule.';
  }

  // A long night waking usually has a daytime cause. Rather than guess, show
  // what was actually logged for the day this night belongs to.
  function renderSplitHint(win, night){
    var hint = el('wake-hint'), band = win.band;
    var naps = napsOn(night.key), facts = [];
    if (naps.ms){
      var over = naps.ms > band.daySleep[1] * 60000;
      facts.push(plural(naps.count, 'nap') + ' totalling ' + fmtDur(naps.ms) +
        (over ? ' (usually ' + fmtDur(band.daySleep[0] * 60000) + '–' + fmtDur(band.daySleep[1] * 60000) + ')' : ''));
    }
    if (naps.lastEnd) facts.push('last nap ended at ' + fmtTime(naps.lastEnd));
    if (night.start) facts.push('down for the night at ' + fmtTime(night.start));
    hint.textContent = 'A long night waking often follows too much day sleep, ' +
      'a late last nap, or a bedtime that did not fit.' +
      (facts.length ? ' ' + friendlyDate(night.key) + ': ' + facts.join(', ') + '.' : '');
    hint.hidden = false;
  }

  function sleepRowHtml(e){
    return '<div class="entry-row">' +
      '<div class="entry-main">' +
        '<span class="entry-range">' + fmtTime(entryStart(e)) + '&nbsp;&ndash;&nbsp;' + fmtTime(entryEnd(e)) + '</span>' +
        sleepMetaHtml(e) +
        noteLines(e) +
      '</div>' +
      '<div class="entry-side">' +
        '<span class="entry-dur">' + fmtDur(entryEnd(e) - entryStart(e)) + '</span>' +
        '<button class="icon-btn writer-only" data-edit="sleep" data-id="' + e.id + '" aria-label="Edit session" type="button">' + ICON.pencil + '</button>' +
      '</div>' +
    '</div>';
  }

  function renderSleepLog(){
    var groups = groupByDay(state.entries, function(e){ return entryStart(e).getTime(); });
    renderDayGroups(
      el('log-list'), groups, sleepRowHtml,
      function(items){ return fmtDur(items.reduce(function(s, e){ return s + (entryEnd(e) - entryStart(e)); }, 0)); },
      '<span class="empty-icon">&#127772;</span><p>No sleep logged yet.<br>Press the button above when your little one drifts off, or log one manually.</p>'
    );
  }

  var CHART_DAYS = 14;
  var CHART_VB_W = 336, CHART_VB_H = 132;
  var CHART_MARGIN = { top: 14, right: 4, bottom: 16, left: 28 };
  var chartActiveBar = null;

  function niceCeilHours(maxMinutes){
    var maxHours = maxMinutes / 60;
    var steps = [0.5, 1, 1.5, 2, 3, 4, 6, 8, 10, 12, 16, 20, 24];
    for (var i = 0; i < steps.length; i++){ if (steps[i] >= maxHours) return steps[i]; }
    return Math.ceil(maxHours);
  }

  function roundedTopRectPath(x, y, w, h, r){
    r = Math.max(0, Math.min(r, w / 2, h));
    return 'M' + x + ',' + (y + h) +
      ' L' + x + ',' + (y + r) +
      ' Q' + x + ',' + y + ' ' + (x + r) + ',' + y +
      ' L' + (x + w - r) + ',' + y +
      ' Q' + (x + w) + ',' + y + ' ' + (x + w) + ',' + (y + r) +
      ' L' + (x + w) + ',' + (y + h) +
      ' Z';
  }

  function hideChartTooltip(){
    if (chartActiveBar) chartActiveBar.classList.remove('is-active');
    chartActiveBar = null;
    Array.prototype.forEach.call(document.querySelectorAll('.chart-tooltip.visible'), function(t){ t.classList.remove('visible'); });
  }

  function chartDays(){
    var days = [];
    var now = new Date();
    for (var i = CHART_DAYS - 1; i >= 0; i--){
      var d = new Date(now); d.setDate(d.getDate() - i); d.setHours(0, 0, 0, 0);
      days.push({ key: dateKey(d), date: d });
    }
    return days;
  }
  function dayLabel(d, todayKey){
    return d.key === todayKey ? 'Today' : d.date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  }
  function rectPath(x, y, w, h){ return 'M' + x + ',' + y + ' h' + w + ' v' + h + ' h' + (-w) + ' Z'; }

  function renderBars(wrapId, cfg){
    var wrap = el(wrapId);
    var days = cfg.days;
    var totals = days.map(function(d){ return d.segments.reduce(function(s, x){ return s + (x.minutes || 0); }, 0); });
    if (!totals.some(function(t){ return t > 0; })){
      wrap.innerHTML = '<div class="chart-empty">' + cfg.empty + '</div>';
      return;
    }
    var yMax = cfg.niceMax(Math.max.apply(null, totals));
    var plotW = CHART_VB_W - CHART_MARGIN.left - CHART_MARGIN.right;
    var plotH = CHART_VB_H - CHART_MARGIN.top - CHART_MARGIN.bottom;
    var n = days.length, gap = 4;
    var barW = (plotW - gap * (n - 1)) / n;
    var todayKey = dateKey(new Date());
    var parts = [];
    [0, 0.5, 1].forEach(function(frac){
      var y = CHART_MARGIN.top + plotH * (1 - frac);
      parts.push('<line class="chart-gridline" x1="' + CHART_MARGIN.left + '" x2="' + (CHART_MARGIN.left + plotW) + '" y1="' + y + '" y2="' + y + '"></line>');
      parts.push('<text class="chart-axis-label" x="' + (CHART_MARGIN.left - 5) + '" y="' + (y + 2.5) + '" text-anchor="end">' + cfg.yLabel(yMax * frac) + '</text>');
    });
    days.forEach(function(d, i){
      var x = CHART_MARGIN.left + i * (barW + gap);
      var segs = d.segments.filter(function(s){ return s.minutes > 0; });
      var inner = '';
      if (!segs.length){
        inner = '<path class="chart-bar is-zero" d="' + rectPath(x, CHART_MARGIN.top + plotH - 1.5, barW, 1.5) + '"></path>';
      } else {
        var yCursor = CHART_MARGIN.top + plotH;
        segs.forEach(function(s, si){
          var h = Math.max(3, (s.minutes / yMax) * plotH);
          var segGap = si === 0 ? 0 : 2;
          var yTop = yCursor - segGap - h;
          var isTop = si === segs.length - 1;
          inner += '<path class="' + s.cls + '" d="' + (isTop ? roundedTopRectPath(x, yTop, barW, h, Math.min(4, barW / 2, h / 2)) : rectPath(x, yTop, barW, h)) + '"></path>';
          yCursor = yTop;
        });
      }
      parts.push('<g class="chart-bar-group" data-i="' + i + '">' + inner + '</g>');
      var dow = d.date.toLocaleDateString(undefined, { weekday: 'narrow' });
      parts.push('<text class="chart-day-label' + (d.key === todayKey ? ' is-today' : '') + '" x="' + (x + barW / 2) + '" y="' + (CHART_VB_H - 4) + '" text-anchor="middle">' + dow + '</text>');
    });
    wrap.innerHTML =
      '<svg class="chart-svg" viewBox="0 0 ' + CHART_VB_W + ' ' + CHART_VB_H + '" role="img" aria-label="' + cfg.label + '">' + parts.join('') + '</svg>' +
      '<div class="chart-tooltip"></div>';
    var tooltip = wrap.querySelector('.chart-tooltip');
    function showTip(group, d){
      hideChartTooltip();
      chartActiveBar = group;
      group.classList.add('is-active');
      tooltip.textContent = d.tip;
      var r = group.getBoundingClientRect(), w = wrap.getBoundingClientRect();
      tooltip.style.left = (r.left - w.left + r.width / 2) + 'px';
      tooltip.style.top = (r.top - w.top - 6) + 'px';
      tooltip.classList.add('visible');
    }
    Array.prototype.forEach.call(wrap.querySelectorAll('.chart-bar-group'), function(group){
      var i = Number(group.getAttribute('data-i'));
      group.addEventListener('mouseenter', function(){ showTip(group, days[i]); });
      group.addEventListener('mouseleave', hideChartTooltip);
      group.addEventListener('click', function(ev){
        ev.stopPropagation();
        if (chartActiveBar === group) hideChartTooltip(); else showTip(group, days[i]);
      });
    });
  }

  function renderSleepTrend(){
    var days = chartDays(), byKey = {}, todayKey = dateKey(new Date());
    days.forEach(function(d){ d.night = 0; d.nap = 0; byKey[d.key] = d; });
    state.entries.forEach(function(e){
      var min = (entryEnd(e) - entryStart(e)) / 60000;
      var night = isNight(e);
      var d = night ? byKey[nightKey(e)] : byKey[e.date];
      if (!d) return;
      if (night) d.night += min; else d.nap += min;
    });
    renderBars('chart-wrap', {
      label: 'Night and nap sleep per day, last 14 days',
      days: days.map(function(d){
        return { key: d.key, date: d.date,
          segments: [{ minutes: d.night, cls: 'chart-seg-night' }, { minutes: d.nap, cls: 'chart-seg-nap' }],
          tip: dayLabel(d, todayKey) + ' · Night ' + fmtDur(d.night * 60000) + ' · Naps ' + fmtDur(d.nap * 60000) };
      }),
      niceMax: function(m){ return niceCeilHours(m) * 60; },
      yLabel: function(m){ return (Math.round(m / 6) / 10) + 'h'; },
      empty: 'Log a few sleeps to see your trend here.'
    });
  }

  function renderSettleTrend(){
    var days = chartDays(), byKey = {}, todayKey = dateKey(new Date());
    var total = settleView() === 'total';
    days.forEach(function(d){ d.sum = 0; d.count = 0; byKey[d.key] = d; });
    state.entries.forEach(function(e){
      var s = settleMinutes(e); var d = byKey[e.date];
      if (s === null || !d) return;
      d.sum += s; d.count++;
    });
    el('settle-range').textContent = (total ? 'Daily total' : 'Daily average') + ', last 14 days';
    renderBars('settle-wrap', {
      label: (total ? 'Total' : 'Average') + ' minutes to settle per day, last 14 days',
      days: days.map(function(d){
        var value = d.count ? (total ? d.sum : d.sum / d.count) : 0;
        return { key: d.key, date: d.date,
          segments: [{ minutes: value, cls: 'chart-seg-night' }],
          tip: dayLabel(d, todayKey) + ' · ' + (d.count
            ? (total
              ? Math.round(value) + 'm settling across ' + plural(d.count, 'sleep')
              : Math.round(value) + 'm to settle on average (' + plural(d.count, 'sleep') + ')')
            : 'No put-down times logged') };
      }),
      niceMax: function(m){ var steps = [5, 10, 15, 20, 30, 45, 60, 90, 120, 180, 240, 360]; for (var i = 0; i < steps.length; i++){ if (steps[i] >= m) return steps[i]; } return Math.ceil(m); },
      yLabel: function(m){ return Math.round(m) + 'm'; },
      empty: 'Add a “put down at” time to a sleep to start tracking settling.'
    });
  }

  function startTicking(){
    if (tickInt) return;
    tick();
    tickInt = setInterval(tick, 15000);
  }
  // ---------- appearance ----------
  // Both palettes have always been there; what was missing was a say in which
  // one. Nothing chosen means the app follows the phone, as it always did.
  // The choice belongs to the person, not the family: it is stored on their
  // account so it follows them to another phone, and cached on this device so
  // the right palette is painted before the database has answered - see the
  // script at the top of index.html.
  var THEME_KEY = 'cilly.theme';
  function themeChoice(){
    var t = (state.prefs || {}).theme;
    return t === 'light' || t === 'dark' ? t : 'system';
  }
  function applyTheme(){
    var choice = themeChoice();
    if (choice === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', choice);
    try { window.localStorage.setItem(THEME_KEY, choice); } catch (e) {}
  }
  // Start from the cached choice rather than the empty state, or the first
  // render would undo what the script in the head just did and flash the
  // phone's palette until the database answered.
  (function(){
    try {
      var cached = window.localStorage.getItem(THEME_KEY);
      if (cached === 'light' || cached === 'dark') state.prefs.theme = cached;
    } catch (e) {}
  })();
  applyTheme();

  // ---------- night mode ----------
  // Once it is switched on in Settings, the app dims between the night times
  // and the Sleep page drops to the toggle and the card: everything else is
  // noise when you are standing in the dark holding a baby. "Show the rest"
  // brings it back for this visit.
  var nightExpanded = false;
  function applyNightMode(){
    var night = nightModeOn() && clockIsNight(new Date());
    document.body.dataset.night = night ? 'true' : 'false';
    document.body.dataset.nightSimple = (night && !nightExpanded) ? 'true' : 'false';
    var btn = el('night-toggle');
    btn.hidden = !night;
    btn.textContent = nightExpanded ? 'Hide the rest' : 'Show the rest';
  }
  el('night-toggle').addEventListener('click', function(){
    nightExpanded = !nightExpanded;
    applyNightMode();
  });

  function tick(){
    if (state.status.asleep) el('status-timer').textContent = fmtDur(Date.now() - new Date(state.status.since).getTime());
    applyNightMode();
    renderWakeCard();
    renderHomeSleepSub();
  }

  var formMode = 'entry';

  // The nudge: the hint shows only while the field is empty, and never stops
  // the form being saved without one.
  function renderPutDownHint(){
    el('f-putdown-hint').hidden = !!el('f-putdown').value;
  }

  function applyMode(){
    var isStart = formMode === 'start';
    var isWake = formMode === 'wake';
    el('field-date').hidden = isStart;
    el('field-end').hidden = isStart;
    el('field-wake').hidden = isStart;
    el('chips-start').hidden = !isStart;
    el('chips-end').hidden = !isWake;
    el('chips-putdown').hidden = !(isStart || isWake);
    renderPutDownHint();

    var danger = el('f-danger');
    var cancel = el('f-cancel');
    if (isStart){
      danger.hidden = false;
      danger.textContent = 'Cancel sleep';
      cancel.hidden = false;
      el('f-submit').textContent = 'Save';
    } else if (isWake){
      danger.hidden = false;
      danger.textContent = 'Discard';
      cancel.hidden = false;
      el('f-submit').textContent = 'Save session';
    } else {
      danger.hidden = !el('entry-id').value;
      danger.textContent = 'Delete';
      cancel.hidden = false;
      el('f-submit').textContent = 'Save';
    }
  }

  function openPanel(){
    hideError('form-error');
    openOverlay('entry-overlay');
    snapshotForm('entry-form');
  }

  function openStartForm(editing){
    formMode = 'start';
    var since = new Date(state.status.since);
    el('form-title').textContent = editing ? 'This sleep' : 'Just went down';
    el('entry-id').value = '';
    el('f-date').value = dateKey(since);
    el('f-putdown').value = state.status.putDown || '';
    el('f-start').value = timeValue(since);
    el('f-end').value = '';
    el('f-settle').value = state.status.settleNotes || '';
    el('f-wake').value = '';
    applyMode();
    openPanel();
  }

  function openWakeForm(){
    formMode = 'wake';
    var since = new Date(state.status.since);
    el('form-title').textContent = 'Just woke up';
    el('entry-id').value = '';
    el('f-date').value = dateKey(since);
    el('f-putdown').value = state.status.putDown || '';
    el('f-start').value = timeValue(since);
    el('f-end').value = timeValue(new Date());
    el('f-settle').value = state.status.settleNotes || '';
    el('f-wake').value = '';
    applyMode();
    openPanel();
  }

  function openForm(id){
    formMode = 'entry';
    var e = id ? state.entries.find(function(x){ return x.id === id; }) : null;
    if (e){
      el('form-title').textContent = 'Edit sleep session';
      el('entry-id').value = e.id;
      el('f-date').value = e.date;
      el('f-putdown').value = e.putDown || '';
      el('f-start').value = e.start;
      el('f-end').value = e.end;
      el('f-settle').value = e.settleNotes || e.notes || '';
      el('f-wake').value = e.wakeNotes || '';
    } else {
      el('form-title').textContent = 'Log a sleep session';
      el('entry-id').value = '';
      el('f-date').value = dateKey(new Date());
      el('f-putdown').value = '';
      el('f-start').value = '';
      el('f-end').value = '';
      el('f-settle').value = '';
      el('f-wake').value = '';
    }
    applyMode();
    openPanel();
  }

  function closeForm(){
    closeOverlay('entry-overlay');
    el('entry-form').reset();
    el('entry-id').value = '';
    hideError('form-error');
    formMode = 'entry';
    clearDraft('entry-form');
  }

  el('toggle-btn').addEventListener('click', async function(){
    if (readOnly) return;
    if (state.status.asleep){
      openWakeForm();
      return;
    }
    // Start tracking right away so the phone can go down; the form that opens
    // just adjusts the time and adds a note.
    var op = { type: 'status', status: { asleep: true, since: new Date().toISOString(), settleNotes: '', putDown: '' } };
    applyOps([op]);
    renderAll();
    openStartForm();
    await persist([op]);
  });

  el('status-edit').addEventListener('click', function(ev){
    ev.stopPropagation();
    if (readOnly || !state.status.asleep) return;
    openStartForm(true);
  });

  el('f-putdown').addEventListener('input', renderPutDownHint);
  el('add-btn').addEventListener('click', function(){ openForm(null); });
  el('f-cancel').addEventListener('click', closeForm);
  el('form-close').addEventListener('click', closeForm);

  el('entry-form').addEventListener('submit', async function(ev){
    ev.preventDefault();
    hideError('form-error');

    if (formMode === 'start'){
      if (!el('f-start').value){ showError('form-error', 'Enter the time they fell asleep.', 'f-start'); return; }
      var status = {
        asleep: true,
        since: timeToDateNear(el('f-start').value, new Date()).toISOString(),
        settleNotes: el('f-settle').value.trim(),
        putDown: el('f-putdown').value
      };
      guardPutDown(status.putDown, el('f-start').value, async function(){
        showToast('Asleep from ' + fmtTime(new Date(status.since)) + ' saved');
        closeForm();
        await commit([{ type: 'status', status: status }]);
      });
      return;
    }

    var date = el('f-date').value;
    var start = el('f-start').value;
    var end = el('f-end').value;
    if (!date){ showError('form-error', 'Pick the date this sleep started.', 'f-date'); return; }
    if (!start){ showError('form-error', 'Enter the time they fell asleep.', 'f-start'); return; }
    if (!end){ showError('form-error', 'Enter the time they woke up.', 'f-end'); return; }

    // A wake time earlier in the clock than the asleep time is read as the
    // next day, which is right for an overnight sleep but wrong for a typo.
    // Anything beyond 16 hours is the typo.
    var draft = { date: date, start: start, end: end };
    var length = entryEnd(draft) - entryStart(draft);
    if (length > 16 * 3600000){
      showError('form-error', 'Woke at must be after asleep at. That reads as ' + fmtDur(length) + ' of sleep.', 'f-end');
      return;
    }

    var entry = {
      id: el('entry-id').value || uid(),
      date: date,
      start: start,
      end: end,
      putDown: el('f-putdown').value,
      settleNotes: el('f-settle').value.trim(),
      wakeNotes: el('f-wake').value.trim()
    };
    var ops = [{ type: 'upsert', collection: 'entries', record: entry }];
    if (formMode === 'wake') ops.push({ type: 'status', status: { asleep: false, since: null, settleNotes: '' } });
    var editing = !!el('entry-id').value;
    guardPutDown(entry.putDown, entry.start, async function(){
      showToast(editing ? 'Sleep updated' : fmtDur(entryEnd(entry) - entryStart(entry)) + ' of sleep logged');
      closeForm();
      await commit(ops);
    });
  });

  el('f-danger').addEventListener('click', function(){
    if (formMode === 'entry'){
      var id = el('entry-id').value;
      if (!id){ closeForm(); return; }
      var e = state.entries.find(function(x){ return x.id === id; });
      askConfirm({
        title: 'Delete this sleep?',
        text: (e ? fmtTime(entryStart(e)) + ' to ' + fmtTime(entryEnd(e)) + ' on ' + friendlyDate(sleepDayKey(e)) +
          ', ' + fmtDur(entryEnd(e) - entryStart(e)) + '. ' : '') + 'It will be gone for both of you, and cannot be undone.',
        confirmLabel: 'Delete',
        onConfirm: async function(){
          showToast('Sleep deleted');
          closeForm();
          await commit([{ type: 'delete', collection: 'entries', id: id }]);
        }
      });
      return;
    }

    var asleepSince = state.status.since ? fmtTime(new Date(state.status.since)) : null;
    var starting = formMode === 'start';
    askConfirm({
      title: starting ? 'Cancel this sleep?' : 'Discard this sleep?',
      text: (asleepSince ? 'They went down at ' + asleepSince + '. ' : '') +
        'Nothing is logged, and the timer stops.',
      confirmLabel: starting ? 'Cancel sleep' : 'Discard',
      keepLabel: 'Keep tracking',
      onConfirm: async function(){
        showToast(starting ? 'Sleep cancelled' : 'Sleep discarded');
        closeForm();
        await commit([{ type: 'status', status: { asleep: false, since: null, settleNotes: '' } }]);
      }
    });
  });

  // ======================================================
  // MILK
  // ======================================================
  // Bottles are entered in whichever unit suits and always stored in
  // millilitres, so totals never depend on how they were typed.
  var ML_PER_OZ = 29.5735;
  var ML_CHIPS = [60, 90, 120, 150, 180, 210, 240];
  var OZ_CHIPS = [2, 3, 4, 5, 6, 7, 8];

  function milkUnit(){ return (state.settings || {}).milkUnit === 'oz' ? 'oz' : 'ml'; }
  function mlToUnit(ml, unit){
    if (ml == null) return '';
    return unit === 'oz' ? Math.round((ml / ML_PER_OZ) * 10) / 10 : Math.round(ml);
  }
  function unitToMl(value, unit){
    var n = Number(value);
    if (!(n > 0)) return null;
    return unit === 'oz' ? Math.round(n * ML_PER_OZ) : Math.round(n);
  }
  function fmtAmount(f){
    if (f.amountMl == null) return '';
    var unit = milkUnit();
    return unit === 'oz' ? mlToUnit(f.amountMl, 'oz') + ' fl oz' : Math.round(f.amountMl) + ' ml';
  }

  function renderUnitControls(){
    var unit = milkUnit();
    Array.prototype.forEach.call(el('m-unit').querySelectorAll('.unit-btn'), function(btn){
      btn.setAttribute('aria-pressed', btn.getAttribute('data-unit') === unit ? 'true' : 'false');
    });
    el('m-amount').placeholder = unit === 'oz' ? '4' : '120';
    el('m-amount-chips').innerHTML = (unit === 'oz' ? OZ_CHIPS : ML_CHIPS).map(function(v){
      return '<button type="button" class="chip" data-amount="' + v + '">' + v + (unit === 'oz' ? ' oz' : ' ml') + '</button>';
    }).join('');
  }

  function setBottleFields(){
    el('m-bottle-fields').hidden = !el('m-bottle').checked;
  }

  function resetMilkForm(){
    var now = new Date();
    el('m-id').value = '';
    el('m-date').value = dateKey(now);
    el('m-time').value = timeValue(now);
    el('m-bottle').checked = false;
    el('m-amount').value = '';
    el('m-notes').value = '';
    el('m-title').textContent = 'Log a feed';
    el('m-submit').textContent = 'Add feed';
    el('m-delete').hidden = true;
    setBottleFields();
    renderUnitControls();
    hideError('m-error');
    clearDraft('milk-form');
  }

  function openMilkForm(){
    resetMilkForm();
    openOverlay('milk-overlay');
    snapshotForm('milk-form');
  }
  function closeMilkForm(){
    closeOverlay('milk-overlay');
    resetMilkForm();
  }

  function editMilk(id, quiet){
    var f = state.feeds.find(function(x){ return x.id === id; });
    if (!f) return false;
    if (!quiet) goTo('milk');
    el('m-id').value = f.id;
    el('m-date').value = f.date;
    el('m-time').value = f.time;
    el('m-bottle').checked = f.kind === 'bottle';
    el('m-amount').value = f.amountMl == null ? '' : mlToUnit(f.amountMl, milkUnit());
    el('m-notes').value = f.notes || '';
    el('m-title').textContent = 'Edit feed';
    el('m-submit').textContent = 'Save';
    el('m-delete').hidden = false;
    setBottleFields();
    renderUnitControls();
    hideError('m-error');
    snapshotForm('milk-form');
    if (!quiet) openOverlay('milk-overlay');
    return true;
  }

  function feedTitle(f){
    if (f.kind === 'bottle') return f.amountMl == null ? 'Bottle feed' : fmtAmount(f);
    return 'Breast feed';
  }

  function milkRowHtml(f){
    return '<div class="entry-row">' +
      '<div class="entry-main">' +
        '<span class="entry-range">' + feedTitle(f) + '</span>' +
        metaHtml(f) +
        (f.notes ? '<span class="entry-notes">' + escapeHtml(f.notes) + '</span>' : '') +
      '</div>' +
      '<div class="entry-side">' +
        '<span class="entry-dur">' + fmtTime(atDate(f)) + '</span>' +
        '<button class="icon-btn writer-only" data-edit="milk" data-id="' + f.id + '" aria-label="Edit feed" type="button">' + ICON.pencil + '</button>' +
      '</div>' +
    '</div>';
  }

  function renderMilk(){
    var groups = groupByDay(state.feeds, function(f){ return atDate(f).getTime(); });
    renderDayGroups(
      el('milk-log'), groups, milkRowHtml,
      function(items){
        var ml = items.reduce(function(s, f){ return s + Number(f.amountMl || 0); }, 0);
        var bottles = items.filter(function(f){ return f.kind === 'bottle'; }).length;
        var label = plural(items.length, 'feed');
        if (bottles && ml > 0){
          var unit = milkUnit();
          label += ' · ' + (unit === 'oz' ? mlToUnit(ml, 'oz') + ' fl oz' : Math.round(ml) + ' ml') + ' in bottles';
        }
        return label;
      },
      '<span class="empty-icon">&#127868;</span><p>No feeds logged yet.<br>Add the first one above.</p>'
    );
    renderUnitControls();
  }

  el('m-bottle').addEventListener('change', function(){
    setBottleFields();
    if (el('m-bottle').checked) el('m-amount').focus();
    snapshotForm('milk-form');
  });

  el('m-unit').addEventListener('click', async function(ev){
    var btn = ev.target.closest('.unit-btn');
    if (!btn) return;
    var unit = btn.getAttribute('data-unit');
    if (unit === milkUnit()) return;
    // Keep whatever is typed meaning the same amount after the switch.
    var typed = el('m-amount').value;
    var asMl = unitToMl(typed, milkUnit());
    var settings = Object.assign({}, state.settings, { milkUnit: unit });
    await commit([{ type: 'settings', settings: settings }]);
    el('m-amount').value = asMl == null ? '' : mlToUnit(asMl, unit);
    renderUnitControls();
    snapshotForm('milk-form');
  });

  el('milk-form').addEventListener('submit', async function(ev){
    ev.preventDefault();
    hideError('m-error');
    var date = el('m-date').value;
    var time = el('m-time').value;
    var isBottle = el('m-bottle').checked;
    if (!date){ showError('m-error', 'Pick the date of this feed.', 'm-date'); return; }
    if (!time){ showError('m-error', 'Enter the time of this feed.', 'm-time'); return; }

    var amountMl = null;
    if (isBottle){
      var typed = el('m-amount').value.trim();
      if (typed){
        amountMl = unitToMl(typed, milkUnit());
        if (amountMl == null){ showError('m-error', 'Enter how much was in the bottle, or clear the amount.', 'm-amount'); return; }
      }
    }

    var feed = {
      id: el('m-id').value || uid(),
      date: date,
      time: time,
      kind: isBottle ? 'bottle' : 'breast',
      amountMl: amountMl,
      notes: el('m-notes').value.trim()
    };
    showToast(el('m-id').value ? 'Feed updated' : feedTitle(feed) + ' logged at ' + fmtTime(atDate(feed)));
    closeMilkForm();
    await commit([{ type: 'upsert', collection: 'feeds', record: feed }]);
  });

  el('milk-add-btn').addEventListener('click', function(){ if (!readOnly) openMilkForm(); });
  el('m-cancel').addEventListener('click', closeMilkForm);
  el('m-close').addEventListener('click', closeMilkForm);
  el('m-delete').addEventListener('click', function(){
    var id = el('m-id').value;
    if (!id){ closeMilkForm(); return; }
    var f = state.feeds.find(function(x){ return x.id === id; });
    askConfirm({
      title: 'Delete this feed?',
      text: (f ? feedTitle(f) + ' at ' + fmtTime(atDate(f)) + ' on ' + friendlyDate(f.date) + '. ' : '') +
        'It will be gone for both of you, and cannot be undone.',
      confirmLabel: 'Delete',
      onConfirm: async function(){
        showToast('Feed deleted');
        closeMilkForm();
        await commit([{ type: 'delete', collection: 'feeds', id: id }]);
      }
    });
  });

  // ======================================================
  // SOLIDS
  // ======================================================
  var solidDraftFoods = [];

  function knownFoods(){
    var seen = {}, out = [];
    state.solids.slice().sort(function(a, b){ return atDate(b) - atDate(a); }).forEach(function(s){
      (s.foods || []).forEach(function(f){
        var k = f.toLowerCase();
        if (!seen[k]){ seen[k] = true; out.push(f); }
      });
    });
    return out;
  }

  function addDraftFood(raw){
    var food = String(raw || '').trim().replace(/\s+/g, ' ');
    if (!food) return false;
    var exists = solidDraftFoods.some(function(f){ return f.toLowerCase() === food.toLowerCase(); });
    if (!exists) solidDraftFoods.push(food);
    renderFoodHelpers();
    snapshotForm('solid-form');
    return true;
  }

  function removeDraftFood(index){
    solidDraftFoods.splice(index, 1);
    renderFoodHelpers();
    snapshotForm('solid-form');
  }

  function renderFoodHelpers(){
    var known = knownFoods();
    el('s-tags').innerHTML = solidDraftFoods.map(function(f, i){
      return '<span class="tag"><span>' + escapeHtml(f) + '</span><button type="button" data-remove-food="' + i + '" aria-label="Remove ' + escapeHtml(f) + '">&times;</button></span>';
    }).join('');
    el('food-suggestions').innerHTML = known.map(function(f){
      return '<option value="' + escapeHtml(f) + '"></option>';
    }).join('');
    var draftLower = solidDraftFoods.map(function(f){ return f.toLowerCase(); });
    var recent = known.filter(function(f){ return draftLower.indexOf(f.toLowerCase()) < 0; }).slice(0, 10);
    el('s-recent').innerHTML = recent.map(function(f){
      return '<button type="button" class="chip" data-food="' + escapeHtml(f) + '">' + escapeHtml(f) + '</button>';
    }).join('');
  }

  function resetSolidForm(){
    var now = new Date();
    solidDraftFoods = [];
    el('s-id').value = '';
    el('s-date').value = dateKey(now);
    el('s-time').value = timeValue(now);
    el('s-food').value = '';
    el('s-notes').value = '';
    el('s-title').textContent = 'Log a meal';
    el('s-submit').textContent = 'Add meal';
    el('s-delete').hidden = true;
    hideError('s-error');
    renderFoodHelpers();
    clearDraft('solid-form');
  }

  function openSolidForm(){
    resetSolidForm();
    openOverlay('solid-overlay');
    snapshotForm('solid-form');
  }
  function closeSolidForm(){
    closeOverlay('solid-overlay');
    resetSolidForm();
  }

  function editSolid(id, quiet){
    var s = state.solids.find(function(x){ return x.id === id; });
    if (!s) return false;
    if (!quiet) goTo('solids');
    solidDraftFoods = (s.foods || []).slice();
    el('s-id').value = s.id;
    el('s-date').value = s.date;
    el('s-time').value = s.time;
    el('s-food').value = '';
    el('s-notes').value = s.notes || '';
    el('s-title').textContent = 'Edit meal';
    el('s-submit').textContent = 'Save';
    el('s-delete').hidden = false;
    hideError('s-error');
    renderFoodHelpers();
    snapshotForm('solid-form');
    if (!quiet) openOverlay('solid-overlay');
    return true;
  }

  function solidRowHtml(s){
    var title = (s.foods && s.foods.length) ? escapeHtml(s.foods.join(', ')) : 'Solids';
    return '<div class="entry-row">' +
      '<div class="entry-main">' +
        '<span class="entry-range">' + title + '</span>' +
        metaHtml(s) +
        (s.notes ? '<span class="entry-notes">' + escapeHtml(s.notes) + '</span>' : '') +
      '</div>' +
      '<div class="entry-side">' +
        '<span class="entry-dur">' + fmtTime(atDate(s)) + '</span>' +
        '<button class="icon-btn writer-only" data-edit="solids" data-id="' + s.id + '" aria-label="Edit meal" type="button">' + ICON.pencil + '</button>' +
      '</div>' +
    '</div>';
  }

  // ---------- food history ----------
  // "When did he last have egg?" is the question this answers, and the one
  // worth answering fast when something has disagreed with him.
  function foodHistory(){
    var byFood = {};
    state.solids.forEach(function(s){
      var at = atDate(s);
      (s.foods || []).forEach(function(f){
        var key = String(f).toLowerCase();
        var row = byFood[key] || (byFood[key] = { name: f, times: 0, first: at, last: at });
        row.times++;
        if (at > row.last) row.last = at;
        if (at < row.first){ row.first = at; row.name = f; }
      });
    });
    return Object.keys(byFood).map(function(k){ return byFood[k]; })
      .sort(function(a, b){ return b.last - a.last; });
  }

  function renderFoodHistory(){
    var panel = el('food-panel'), all = foodHistory();
    if (!all.length){ panel.hidden = true; return; }
    panel.hidden = false;
    var term = String(el('food-search').value || '').trim().toLowerCase();
    var shown = term ? all.filter(function(r){ return r.name.toLowerCase().indexOf(term) >= 0; }) : all;
    el('food-count').textContent = plural(all.length, 'food');
    el('food-list').innerHTML = shown.length
      ? shown.map(function(r){
          return '<div class="food-row">' +
            '<span class="food-name">' + escapeHtml(r.name) + '</span>' +
            '<span class="food-when">' + friendlyDate(dateKey(r.last)) + '</span>' +
            '<span class="food-times">' + (r.times === 1 ? 'once' : r.times + '&times;') + '</span>' +
          '</div>';
        }).join('')
      : '<p class="form-hint">Nothing matching &ldquo;' + escapeHtml(term) + '&rdquo; yet.</p>';
    el('food-note').textContent = term
      ? ''
      : 'Most recent first. First tried ' + friendlyDate(dateKey(all.reduce(function(a, b){ return a.first < b.first ? a : b; }).first)) + '.';
  }
  el('food-search').addEventListener('input', renderFoodHistory);

  function renderSolids(){
    renderFoodHistory();
    var groups = groupByDay(state.solids, function(s){ return atDate(s).getTime(); });
    renderDayGroups(
      el('solids-log'), groups, solidRowHtml,
      function(items){ return plural(items.length, 'meal'); },
      '<span class="empty-icon">&#129367;</span><p>No solids logged yet.<br>Add the first meal above.</p>'
    );
    renderFoodHelpers();
  }

  el('s-add-food').addEventListener('click', function(){
    if (addDraftFood(el('s-food').value)){ el('s-food').value = ''; }
    el('s-food').focus();
  });
  el('s-food').addEventListener('keydown', function(ev){
    if (ev.key === 'Enter'){
      ev.preventDefault();
      if (addDraftFood(el('s-food').value)){ el('s-food').value = ''; }
    }
  });
  el('s-tags').addEventListener('click', function(ev){
    var btn = ev.target.closest('[data-remove-food]');
    if (btn) removeDraftFood(Number(btn.getAttribute('data-remove-food')));
  });

  el('solid-form').addEventListener('submit', async function(ev){
    ev.preventDefault();
    hideError('s-error');
    if (el('s-food').value.trim()){ addDraftFood(el('s-food').value); el('s-food').value = ''; }
    var date = el('s-date').value;
    var time = el('s-time').value;
    if (!date){ showError('s-error', 'Pick the date of this meal.', 's-date'); return; }
    if (!time){ showError('s-error', 'Enter the time of this meal.', 's-time'); return; }
    if (!solidDraftFoods.length){ showError('s-error', 'Add at least one food.', 's-food'); return; }

    var meal = {
      id: el('s-id').value || uid(),
      date: date,
      time: time,
      foods: solidDraftFoods.slice(),
      notes: el('s-notes').value.trim()
    };
    showToast(el('s-id').value ? 'Meal updated' : meal.foods.join(', ') + ' logged');
    closeSolidForm();
    await commit([{ type: 'upsert', collection: 'solids', record: meal }]);
  });

  el('solid-add-btn').addEventListener('click', function(){ if (!readOnly) openSolidForm(); });
  el('s-cancel').addEventListener('click', closeSolidForm);
  el('s-close').addEventListener('click', closeSolidForm);
  el('s-delete').addEventListener('click', function(){
    var id = el('s-id').value;
    if (!id){ closeSolidForm(); return; }
    var s = state.solids.find(function(x){ return x.id === id; });
    askConfirm({
      title: 'Delete this meal?',
      text: (s ? ((s.foods || []).join(', ') || 'Solids') + ' at ' + fmtTime(atDate(s)) + ' on ' + friendlyDate(s.date) + '. ' : '') +
        'It will be gone for both of you, and cannot be undone.',
      confirmLabel: 'Delete',
      onConfirm: async function(){
        showToast('Meal deleted');
        closeSolidForm();
        await commit([{ type: 'delete', collection: 'solids', id: id }]);
      }
    });
  });

  // ======================================================
  // MEDICINE
  // ======================================================
  // What was given and, when a gap between doses was entered, when the next
  // one is due. The app counts the gap it was told and nothing more: how much
  // and how often come from the label.
  var medDraftGap = 240;

  function medsByRecent(){
    return state.meds.slice().sort(function(a, b){ return atDate(b) - atDate(a); });
  }
  // The last time each medicine was given, so picking a name can bring back
  // the dose and the gap that went with it.
  function lastOfEachMed(){
    var seen = {};
    medsByRecent().forEach(function(m){
      var key = String(m.name || '').toLowerCase();
      if (key && !seen[key]) seen[key] = m;
    });
    return seen;
  }

  function renderMedHelpers(){
    var last = lastOfEachMed();
    var names = Object.keys(last).map(function(k){ return last[k].name; });
    el('med-suggestions').innerHTML = names.map(function(n){
      return '<option value="' + escapeHtml(n) + '"></option>';
    }).join('');
    el('md-recent').innerHTML = names.slice(0, 5).map(function(n){
      return '<button type="button" class="chip" data-med="' + escapeHtml(n) + '">' + escapeHtml(n) + '</button>';
    }).join('');
    var prior = last[String(el('md-name').value || '').toLowerCase()];
    var priorMl = prior ? medDoseMl(prior) : null;
    el('md-dose-chips').innerHTML = priorMl === null
      ? ''
      : '<button type="button" class="chip" data-dose="' + priorMl + '">' + fmtDose(priorMl) + ' (last time)</button>';
    Array.prototype.forEach.call(el('md-gap').querySelectorAll('.unit-btn'), function(btn){
      btn.setAttribute('aria-pressed', Number(btn.dataset.gap) === medDraftGap ? 'true' : 'false');
    });
    el('md-gap-hint').textContent = medDraftGap
      ? 'The next dose will show as due ' + fmtDur(medDraftGap * 60000) + ' after this one. Check the label for how much and how often.'
      : 'No next dose will be worked out for this one.';
  }

  function resetMedForm(){
    var now = new Date();
    el('md-id').value = '';
    el('md-date').value = dateKey(now);
    el('md-time').value = timeValue(now);
    el('md-name').value = '';
    el('md-dose').value = '';
    el('md-notes').value = '';
    el('med-title').textContent = 'Log a dose';
    el('md-submit').textContent = 'Add dose';
    el('md-delete').hidden = true;
    medDraftGap = 240;
    renderMedHelpers();
    hideError('md-error');
    clearDraft('med-form');
  }
  function openMedForm(){
    resetMedForm();
    openOverlay('med-overlay');
    snapshotForm('med-form');
  }
  function closeMedForm(){
    closeOverlay('med-overlay');
    resetMedForm();
  }

  function editMed(id, quiet){
    var m = state.meds.find(function(x){ return x.id === id; });
    if (!m) return false;
    if (!quiet) goTo('meds');
    el('md-id').value = m.id;
    el('md-date').value = m.date;
    el('md-time').value = m.time;
    el('md-name').value = m.name || '';
    el('md-dose').value = medDoseMl(m) === null ? '' : medDoseMl(m);
    el('md-notes').value = m.notes || '';
    el('med-title').textContent = 'Edit dose';
    el('md-submit').textContent = 'Save';
    el('md-delete').hidden = false;
    medDraftGap = m.gapMin || 0;
    renderMedHelpers();
    hideError('md-error');
    snapshotForm('med-form');
    if (!quiet) openOverlay('med-overlay');
    return true;
  }

  function medDoseMl(m){
    var n = parseFloat(String(m && m.dose != null ? m.dose : '').replace(',', '.'));
    return isNaN(n) || n <= 0 ? null : n;
  }
  function fmtDose(ml){ return (Math.round(ml * 100) / 100) + ' ml'; }
  function medTitle(m){
    var name = m.name || 'Medicine';
    var ml = medDoseMl(m);
    return ml === null ? name : name + ' ' + fmtDose(ml);
  }

  function medRowHtml(m){
    var bits = [];
    if (m.gapMin) bits.push('<span>Next from ' + fmtTime(new Date(atDate(m).getTime() + m.gapMin * 60000)) + '</span>');
    var who = personChip(m);
    if (who) bits.push(who);
    return '<div class="entry-row">' +
      '<div class="entry-main">' +
        '<span class="entry-range">' + escapeHtml(medTitle(m)) + '</span>' +
        (bits.length ? '<span class="entry-meta">' + bits.join('') + '</span>' : '') +
        (m.notes ? '<span class="entry-notes">' + escapeHtml(m.notes) + '</span>' : '') +
      '</div>' +
      '<div class="entry-side">' +
        '<span class="entry-dur">' + fmtTime(atDate(m)) + '</span>' +
        '<button class="icon-btn writer-only" data-edit="meds" data-id="' + m.id + '" aria-label="Edit dose" type="button">' + ICON.pencil + '</button>' +
      '</div>' +
    '</div>';
  }

  // The last dose given, plus every medicine still inside the gap set for it.
  // Kept per name so a Calpol dose does not hide that Nurofen is still due.
  function medStatus(){
    if (!state.meds.length) return null;
    var last = lastOfEachMed(), now = new Date(), pending = [];
    Object.keys(last).forEach(function(k){
      var m = last[k];
      if (!m.gapMin) return;
      var due = new Date(atDate(m).getTime() + m.gapMin * 60000);
      if (due > now) pending.push({ med: m, due: due });
    });
    pending.sort(function(a, b){ return a.due - b.due; });
    return { latest: medsByRecent()[0], pending: pending };
  }

  function renderMedDue(){
    var card = el('med-due-card'), st = medStatus();
    if (!st){ card.hidden = true; return; }
    card.hidden = false;
    var now = new Date(), m = st.latest, at = atDate(m), stateEl = el('med-due-state');
    el('med-due-last').textContent = medTitle(m);
    el('med-due-ago').textContent = fmtTime(at) + ' · ' + fmtDur(Math.max(0, now - at)) + ' ago';
    if (m.gapMin){
      var due = new Date(at.getTime() + m.gapMin * 60000);
      el('med-due-next').textContent = fmtTime(due);
      if (due > now){ stateEl.textContent = 'in ' + fmtDur(due - now); stateEl.dataset.state = 'soon'; }
      else { stateEl.textContent = 'due now'; stateEl.dataset.state = 'open'; }
    } else {
      el('med-due-next').textContent = '—';
      stateEl.textContent = 'no gap set';
      stateEl.dataset.state = 'none';
    }
    var others = st.pending.filter(function(p){ return p.med.id !== m.id; });
    el('med-due-foot').textContent =
      (others.length ? others.map(function(p){ return medTitle(p.med) + ' not until ' + fmtTime(p.due); }).join('. ') + '. ' : '') +
      'Worked out from the gap entered with each dose. Check the label for how much and how often.';
  }

  function renderMedsLog(){
    var groups = groupByDay(state.meds, function(m){ return atDate(m).getTime(); });
    renderDayGroups(
      el('meds-log'), groups, medRowHtml,
      function(items){ return plural(items.length, 'dose'); },
      '<span class="empty-icon">&#128137;</span><p>No medicine logged yet.<br>Anything given shows here for both of you.</p>'
    );
  }

  function renderMeds(){
    if (!FEATURES.medicine) return;
    renderMedDue();
    renderMedsLog();
    var todayKey = dateKey(new Date());
    var today = medsByRecent().filter(function(m){ return m.date === todayKey; });
    el('home-meds-sub').textContent = today.length
      ? medTitle(today[0]) + ' at ' + fmtTime(atDate(today[0])) +
        (today.length > 1 ? ' · ' + plural(today.length, 'dose') + ' today' : '')
      : 'Nothing given today';
  }

  el('md-name').addEventListener('input', renderMedHelpers);
  el('md-gap').addEventListener('click', function(ev){
    var btn = ev.target.closest('.unit-btn');
    if (!btn) return;
    medDraftGap = Number(btn.dataset.gap);
    renderMedHelpers();
    snapshotForm('med-form');
  });

  el('med-form').addEventListener('submit', async function(ev){
    ev.preventDefault();
    hideError('md-error');
    var date = el('md-date').value, time = el('md-time').value;
    var name = el('md-name').value.trim();
    if (!date){ showError('md-error', 'Pick the date of this dose.', 'md-date'); return; }
    if (!time){ showError('md-error', 'Enter the time of this dose.', 'md-time'); return; }
    if (!name){ showError('md-error', 'Name the medicine.', 'md-name'); return; }
    var typedDose = el('md-dose').value.trim();
    var doseMl = typedDose === '' ? null : Number(typedDose);
    if (typedDose !== '' && !(doseMl > 0)){
      showError('md-error', 'Enter the dose in millilitres, or leave it blank.', 'md-dose');
      return;
    }

    var med = {
      id: el('md-id').value || uid(),
      date: date,
      time: time,
      name: name,
      dose: doseMl === null ? '' : String(doseMl),
      gapMin: medDraftGap || null,
      notes: el('md-notes').value.trim()
    };
    showToast(el('md-id').value ? 'Dose updated' : medTitle(med) + ' logged at ' + fmtTime(atDate(med)));
    closeMedForm();
    await commit([{ type: 'upsert', collection: 'meds', record: med }]);
  });

  el('med-add-btn').addEventListener('click', function(){ if (!readOnly) openMedForm(); });
  el('md-cancel').addEventListener('click', closeMedForm);
  el('med-close').addEventListener('click', closeMedForm);
  el('md-delete').addEventListener('click', function(){
    var id = el('md-id').value;
    if (!id){ closeMedForm(); return; }
    var m = state.meds.find(function(x){ return x.id === id; });
    askConfirm({
      title: 'Delete this dose?',
      text: (m ? medTitle(m) + ' at ' + fmtTime(atDate(m)) + ' on ' + friendlyDate(m.date) + '. ' : '') +
        'It will be gone for both of you, and cannot be undone.',
      confirmLabel: 'Delete',
      onConfirm: async function(){
        showToast('Dose deleted');
        closeMedForm();
        await commit([{ type: 'delete', collection: 'meds', id: id }]);
      }
    });
  });

  // ======================================================
  // HOME
  // ======================================================
  function allEvents(){
    var out = [];
    state.entries.forEach(function(e){
      out.push({ kind: 'sleep', id: e.id, date: e.date, at: entryStart(e), src: e });
    });
    state.feeds.forEach(function(f){
      out.push({ kind: 'milk', id: f.id, date: f.date, at: atDate(f), src: f });
    });
    state.solids.forEach(function(s){
      out.push({ kind: 'solids', id: s.id, date: s.date, at: atDate(s), src: s });
    });
    if (FEATURES.medicine){
      state.meds.forEach(function(m){
        out.push({ kind: 'meds', id: m.id, date: m.date, at: atDate(m), src: m });
      });
    }
    return out;
  }

  function eventRowHtml(ev){
    var title = '', sub = '', notes = '';
    if (ev.kind === 'sleep'){
      title = 'Slept ' + fmtDur(entryEnd(ev.src) - entryStart(ev.src));
      sub = fmtTime(entryStart(ev.src)) + ' – ' + fmtTime(entryEnd(ev.src));
      notes = noteLines(ev.src);
    } else if (ev.kind === 'milk'){
      title = ev.src.amountMl ? ev.src.amountMl + ' ml milk' : 'Milk feed';
      notes = ev.src.notes ? '<span class="entry-notes">' + escapeHtml(ev.src.notes) + '</span>' : '';
    } else if (ev.kind === 'meds'){
      title = escapeHtml(medTitle(ev.src));
      if (ev.src.gapMin) sub = 'Next from ' + fmtTime(new Date(ev.at.getTime() + ev.src.gapMin * 60000));
      notes = ev.src.notes ? '<span class="entry-notes">' + escapeHtml(ev.src.notes) + '</span>' : '';
    } else {
      title = (ev.src.foods && ev.src.foods.length) ? escapeHtml(ev.src.foods.join(', ')) : 'Solids';
      notes = ev.src.notes ? '<span class="entry-notes">' + escapeHtml(ev.src.notes) + '</span>' : '';
    }
    var who = personChip(ev.src);
    return '<button class="event-row" type="button" data-edit="' + ev.kind + '" data-id="' + ev.id + '">' +
      '<span class="event-icon" data-type="' + ev.kind + '">' + TYPE_ICON[ev.kind] + '</span>' +
      '<span class="event-main">' +
        '<span class="event-title">' + title + '</span>' +
        (sub ? '<span class="event-sub">' + sub + '</span>' : '') +
        (who ? '<span class="entry-meta">' + who + '</span>' : '') +
        notes +
      '</span>' +
      '<span class="event-time">' + fmtTime(ev.at) + '</span>' +
    '</button>';
  }

  function renderHomeSleepSub(){
    var todayKey = dateKey(new Date());
    var napMs = 0, napCount = 0;
    state.entries.forEach(function(e){
      if (!isNight(e) && e.date === todayKey){ napMs += entryEnd(e) - entryStart(e); napCount++; }
    });
    var sub;
    if (state.status.asleep){
      sub = 'Asleep since ' + fmtTime(new Date(state.status.since));
    } else {
      var last = lastWakeDate();
      if (last){
        sub = 'Awake ' + fmtDur(Date.now() - last.getTime());
        var win = sleepWindow();
        if (win && win.kind === 'night') sub += ' · settle them back when you can';
        else if (win) sub += ' · ' + win.shortLabel + ' from ' + fmtTime(win.open);
      } else {
        sub = 'Nothing logged yet';
      }
    }
    if (napCount) sub += ' · ' + plural(napCount, 'nap') + ' today (' + fmtDur(napMs) + ')';
    el('home-sleep-sub').textContent = sub;
  }

  // The bedtime choice while the overlay is open, so the hint can preview a
  // night start that has been typed but not saved yet.
  var draftBasis = 'night';
  function bedtimeHintText(){
    var age = currentAge();
    if (draftBasis === 'age'){
      if (!age) return 'Add a date of birth to use the age guide.';
      if (!age.band.bedtime) return 'Sleep is spread around the clock at ' + age.band.label + ', so the guide leaves bedtime open.';
      return 'Bedtime aimed at ' + fmtRange(age.band.bedtime[0], age.band.bedtime[1]) + ', the usual range at ' + age.band.label + '.';
    }
    var startMin = minutesOf(el('set-night-start').value || '19:00');
    return 'Bedtime aimed at ' + fmtRange(startMin - BEDTIME_SPREAD, startMin + BEDTIME_SPREAD) +
      ', half an hour either side of your ' + fmtClock(startMin) + ' night start.';
  }
  function renderBedtimeBasis(){
    Array.prototype.forEach.call(el('set-bedtime-basis').querySelectorAll('.unit-btn'), function(btn){
      btn.setAttribute('aria-pressed', btn.dataset.basis === draftBasis ? 'true' : 'false');
    });
    el('set-bedtime-hint').textContent = bedtimeHintText();
  }
  el('set-bedtime-basis').addEventListener('click', function(ev){
    var btn = ev.target.closest('.unit-btn');
    if (!btn) return;
    draftBasis = btn.dataset.basis;
    renderBedtimeBasis();
  });
  // Both hints quote the night times, so they follow the fields as they change.
  el('set-night-start').addEventListener('input', function(){ renderBedtimeBasis(); renderNightChoice(); });
  el('set-night-end').addEventListener('input', renderNightChoice);

  // Everything under "Just for you" is kept the moment it is tapped. None of
  // it is anyone else's, so there is nothing for Save or Cancel to weigh up,
  // and all three are things you want to see the effect of before deciding.
  function keepPref(name, value){
    var next = {};
    next[name] = value;
    commit([{ type: 'prefs', prefs: Object.assign({}, state.prefs, next) }]);
  }

  function renderSettleChoice(){
    var choice = settleView();
    Array.prototype.forEach.call(el('set-settle-view').querySelectorAll('.unit-btn'), function(btn){
      btn.setAttribute('aria-pressed', btn.dataset.settle === choice ? 'true' : 'false');
    });
    el('set-settle-hint').textContent = choice === 'total'
      ? 'Each bar adds up all the settling that day, so a day with three hard naps stands out.'
      : 'Each bar is the average settle for one sleep that day, so days are comparable however many sleeps they had.';
  }
  el('set-settle-view').addEventListener('click', function(ev){
    var btn = ev.target.closest('.unit-btn');
    if (!btn || btn.dataset.settle === settleView()) return;
    keepPref('settleView', btn.dataset.settle);
    renderSettleChoice();
  });

  function renderNightChoice(){
    var on = nightModeSetting();
    Array.prototype.forEach.call(el('set-night-mode').querySelectorAll('.unit-btn'), function(btn){
      btn.setAttribute('aria-pressed', (btn.dataset.night === 'on') === on ? 'true' : 'false');
    });
    // The night times are in the other section and are saved rather than
    // instant, so the hint quotes the fields as typed, not what is stored.
    var from = fmtClock(minutesOf(el('set-night-start').value || '19:00'));
    var to = fmtClock(minutesOf(el('set-night-end').value || '06:00'));
    el('set-night-mode-hint').textContent = on
      ? 'Between ' + from + ' and ' + to + ' the screen dims and the Sleep page drops to the toggle and the card. "Show the rest" brings it back.'
      : 'The app looks the same at 3am as it does at noon.';
  }
  el('set-night-mode').addEventListener('click', function(ev){
    var btn = ev.target.closest('.unit-btn');
    if (!btn || (btn.dataset.night === 'on') === nightModeSetting()) return;
    keepPref('nightMode', btn.dataset.night === 'on');
    renderNightChoice();
    renderThemeChoice(); // its hint mentions night mode
  });

  // The name on the other account, where there is exactly one, so the section
  // can say whose choices these are not.
  function otherPersonName(){
    var people = state.people || {}, me = state.me || '';
    var names = Object.keys(people)
      .filter(function(email){ return email !== me; })
      .map(function(email){ return people[email]; })
      .filter(Boolean);
    return names.length === 1 ? names[0] : '';
  }
  function renderThemeChoice(){
    var choice = themeChoice();
    Array.prototype.forEach.call(el('set-theme').querySelectorAll('.unit-btn'), function(btn){
      btn.setAttribute('aria-pressed', btn.dataset.theme === choice ? 'true' : 'false');
    });
    el('set-theme-hint').textContent = (choice === 'system'
      ? 'Follows whatever your phone is set to.'
      : 'Always ' + choice + ', whatever your phone is set to.') +
      (nightModeSetting() ? ' Night mode still takes over between your night times.' : '');
    var other = otherPersonName();
    el('set-yours-hint').textContent = state.me
      ? 'Kept on your account' + (other ? ', not ' + other + '’s.' : ', so the other phone keeps its own.')
      : 'Kept on this device.';
  }
  el('set-theme').addEventListener('click', function(ev){
    var btn = ev.target.closest('.unit-btn');
    if (!btn || btn.dataset.theme === themeChoice()) return;
    keepPref('theme', btn.dataset.theme);
    renderThemeChoice();
  });

  function openSettings(){
    if (readOnly) return;
    var s = state.settings || {};
    el('set-dob').value = s.dob || '';
    el('set-night-start').value = s.nightStart || '19:00';
    el('set-night-end').value = s.nightEnd || '06:00';
    draftBasis = bedtimeBasis();
    renderBedtimeBasis();
    renderSettleChoice();
    renderNightChoice();
    renderThemeChoice();
    renderAbout();
    hideError('set-error');
    openOverlay('settings-overlay');
    el('set-dob').focus();
  }
  function closeSettings(){ closeOverlay('settings-overlay'); }

  // What this phone is actually running. The version says what it can do, the
  // build says which copy of it arrived - useful when one phone has the update
  // and the other has not.
  function renderAbout(){
    var latest = (window.CILLY_CHANGELOG || [])[0];
    var build = currentBuild();
    el('set-about-hint').textContent = (latest ? 'Version ' + latest.version : 'Cilly Log') +
      (build ? ' · build ' + build : '') + '.';
  }

  // ---------- change log ----------
  // Entries live in js/changelog.js. The build stamp underneath comes from the
  // version on this script's own URL, so it always matches what is running.
  function currentBuild(){
    var tag = document.querySelector('script[src*="js/app.js"]');
    var match = tag ? /[?&]v=([^&"]+)/.exec(tag.getAttribute('src') || '') : null;
    return match ? match[1] : '';
  }
  function longDate(key){
    var parts = String(key).split('-').map(Number);
    var d = new Date(parts[0], parts[1] - 1, parts[2]);
    return isNaN(d.getTime()) ? key
      : d.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
  }
  function renderChangelog(){
    var releases = window.CILLY_CHANGELOG || [];
    el('changelog-list').innerHTML = releases.map(function(r){
      return '<section class="release">' +
        '<div class="release-head">' +
          '<h3>' + escapeHtml(r.title) + '</h3>' +
          '<span class="release-meta">' + escapeHtml(r.version) + ' &middot; ' + escapeHtml(longDate(r.date)) + '</span>' +
        '</div>' +
        '<ul>' + (r.notes || []).map(function(n){ return '<li>' + escapeHtml(n) + '</li>'; }).join('') + '</ul>' +
      '</section>';
    }).join('') || '<p class="form-hint">Nothing recorded yet.</p>';
    var build = currentBuild();
    el('changelog-build').textContent = build ? 'Running build ' + build + '.' : '';
  }
  function openChangelog(){
    renderChangelog();
    openOverlay('changelog-overlay');
    el('changelog-close').focus();
  }
  function closeChangelog(){ closeOverlay('changelog-overlay'); }

  el('changelog-btn').addEventListener('click', openChangelog);
  el('changelog-close').addEventListener('click', closeChangelog);
  el('changelog-overlay').addEventListener('click', function(ev){
    if (ev.target === el('changelog-overlay')) closeChangelog();
  });

  el('settings-btn').addEventListener('click', openSettings);
  el('set-cancel').addEventListener('click', closeSettings);
  el('settings-close').addEventListener('click', closeSettings);
  // Settings closes on a tap outside it, but the logging forms do not: a
  // stray tap on a phone should not throw away a half-typed note.
  el('settings-overlay').addEventListener('click', function(ev){
    if (ev.target === el('settings-overlay')) closeSettings();
  });
  el('confirm-no').addEventListener('click', closeConfirm);
  el('confirm-close').addEventListener('click', closeConfirm);
  el('confirm-overlay').addEventListener('click', function(ev){
    if (ev.target === el('confirm-overlay')) closeConfirm();
  });
  el('confirm-yes').addEventListener('click', async function(){
    var act = pendingConfirm;
    closeConfirm();
    if (act) await act();
  });

  document.addEventListener('keydown', function(ev){
    if (ev.key !== 'Escape') return;
    var open = openOverlayId();
    if (open === 'confirm-overlay') closeConfirm();
    else if (open === 'changelog-overlay') closeChangelog();
    else if (open === 'settings-overlay') closeSettings();
    else if (open === 'marker-overlay') closeMarkerForm();
    else if (open === 'day-overlay') closeDay();
    else if (open === 'entry-overlay') closeForm();
    else if (open === 'milk-overlay') closeMilkForm();
    else if (open === 'solid-overlay') closeSolidForm();
    else if (open === 'med-overlay') closeMedForm();
  });
  el('settings-form').addEventListener('submit', async function(ev){
    ev.preventDefault();
    hideError('set-error');
    var dob = el('set-dob').value, ns = el('set-night-start').value, ne = el('set-night-end').value;
    if (dob && dob > dateKey(new Date())){ showError('set-error', 'The date of birth can’t be in the future.', 'set-dob'); return; }
    if (!ns || !ne){ showError('set-error', 'Enter both night times.', ns ? 'set-night-end' : 'set-night-start'); return; }
    closeSettings();
    // Night mode and the settle chart used to be saved here. They are one
    // person's choice now, kept the moment they are tapped, and whatever this
    // row still holds for them stands in for anyone who has not chosen.
    await commit([{ type: 'settings', settings: Object.assign({}, state.settings, {
      dob: dob, nightStart: ns, nightEnd: ne, bedtimeBasis: draftBasis
    }) }]);
  });

  function renderHome(){
    var todayKey = dateKey(new Date());

    renderHomeSleepSub();

    var ml = 0, feedCount = 0;
    state.feeds.forEach(function(f){
      if (f.date === todayKey){ ml += Number(f.amountMl || 0); feedCount++; }
    });
    if (!feedCount) el('home-milk-sub').textContent = 'No feeds logged today';
    else if (ml > 0) el('home-milk-sub').textContent = ml + ' ml today across ' + plural(feedCount, 'feed');
    else el('home-milk-sub').textContent = plural(feedCount, 'feed') + ' today';

    var meals = state.solids.filter(function(s){ return s.date === todayKey; });
    if (meals.length){
      var latest = meals.slice().sort(function(a, b){ return atDate(b) - atDate(a); })[0];
      var foods = (latest.foods || []).slice(0, 3).join(', ');
      el('home-solids-sub').textContent = plural(meals.length, 'meal') + ' today' + (foods ? ' · ' + foods : '');
    } else {
      el('home-solids-sub').textContent = 'No solids logged today';
    }

    var events = allEvents();
    var groups = groupByDay(events, function(ev){ return ev.at.getTime(); });
    el('home-log-count').textContent = events.length ? plural(events.length, 'event') : '';
    renderDayGroups(
      el('home-log'), groups, eventRowHtml,
      function(items){
        var ms = 0, mlTotal = 0, mealCount = 0;
        items.forEach(function(ev){
          if (ev.kind === 'sleep') ms += entryEnd(ev.src) - entryStart(ev.src);
          else if (ev.kind === 'milk') mlTotal += Number(ev.src.amountMl || 0);
          else mealCount++;
        });
        var bits = [];
        if (ms > 0) bits.push(fmtDur(ms));
        if (mlTotal > 0) bits.push(mlTotal + ' ml');
        if (mealCount > 0) bits.push(plural(mealCount, 'meal'));
        return bits.join(' · ');
      },
      '<span class="empty-icon">&#127772;</span><p>Nothing logged yet.<br>Pick a section above to get started.</p>'
    );
  }

  // ======================================================
  // PERSIST
  // ======================================================
  // ---------- the outbox ----------
  // A save that fails used to say so and then vanish: the entry lived in
  // memory until the next reload took it. In a nursery corridor at 3am that is
  // the log quietly losing a night. Failed ops now wait on the device instead,
  // are re-applied over whatever the database sends back so they stay on
  // screen, and go up the moment anything works again.
  var OUTBOX_KEY = 'cilly.outbox';
  function outboxRead(){
    try {
      var raw = window.localStorage.getItem(OUTBOX_KEY);
      var list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch (e) { return []; }
  }
  function outboxWrite(list){
    try { window.localStorage.setItem(OUTBOX_KEY, JSON.stringify(list)); } catch (e) {}
    renderOutbox();
  }
  // What an op is about, so a later one can replace an earlier one for the
  // same thing rather than both being replayed in turn.
  function opKey(op){
    if (op.type === 'upsert') return 'upsert:' + op.collection + ':' + op.record.id;
    if (op.type === 'delete') return 'delete:' + op.collection + ':' + op.id;
    return op.type; // status, settings and prefs are each one whole row
  }
  function outboxAdd(ops){
    var list = outboxRead();
    ops.forEach(function(op){
      var key = opKey(op);
      // A delete cancels a queued upsert of the same record, and the newest
      // write of a whole row is the only one worth sending.
      list = list.filter(function(q){
        if (q.key === key) return false;
        if (op.type === 'delete' && q.key === 'upsert:' + op.collection + ':' + op.id) return false;
        return true;
      });
      list.push({ key: key, op: op, at: Date.now() });
    });
    outboxWrite(list);
  }
  // Ops waiting to be sent are re-applied on top of server state, so an entry
  // logged offline stays visible instead of disappearing on the next reload or
  // when the other phone changes something.
  function applyOutbox(){
    var list = outboxRead();
    if (list.length) applyOps(list.map(function(q){ return q.op; }));
  }
  var flushing = false;
  async function flushOutbox(){
    if (flushing) return;
    var list = outboxRead();
    if (!list.length) return;
    flushing = true;
    try {
      while (list.length){
        // One at a time and in order: a batch that fails half way through
        // would otherwise be sent twice.
        var head = list[0];
        await store.apply([head.op], state);
        list = outboxRead().filter(function(q){ return !(q.key === head.key && q.at === head.at); });
        outboxWrite(list);
      }
      showToast('Everything waiting has been saved.');
    } catch (e) {
      // Still no connection, or the database said no. Leave the rest queued.
    }
    flushing = false;
  }
  function renderOutbox(){
    var n = outboxRead().length;
    var note = el('outbox-note');
    note.hidden = !n;
    note.textContent = n === 1
      ? 'One entry is saved on this phone and waiting to sync.'
      : n + ' entries are saved on this phone and waiting to sync.';
  }
  window.addEventListener('online', flushOutbox);
  document.addEventListener('visibilitychange', function(){
    if (!document.hidden) flushOutbox();
  });

  async function persist(ops){
    try {
      await store.apply(ops, state);
      // Something worked, so anything held back is worth another go.
      if (outboxRead().length) flushOutbox();
    } catch (e) {
      outboxAdd(ops);
      showToast('No connection. Saved on this phone and it will sync itself.');
    }
  }
  // ======================================================
  // GLOBAL DELEGATED HANDLERS
  // ======================================================
  document.addEventListener('click', function(ev){
    var target = ev.target;
    if (!target.closest) return;

    var nav = target.closest('[data-nav]');
    if (nav){ goTo(nav.getAttribute('data-nav')); return; }

    var refresh = target.closest('[data-refresh]');
    if (refresh){
      refresh.classList.add('spinning');
      window.location.reload();
      return;
    }

    var chip = target.closest('.chip');
    if (chip){
      var row = chip.closest('.chips');
      if (chip.hasAttribute('data-minutes') && row){
        var minutes = Number(chip.getAttribute('data-minutes'));
        el(row.getAttribute('data-target')).value = timeValue(new Date(Date.now() - minutes * 60000));
      } else if (chip.hasAttribute('data-amount') && row){
        el(row.getAttribute('data-target')).value = chip.getAttribute('data-amount');
      } else if (chip.hasAttribute('data-before')){
        var before = Number(chip.getAttribute('data-before'));
        var startVal = el('f-start').value;
        var base = startVal ? timeToDateNear(startVal, new Date()) : new Date();
        el('f-putdown').value = timeValue(new Date(base.getTime() - before * 60000));
        renderPutDownHint();
      } else if (chip.hasAttribute('data-food')){
        addDraftFood(chip.getAttribute('data-food'));
      } else if (chip.hasAttribute('data-med')){
        el('md-name').value = chip.getAttribute('data-med');
        // Bring back what went with it last time, so a 3am dose is two taps.
        var prior = lastOfEachMed()[chip.getAttribute('data-med').toLowerCase()];
        if (prior){
          var priorDose = medDoseMl(prior);
          if (priorDose !== null) el('md-dose').value = priorDose;
          medDraftGap = prior.gapMin || 0;
        }
        renderMedHelpers();
      } else if (chip.hasAttribute('data-dose')){
        el('md-dose').value = chip.getAttribute('data-dose');
      }
      var chipForm = chip.closest('form');
      if (chipForm) snapshotForm(chipForm.id);
      return;
    }

    var edit = target.closest('[data-edit]');
    if (edit){ openEditor(edit.getAttribute('data-edit'), edit.getAttribute('data-id')); return; }

    if (!target.closest('.chart-bar-group')) hideChartTooltip();
  });

  document.addEventListener('input', function(ev){
    var form = ev.target && ev.target.closest ? ev.target.closest('form') : null;
    if (form) snapshotForm(form.id);
  });

  // ---------- boot ----------
  var cfg = window.CILLY_CONFIG || {};
  store = (!cfg.forceLocal && cfg.supabaseUrl && cfg.supabaseAnonKey && window.supabase)
    ? window.CillyStore.supabase({ url: cfg.supabaseUrl, anonKey: cfg.supabaseAnonKey })
    : window.CillyStore.local();
  var started = false;

  if ('serviceWorker' in navigator){
    window.addEventListener('load', function(){
      navigator.serviceWorker.register('sw.js').then(function(reg){
        reg.addEventListener('updatefound', function(){
          var worker = reg.installing;
          if (!worker) return;
          worker.addEventListener('statechange', function(){
            if (worker.state === 'installed' && navigator.serviceWorker.controller){
              showToast('An update is ready. Tap the refresh button to get it.');
            }
          });
        });
      }).catch(function(){});
    });
  }

  function startApp(){
    if (started) return;
    started = true;
    el('auth-panel').hidden = true;
    el('app').hidden = false;
    applyFeatureFlags();
    resetMilkForm();
    resetSolidForm();
    if (FEATURES.medicine) resetMedForm();
    restoreView();
    renderAll();
    // Anything still waiting to go up is re-applied over what arrives, so the
    // app shows what was logged rather than what the database knows so far.
    store.onChange(function(next){ state = next; applyOutbox(); renderAll(); });
    store.load().then(function(loaded){
      state = loaded;
      applyOutbox();
      renderAll();
      renderOutbox();
      flushOutbox();
      restoreDrafts();
      if (store.kind === 'local') showNotice('Saving on this device only for now. Shared sync between phones comes once the database is connected.');
    }).catch(function(){
      showNotice('Couldn\u2019t load the log. Check your connection and tap refresh.');
    });
    if (store.kind === 'supabase' && cfg.env !== 'live'){
      showNotice('Staging copy. Anything logged here is test data and never reaches the live log.');
    }
    if (store.kind === 'supabase'){
      store.isAllowed().then(function(ok){
        if (!ok) showNotice('This account isn\u2019t on the family list yet, so it can\u2019t see or add anything. Ask the log owner to add it.');
      });
    }
  }

  function showAuth(){
    el('app').hidden = true;
    el('auth-panel').hidden = false;
  }

  if (store.kind === 'supabase'){
    el('sign-out').hidden = false;
    el('auth-email-block').hidden = !cfg.emailSignIn;
    el('auth-google').addEventListener('click', async function(){
      hideError('auth-error');
      var r = await store.signInWithGoogle();
      if (r && r.error) showError('auth-error', 'Couldn’t start Google sign-in: ' + r.error.message);
    });
    el('auth-form').addEventListener('submit', async function(ev){
      ev.preventDefault();
      hideError('auth-error');
      if (!cfg.emailSignIn) return;
      var email = el('auth-email').value.trim();
      if (!email){ showError('auth-error', 'Enter your email address.', 'auth-email'); return; }
      el('auth-submit').disabled = true;
      var r = await store.signIn(email);
      el('auth-submit').disabled = false;
      if (r.error){ showError('auth-error', 'Couldn\u2019t send the link: ' + r.error.message); return; }
      el('auth-hint').textContent = 'Check your email and open the link on this device.';
    });
    el('sign-out').addEventListener('click', async function(){
      await store.signOut();
      window.location.reload();
    });
    store.onAuth(function(session){ if (session) startApp(); else showAuth(); });
    store.getSession().then(function(session){ if (session) startApp(); else showAuth(); });
  } else {
    startApp();
  }
})();