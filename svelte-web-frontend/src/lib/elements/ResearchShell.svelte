<!--
	Page frame for the research workspace: applies the white-surface `research`
	daisyUI theme (src/app.pcss) on a light page background. Used by the root
	layout for /research routes and by the dev UI harness.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	let { children }: { children?: Snippet } = $props();
</script>

<div
	data-theme="research"
	class="bg-base-200 text-base-content min-h-[var(--content_height,100dvh)] pb-10"
>
	{@render children?.()}
</div>
