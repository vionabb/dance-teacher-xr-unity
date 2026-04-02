<script lang="ts">
	interface Props {
		position?: 'top' | 'down' | 'left' | 'right';
		alignment?: 'start' | 'end';
		btnClass?: string;
		menuOpen?: boolean;
		dismissWhenNotFocused?: boolean;
		buttonTitle?: import('svelte').Snippet;
		children?: import('svelte').Snippet;
	}

	let {
		position = 'down',
		alignment = 'start',
		btnClass = '',
		menuOpen = false,
		dismissWhenNotFocused = true,
		buttonTitle,
		children
	}: Props = $props();
</script>

{#if dismissWhenNotFocused}
	<div
		class={`daisy-dropdown daisy-dropdown-${position}`}
		class:daisy-dropdown-end={alignment === 'end'}
		class:daisy-dropdown-open={menuOpen}
	>
		<div tabindex="0" role="button" class={`daisy-btn ${btnClass}`}>
			{@render buttonTitle?.()}
		</div>
		<div class="daisy-dropdown-content">
			{@render children?.()}
		</div>
	</div>
{:else}
	<details class={`daisy-dropdown daisy-dropdown-${position}`}>
		<summary class={`btn daisy-btn ${btnClass}`}>
			{@render buttonTitle?.()}
		</summary>
		<div class="daisy-dropdown-content">
			{@render children?.()}
		</div>
	</details>
{/if}
