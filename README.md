# ⛽ Claude Fuel Gauge — Chrome Extension

**A free, persistent usage gauge that sits at the top of every claude.ai tab showing exactly how much of your session and weekly token allotment you've burned through.**

Built by [NumberOneSonSoftware](https://github.com/rogergrubb)

---

## What It Does

If you use Claude Pro or Max, you know the pain: you're deep in a conversation and suddenly hit a rate limit with no warning. This extension fixes that by adding a thin, always-visible fuel gauge bar to the top of every claude.ai page.

**Three color-coded gauges show your usage at a glance:**

- **USED** (amber/gold) — Your 5-hour rolling session consumption. Shows how much of your current session window you've burned.
- **WEEKLY** (teal/cyan) — Your weekly all-models usage across Claude. Resets on a 7-day cycle.
- **SONNET** (periwinkle/blue) — Your weekly Sonnet-only usage, tracked separately.

**Color states:**
- **Section color** (green range) — Plenty of fuel, you're fine
- **Orange** — 50-79% used, pace yourself
- **Red (pulsing)** — 80%+ used, you're running low

## How It Works (Technical)

This extension does NOT require an API key. There is no public API for Claude.ai usage data. Instead, it uses Chrome extension privileges to read your usage percentages directly:

1. **Content script** (`content.js`) injects the gauge bar UI into every claude.ai page and keeps it alive even when React re-renders the SPA.

2. **Background service worker** (`background.js`) uses `chrome.scripting.executeScript()` to read the rendered DOM of your Claude settings page. This bypasses CORS because Chrome extensions with `host_permissions` run in their own privileged origin.

3. When you visit Settings > Usage, the content script reads the live DOM text ("24% used", "16% used", etc.) and sends it to the background worker for parsing.

4. Parsed data is cached in `chrome.storage.local` so it persists across all tabs and browser restarts.

5. **No tabs are spawned automatically.** The 2-minute refresh alarm only reads from settings tabs you already have open. A temporary background tab is only created when you manually click "Refresh Data" in the popup.

6. Clicking the extension icon immediately injects the gauge into **all open Claude tabs** without reloading them, using `chrome.scripting.insertCSS()` + `chrome.scripting.executeScript()`.

## Features

- **Persistent top bar** on every claude.ai page with three usage gauges
- **One-click activation** — click the extension icon to inject into all open Claude tabs instantly, no reload needed
- **Color-coded sections** — each gauge has its own identity color (amber, teal, periwinkle) so you can tell them apart at a glance
- **Warning states** — gauges shift from section color → orange → pulsing red as usage climbs
- **Collapsible** — click the glowing ▲ button to minimize to a 4px strip; click it again to expand
- **Hover tooltips** — hover any section to see "X% used · Y% left · Resets [time]"
- **Popup dashboard** — click the extension icon for a detailed breakdown with "Activate All Tabs" and "Refresh Data" buttons
- **Zero external dependencies** — no API keys, no third-party services, everything runs locally
- **Auto-inject on new tabs** — any new claude.ai tab that opens automatically gets the gauge
- **React-resistant** — the gauge re-injects itself every 3 seconds if React wipes the DOM

## Installation

1. **Download** this repository (click Code → Download ZIP) or clone it
2. **Unzip** to a folder on your computer
3. Open Chrome → navigate to `chrome://extensions`
4. Toggle **Developer mode** ON (top-right corner)
5. Click **Load unpacked** → select the unzipped folder
6. **Pin the extension** — click the puzzle piece icon in Chrome's toolbar, then pin "Claude Fuel Gauge"
7. Navigate to `claude.ai` — the gauge appears at the top
8. Visit **Settings > Usage** once to prime the data, then it stays cached

## File Structure

```
claude-fuel-gauge/
├── manifest.json      # Chrome extension manifest v3
├── background.js      # Service worker — tab injection, data fetching, parsing
├── content.js         # Content script — gauge UI rendering, DOM reading
├── gauge.css          # All gauge styling, per-section colors, animations
├── popup.html         # Extension icon popup — dashboard + action buttons
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md
```

## Permissions Explained

- **storage** — Cache usage data locally so it persists across tabs
- **scripting** — Inject gauge CSS/JS into Claude tabs without reloading
- **tabs** — Find all open Claude tabs to inject into
- **alarms** — 2-minute timer to check existing settings tabs for fresh data
- **host_permissions: claude.ai** — Required to inject scripts and read the settings page DOM

## License

Free to use. Built by NumberOneSonSoftware.
