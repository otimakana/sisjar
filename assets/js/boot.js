/* SISJAR bootstrap: bridge legacy Google Apps Script calls to the Supabase API adapter. */
(function(){
  function makeRunner(success, failure){
    var runner = {
      withSuccessHandler:function(fn){ return makeRunner(fn, failure); },
      withFailureHandler:function(fn){ return makeRunner(success, fn); }
    };
    return new Proxy(runner, {
      get:function(target, prop){
        if(prop in target) return target[prop];
        return function(){
          var args = Array.prototype.slice.call(arguments);
          Promise.resolve().then(function(){
            if(!window.SISJAR_API || typeof window.SISJAR_API.call !== 'function') {
              throw new Error('SISJAR API belum termuat.');
            }
            return window.SISJAR_API.call(String(prop), args);
          }).then(function(res){
            if(typeof success === 'function') success(res);
          }).catch(function(err){
            console.error('[SISJAR] API error:', prop, err);
            if(typeof failure === 'function') failure(err);
          });
          return runner;
        };
      }
    });
  }

  // The migrated HTML still contains a number of legacy google.script.run calls.
  // Keep them working without requiring Google Apps Script at runtime.
  if(!window.google || !window.google.script || !window.google.script.run){
    window.google = window.google || {};
    window.google.script = window.google.script || {};
    window.google.script.run = makeRunner(null, null);
  }

  window.gmCall=function(name,args,ok,fail){
    window.SISJAR_API.call(name,args||[]).then(function(r){
      if(typeof ok === 'function') ok(r);
    }).catch(function(e){
      console.error('[SISJAR] gmCall error:', name, e);
      if(typeof fail === 'function') fail(e);
      else if(typeof window.showToast === 'function') window.showToast(e.message || 'Terjadi kesalahan.','error');
    });
  };

  window.getCredential=function(){
    // Legacy callers pass this value through to the adapter; the adapter uses
    // the current Supabase Auth session directly, so a Promise is acceptable.
    return window.SISJAR_SB?.auth?.getSession?.() || '';
  };
})();
