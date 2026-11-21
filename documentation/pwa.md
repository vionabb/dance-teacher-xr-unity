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

Pages and private data (`cache-control: private, no-store`) are never cached.
When a navigation fails for lack of a connection, the app shows the offline
page with **Try again** and **Home** instead of the browser's error page.

## Caching

The service worker (`src/service-worker.ts`, rules in
`src/lib/pwa/sw-caching.ts`) works the same in browser tabs and the installed
app:

| What | Strategy | Cache |
| --- | --- | --- |
| Reference videos and reference poses: research materials marked `?reference` (key moves, metric inspectors, materials page) and the practice dances' public Storage buckets (`sourcevideos`, `pose2ddata`, `holisticdata`, `thumbnails`) | Cache first. A video's first play streams from the network while the whole file downloads in the background; later plays (including seeking) come from the device. | `reference-media-v1`, kept across deploys, cleared whenever the app is signed out |
| MediaPipe model and wasm (`/mediapipe/`) | Stale while revalidate | `mediapipe-v1` |
| Hashed app build (`/_app/immutable/`) | Cache first; files not in the current build are dropped when a new worker activates | `app-immutable` |
| Offline page and icon | Precached | `offline-<version>` |

`/research/materials/file/<id>?reference` is refused for anything that is not a
reference video or reference pose, so the marker cannot put study data in the
cache. Participant recordings, participant poses, ratings, reviewed poses and
pages stay uncached: they are access-controlled study data. Caching them for
offline review would need an explicit opt-in and a decision about study data
on personal devices.

## Navigation without browser chrome

Browser tabs and the installed app share one layout, so the app never relies on
browser chrome:

- `AppHistoryButtons.svelte` adds **Back** (history back, or Home when the app
  was opened on that page) and **Forward** (shown unless the browser reports
  there is nothing to go forward to). They sit at the left of the main blue bar
  on ordinary pages (not on Home or Login), next to each page's link up.
- Research pages and metric inspectors use the same blue bar, a shade darker
  and marked **Research**, with Back, Home, the current tool, a tools menu
  (inline on wide screens) and Settings. The main bar is not shown above it.
- File downloads (research materials, pose CSVs, discrepancy notes): in the
  installed app they go to the system share sheet (`src/lib/pwa/download.ts`),
  so a file never replaces the app window with a viewer that has no way back.
  Browser tabs keep the normal download, which already leaves the page in
  place. If the file takes too long to fetch for the browser to allow sharing,
  a notice asks for one more tap.
- The pose CSV endpoint sends `Content-Disposition: attachment` so the file is
  saved rather than shown in place of the page.

`src/lib/pwa/standalone.svelte.ts` detects the installed app (the
`display-mode` media query, or `navigator.standalone` on iOS) and sets
`data-standalone` on `<html>`.

## Verifying

From `svelte-web-frontend/`:

- `node scripts/pwa/walk-standalone.mjs --base-url <url> --out <dir>` checks
  Chrome's installability (manifest and service worker, via DevTools) and walks
  the app as an installed phone app (add `--tab` for a phone browser tab): sign-in, home, settings, account, every
  research tool, a recording (Back and Forward), key moves (checking the
  reference video lands in the cache), both metric inspectors, a download,
  offline, and a missing page. It reports any page
  without an in-app way back and any navigation that leaves the app. It signs in
  with `PWA_WALK_EMAIL`/`PWA_WALK_PASSWORD` (or the research agent account) and
  blocks every write to Supabase. Screenshots can show study media: keep them
  out of Git.
- `pnpm screenshots -- --viewports phone,standalone` renders the UI-harness
  scenarios as a phone browser and as the installed app.

Chromium cannot emulate `display-mode`, so both scripts patch `matchMedia` and
`navigator.standalone` (`scripts/pwa/standalone-emulation.mjs`). A check on a
real iPhone and Android phone is still the final test.
