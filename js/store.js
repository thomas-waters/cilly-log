/*
 * Storage adapters. The app talks to a store through three calls:
 *   load()            -> Promise<state>
 *   apply(ops, state) -> Promise<void>   persist a batch of ops (the app has
 *                                         already applied them to `state`)
 *   onChange(cb)      -> called with a fresh state when another tab or device
 *                        changes the data
 * The Supabase store adds getSession / onAuth / signIn / signOut.
 */
(function(){
  var STATE_KEY = 'cilly-log.state';

  function emptyState(){
    return {
      status: { asleep: false, since: null, settleNotes: '', putDown: '' },
      settings: { dob: '', nightStart: '19:00', nightEnd: '06:00' },
      entries: [],
      feeds: [],
      solids: []
    };
  }

  function normalize(s){
    s = s && typeof s === 'object' ? s : {};
    var base = emptyState();
    s.status = Object.assign(base.status, s.status || {});
    s.settings = Object.assign(base.settings, s.settings || {});
    s.entries = Array.isArray(s.entries) ? s.entries : [];
    s.feeds = Array.isArray(s.feeds) ? s.feeds : [];
    s.solids = Array.isArray(s.solids) ? s.solids : [];
    return s;
  }

  // ---------------------------------------------------------------
  // Local store: one browser, one device. Used until Supabase is set up.
  // ---------------------------------------------------------------
  function localStore(){
    var listeners = [];
    function read(){
      try {
        var raw = window.localStorage.getItem(STATE_KEY);
        return normalize(raw ? JSON.parse(raw) : null);
      } catch (e) {
        return emptyState();
      }
    }
    window.addEventListener('storage', function(ev){
      if (ev.key !== STATE_KEY) return;
      var next = read();
      listeners.forEach(function(cb){ cb(next); });
    });
    return {
      kind: 'local',
      load: function(){ return Promise.resolve(read()); },
      apply: function(ops, state){
        try {
          window.localStorage.setItem(STATE_KEY, JSON.stringify(state));
          return Promise.resolve();
        } catch (e) {
          return Promise.reject({ code: 'storage_failed', message: String(e) });
        }
      },
      onChange: function(cb){ listeners.push(cb); }
    };
  }

  // ---------------------------------------------------------------
  // Supabase store: shared between everyone who is signed in and allowed.
  // ---------------------------------------------------------------
  function supabaseStore(cfg){
    var client = window.supabase.createClient(cfg.url, cfg.anonKey);
    var listeners = [];
    var channel = null;
    var reloadTimer = null;

    function rowToSleep(r){
      return { id: r.id, date: r.date, start: r.start_time, end: r.end_time,
        putDown: r.put_down || '', settleNotes: r.settle_notes || '', wakeNotes: r.wake_notes || '' };
    }
    function sleepToRow(e){
      return { id: e.id, date: e.date, start_time: e.start, end_time: e.end,
        put_down: e.putDown || '', settle_notes: e.settleNotes || '', wake_notes: e.wakeNotes || '' };
    }
    function rowToFeed(r){
      return { id: r.id, date: r.date, time: r.time, amountMl: r.amount_ml == null ? null : Number(r.amount_ml), notes: r.notes || '' };
    }
    function feedToRow(f){
      return { id: f.id, date: f.date, time: f.time, amount_ml: f.amountMl == null ? null : f.amountMl, notes: f.notes || '' };
    }
    function rowToSolid(r){
      return { id: r.id, date: r.date, time: r.time, foods: Array.isArray(r.foods) ? r.foods : [], notes: r.notes || '' };
    }
    function solidToRow(s){
      return { id: s.id, date: s.date, time: s.time, foods: s.foods || [], notes: s.notes || '' };
    }

    var TABLE = { entries: 'sleeps', feeds: 'feeds', solids: 'solids' };
    var TO_ROW = { entries: sleepToRow, feeds: feedToRow, solids: solidToRow };

    async function load(){
      var results = await Promise.all([
        client.from('sleeps').select('*'),
        client.from('feeds').select('*'),
        client.from('solids').select('*'),
        client.from('app_state').select('*')
      ]);
      for (var i = 0; i < results.length; i++){ if (results[i].error) throw results[i].error; }
      var state = emptyState();
      state.entries = results[0].data.map(rowToSleep);
      state.feeds = results[1].data.map(rowToFeed);
      state.solids = results[2].data.map(rowToSolid);
      results[3].data.forEach(function(row){
        if (row.key === 'status') state.status = Object.assign(state.status, row.value || {});
        if (row.key === 'settings') state.settings = Object.assign(state.settings, row.value || {});
      });
      return normalize(state);
    }

    async function apply(ops){
      for (var i = 0; i < ops.length; i++){
        var op = ops[i], res = null;
        if (op.type === 'upsert') res = await client.from(TABLE[op.collection]).upsert(TO_ROW[op.collection](op.record));
        else if (op.type === 'delete') res = await client.from(TABLE[op.collection]).delete().eq('id', op.id);
        else if (op.type === 'status') res = await client.from('app_state').upsert({ key: 'status', value: op.status });
        else if (op.type === 'settings') res = await client.from('app_state').upsert({ key: 'settings', value: op.settings });
        if (res && res.error) throw res.error;
      }
    }

    function scheduleReload(){
      if (reloadTimer) clearTimeout(reloadTimer);
      reloadTimer = setTimeout(function(){
        load().then(function(next){ listeners.forEach(function(cb){ cb(next); }); }).catch(function(){});
      }, 250);
    }

    function subscribe(){
      if (channel) return;
      channel = client.channel('cilly-log-changes');
      ['sleeps', 'feeds', 'solids', 'app_state'].forEach(function(table){
        channel.on('postgres_changes', { event: '*', schema: 'public', table: table }, scheduleReload);
      });
      channel.subscribe();
    }

    return {
      kind: 'supabase',
      load: load,
      apply: apply,
      onChange: function(cb){ listeners.push(cb); subscribe(); },
      getSession: async function(){
        var r = await client.auth.getSession();
        return r.data ? r.data.session : null;
      },
      isAllowed: async function(){
        var r = await client.rpc('is_family');
        return !r.error && r.data === true;
      },
      onAuth: function(cb){
        client.auth.onAuthStateChange(function(event, session){ cb(session, event); });
      },
      signIn: function(email){
        var redirect = window.location.origin + window.location.pathname;
        return client.auth.signInWithOtp({ email: email, options: { emailRedirectTo: redirect } });
      },
      signInWithGoogle: function(){
        var redirect = window.location.origin + window.location.pathname;
        return client.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: redirect } });
      },
      signOut: function(){ return client.auth.signOut(); }
    };
  }

  window.CillyStore = {
    emptyState: emptyState,
    normalize: normalize,
    local: localStore,
    supabase: supabaseStore
  };
})();
