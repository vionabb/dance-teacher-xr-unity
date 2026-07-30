---
date: 2026-07-30
tags: [refactoring, svelte-web-frontend, engineering-debt, structure]
artifacts: []
---

# Svelte web frontend structural refactoring

**Issue context (verbatim from #381):** "the structure of the svelte-web-frontend project emerged organically through a research project. in this process, it did not grow in a principled way that reflects best practices makes it easy for future readers to consume. for example, there are parts of the codebase that are obsolete, some that are incomplete, and some whose name or location is not semantically logical. the task is to make a plan to refactor that project to reduce engineering debt and streamline further development work"

---

## Changes made

### Removed dead/obsolete code

- **`src/lib/ReviewPage.svelte`** — deleted. This was an empty stub component with a broken import (`$lib/ai/Evaluation`, a module that never existed). It was not imported or used anywhere in the codebase.
- **`src/lib/rating.ts`** — deleted. Completely empty file with no content; a leftover placeholder.

### Fixed naming typo

- **`src/lib/webcam/post-estimation.nonworker.ts`** → renamed to **`pose-estimation.nonworker.ts`**. The filename had "post" instead of "pose" — inconsistent with the sibling `pose-estimation.worker.ts` file.

### Moved misplaced interface to model/

- **`src/lib/ai/IPracticePage.ts`** → moved to **`src/lib/model/IPracticePage.ts`**. This file contains only interface/type definitions (`IPracticePage`, `VideoRecording`, `AttemptSettings`) — it is a domain model contract, not AI logic. Placing it in `src/lib/ai/` was semantically incorrect. Consumers updated: `src/lib/ai/backend/IDataBackend.ts`, `src/lib/ai/backend/SupabaseDatabackend.ts`, `src/lib/ai/TeachingAgent/IPostActivityCoordinator.ts`, `src/lib/pages/PracticePage.svelte`, `src/routes/motion/.../[practiceStepId]/+page.svelte`.

### Created `src/lib/ai/evaluation/` subdirectory

The flat `src/lib/ai/` directory was mixing evaluation infrastructure with AI teaching logic and feedback generation, making it hard to navigate. The following 8 files were moved to a new `evaluation/` subdirectory:

| Old path | New path |
|---|---|
| `src/lib/ai/FrontendDanceEvaluator.ts` | `src/lib/ai/evaluation/FrontendDanceEvaluator.ts` |
| `src/lib/ai/UserDanceEvaluator.ts` | `src/lib/ai/evaluation/UserDanceEvaluator.ts` |
| `src/lib/ai/UserEvaluationTrackRecorder.ts` | `src/lib/ai/evaluation/UserEvaluationTrackRecorder.ts` |
| `src/lib/ai/UserEvaluationTrackRecorder.spec.ts` | `src/lib/ai/evaluation/UserEvaluationTrackRecorder.spec.ts` |
| `src/lib/ai/performanceHistory.ts` | `src/lib/ai/evaluation/performanceHistory.ts` |
| `src/lib/ai/frontendPerformanceHistory.ts` | `src/lib/ai/evaluation/frontendPerformanceHistory.ts` |
| `src/lib/ai/detectAchievements.ts` | `src/lib/ai/evaluation/detectAchievements.ts` |
| `src/lib/ai/SkeletonFeedbackVisualization.ts` | `src/lib/ai/evaluation/SkeletonFeedbackVisualization.ts` |

Note: `EvaluationCommonUtils.ts` was intentionally kept at the `ai/` root (not moved to `evaluation/`) because it is imported by 11 files in `motionmetrics/` via relative paths. Moving it would have required updating all those imports for no semantic gain since `EvaluationCommonUtils` is equally shared by both `motionmetrics/` and `evaluation/` consumers.

All external import paths were updated across the codebase. TypeScript type checking confirms no new module resolution errors after the refactoring.

---

## Decisions

- Keep `EvaluationCommonUtils.ts` at `src/lib/ai/` root, not in `evaluation/`, to avoid cascading import changes in the 11 `motionmetrics/` files that use it.
- Keep `feedback.ts`, `textual-distillation.ts`, and `precomputed-feedback-msgs.ts` at `src/lib/ai/` root — these are feedback-generation utilities, and their current position is serviceable. A future `feedback/` subdirectory could be created if those files grow significantly.
- Did not touch `motionmetrics/` or `TeachingAgent/` subdirectories — both are already logically organized.

---

## Remaining structural issues (not addressed in this pass)

- **`src/lib/ai/feedback.ts`**, **`textual-distillation.ts`**, **`precomputed-feedback-msgs.ts`**: these are feedback-generation utilities that could be grouped under a `src/lib/ai/feedback/` subdirectory for further clarity, but this was deferred to avoid touching too many files.
- **`src/lib/data/bundle/`**: the bundle directory has data files; its relationship with `static/bundle` could be better documented.
- **`src/routes/motion/.../DanceLandingPage.svelte`**: this is a route-local page component. SvelteKit allows co-locating helper components next to routes, so this is not incorrect, but it diverges from the `src/lib/pages/` convention used elsewhere. Worth consolidating if the page grows complex.
- **Pre-existing TypeScript errors**: `pnpm check` reports 65 pre-existing errors (env variable types, type mismatches in mediapipe workers, snapshot issues) that are unrelated to this refactoring. These should be addressed separately.
