<script lang="ts">
	import { resolve } from '$app/paths';
	import type { DiscrepancyTask, ResearchBackend } from '$lib/research/discrepancy-client';
	let { data }: { data: { tasks: DiscrepancyTask[]; researchBackend?: ResearchBackend } } =
		$props();
	let query = $state('');
	let status = $state('all');
	let limit = $state(50);
	let sort = $state('identity');
	const tasks = $derived(
		data.tasks.filter(
			(task) =>
				`${task.participantLabel} ${task.study} ${task.dance} ${task.condition} ${task.clipNumber}`
					.toLowerCase()
					.includes(query.toLowerCase()) &&
				(status === 'all' || (status === 'reviewed') === task.observations.length > 0)
		)
	);
	const sortedTasks = $derived(
		[...tasks].sort((a, b) => {
			if (sort === 'human-low') return (a.human.human_rating ?? 0) - (b.human.human_rating ?? 0);
			if (sort === 'human-high') return (b.human.human_rating ?? 0) - (a.human.human_rating ?? 0);
			if (sort === 'rater-spread') {
				const spread = (task: (typeof tasks)[number]) => {
					const ratings = [task.human.rating_1, task.human.rating_2, task.human.rating_3].filter(
						(value): value is number => value !== null
					);
					return ratings.length > 1 ? Math.max(...ratings) - Math.min(...ratings) : -1;
				};
				return spread(b) - spread(a);
			}
			return 0;
		})
	);
	function exportNotes() {
		const blob = new Blob(
			[
				JSON.stringify(
					{
						schemaVersion: 1,
						exportedAt: new Date().toISOString(),
						tasks: data.tasks.filter((task) => task.observations.length)
					},
					null,
					2
				)
			],
			{ type: 'application/json' }
		);
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = 'discrepancy-observations.json';
		a.click();
		URL.revokeObjectURL(url);
	}
</script>

<svelte:head><title>Human–metric discrepancy review</title></svelte:head>
<main class="mx-auto max-w-6xl space-y-4 p-4 sm:p-8">
	<a href={resolve('/research')} class="link link-primary">← Research studio</a>
	<h1 class="text-2xl font-bold">Human–metric discrepancy review</h1>
	<p>
		Investigate why automatic motion scores and prior-study human similarity ratings may disagree.
		Choose a segment, inspect the video and metric curve, and mark observations. Agreement cases are
		useful comparisons too.
	</p>
	<p class="text-sm opacity-70">
		Human means and individual raters retain their original source scales. Metrics are uncalibrated
		diagnostics. This queue includes exact human-rating matches with video and raw pose data; it is
		not ranked by numerical discrepancy.
	</p>
	<div class="flex flex-wrap items-center gap-3">
		<input
			class="daisy-input"
			aria-label="Find a review segment"
			placeholder="Participant, dance, condition…"
			bind:value={query}
		/>
		<select class="daisy-select w-auto" aria-label="Review status" bind:value={status}
			><option value="all">All segments</option><option value="unreviewed"
				>Without observations</option
			><option value="reviewed">With observations</option></select
		>
		<select class="daisy-select w-auto" aria-label="Sort review segments" bind:value={sort}>
			<option value="identity">Performance order</option><option value="human-low"
				>Lowest human mean</option
			><option value="human-high">Highest human mean</option><option value="rater-spread"
				>Largest rater disagreement</option
			></select
		>
		<button class="daisy-btn daisy-btn-outline" onclick={exportNotes}
			>Export observations (JSON)</button
		>
		<span class="text-sm" role="status"
			>{tasks.length} segments · {data.tasks.filter((task) => task.observations.length).length} reviewed</span
		>
	</div>
	{#if !tasks.length}<p class="daisy-alert">
			No matching segments. Try clearing your filters. Review requires matching human ratings,
			participant video and pose data.
		</p>{:else}
		<div class="overflow-x-auto">
			<table class="daisy-table">
				<thead
					><tr
						><th>Performance</th><th>Segment</th><th>Human mean</th><th>Individual raters</th><th
							>Notes</th
						><th>Inspect</th></tr
					></thead
				><tbody>
					{#each sortedTasks.slice(0, limit) as task (task.segmentId)}<tr>
							<td
								>{task.participantLabel}
								<div class="text-xs opacity-70">
									{task.study} · {task.dance} · {task.condition}{task.phase
										? ` · ${task.phase}`
										: ''}
								</div></td
							>
							<td>{task.clipNumber}</td><td>{task.human.human_rating?.toFixed(2)}</td><td
								>{[task.human.rating_1, task.human.rating_2, task.human.rating_3]
									.map((value) => value ?? '—')
									.join(' / ')}</td
							><td>{task.observations.length}</td>
							<td
								>{#if task.referenceAvailable}<a
										class="daisy-btn daisy-btn-primary daisy-btn-sm"
										href={resolve(
											`/metrics/qijia2d?performance=${task.performanceId}&segment=${task.segmentId}&review=discrepancy`
										)}>Review</a
									>{:else}<span class="text-xs">Reference pose missing</span>{/if}</td
							>
						</tr>{/each}
				</tbody>
			</table>
		</div>
		{#if limit < tasks.length}<button
				class="daisy-btn daisy-btn-outline"
				onclick={() => (limit += 50)}>Show 50 more ({tasks.length - limit} remaining)</button
			>{/if}
	{/if}
</main>
