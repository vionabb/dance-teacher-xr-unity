# Environmental Variables

To get the app running locally, copy `.env.example` to `.env`, and fill in the values.

This file is ignored by git, so you can safely store your secrets here.

During deployment on vercel, the environmental variables are set in the vercel dashboard and take precedence over the values in `.env` (per vite's [docs](https://vitejs.dev/guide/env-and-mode.html#env-files)).

Any variables prefixed with `NEXT_PUBLIC_` will be available in both the server and the browser through `$env/dynamic/public` (or `$env/static/public`). All other variables will be accessible only server-side code (`$env/dynamic/private` and `$env/static/private`).See the sveltekit documentation for the different ways to access these variables: <https://kit.svelte.dev/docs/modules#$env-static-public>.
