<script lang="ts">
	import type { PracticePlanActivity } from '$lib/model/PracticePlan.js';
	import { setContext } from 'svelte';
	import { derived, toStore, type Readable } from 'svelte/store';

	let { data, children } = $props();

	const practiceActivity = toStore<PracticePlanActivity>(() => data.practiceActivity);
	const practiceActivityReadOnly = derived(
		practiceActivity,
		(activity): PracticePlanActivity => activity
	);
	setContext<Readable<PracticePlanActivity>>('practiceActivity', practiceActivityReadOnly);
</script>

{@render children?.()}
