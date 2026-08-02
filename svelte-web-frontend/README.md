# Svelte Web Frontend

SvelteKit application for lesson delivery, webcam pose estimation, motion evaluation, feedback, progress tracking, and teaching-agent logic. For repository context and cross-project contracts, read [the repository README](../README.md) and [technical architecture](../documentation/technical-architecture.md).

## Environment

Run commands from this directory.

Required:

- Node `>=24 <25`;
- pnpm `9.12.2` (the `packageManager` version in `package.json`).

Optional for full local data/auth flows:

- Docker;
- Supabase CLI, installed with project dependencies;
- a populated frontend media bundle.

```bash
corepack enable
corepack prepare pnpm@9.12.2 --activate
pnpm install --frozen-lockfile
```

Environment variables are loaded from `src/env/`. Copy the checked-in example and provide only the values needed by the workflow:

```bash
cp src/env/.env.example src/env/.env
```

The app expects `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. LLM-backed code paths additionally need the corresponding private API key, such as `ANTHROPIC_API_KEY` or `OPENAI_API_KEY`. `NEXT_PUBLIC_` variables are available to browser code; all other variables are server-only. Never commit populated environment files. Deployment variables are configured in Vercel.

## Fast validation without full services

Most code work can start without Supabase or the media bundle:

```bash
pnpm check
pnpm test -- --run <test-file>
pnpm lint
```

Use `pnpm test -- --run`, not bare `pnpm test`, for one-shot automation; the default command starts watch mode.

## Run the app

For UI work that does not need real backend/media behavior:

```bash
pnpm dev
```

Open <http://localhost:5173>.

For the complete experience, first populate:

- `src/lib/data/bundle/` with bundle JSON;
- `static/bundle/` with source videos, pose data, and thumbnails.

These assets are produced by the Python pipeline or obtained from the validated processed-media bundle described in [the dataset guide](../documentation/dataset.md).

## Local Supabase

Start Docker, then:

```bash
pnpm supabase start
pnpm supabase status
```

The local configuration lives in `supabase/config.toml`. Studio is normally available at <http://localhost:54323>.

Storage-backed media flows expect public buckets named:

- `holisticdata`
- `pose2ddata`
- `sourcevideos`
- `thumbnails`

After the local instance and bundle are available, use the dry-run launch/task before syncing:

- `Sync Storage Assets (dry run)`
- `Sync Storage Assets`
- `Sync Bundle Data (dry run)`
- `Sync Bundle Data`

The canonical configurations are in [.vscode/launch.json](.vscode/launch.json). Absolute portable-sync paths in that file are workstation examples.

## Key areas

- `src/lib/ai/TeachingAgent/`: automated practice-plan construction and coaching coordination.
- `src/lib/ai/evaluation/`: live/terminal evaluation and performance history.
- `src/lib/ai/motionmetrics/`: metric implementations, quantifiers, and tests.
- `src/lib/ai/motionmetrics/testdata/`: human ratings and checked-in fixtures.
- `src/lib/pages/` and `src/lib/elements/`: application UI.
- `src/lib/webcam/` and `src/lib/services/PoseEstimationService.ts`: browser pose estimation.
- `src/lib/data/bundle/`: generated lesson metadata.
- `static/bundle/`: generated/downloaded media.
- `artifacts/`: generated cross-language metric outputs.
- `testResults/`: generated/local metric summaries, study poses, and browser profiles.

## Motion-metric research workflow

The CHI study assets are used to compare automatic metrics with human ratings:

```bash
pnpm test -- --run src/lib/ai/motionmetrics/allmetrics.spec.ts
```

The aggregate test writes:

- `artifacts/motion_metrics.db`
- `artifacts/motion_metrics.csv`

The CSV is consumed by `../motion-pipeline/motion_extraction/scripts/fit_metric_linear_model.py`. Coordinate changes to metric names, scales, directionality, or columns across both projects.

## Build

```bash
pnpm build
pnpm preview
```

The project uses the Vercel adapter. The old GitHub Pages `../docs` output workflow is no longer current.

## Database schema changes

For intentional local schema work:

```bash
pnpm supabase db diff --local -f <migration_name>
pnpm supabase gen types typescript --local > src/lib/ai/backend/SupabaseTypes.ts
pnpm supabase db reset
```

Review generated migrations and types before committing. Do not link to or modify a production project unless the task explicitly requires it.
