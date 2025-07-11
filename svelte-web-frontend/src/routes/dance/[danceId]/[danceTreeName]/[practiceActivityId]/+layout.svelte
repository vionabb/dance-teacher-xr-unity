<script lang="ts">
	import type { Dance, DanceTree } from '$lib/data/dances-store.js';
	import type { PracticePlanActivity } from '$lib/model/PracticePlan.js';
	import { setContext } from 'svelte';
	import { derived, writable, type Readable } from 'svelte/store';

    
    let { data, children } = $props();

    const practiceActivity = writable<PracticePlanActivity>(data.practiceActivity);
    const practiceActivityReadOnly = derived(practiceActivity, (activity): PracticePlanActivity => activity);
    setContext<Readable<PracticePlanActivity>>('practiceActivity', practiceActivityReadOnly);
    $effect(() => {
        practiceActivity.set(data.practiceActivity);
    });
</script>

{@render children?.()}