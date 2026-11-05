---
date: 2026-10-29
tags: [hosted-research, authentication, regression]
artifacts: [assets/2026-10-29-login-handoff/verification.json]
---

# Password login return-path repair

Viona reported: opening the production research URL led to login; signing in with
the newer account reported success and returned to login, while manually opening
research worked. This distinguishes a valid session from a broken handoff.

The prior login route was prerendered, discarded the requested destination and
combined client password sign-in, Auth-driven invalidation and browser navigation.
The repair posts password sign-in through a server action so cookie creation and
redirect share one response. Login becomes dynamic, safe local return paths keep
the original path/query, and role-aware landing remains the fallback. Redirects
and login/landing responses explicitly disable caching. The production anonymous
redirect previously advertised public cache control. No live account credentials,
research rows, source files or access grants were changed.

Validation: 21 focused tests cover server actions, invalid credentials, role-aware
landing and rejected external/encoded/auth-loop destinations. The production-mode
browser test uses a local synthetic Auth service and verifies real session cookie
creation, the same research query after sign-in and reload, JavaScript-disabled
sign-in, already-authenticated navigation, failed credentials and private/no-store
redirect headers. The first browser run exposed that event.setHeaders alone did
not attach cache control to a redirect thrown by the hook; returning the redirect
response and wrapping resolved Auth responses fixed that, and the rerun passed.
Typecheck passes with zero errors and 12 existing warnings. The Svelte autofixer
was run on both touched components; its forced-runes mode flags their existing
legacy export-let syntax, while the actual Svelte 5 compiler/build and typecheck
accept that mode. No unrelated component migration was introduced.

[Browser proof](assets/2026-10-29-login-handoff/verification.json) contains synthetic
statuses only. The harness is `svelte-web-frontend/scripts/verifyLoginRedirect.mjs`.
The login/landing unit suite is included in CI. Production rollout requires the
new fix PR to be merged; approval for #431 does not imply a subsequent merge.
