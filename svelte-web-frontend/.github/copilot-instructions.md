```instructions
Repository Copilot Guidance: Svelte 5 + Project Conventions
Primary Frontend Stack: Svelte 5 (runes API), TypeScript, Vite, Tailwind.
Always prefer Svelte 5 runes syntax over legacy ($: labels + writable stores) unless interacting with external store ecosystems.
Svelte 5 Runes Usage:
- Use $props() to destructure component props once; supply defaults inline.
- Use $state() for local mutable state; do NOT wrap primitives in writable() unless they need to be exported or shared across component instances.
- Use $derived(expr) for pure synchronous derived values.
- Use $derived.by(() => { ... }) when branching, early returns, or multi-line derivations.
- Use $effect(() => { ... }) for side effects; return a cleanup function when needed.
- Prefer $inspect(varName) only for temporary debug; remove in committed code unless explicitly valuable.
Events & Dispatch:
- Use createEventDispatcher generics for strongly typed events.
- Expose events instead of passing deep callback props when practical.
- Name events kebab-case in markup, camelCase in dispatcher definitions.
Children / Slots:
- Prefer {#snippet children()} blocks for passing child content in Svelte 5 components.
- Keep structural markup inside parent; pass only what must vary.
Async & Lifecycle:
- Use onMount(async () => { ... }) for startup side effects; wrap awaits in try/catch and log concise errors.
- Clean up timers, intervals, MediaRecorder, and external listeners in onMount return.
Media / Recording:
- Store recordings as Blob in memory (see PracticePage) not permanent object URLs; only createObjectURL transiently in UI components, revoke on change/unmount.
State Patterns:
- Keep computed values derived ($derived) not imperatively synced.
- Avoid duplicated sources of truth: one mutable $state plus any number of $derived.
- For deeply related clusters of primitive state, prefer an object in a single $state to reduce effect churn.
TypeScript:
- All new components & helpers must be typed. Export public types in dedicated files under lib/model or adjacent domain folder.
- Use discriminated unions for variant actions (e.g. PostPracticeAttemptAction) instead of loose objects.
Naming & Conventions:
- DB layer uses snake_case; map to camelCase in frontend domain models only if necessary. Keep direct Supabase row types in snake_case for clarity.
- Functions: verbNoun (loadMotionSegmentation, generatePracticePlan). Components: PascalCase.
- Avoid default exports unless a file exposes exactly one primary entity (component or class). For utility collections, use named exports.
Performance / Reactivity:
- Do not trigger effects from within other effects unless unavoidable; chain by updating state.
- Avoid creating functions inline in large lists unless they close over state; lift them if stable.
- Debounce or throttle high-frequency handlers (scroll, resize) in $effect with cleanup.
Error Handling:
- Log concise contextual messages: console.warn('PracticePage: missing pose data', details).
- Surface recoverable user-facing errors via lightweight UI affordances (toasts/dialog) not console-only.
Supabase / Data Access:
- Never expose service_role key in client code.
- Use row level security assumptions: always send user_id = auth.uid() implicitly; do not trust client-supplied IDs.
- For inserts on tables with default/trigger IDs (UUID or identity) omit id field entirely.
Teaching Agent / Practice Plan:
- Mutations: update local store optimistically, then persist via dataBackend; rollback or warn on failure.
- Keep navigation decision helpers (like buildDefaultNavigationAction) outside class for testability.
UI / Styling:
- Prefer utility classes (Tailwind / DaisyUI) over ad-hoc SCSS when feasible; SCSS only for layout or complex selectors.
- Co-locate small component-scoped styles inside <style lang="scss"> in the same file.
Accessibility:
- Include aria-labels for icon-only buttons.
- Provide captions or a11y ignore comments with justification for media lacking captions.
Testing Guidance:
- For new evaluation logic or math helpers, add lightweight *.spec.ts colocated or in existing spec files.
What NOT to Generate:
- Legacy Svelte 3/4 syntax ($: reactive labels for new code) unless modifying existing legacy block.
- Unscoped writable stores for local component-only reactivity.
- Direct DOM manipulation where a reactive prop suffices.
- Inserting IDs manually into tables with enforced triggers preventing user-supplied IDs.
When Unsure:
- Prefer deriving over caching.
- Prefer pure helper function over class method if no internal state needed.
- Add a brief // TODO(username): context instead of large speculative scaffolding.
Keep this file concise; update when architectural decisions change.
```


