# Installable app (PWA)

The Svelte web app can be installed on a phone as **Dance Tutor**. The installed
app opens in its own standalone window, without browser chrome: no back or
forward buttons and no address bar. This document owns how installation works,
how the app stays navigable without that chrome, and how to verify it.

## Installing

- **iPhone/iPad (Safari):** open <https://dancetutor.viona.dev>, tap Share, then
  **Add to Home Screen**.
- **Android (Chrome):** open the site, then **Install app** from the menu (or the
  install prompt).

The installed app has its own sign-in. On iOS its storage is separate from
Safari's, so sign in once inside the installed app even if Safari is already
signed in. Sign-in uses the in-app email/password form and same-origin
redirects, so it never leaves the app window. A researcher with a
`research_access` row sees the Research workspace on the home page exactly as in
the browser; every `/research/**` and `/metrics/**` route is inside the manifest
scope (`/`).

Links in emails (password reset, sign-up confirmation) open in the phone's
browser, not in the installed app: that is how both platforms handle links from
other apps. Finish the step in the browser, then return to the app and sign in.

## What makes it installable

| Piece | File |
| --- | --- |
| Web app manifest (name, `start_url` `/`, scope `/`, `standalone`, colors, icons, shortcuts) | `svelte-web-frontend/static/manifest.webmanifest` |
| Icons, rendered from `icon.svg` by `node scripts/pwa/render-icons.mjs` | `svelte-web-frontend/static/pwa/` |
| Manifest link, theme color, iOS home-screen tags, apple-touch-icon | `svelte-web-frontend/src/app.html` |
| Service worker, registered automatically by SvelteKit | `svelte-web-frontend/src/service-worker.ts` |
| Offline page | `svelte-web-frontend/static/offline.html` |

The PNG icons are plain Git blobs, not LFS (`.gitattributes` exception), so
every deployment ships them and cloud sessions can update them.

The service worker caches only the offline page and one icon. Pages and data
are private (`cache-control: private, no-store`) and are never cached. When a
navigation fails for lack of a connection, the app shows the offline page with
**Try again** and **Home** instead of the browser's error page.

## Navigation without browser chrome

`src/lib/pwa/standalone.svelte.ts` detects standalone mode (the
`display-mode` media query, or `navigator.standalone` on iOS) and sets
`data-standalone` on `<html>`. Only then:

- `AppHistoryButtons.svelte` adds **Back** (history back, or Home when the app
  was opened on that page) and **Forward** (shown unless the browser reports
  there is nothing to go forward to).
- On ordinary pages the buttons sit at the left of the main navigation bar
  (not on Home or Login), next to each page's existing link up.
- On research pages and metric inspectors they sit at the left of the research
  bar, pinned with **Home** while the tool list scrolls sideways. The main
  navigation bar is hidden there in standalone mode, because the research bar
  already carries Back, Home and the tools.
- File downloads (research materials, pose CSVs, discrepancy notes) go to the
  system share sheet (`src/lib/pwa/download.ts`), so a file never replaces the
  app window with a viewer that has no way back. If the file takes too long to
  fetch for the browser to allow sharing, a notice asks for one more tap.
- The pose CSV endpoint sends `Content-Disposition: attachment` so the file is
  saved rather than shown in place of the page.

In a normal browser tab none of this changes the UI.

## Verifying

From `svelte-web-frontend/`:

- `node scripts/pwa/walk-standalone.mjs --base-url <url> --out <dir>` checks
  Chrome's installability (manifest and service worker, via DevTools) and walks
  the app as a standalone phone app: sign-in, home, settings, account, every
  research tool, a recording (Back and Forward), key moves, both metric
  inspectors, a download, offline, and a missing page. It reports any page
  without an in-app way back and any navigation that leaves the app. It signs in
  with `PWA_WALK_EMAIL`/`PWA_WALK_PASSWORD` (or the research agent account) and
  blocks every write to Supabase. Screenshots can show study media: keep them
  out of Git.
- `pnpm screenshots -- --viewports phone,standalone` renders the UI-harness
  scenarios as a phone browser and as the installed app.

Chromium cannot emulate `display-mode`, so both scripts patch `matchMedia` and
`navigator.standalone` (`scripts/pwa/standalone-emulation.mjs`). A check on a
real iPhone and Android phone is still the final test.
