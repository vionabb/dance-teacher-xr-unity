<script lang="ts">

	import type { PracticePlanActivity } from '$lib/model/PracticePlan.js';
	import { setContext } from 'svelte';
	import { derived, writable, type Readable } from 'svelte/store';

    
    let { data, children } = $props();

    const practiceActivity = writable<PracticePlanActivity>(data.practiceActivity);
    const practiceActivityReadOnly = derived(practiceActivity, (activity): PracticePlanActivity => activity);
    setContext<Readable<PracticePlanActivity>>('practiceActivity', practiceActivityReadOnly);

    // This should reactively update the context when the practiceActivity data property changes
    $effect(() => {
        practiceActivity.set(data.practiceActivity);
        console.log('Practice activity context updated:', data.practiceActivity.id);
    });
</script>

{@render children?.()}