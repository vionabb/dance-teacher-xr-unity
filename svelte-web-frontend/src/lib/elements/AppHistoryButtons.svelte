<!--
	In-app Back/Forward buttons. Shown everywhere so browser tabs and the
	installed app (PWA, which has no browser chrome) look the same. See
	documentation/pwa.md.
-->
<script lang="ts">
	import { afterNavigate } from '$app/navigation';
	import { appHistory } from '$lib/pwa/standalone.svelte';
	import ResearchIcon from './ResearchIcon.svelte';

	let { size = 'sm', forward = true }: { size?: 'sm' | 'md'; forward?: boolean } = $props();

	afterNavigate(() => appHistory.refresh());
</script>

<div class="daisy-join shrink-0" data-testid="app-history">
	<button
		type="button"
		class={[
			'daisy-btn daisy-join-item daisy-btn-ghost daisy-btn-square',
			size === 'sm' && 'daisy-btn-sm'
		]}
		aria-label="Back"
		onclick={() => appHistory.back()}><ResearchIcon name="arrow-left" /></button
	>
	{#if forward && appHistory.canGoForward}
		<button
			type="button"
			class={[
				'daisy-btn daisy-join-item daisy-btn-ghost daisy-btn-square',
				size === 'sm' && 'daisy-btn-sm'
			]}
			aria-label="Forward"
			onclick={() => appHistory.forward()}><ResearchIcon name="arrow-right" /></button
		>
	{/if}
</div>
