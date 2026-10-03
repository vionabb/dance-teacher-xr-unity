<script lang="ts">
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();
	let open = $derived(
		data.tasks.filter((task) => task.status !== 'completed' && task.status !== 'skipped')
	);
</script>

<svelte:head><title>Frame corrections · Research</title></svelte:head>
<main class="mx-auto max-w-5xl space-y-4 px-4 py-5">
	<a class="link link-primary text-sm" href="/research">← Research</a>
	<div class="flex flex-wrap items-end justify-between gap-3">
		<div>
			<h1 class="text-2xl font-bold">Frame corrections</h1>
			<p class="text-sm opacity-70">Sparse frame usability and landmark corrections</p>
		</div>
		{#if open.length}<a
				class="daisy-btn daisy-btn-primary daisy-btn-sm"
				href={`/research/frames/${open[0].taskId}`}>Resume next case</a
			>{/if}
	</div>
	{#if !data.configured}
		<div role="alert" class="daisy-alert">
			Set a local frame source to review the existing 49 follow-up cases. See the research workspace
			documentation.
		</div>
	{:else}
		<p class="text-sm">
			{data.tasks.length - open.length} of {data.tasks.length} cases completed or skipped · {data.annotator}
			· {data.experimentId}
		</p>
		<ul class="daisy-list rounded-box bg-base-100 border-base-300 border">
			{#each data.tasks as task}
				<li class="daisy-list-row items-center">
					<div class="min-w-0">
						<a class="link font-medium" href={`/research/frames/${task.taskId}`}>{task.label}</a>
						<p class="text-xs opacity-60">
							{#if task.identity}CHI25 {task.identity.study} · user {task.identity.userId} · {task
									.identity.dance} · {task.identity.condition} · segment {task.identity
									.segmentNumber}{:else}{task.sourceCorpus}{/if} · {task.frameCount} frames · {task.taskId}
						</p>
					</div>
					<span class="daisy-badge daisy-badge-sm shrink-0">{task.status}</span>
				</li>
			{/each}
		</ul>
	{/if}
</main>
