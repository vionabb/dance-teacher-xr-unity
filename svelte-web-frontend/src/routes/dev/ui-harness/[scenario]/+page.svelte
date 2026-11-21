<script lang="ts">
	import { onMount } from 'svelte';
	import ResearchNavigation from '$lib/elements/ResearchNavigation.svelte';
	import ResearchShell from '$lib/elements/ResearchShell.svelte';
	import KeyMovesIndex from '../../../research/key-moves/+page.svelte';
	import KeyMovesDance from '../../../research/key-moves/[dance]/+page.svelte';
	import ResearchHome from '../../../research/+page.svelte';
	import Discrepancy from '../../../research/discrepancy/+page.svelte';
	import StudiesList from '../../../research/studies/+page.svelte';
	import StudyRecording from '../../../research/studies/[id]/+page.svelte';
	import Materials from '../../../research/materials/+page.svelte';
	import SourceRecords from '../../../research/records/+page.svelte';
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

<ResearchShell>
	<ResearchNavigation
		hosted={data.nav === 'hosted'}
		local={data.nav === 'local'}
		current={data.route}
		onsettings={() => {}}
	/>
	{#if data.view === 'key-moves-index'}
		<KeyMovesIndex data={fixture} />
	{:else if data.view === 'key-moves-dance'}
		<KeyMovesDance data={fixture} />
	{:else if data.view === 'research-home'}
		<ResearchHome />
	{:else if data.view === 'discrepancy'}
		<Discrepancy data={fixture} />
	{:else if data.view === 'studies-list'}
		<StudiesList data={fixture} />
	{:else if data.view === 'study-recording'}
		<StudyRecording data={fixture} />
	{:else if data.view === 'materials'}
		<Materials data={fixture} />
	{:else if data.view === 'source-records'}
		<SourceRecords data={fixture} />
	{/if}
</ResearchShell>
