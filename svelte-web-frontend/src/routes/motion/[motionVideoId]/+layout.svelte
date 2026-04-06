<script lang="ts">
	import type { MotionVideo } from '$lib/ai/backend/IDataBackend.js';
	import { setContext } from 'svelte';
	import { readonly, toStore, type Readable } from 'svelte/store';

	let { data, children } = $props();
	const motionVideo = toStore<MotionVideo>(() => data.motionVideo);
	const motionVideoReadOnly = readonly(motionVideo);
	setContext<Readable<MotionVideo>>('motionVideo', motionVideoReadOnly);
</script>

{@render children?.()}
