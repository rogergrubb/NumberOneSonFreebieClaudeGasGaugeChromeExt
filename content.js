// ============================================
// CLAUDE FUEL GAUGE — Content Script v3.3
// ============================================
// Uses DOM-based existence check instead of window flag
// so re-injection from background.js always works even
// after React wipes the gauge element.
// ============================================

(function () {
  'use strict';

  var GAUGE_ID = 'claude-fuel-gauge';
  var MARKER_ID = 'cfg-script-loaded';

  // If our script marker AND gauge both exist, we're already running
  if (document.getElementById(MARKER_ID) && document.getElementById(GAUGE_ID)) return;

  // Drop a hidden marker so we know the listeners are registered
  // (even if gauge gets wiped, we don't re-register listeners)
  var listenersRegistered = !!document.getElementById(MARKER_ID);
  if (!listenersRegistered) {
    var marker = document.createElement('div');
    marker.id = MARKER_ID;
    marker.style.display = 'none';
    document.documentElement.appendChild(marker);
  }

  var state = {
    session: { pct: null, time: '' },
    weeklyAll: { pct: null, time: '' },
    weeklySonnet: { pct: null, time: '' },
    lastUpdated: null,
    collapsed: false,
  };

  // ─── BOOTSTRAP ───────────────────────────────

  chrome.storage.local.get(['cfgState'], function (res) {
    if (res.cfgState) state = merge(state, res.cfgState);
    boot();
  });

  function merge(base, inc) {
    return {
      session: inc.session || base.session,
      weeklyAll: inc.weeklyAll || base.weeklyAll,
      weeklySonnet: inc.weeklySonnet || base.weeklySonnet,
      lastUpdated: inc.lastUpdated || base.lastUpdated,
      collapsed: inc.collapsed !== undefined ? inc.collapsed : base.collapsed,
    };
  }

  function persist() {
    chrome.storage.local.set({ cfgState: state });
  }

  // ─── LISTEN FOR DATA UPDATES ─────────────────
  // Only register once (guard by marker)

  if (!listenersRegistered) {
    chrome.runtime.onMessage.addListener(function (msg) {
      if (msg.type === 'cfg-data-updated') {
        chrome.storage.local.get(['cfgState'], function (res) {
          if (res.cfgState) {
            state = merge(state, res.cfgState);
            ensureGauge();
            updateDisplay();
          }
        });
      }
    });

    chrome.storage.onChanged.addListener(function (changes) {
      if (changes.cfgState && changes.cfgState.newValue) {
        state = merge(state, changes.cfgState.newValue);
        ensureGauge();
        updateDisplay();
      }
    });
  }

  // ─── GAUGE DOM ───────────────────────────────

  function createGauge() {
    // Remove any stale gauge first
    var existing = document.getElementById(GAUGE_ID);
    if (existing) existing.remove();

    var bar = document.createElement('div');
    bar.id = GAUGE_ID;
    if (state.collapsed) bar.classList.add('cfg-collapsed');

    bar.innerHTML =
      '<div class="cfg-section" id="cfg-session" data-tooltip="">' +
        '<span class="cfg-label">Used</span>' +
        '<div class="cfg-gauge-wrap"><div class="cfg-gauge-fill cfg-level-ok" id="cfg-session-fill" style="width:0%"></div></div>' +
        '<span class="cfg-pct" id="cfg-session-pct">\u2014</span>' +
        '<span class="cfg-time" id="cfg-session-time"></span>' +
      '</div>' +
      '<div class="cfg-divider"></div>' +
      '<div class="cfg-section" id="cfg-weekly" data-tooltip="">' +
        '<span class="cfg-label">Weekly</span>' +
        '<div class="cfg-gauge-wrap"><div class="cfg-gauge-fill cfg-level-ok" id="cfg-weekly-fill" style="width:0%"></div></div>' +
        '<span class="cfg-pct" id="cfg-weekly-pct">\u2014</span>' +
        '<span class="cfg-time" id="cfg-weekly-time"></span>' +
      '</div>' +
      '<div class="cfg-divider"></div>' +
      '<div class="cfg-section" id="cfg-sonnet" data-tooltip="">' +
        '<span class="cfg-label">Sonnet</span>' +
        '<div class="cfg-gauge-wrap"><div class="cfg-gauge-fill cfg-level-ok" id="cfg-sonnet-fill" style="width:0%"></div></div>' +
        '<span class="cfg-pct" id="cfg-sonnet-pct">\u2014</span>' +
        '<span class="cfg-time" id="cfg-sonnet-time"></span>' +
      '</div>' +
      '<div class="cfg-divider"></div>' +
      '<a class="cfg-coffee" href="https://buy.stripe.com/aFaeVf6Qw8xT3vM9OEaIM0T" target="_blank" title="Buy the developer a coffee — $5">' +
        '\u2615 Buy Me a Coffee' +
      '</a>' +
      '<div class="cfg-controls">' +
        '<button class="cfg-btn" id="cfg-refresh" title="Refresh usage data">\u27F3</button>' +
        '<button class="cfg-btn" id="cfg-collapse" title="Minimize/expand">\u25B2</button>' +
      '</div>';

    document.documentElement.appendChild(bar);
    applySpacing(!state.collapsed);

    // Event listeners are on the element itself, so they
    // need to be re-attached every time we recreate
    document.getElementById('cfg-collapse').addEventListener('click', function (e) {
      e.stopPropagation();
      state.collapsed = !state.collapsed;
      bar.classList.toggle('cfg-collapsed', state.collapsed);
      document.getElementById('cfg-collapse').textContent = state.collapsed ? '\u25BC' : '\u25B2';
      applySpacing(!state.collapsed);
      persist();
    });

    bar.addEventListener('click', function () {
      if (state.collapsed) {
        state.collapsed = false;
        bar.classList.remove('cfg-collapsed');
        document.getElementById('cfg-collapse').textContent = '\u25B2';
        applySpacing(true);
        persist();
      }
    });

    document.getElementById('cfg-refresh').addEventListener('click', function (e) {
      e.stopPropagation();
      var btn = document.getElementById('cfg-refresh');
      btn.classList.add('cfg-spinning');

      if (tryReadSettings()) {
        setTimeout(function () { btn.classList.remove('cfg-spinning'); }, 500);
        return;
      }

      chrome.runtime.sendMessage({ type: 'cfg-refresh' }, function () {
        setTimeout(function () { btn.classList.remove('cfg-spinning'); }, 3000);
      });
    });
  }

  function applySpacing(expanded) {
    if (document.body) {
      document.body.style.setProperty('padding-top', expanded ? '38px' : '6px', 'important');
    }
  }

  function ensureGauge() {
    if (!document.getElementById(GAUGE_ID)) {
      createGauge();
      updateDisplay();
    }
  }

  // ─── DISPLAY ─────────────────────────────────

  function updateDisplay() {
    if (!document.getElementById(GAUGE_ID)) return;
    renderSection('cfg-session', state.session.pct, state.session.time);
    renderSection('cfg-weekly', state.weeklyAll.pct, state.weeklyAll.time);
    renderSection('cfg-sonnet', state.weeklySonnet.pct, state.weeklySonnet.time);
  }

  function renderSection(prefix, usedPct, timeStr) {
    var fill = document.getElementById(prefix + '-fill');
    var pctEl = document.getElementById(prefix + '-pct');
    var timeEl = document.getElementById(prefix + '-time');
    var section = document.getElementById(prefix);

    if (usedPct === null || usedPct === undefined) {
      if (pctEl) pctEl.textContent = '\u2014';
      return;
    }

    var remaining = Math.max(0, Math.min(100, 100 - usedPct));

    if (fill) {
      fill.style.width = usedPct + '%';
      fill.className = 'cfg-gauge-fill ' + (usedPct >= 80 ? 'cfg-level-low' : usedPct >= 50 ? 'cfg-level-mid' : 'cfg-level-ok');
    }
    if (pctEl) {
      pctEl.textContent = usedPct + '%';
      pctEl.style.color = usedPct >= 80 ? '#e74c3c' : '';
    }
    if (timeEl) timeEl.textContent = timeStr || '';
    if (section) {
      section.setAttribute('data-tooltip', usedPct + '% used \u00B7 ' + remaining + '% left' + (timeStr ? ' \u00B7 ' + timeStr : ''));
    }
  }

  // ─── SETTINGS PAGE DIRECT READ ───────────────

  function tryReadSettings() {
    if (window.location.href.indexOf('/settings') === -1) return false;
    var text = (document.body && (document.body.innerText || document.body.textContent)) || '';
    if (text.indexOf('% used') === -1) return false;
    chrome.runtime.sendMessage({ type: 'cfg-settings-data', text: text });
    return true;
  }

  function watchSettings() {
    if (window.location.href.indexOf('/settings') === -1) return;
    var observer = new MutationObserver(function () { tryReadSettings(); });
    if (document.body) observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    [2000, 4000, 7000, 10000].forEach(function (ms) { setTimeout(tryReadSettings, ms); });
  }

  // ─── SPA NAV WATCHER ─────────────────────────

  function watchNav() {
    var lastUrl = window.location.href;
    var observer = new MutationObserver(function () {
      if (window.location.href !== lastUrl) {
        lastUrl = window.location.href;
        ensureGauge();
        if (lastUrl.indexOf('/settings') !== -1) {
          [2000, 4000, 7000].forEach(function (ms) { setTimeout(tryReadSettings, ms); });
        }
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  // ─── BOOT ────────────────────────────────────

  function boot() {
    if (!document.body) {
      document.addEventListener('DOMContentLoaded', boot);
      return;
    }
    createGauge();
    updateDisplay();

    // Only set up watchers once (first injection)
    if (!listenersRegistered) {
      watchSettings();
      watchNav();
      setInterval(ensureGauge, 3000);
    }
  }
})();
