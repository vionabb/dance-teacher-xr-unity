<script lang="ts">
	import { onMount } from 'svelte';
	import KeyMovesIndex from '../../../research/key-moves/+page.svelte';
	import KeyMovesDance from '../../../research/key-moves/[dance]/+page.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	// Fixture data is shaped like each page's own load result.
	const fixture = $derived(data.fixture as never);

	onMount(() => {
		// The capture script waits for this before interacting.
		document.documentElement.dataset.uiHarness = 'ready';
		return () => delete document.documentElement.dataset.uiHarness;
	});
</script>

{#if data.view === 'key-moves-index'}
	<KeyMovesIndex data={fixture} />
{:else if data.view === 'key-moves-dance'}
	<KeyMovesDance data={fixture} />
{/if}
