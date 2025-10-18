# Svelte Web Frontend

This is a web app for teaching short dance choreographies, built using the svelte framework.

## Developing

For all development on the frontend, we assume you're in this directory. `cd` into it if you're not.

I recommend using Visual Studio Code as your editor, with the [svelte extension](https://marketplace.visualstudio.com/items?itemName=svelte.svelte-vscode) installed.

1. Install [Node.js](https://nodejs.org)
2. (recommended) install [pnpm](https://pnpm.js.org/en/installation)

    ```bash
    npm install -g pnpm
    ```

3. Ensure that the motion processing pipeline has been run, so that the `static/bundle` directory and `src/lib/data/bundle` folders are populated with the necessary files. See the [motion pipeline README](../motion-pipeline/README.md) for more information.

4. Install the dependencies:

    ```bash
    pnpm install
    ```

5. Configure supabase

    ```bash
    pnpm supabase init
    pnpm supabase login # you'll need to provide an access token, which you can get from the supabase dashboard
    pnpm supabase start
    ```

6. Load your local supabase with media files (see later in README for more information)

7. Run the app:

    ```bash
    pnpm run dev
    ```

8. Navigate to [localhost:5173](http://localhost:5173)

## Building

To create a production version of the app:

```bash
npm run build
```

This will leave a production-ready version of the app in the `../docs` folder, which github pages will pick up when you merged into the `main` branch.

You can preview the production build with:

```bash
npm run preview
```

## Testing

We use `vitest` for testing. This will be installed as a dev dependency as part of `pnpm install`.

I recommend using Visual Studio Code as your editor, with the [vitest extension](https://marketplace.visualstudio.com/items?itemName=ZixuanChen.vitest-explorer) installed.

* Then, you can use the testing tab in vscode to run tests, or hover over tests and click to run or debug an individual test.

You can also run tests from the command line:

* To run tests, you can simply do `pnpm run test`. This will put tests in watch mode, and will rerun whenever code changes.
* You can also execute `pnpm run test --run` to run the tests only once (not in watch mode).
* You can also execute `pnpm run test --coverage` to run the tests and generate a coverage report.

Many motion metric tests include a test that runs the metric against multiple pre-recorded dance performance and outputs the formatted summaries of the results in the `testResults` directory. These CSV files are very useful for getting an overview of a given metric's output for many different performances. You can record a new performance by loading up the site, enabling debug mode, and practicing a segment. Then, click "Export Recorded Track", enter a description for the track, and the files will be saved.

## Development Tips

### Using Icons

We use the [unplugin-icons](https://github.com/unplugin/unplugin-icons) package. For consistency, we prefer to use icons form the `IconPark Outline` library, searchable [here](https://icon-sets.iconify.design/icon-park-outline/).

To put an icon in your code, first import it like so:

```js
import ClockIcon from 'virtual:icons/icon-park-outline/alarm-clock';
```

Then use it like so:

```html
<ClockIcon />
```

### Updating Mediapipe

You can update the mediapipe version with pip (be sure to update requirements.txt).

Be sure to download the improved model and put it in the static/mediapipe folder. See <https://developers.google.com/mediapipe/solutions/vision/pose_landmarker/index#models> for more information.


### Supabase

We use [supabase](https://supabase.io/) for our database. For local development, we use the [supabase CLI](https://supabase.io/docs/reference/cli/installation) to interact with the database. This will be installed with `pnpm install`.

1. Ensure you have docker installed and running.
1. Run `pnpm supabase login` to login to supabase. You'll need to provide an access token, which you can get from the supabase dashboard.
1. Run `pnpm supabase link --project-ref ngjnwvcgmfxwbwbidtcy` to link the CLI to the supabase project. This will allow you to run commands like `pnpm supabase init` to initialize the database.
1. To get started with a local supabase instance, you can run `pnpm supabase start`. This will start a local supabase instance, and will also start a local postgres instance. You can then use the supabase CLI to interact with the local instance. For example, you can run `pnpm supabase init` to initialize the local instance with the necessary tables and data.

To get the app running locally, you'll need to upload the necessary data to supabase.
1. Go to the supabase local dashboard at <http://localhost:54323>, the go to the storage tab.
1. Create buckets for `holisticdata`, `pose2ddata`, `sourcevideos`, and `thumbnails` (ensure they're all public buckets).
1. Upload the files in the folders of `static/bundle` to their corresponding buckets.

Other commands:

* `pnpm supabase db pull` to pull the latest database schema from supabase. Will create a SQL migration script in `migrations/` that you can run with `pnpm supabase db push`.
* `pnpm supabase db reset` to reset the local db to default state, applying migrations in `migrations/` and then running `pnpm supabase init`.
* Connect to local db with `psql -h localhost -p 54322 -U postgres -d postgres` (default pw: `postgres`).
  * To run a file, add `-f <filename>` to the command.
* `pnpm supabase status` to get the status of running services, including the local postgres instance (and their URLs).
* `pnpm supabase projects api-keys` to get the api keys for the local supabase instanc (or `pnpx supabase status`)
* `pnpm supabase migration new <migration_name>` to create a new migration file in `migrations/`.
* `pnpm supabase gen types typescript --local > src/lib/ai/backend/SupabaseTypes.ts` to update type definitions based on the local db schema.
* `pnpm supabase db dump --local -f supabase/seed.sql --data-only` to dump the local db data to a sql file (for seeding purposes).

Other useful links:

* Local supabase dashboard: <http://localhost:54323>
* Testing mock email server <http://localhost:54324> (view emails that would have been sent.)

### Updating the database schema

1. Update the database using the web editor locally: <http://localhost:54323>
2. Run `pnpm supabase db diff --local -f <migration_name>` to create a new migration file in `migrations/`.
3. Run `pnpm supabase gen types typescript --local > src/lib/ai/backend/SupabaseTypes.ts` to update the type definitions based on the new schema.

#### Supabase Issues

* If you get a network error / CORS error when trying to login, ensure the supabase services are running with `pnpm supabase start`.
* If you get an error when starting supabase like `Local hosting manifest for public.ecr.aws/supabase/postgrest:v11.2.1 not found`, [try changing the rest-version file in /supabase/.temp/rest-version](https://github.com/supabase/supabase/issues/18207)

