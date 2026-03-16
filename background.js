// ============================================
// CLAUDE FUEL GAUGE — Background Worker v3.2
// ============================================
// CRITICAL FIX: No automatic tab spawning.
//
// Data sources (in priority order):
// 1. Content script on /settings page sends data directly
// 2. Periodic alarm checks EXISTING settings tabs (no new tabs)
// 3. Manual "Refresh" from popup opens ONE background tab,
//    reads it, closes it immediately
//
// Tab injection:
// - On install/startup: inject into all existing Claude tabs
// - On tab update: inject into newly loaded Claude tabs
// - On popup open: inject into all Claude tabs
// ============================================

const ALARM_NAME = 'cfg-refresh';
const REFRESH_MINUTES = 2;

// ─── ALARMS ────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: REFRESH_MINUTES });
  injectIntoAllClaudeTabs();
});

chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: REFRESH_MINUTES });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) {
    // ONLY read from tabs that are ALREADY open on settings
    // NEVER create a new tab automatically
    readFromExistingSettingsTabs();
  }
});

// ─── AUTO-INJECT on new Claude tab loads ───────

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url && tab.url.startsWith('https://claude.ai')) {
    injectIntoTab(tabId);

    // Bonus: if this tab IS the settings page, read it
    if (tab.url.includes('/settings')) {
      setTimeout(() => readSettingsFromTab(tabId), 3000);
    }
  }
});

// ─── MESSAGES ──────────────────────────────────

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'cfg-inject-all') {
    injectIntoAllClaudeTabs().then(() => sendResponse({ ok: true }));
    return true;
  }

  if (msg.type === 'cfg-refresh-manual') {
    // Manual refresh from popup — this is the ONLY path that
    // is allowed to open a temporary background tab
    manualRefreshViaTab().then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false }));
    return true;
  }

  if (msg.type === 'cfg-refresh') {
    // From content script refresh button — try existing tabs first,
    // only spawn if nothing found
    readFromExistingSettingsTabs().then((found) => {
      if (!found) {
        manualRefreshViaTab().then(() => sendResponse({ ok: true }));
      } else {
        sendResponse({ ok: true });
      }
    });
    return true;
  }

  if (msg.type === 'cfg-settings-data') {
    processExtractedText(msg.text);
    sendResponse({ ok: true });
  }
});

// ─── READ FROM EXISTING SETTINGS TABS ONLY ─────
// This NEVER creates new tabs. Returns true if data was found.

async function readFromExistingSettingsTabs() {
  try {
    const tabs = await chrome.tabs.query({ url: 'https://claude.ai/settings*' });
    if (tabs.length === 0) return false;

    for (const tab of tabs) {
      const found = await readSettingsFromTab(tab.id);
      if (found) return true;
    }
  } catch (err) {
    console.log('[CFG BG] readFromExistingSettingsTabs error:', err.message);
  }
  return false;
}

async function readSettingsFromTab(tabId) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => document.body ? (document.body.innerText || '') : '',
    });

    if (results && results[0] && results[0].result) {
      const text = results[0].result;
      if (text.indexOf('% used') !== -1) {
        processExtractedText(text);
        return true;
      }
    }
  } catch (err) {
    console.log('[CFG BG] readSettingsFromTab error:', err.message);
  }
  return false;
}

// ─── MANUAL REFRESH (popup button only) ────────
// Opens a temporary tab, reads it, closes it.
// This is the ONLY function that creates a tab.

async function manualRefreshViaTab() {
  let tabId = null;
  try {
    // First try existing settings tabs
    const existing = await chrome.tabs.query({ url: 'https://claude.ai/settings*' });
    if (existing.length > 0) {
      await readSettingsFromTab(existing[0].id);
      return;
    }

    // Create a temporary background tab
    const tab = await chrome.tabs.create({
      url: 'https://claude.ai/settings',
      active: false,
    });
    tabId = tab.id;

    await waitForTab(tabId);
    await sleep(5000);

    // Try reading up to 3 times
    for (let i = 0; i < 3; i++) {
      const found = await readSettingsFromTab(tabId);
      if (found) break;
      await sleep(2000);
    }

  } catch (err) {
    console.warn('[CFG BG] manualRefreshViaTab error:', err.message);
  } finally {
    // ALWAYS close the tab we created
    if (tabId) {
      try { await chrome.tabs.remove(tabId); } catch (e) {}
    }
  }
}

// ─── INJECT GAUGE INTO TABS ────────────────────

async function injectIntoAllClaudeTabs() {
  try {
    const tabs = await chrome.tabs.query({ url: 'https://claude.ai/*' });
    for (const tab of tabs) {
      await injectIntoTab(tab.id);
    }
  } catch (err) {
    console.warn('[CFG BG] injectIntoAllClaudeTabs error:', err.message);
  }
}

async function injectIntoTab(tabId) {
  try {
    // Always inject CSS (idempotent — Chrome deduplicates)
    await chrome.scripting.insertCSS({ target: { tabId }, files: ['gauge.css'] });

    // Check if gauge DOM element exists
    const check = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => !!document.getElementById('claude-fuel-gauge'),
    });

    // If gauge element is missing, inject the script
    // (content.js handles its own listener dedup via a hidden marker)
    if (!check || !check[0] || !check[0].result) {
      await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
    }
  } catch (err) {
    // Tab not ready or restricted
  }
}

// ─── PARSE USAGE TEXT ──────────────────────────

function processExtractedText(text) {
  if (!text || text.indexOf('% used') === -1) return;

  const pctMatches = [...text.matchAll(/(\d+)%\s*used/gi)];
  const resetMatches = [...text.matchAll(/Resets?\s+(.*?)(?:\n|$)/gi)];
  if (pctMatches.length === 0) return;

  const data = {
    session: { pct: null, time: '' },
    weeklyAll: { pct: null, time: '' },
    weeklySonnet: { pct: null, time: '' },
    lastUpdated: Date.now(),
  };

  if (pctMatches.length >= 1) {
    data.session.pct = parseInt(pctMatches[0][1], 10);
    data.session.time = resetMatches.length >= 1 ? resetMatches[0][1].trim() : '';
  }
  if (pctMatches.length >= 2) {
    data.weeklyAll.pct = parseInt(pctMatches[1][1], 10);
    data.weeklyAll.time = resetMatches.length >= 2 ? resetMatches[1][1].trim() : '';
  }
  if (pctMatches.length >= 3) {
    data.weeklySonnet.pct = parseInt(pctMatches[2][1], 10);
    data.weeklySonnet.time = resetMatches.length >= 3 ? resetMatches[2][1].trim() : '';
  }

  chrome.storage.local.get(['cfgState'], (res) => {
    const existing = res.cfgState || {};
    chrome.storage.local.set({ cfgState: { ...existing, ...data } }, () => {
      chrome.tabs.query({ url: 'https://claude.ai/*' }, (tabs) => {
        tabs.forEach((t) => {
          chrome.tabs.sendMessage(t.id, { type: 'cfg-data-updated' }).catch(() => {});
        });
      });
    });
  });
}

// ─── UTILS ─────────────────────────────────────

function waitForTab(tabId) {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    }, 15000);
    function listener(id, info) {
      if (id === tabId && info.status === 'complete') {
        clearTimeout(timeout);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }
    chrome.tabs.onUpdated.addListener(listener);
  });
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}
