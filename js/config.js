// Public client configuration. Publishable keys are safe to ship in the
// browser: row-level security in the database decides what a signed-in user
// may do. The secret keys never go here.
//
// Only the exact live URL uses the live database. Everything else — the
// /staging/ deployment and local testing — uses the staging project, so
// experiments can never touch the real log.
(function(){
  // Features that can be switched off without unpicking the code: off means
  // the app behaves as it did before the feature existed, with no leftover
  // buttons. `medicine` needs its table in the database, so it stays off on
  // an environment until the migration has been run there.
  var ENVIRONMENTS = {
    live: {
      supabaseUrl: 'https://hopvsalkhtgrqbbkioqn.supabase.co',
      supabaseAnonKey: 'sb_publishable_IXpyCf7727af0cpGUfP9_Q_R2VOZSJm',
      features: { medicine: false, nightMode: true }
    },
    staging: {
      supabaseUrl: 'https://kmcviicuibnetrbzcctd.supabase.co',
      supabaseAnonKey: 'sb_publishable__E2EZvlD4A73QaPx0GlDyQ_pFWFptyB',
      features: { medicine: true, nightMode: true }
    }
  };

  var isLive = window.location.hostname === 'thomas-waters.github.io' &&
    window.location.pathname.indexOf('/staging/') < 0;
  var env = isLive ? 'live' : 'staging';

  // ?store=local runs the app against this browser's own storage with no
  // sign-in, for looking at the interface without touching any database.
  var forceLocal = window.location.search.indexOf('store=local') >= 0;

  // Sign-in is by Google only. The emailed magic link is disabled in Supabase
  // (its free tier sends only a couple of messages an hour), so the app does
  // not offer it. Set this back to true if that provider is turned on again.
  var emailSignIn = false;

  window.CILLY_CONFIG = Object.assign(
    { env: env, forceLocal: forceLocal, emailSignIn: emailSignIn },
    ENVIRONMENTS[env]
  );
})();
