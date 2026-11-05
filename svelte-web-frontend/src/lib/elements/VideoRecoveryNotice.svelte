<script lang="ts">
	import type { VideoRecovery } from '$lib/research/video-recovery';
	let {
		label,
		recovery,
		onreload
	}: {
		label: string;
		recovery: VideoRecovery;
		onreload: () => void;
	} = $props();
	const busy = $derived(recovery.state === 'checking' || recovery.state === 'loading');
</script>

{#if recovery.state !== 'idle'}
	<div class="recovery-notice" aria-label={`${label} video recovery`}>
		<p role="status">{recovery.message}</p>
		{#if recovery.state !== 'ready'}
			<button
				type="button"
				class="daisy-btn daisy-btn-sm daisy-btn-outline"
				disabled={busy}
				onclick={onreload}
			>
				{busy ? 'Reloading…' : 'Reload video'}
			</button>
		{/if}
	</div>
{/if}

<style>
	.recovery-notice {
		margin: 0.5rem 0.75rem;
		padding: 0.75rem;
		border: 1px solid var(--color-base-300);
		border-radius: 0.5rem;
		background: var(--color-base-200);
		font-size: 0.8rem;
		line-height: 1.5;
	}
	button {
		margin-top: 0.5rem;
		min-height: 2.75rem;
	}
</style>
