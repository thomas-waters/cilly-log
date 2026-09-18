(function(){
  var ICON = {
    pencil: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 20h4L18.5 9.5a2 2 0 0 0 0-2.8l-1.2-1.2a2 2 0 0 0-2.8 0L4 15.5V20Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
    moon: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" fill="currentColor"/></svg>',
    bottle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><path d="M10 2.5h4v2.5h-4z"/><path d="M9 5h6l1.5 3h-9z"/><path d="M8 8h8v10.5A2.5 2.5 0 0 1 13.5 21h-3A2.5 2.5 0 0 1 8 18.5z"/><path d="M8 12h8M8 15.5h8"/></svg>',
    bowl: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><path d="M3 11h18a9 9 0 0 1-18 0z"/><path d="M8 11c0-3 1.6-5 4-5s4 2 4 5"/><path d="M6 20h12"/></svg>'
  };
  var TYPE_ICON = { sleep: ICON.moon, milk: ICON.bottle, solids: ICON.bowl };
  var VIEWS = ['home', 'sleep', 'milk', 'solids', 'summary'];
  var DRAFT_KEY = 'cilly.draft', VIEW_KEY = 'cilly.view';
  var DRAFT_MAX_AGE = 30 * 60000;
  var FORM_FIELDS = {
    'entry-form': ['entry-id', 'f-date', 'f-putdown', 'f-start', 'f-end', 'f-settle', 'f-wake'],
    'milk-form': ['m-id', 'm-date', 'm-time', 'm-amount', 'm-notes'],
    'solid-form': ['s-id', 's-date', 's-time', 's-food', 's-notes']
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
  function isNight(e){
    var m = minutesOf(e.start), b = nightBounds();
    return b.start > b.end ? (m >= b.start || m < b.end) : (m >= b.start && m < b.end);
  }
  // Would a sleep starting at this moment count as night sleep?
  function clockIsNight(d){
    var m = d.getHours() * 60 + d.getMinutes(), b = nightBounds();
    return b.start > b.end ? (m >= b.start || m < b.end) : (m >= b.start && m < b.end);
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
  function settleMinutes(e){
    if (!e.putDown) return null;
    var d = minutesOf(e.start) - minutesOf(e.putDown);
    if (d < 0) d += 1440;
    return d > 360 ? null : d;
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

  var POSITION_WORDS = { first: 'before the first nap', mid: 'between naps', last: 'before bed' };

  // When the next sleep is likely due, and what to call it.
  //
  // Wake windows describe the day only, so during night hours this returns
  // kind 'night' and no times at all: a baby who wakes at 2am should go back
  // down, not wait out a three-hour window.
  //
  // For the last sleep of the day the age band's bedtime range leads and the
  // wake window adjusts it, rather than the other way round. Adding a wake
  // window to a late nap is what used to push bedtime past eight o'clock.
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
      if (band.bedtime){
        bedRange = band.bedtime;
        var from = clockAt(band.bedtime[0], now), to = clockAt(band.bedtime[1], now);
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
    setView(view);
    ssSet(VIEW_KEY, view);
    hideChartTooltip();
    window.scrollTo({ top: 0 });
  }

  function restoreView(){
    var v = ssGet(VIEW_KEY);
    setView(VIEWS.indexOf(v) >= 0 ? v : 'home');
  }

  function openEditor(kind, id){
    if (readOnly){ goTo(kind); return; }
    if (kind === 'sleep'){ goTo('sleep'); openForm(id); }
    else if (kind === 'milk'){ editMilk(id, false); }
    else if (kind === 'solids'){ editSolid(id, false); }
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
      entry.open = !el('form-panel').hidden;
    }
    if (formId === 'solid-form') entry.foods = solidDraftFoods.slice();
    if (formId === 'milk-form') entry.bottle = el('m-bottle').checked;
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
        el('form-panel').hidden = false;
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
        snapshotForm('milk-form');
      }
    }

    var so = draft['solid-form'];
    if (so){
      var solidId = so.fields['s-id'];
      if (!solidId || editSolid(solidId, true)){
        setFields(so.fields);
        solidDraftFoods = (so.foods || []).slice();
        renderFoodHelpers();
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
    renderSleep();
    renderMilk();
    renderSolids();
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
    if (!before) return '<span class="summary-delta">no figure for the week before</span>';
    var diff = now - before;
    var pct = Math.round((diff / before) * 100);
    if (Math.abs(pct) < 1) return '<span class="summary-delta">about the same as the week before</span>';
    var dir = diff > 0 ? 'up' : 'down';
    var arrow = diff > 0 ? '↑' : '↓';
    return '<span class="summary-delta" data-dir="' + dir + '">' + arrow + ' ' + format(Math.abs(diff)) +
      ' (' + (diff > 0 ? '+' : '−') + Math.abs(pct) + '%) vs the week before</span>';
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

  function renderSummary(){
    var thisWeek = statsFor(dayKeysEndingToday(0, 7));
    var lastWeek = statsFor(dayKeysEndingToday(1, 7));
    var perDay = function(v){ return (Math.round(v * 10) / 10) + ' a day'; };
    var meals = perDay;

    el('summary-grid').innerHTML =
      summaryTile('Sleep a day', thisWeek.sleepPerDayMs ? fmtDur(thisWeek.sleepPerDayMs) : '—', thisWeek.sleepPerDayMs, lastWeek.sleepPerDayMs, fmtDur, thisWeek.sleepDays) +
      summaryTile('Longest night stretch', thisWeek.longestNightMs ? fmtDur(thisWeek.longestNightMs) : '—', thisWeek.longestNightMs, lastWeek.longestNightMs, fmtDur) +
      summaryTile('Feeds a day', thisWeek.feedsPerDay ? Math.round(thisWeek.feedsPerDay * 10) / 10 : '—', thisWeek.feedsPerDay, lastWeek.feedsPerDay, perDay, thisWeek.milkDays) +
      summaryTile('Meals a day', thisWeek.mealsPerDay ? Math.round(thisWeek.mealsPerDay * 10) / 10 : '—', thisWeek.mealsPerDay, lastWeek.mealsPerDay, meals, thisWeek.mealsDays);

    renderDayTable();
    renderNorms();
    el('print-heading').textContent = 'Cilly Log — 7 days to ' +
      new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

    var sub = thisWeek.sleepPerDayMs ? fmtDur(thisWeek.sleepPerDayMs) + ' sleep a day this week' : 'Nothing logged this week';
    if (thisWeek.feedsPerDay) sub += ' · ' + perDay(thisWeek.feedsPerDay) + ' feeds';
    el('home-summary-sub').textContent = sub;
  }

  // How the last 7 days sit against the ranges for their age. These are
  // population ranges, not targets, and the note under the table says so.
  function renderNorms(){
    var panel = el('norms-panel'), age = currentAge();
    if (!age){ panel.hidden = true; return; }
    panel.hidden = false;
    var band = age.band;

    var set = {};
    dayKeysEndingToday(0, 7).forEach(function(k){ set[k] = true; });
    var night = {}, day = {}, naps = {}, total = {};
    state.entries.forEach(function(e){
      var key = sleepDayKey(e);
      if (!set[key]) return;
      var dur = entryEnd(e) - entryStart(e);
      total[key] = (total[key] || 0) + dur;
      if (isNight(e)) night[key] = (night[key] || 0) + dur;
      else { day[key] = (day[key] || 0) + dur; naps[key] = (naps[key] || 0) + 1; }
    });

    function row(label, avg, low, high, format){
      var usual = low === high ? format(low) : format(low) + ' – ' + format(high);
      if (!avg) return '<tr><td>' + label + '</td><td>—</td><td>' + usual + '</td><td>—</td></tr>';
      var flag = avg < low ? ['down', 'below'] : avg > high ? ['up', 'above'] : ['', 'in range'];
      return '<tr>' +
        '<td>' + label + '</td>' +
        '<td>' + format(avg) + '</td>' +
        '<td>' + usual + '</td>' +
        '<td><span class="norm-flag"' + (flag[0] ? ' data-dir="' + flag[0] + '"' : '') + '>' + flag[1] + '</span></td>' +
      '</tr>';
    }
    var hours = function(ms){ return fmtDur(ms); };
    var count = function(n){ return Math.round(n * 10) / 10; };
    var mins = function(m){ return m * 60000; };

    el('norms-age').textContent = band.label;
    el('norms-table').innerHTML =
      '<thead><tr><th>Sleep</th><th>Average</th><th>Usual at this age</th><th></th></tr></thead><tbody>' +
      row('Night', averageOver(night).avg, mins(band.nightSleep[0]), mins(band.nightSleep[1]), hours) +
      row('Naps', averageOver(day).avg, mins(band.daySleep[0]), mins(band.daySleep[1]), hours) +
      row('Total in 24h', averageOver(total).avg, mins(band.total[0]), mins(band.total[1]), hours) +
      row('Naps a day', averageOver(naps).avg, band.naps[0], band.naps[1], count) +
      '</tbody>';

    el('norms-note').textContent = (band.note ? band.note + ' ' : '') +
      MODEL.sources + ' Every baby is different, and a week outside a range is not a problem by itself ' +
      '— it is a question for your health visitor or GP, not a verdict.';
  }

  function renderDayTable(){
    var keys = dayKeysEndingToday(0, 7).slice().reverse();
    var rows = keys.map(function(key){
      var night = 0, naps = 0, feeds = 0, meals = 0;
      state.entries.forEach(function(e){
        if (sleepDayKey(e) !== key) return;
        var dur = entryEnd(e) - entryStart(e);
        if (isNight(e)) night += dur; else naps += dur;
      });
      state.feeds.forEach(function(f){ if (f.date === key) feeds++; });
      state.solids.forEach(function(s){ if (s.date === key) meals++; });
      return { key: key, night: night, naps: naps, feeds: feeds, meals: meals };
    });

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
    var loggedDays = rows.filter(function(r){ return r.night + r.naps + r.feeds + r.meals > 0; }).length;

    var body = rows.map(function(r){
      return '<tr>' +
        '<td>' + friendlyDate(r.key) + '</td>' +
        '<td>' + (r.night ? fmtDur(r.night) : '—') + '</td>' +
        '<td>' + (r.naps ? fmtDur(r.naps) : '—') + '</td>' +
        '<td>' + ((r.night + r.naps) ? fmtDur(r.night + r.naps) : '—') + '</td>' +
        '<td>' + (r.feeds || '—') + '</td>' +
        '<td>' + (r.meals || '—') + '</td>' +
      '</tr>';
    }).join('');

    el('day-table').innerHTML =
      '<thead><tr><th>Day</th><th>Night</th><th>Naps</th><th>Total</th><th>Feeds</th><th>Meals</th></tr></thead>' +
      '<tbody>' + body + '</tbody>' +
      '<tfoot><tr>' +
        '<td>Average</td>' +
        '<td>' + (avg.night ? fmtDur(avg.night) : '—') + '</td>' +
        '<td>' + (avg.naps ? fmtDur(avg.naps) : '—') + '</td>' +
        '<td>' + (avg.total ? fmtDur(avg.total) : '—') + '</td>' +
        '<td>' + (avg.feeds ? Math.round(avg.feeds * 10) / 10 : '—') + '</td>' +
        '<td>' + (avg.meals ? Math.round(avg.meals * 10) / 10 : '—') + '</td>' +
      '</tr></tfoot>';

    el('day-table-note').textContent = loggedDays === 7
      ? 'Averages cover all 7 days.'
      : 'Averages count only days with something logged (' + plural(loggedDays, 'day') + ' of 7). Each column counts its own days.';
  }

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
      labelEl.textContent = 'Night so far';
      winEl.textContent = night.ms ? fmtDur(night.ms) : '—';
      stEl.dataset.state = 'night';
      stEl.textContent = night.ms
        ? 'usually ' + fmtDur(band.nightSleep[0] * 60000) + '–' + fmtDur(band.nightSleep[1] * 60000) +
          (night.wakings ? ' · ' + plural(night.wakings, 'waking') : '')
        : 'nothing logged for tonight yet';
      foot.textContent = 'Settle them back when you can, lights low and as little fuss as possible. ' +
        'Wake windows are a daytime guide, so the app is not counting one now.';
      if (awake >= SPLIT_NIGHT_MS) renderSplitHint(win, night);
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
        note = 'Usual bedtime at ' + win.band.label + ' is ' + usual + '. ';
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
    days.forEach(function(d){ d.sum = 0; d.count = 0; byKey[d.key] = d; });
    state.entries.forEach(function(e){
      var s = settleMinutes(e); var d = byKey[e.date];
      if (s === null || !d) return;
      d.sum += s; d.count++;
    });
    renderBars('settle-wrap', {
      label: 'Average minutes to settle per day, last 14 days',
      days: days.map(function(d){
        var avg = d.count ? d.sum / d.count : 0;
        return { key: d.key, date: d.date,
          segments: [{ minutes: avg, cls: 'chart-seg-night' }],
          tip: dayLabel(d, todayKey) + ' · ' + (d.count ? Math.round(avg) + 'm to settle on average (' + plural(d.count, 'sleep') + ')' : 'No put-down times logged') };
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
  function tick(){
    if (state.status.asleep) el('status-timer').textContent = fmtDur(Date.now() - new Date(state.status.since).getTime());
    renderWakeCard();
    renderHomeSleepSub();
  }

  var formMode = 'entry';

  function applyMode(){
    var isStart = formMode === 'start';
    var isWake = formMode === 'wake';
    el('field-date').hidden = isStart;
    el('field-end').hidden = isStart;
    el('field-wake').hidden = isStart;
    el('chips-start').hidden = !isStart;
    el('chips-end').hidden = !isWake;
    el('chips-putdown').hidden = !(isStart || isWake);

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
    var panel = el('form-panel');
    panel.hidden = false;
    hideError('form-error');
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
    el('form-panel').hidden = true;
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

  el('add-btn').addEventListener('click', function(){ openForm(null); });
  el('f-cancel').addEventListener('click', closeForm);

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
      closeForm();
      await commit([{ type: 'status', status: status }]);
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
    closeForm();
    await commit(ops);
  });

  el('f-danger').addEventListener('click', async function(){
    var ops;
    if (formMode === 'entry'){
      var id = el('entry-id').value;
      if (!id){ closeForm(); return; }
      ops = [{ type: 'delete', collection: 'entries', id: id }];
    } else {
      ops = [{ type: 'status', status: { asleep: false, since: null, settleNotes: '' } }];
    }
    closeForm();
    await commit(ops);
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
    el('m-cancel').hidden = true;
    setBottleFields();
    renderUnitControls();
    hideError('m-error');
    clearDraft('milk-form');
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
    el('m-cancel').hidden = false;
    setBottleFields();
    renderUnitControls();
    hideError('m-error');
    snapshotForm('milk-form');
    if (!quiet) el('m-time').focus();
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
    resetMilkForm();
    await commit([{ type: 'upsert', collection: 'feeds', record: feed }]);
  });

  el('m-cancel').addEventListener('click', resetMilkForm);
  el('m-delete').addEventListener('click', async function(){
    var id = el('m-id').value;
    resetMilkForm();
    if (id) await commit([{ type: 'delete', collection: 'feeds', id: id }]);
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
    el('s-cancel').hidden = true;
    hideError('s-error');
    renderFoodHelpers();
    clearDraft('solid-form');
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
    el('s-cancel').hidden = false;
    hideError('s-error');
    renderFoodHelpers();
    snapshotForm('solid-form');
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

  function renderSolids(){
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
    resetSolidForm();
    await commit([{ type: 'upsert', collection: 'solids', record: meal }]);
  });

  el('s-cancel').addEventListener('click', resetSolidForm);
  el('s-delete').addEventListener('click', async function(){
    var id = el('s-id').value;
    resetSolidForm();
    if (id) await commit([{ type: 'delete', collection: 'solids', id: id }]);
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

  function openSettings(){
    if (readOnly) return;
    var s = state.settings || {};
    el('set-dob').value = s.dob || '';
    el('set-night-start').value = s.nightStart || '19:00';
    el('set-night-end').value = s.nightEnd || '06:00';
    hideError('set-error');
    el('settings-overlay').hidden = false;
    el('set-dob').focus();
  }
  function closeSettings(){ el('settings-overlay').hidden = true; }

  el('settings-btn').addEventListener('click', openSettings);
  el('set-cancel').addEventListener('click', closeSettings);
  el('settings-close').addEventListener('click', closeSettings);
  el('settings-overlay').addEventListener('click', function(ev){
    if (ev.target === el('settings-overlay')) closeSettings();
  });
  document.addEventListener('keydown', function(ev){
    if (ev.key === 'Escape' && !el('settings-overlay').hidden) closeSettings();
  });
  el('settings-form').addEventListener('submit', async function(ev){
    ev.preventDefault();
    hideError('set-error');
    var dob = el('set-dob').value, ns = el('set-night-start').value, ne = el('set-night-end').value;
    if (dob && dob > dateKey(new Date())){ showError('set-error', 'The date of birth can’t be in the future.', 'set-dob'); return; }
    if (!ns || !ne){ showError('set-error', 'Enter both night times.', ns ? 'set-night-end' : 'set-night-start'); return; }
    closeSettings();
    await commit([{ type: 'settings', settings: Object.assign({}, state.settings, { dob: dob, nightStart: ns, nightEnd: ne }) }]);
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
  async function persist(ops){
    try {
      await store.apply(ops, state);
    } catch (e) {
      showToast('Couldn\u2019t save that. Check your connection and try again.');
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
      } else if (chip.hasAttribute('data-food')){
        addDraftFood(chip.getAttribute('data-food'));
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
    resetMilkForm();
    resetSolidForm();
    restoreView();
    renderAll();
    store.onChange(function(next){ state = next; renderAll(); });
    store.load().then(function(loaded){
      state = loaded;
      renderAll();
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