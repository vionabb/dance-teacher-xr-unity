<script lang="ts">
	import type { MotionVideo } from '$lib/ai/backend/IDataBackend.js';
	import { setContext } from 'svelte';
	import { readonly, writable, type Readable } from 'svelte/store';

	let { data, children } = $props();
	const motionVideo = writable<MotionVideo>(data.motionVideo);
	const motionVideoReadOnly = readonly(motionVideo);
	setContext<Readable<MotionVideo>>('motionVideo', motionVideoReadOnly);
	$effect(() => {
		motionVideo.set(data.motionVideo);
	});
</script>

{@render children?.()}
