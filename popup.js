// ============================================
// CLAUDE FUEL GAUGE — Popup Script
// ============================================
// Extracted from inline <script> to comply with
// Manifest V3 Content Security Policy (no inline scripts).
// ============================================

// On popup open: immediately inject gauge into all Claude tabs
chrome.runtime.sendMessage({ type: 'cfg-inject-all' });

// Render cached data
chrome.storage.local.get(['cfgState'], function (res) {
  var s = res.cfgState || {};
  render('session', s.session);
  render('weekly', s.weeklyAll);
  render('sonnet', s.weeklySonnet);

  if (s.lastUpdated) {
    var ago = Math.round((Date.now() - s.lastUpdated) / 60000);
    var statusEl = document.getElementById('status');
    statusEl.innerHTML = ago < 1
      ? '<span class="ok">\u25CF</span> Updated just now'
      : '<span class="ok">\u25CF</span> Updated ' + ago + 'm ago';
  }
});

function render(prefix, data) {
  var fill = document.getElementById(prefix + '-fill');
  var val = document.getElementById(prefix + '-val');
  var time = document.getElementById(prefix + '-time');
  if (!data || data.pct === null || data.pct === undefined) { val.textContent = '\u2014'; return; }
  var used = data.pct;
  fill.style.width = used + '%';
  fill.className = 'meter-fill ' + (used >= 80 ? 'low' : used >= 50 ? 'mid' : 'ok');
  val.textContent = used + '% used';
  if (used >= 80) val.style.color = '#e74c3c';
  var t = data.time || data.remaining || data.resets || '';
  if (t) time.textContent = 'Resets ' + t;
}

// Buttons
document.getElementById('btn-inject').addEventListener('click', function () {
  var btn = document.getElementById('btn-inject');
  btn.textContent = '\u2713 Injected!';
  btn.style.opacity = '0.6';
  chrome.runtime.sendMessage({ type: 'cfg-inject-all' });
  setTimeout(function () { btn.textContent = '\u26FD Activate All Tabs'; btn.style.opacity = '1'; }, 2000);
});

document.getElementById('btn-refresh').addEventListener('click', function () {
  var btn = document.getElementById('btn-refresh');
  btn.textContent = '\u27F3 Refreshing...';
  btn.style.opacity = '0.6';
  chrome.runtime.sendMessage({ type: 'cfg-refresh-manual' }, function () {
    setTimeout(function () {
      chrome.storage.local.get(['cfgState'], function (res) {
        var s = res.cfgState || {};
        render('session', s.session);
        render('weekly', s.weeklyAll);
        render('sonnet', s.weeklySonnet);
        btn.textContent = '\u27F3 Refresh Data';
        btn.style.opacity = '1';
      });
    }, 5000);
  });
});
