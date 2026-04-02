<script lang="ts">
	import { getThumbnailUrl } from '$lib/data/dances-store';
	import { getContext } from 'svelte';
	import type { SupabaseClient } from '@supabase/supabase-js';
	import type { MotionVideo } from '$lib/ai/backend/IDataBackend';

	type Props = {
		motionVideos: MotionVideo[];
	};

	let { motionVideos }: Props = $props();

	const supabase = getContext('supabase') as SupabaseClient;

	let danceTiles = $derived(
		motionVideos.map((mv) => {
			return {
				...mv,
				menuLink: `/motion/${mv.id}/`
			};
		})
	);
</script>

<section>
	<div
		class="
        grid grid-cols-[repeat(auto-fit,_minmax(18rem,1fr))]
        gap-4"
	>
		{#each danceTiles as tileData (tileData.id)}
			<div class="daisy-card daisy-card-side bg-base-200 text-base-content shadow-xl">
				<figure class="aspect-9/16 w-24">
					<img
						class="aspect-9/16 h-full w-full"
						src={getThumbnailUrl(supabase, tileData.thumbnail_src)}
						alt={tileData.display_name + ' thumbnail'}
					/>
				</figure>
				<div class="daisy-card-body">
					<h2 class="daisy-card-title">{tileData.display_name}</h2>
					<!-- <span class="detail duration" title="Duration"><span class="label"><ClockIcon /></span> {(danceTree.root.end_time - danceTree.root.start_time).toFixed(1)}s</span> -->
					<!-- <span class="detail complexity" title="Complexity"><span class="label"><ConfoundedFaceIcon /></span> {(danceTree.root.complexity / (danceTree.root.end_time - danceTree.root.start_time) * 100).toFixed(0)}&percnt;</span> -->

					<!-- <div class="hidden performance-history flex align-center">
                    <span class="label" title="Dance Attempts"><DanceIcon /></span>
                    {($perfHistoryAggregatedStore[i] ?? []).length} Repetitions
                </div> -->
					<div class="grow"></div>

					<div class="daisy-card-actions justify-end">
						<a href={tileData.menuLink} class="daisy-btn daisy-btn-primary">Learn</a>
					</div>
				</div>
			</div>
		{/each}
	</div>
	<!-- <Counter /> -->
</section>
