<script lang="ts">
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();
	const formatRating = (rating: number | null | undefined) =>
		rating == null ? '—' : Number(rating.toFixed(2)).toString();
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
			similarity. The table joins them only when study, dance, user ID, segment, and condition match
			exactly.
		</p>
	</header>
	{#if data.recorded}<p class="daisy-alert daisy-alert-success">Usability rating saved.</p>{/if}
	{#if data.backupWarning}<p class="daisy-alert daisy-alert-warning">
			The rating was saved, but its follow-up database snapshot could not be verified. Back up the
			local research database before rating more clips.
		</p>{/if}

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

	<section class="space-y-3" aria-label="Whole-video segment usability reviews">
		<div class="flex flex-wrap items-start justify-between gap-3">
			<div>
				<h2 class="text-xl font-semibold">Whole-video segment usability</h2>
				<p class="text-sm opacity-70">
					{data.participantVideoReviews.length} CHI25 participant ratings. Frame-stage unusable overrides
					appear as the effective rating; the original rating remains in the source details.
				</p>
			</div>
			{#if data.queue.available && data.queue.hasNext}
				<a class="daisy-btn daisy-btn-primary" href="/research/records/rate"
					>Rate more videos’ usability</a
				>
			{:else}
				<button class="daisy-btn daisy-btn-primary" disabled>Rate more videos’ usability</button>
			{/if}
		</div>
		{#if data.queue.available}
			<p class="text-sm opacity-70">
				{data.queue.remaining} unrated segments with a matching CHI25 human similarity rating. The queue
				fills sparse study × dance × segment × condition cells first, then alternates suspected problem
				segments with comparison segments. Selection details stay hidden while you rate to reduce bias.
			</p>
		{:else}
			<p class="daisy-alert text-sm">{data.queue.reason}</p>
		{/if}
		<div class="rounded-box border-base-300 overflow-x-auto border">
			<table class="daisy-table daisy-table-zebra daisy-table-sm">
				<thead>
					<tr>
						<th>Paper</th><th>Study</th><th>User ID</th><th>Dance</th><th>Condition</th>
						<th>Segment</th><th>Usability</th><th>Human similarity</th><th>Source</th>
					</tr>
				</thead>
				<tbody>
					{#each data.participantVideoReviews as review (review.key)}
						<tr>
							<td>{review.identity?.paper}</td>
							<td>{review.identity?.study}</td>
							<td>{review.identity?.userId}</td>
							<td>{review.identity?.dance}</td>
							<td>{review.identity?.condition}</td>
							<td>{review.identity?.segmentNumber}</td>
							<td>
								<span class="daisy-badge daisy-badge-outline">{review.rating ?? '—'}</span>
								{#if review.override}<span class="block text-xs opacity-60">frame override</span
									>{/if}
							</td>
							<td
								>{formatRating(review.humanRating?.human_rating)}
								<span class="text-xs opacity-60">/ 5</span></td
							>
							<td>
								<details class="min-w-32">
									<summary class="cursor-pointer">{review.source}</summary>
									<div class="max-w-sm space-y-1 py-2 text-xs break-all">
										<div>
											Task: {review.taskId}; annotator: {review.annotator}; revision: {review.revisionId}
										</div>
										<div>Original rating: {review.originalRating ?? 'none'}</div>
										<div>Frame override: {review.override ?? 'none'}</div>
										<div>Video SHA-256: {review.videoSha256}</div>
										<div>Source stem: {review.sourceStem}</div>
									</div>
								</details>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</section>

	{#if data.referenceVideoReviews.length}
		<details class="rounded-box border-base-300 border p-4">
			<summary class="cursor-pointer font-semibold"
				>{data.referenceVideoReviews.length} reference-video usability ratings</summary
			>
			<p class="mt-2 text-sm opacity-70">
				Reference segments have no CHI25 participant user ID or condition.
			</p>
			<ul class="mt-2 space-y-1 text-sm">
				{#each data.referenceVideoReviews as review (review.key)}
					<li>{review.sourceStem} · {review.taskId} · {review.rating ?? '—'}</li>
				{/each}
			</ul>
		</details>
	{/if}

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
							>Mean (1–5)</th
						><th>Rater 1 (1–3)</th><th>Rater 2 (1–3)</th><th>Rater 3 (1–3)</th><th>Percentile</th
						></tr
					></thead
				>
				<tbody>
					{#each data.humanRatings as rating (`${rating.study}:${rating.dance}:${rating.user_id}:${rating.segment_id}`)}
						<tr
							><td>{rating.study}</td><td>{rating.dance}</td><td>{rating.user_id}</td><td
								>{rating.segment_id}</td
							><td>{rating.condition}</td><td>{rating.human_rating ?? '—'}</td><td
								>{rating.rating_1 ?? '—'}</td
							><td>{rating.rating_2 ?? '—'}</td><td>{rating.rating_3 ?? '—'}</td><td
								>{rating.human_rating_percentile ?? '—'}</td
							></tr
						>
					{/each}
				</tbody>
			</table>
		</div>
	</section>
</main>
