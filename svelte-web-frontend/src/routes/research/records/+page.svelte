<script lang="ts">
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>Research source records</title>
	<meta
		name="description"
		content="Inspect imported manual reviews and prior-study human ratings."
	/>
</svelte:head>

<main class="mx-auto max-w-6xl space-y-8 px-4 py-6 lg:px-8">
	<header class="space-y-2">
		<a class="link link-primary text-sm" href="/research">← Performances</a>
		<h1 class="text-3xl font-bold">Research source records</h1>
		<p class="max-w-3xl text-sm opacity-75">
			Manual reviews rate pose-tracking usability. Prior-study human ratings measure motion
			similarity. The sources are listed separately until their clip identities are verified.
		</p>
	</header>

	{#if data.sources.length === 0}
		<p class="daisy-alert">No sources have been imported into the local research database.</p>
	{:else}
		<section class="space-y-2" aria-label="Imported sources">
			<h2 class="text-xl font-semibold">Imported sources</h2>
			{#each data.sources as source (source.kind)}
				<p class="rounded-box bg-base-200 p-3 text-sm">
					<strong>{source.kind}</strong> · {source.source_version} · SHA-256
					<code class="break-all">{source.source_sha256}</code>
				</p>
			{/each}
		</section>
	{/if}

	<section class="space-y-2" aria-label="Manual reviews">
		<h2 class="text-xl font-semibold">Pose-tracking usability reviews</h2>
		<p class="text-sm opacity-70">
			Showing up to 100 source records. Frame reviews include correction counts and may override a
			video-stage rating.
		</p>
		<div class="grid gap-2">
			{#each data.reviews as review (`${review.release_id}:${review.scope}:${review.segment_id}`)}
				<details class="rounded-box border-base-300 border p-3 text-sm">
					<summary class="cursor-pointer font-medium">
						{review.source_corpus} · {review.source_stem} · frames {review.source_frame_start}–{review.source_frame_end_exclusive}
						<span class="daisy-badge daisy-badge-outline ml-2">{review.scope}</span>
						{review.video_usability_rating_override ||
							review.video_usability_rating ||
							'no video rating'}
					</summary>
					<dl class="mt-3 grid gap-1 break-all opacity-75">
						<div>Original video rating: {review.video_usability_rating ?? 'none'}</div>
						<div>Frame-stage override: {review.video_usability_rating_override ?? 'none'}</div>
						<div>Corrections: {review.correction_count}</div>
						<div>Segment: {review.segment_id}</div>
						<div>Video SHA-256: {review.source_video_sha256}</div>
						<div>Reviewed pose SHA-256: {review.reviewed_pose_sha256 ?? 'none'}</div>
						<div>Release: {review.release_id}; source: {review.source_id}</div>
						<div>Manifest SHA-256: {review.source_manifest_sha256}</div>
						<div>
							Experiment: {review.experiment_id}; task: {review.task_id}; annotator: {review.annotator};
							revision: {review.revision_id}
						</div>
					</dl>
				</details>
			{/each}
		</div>
	</section>

	<section class="space-y-2" aria-label="Human similarity ratings">
		<h2 class="text-xl font-semibold">Prior-study human similarity ratings</h2>
		<p class="text-sm opacity-70">
			Showing up to 100 source records. These scores are not usability judgments.
		</p>
		<div class="overflow-x-auto">
			<table class="daisy-table daisy-table-zebra daisy-table-sm">
				<thead
					><tr
						><th>Study</th><th>Dance</th><th>Participant</th><th>Segment</th><th>Condition</th><th
							>Rating (1–5)</th
						><th>Percentile</th></tr
					></thead
				>
				<tbody>
					{#each data.humanRatings as rating (`${rating.study}:${rating.dance}:${rating.user_id}:${rating.segment_id}`)}
						<tr
							><td>{rating.study}</td><td>{rating.dance}</td><td>{rating.user_id}</td><td
								>{rating.segment_id}</td
							><td>{rating.condition}</td><td>{rating.human_rating ?? '—'}</td><td
								>{rating.human_rating_percentile ?? '—'}</td
							></tr
						>
					{/each}
				</tbody>
			</table>
		</div>
	</section>
</main>
