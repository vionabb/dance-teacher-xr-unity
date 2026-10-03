<script lang="ts">
	import { resolve } from '$app/paths';
	import type { ActionData, PageData } from './$types';
	let { data, form }: { data: PageData; form: ActionData | null } = $props();
	let message = $state('');
</script>

<svelte:head>
	<title>Research hypotheses</title>
	<meta name="description" content="Local research hypotheses and evidence trails." />
</svelte:head>

<main class="mx-auto max-w-6xl space-y-8 px-4 py-8 lg:px-8">
	<header class="space-y-3">
		<a class="link link-primary text-sm" href={resolve('/research')}>← Research workspace</a>
		<p class="text-primary text-xs font-bold tracking-[.16em] uppercase">Research workspace</p>
		<h1 class="text-3xl font-bold">Hypotheses</h1>
		<p class="max-w-3xl text-sm opacity-75">
			Candidate questions drawn from the lab log and annotation analyses. Their statuses track the
			research workflow; evidence and uncertainty remain attached to each source.
		</p>
	</header>
	<div class="grid min-w-0 gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,24rem)]">
		<section class="order-last min-w-0 space-y-4 lg:order-first" aria-labelledby="catalog-heading">
			<h2 id="catalog-heading" class="text-xl font-semibold">Current hypotheses</h2>
			{#each data.hypotheses as hypothesis (hypothesis.slug)}
				<a
					class="rounded-box border-base-300 hover:border-primary block space-y-3 border p-5 transition-colors"
					href={resolve('/research/hypothesis/[slug]', { slug: hypothesis.slug })}
				>
					<div class="flex items-start justify-between gap-3">
						<h3 class="text-lg font-semibold">{hypothesis.title}</h3>
						<span class="daisy-badge daisy-badge-outline shrink-0">{hypothesis.status}</span>
					</div>
					<p class="text-sm opacity-75">{hypothesis.question}</p>
					<p class="text-xs opacity-60">{hypothesis.findings} saved findings</p>
					<p class="text-primary text-sm font-semibold">Open page and discuss with Codex →</p>
				</a>
			{/each}
			{#if data.removed.length > 0}
				<details class="rounded-box border-base-300 border p-4">
					<summary class="cursor-pointer font-medium"
						>Removed hypotheses ({data.removed.length})</summary
					>
					<p class="mt-2 text-sm opacity-70">
						Ask Codex here to restore one. Its page and history are preserved.
					</p>
					<ul class="mt-3 space-y-2">
						{#each data.removed as hypothesis (hypothesis.slug)}
							<li>
								<a
									class="link link-primary text-sm"
									href={resolve('/research/hypothesis/[slug]', { slug: hypothesis.slug })}
									>{hypothesis.title}</a
								>
							</li>
						{/each}
					</ul>
				</details>
			{/if}
		</section>
		<aside
			id="collection-conversation"
			class="order-first min-w-0 lg:sticky lg:top-6 lg:order-last lg:self-start"
			aria-labelledby="collection-conversation-heading"
		>
			<div class="rounded-box border-primary/40 bg-base-100 min-w-0 space-y-4 border p-5">
				<div class="space-y-2">
					<h2 id="collection-conversation-heading" class="text-xl font-semibold">
						Manage hypotheses with Codex
					</h2>
					<p class="text-sm leading-6 opacity-75">
						Ask to add or rename a hypothesis, change its workflow status, delete it, or restore it.
						Name the exact title or URL name in each change request. Here, delete hides the page
						from this list while preserving its history.
					</p>
				</div>
				{#if data.backupWarning}<div role="alert" class="daisy-alert daisy-alert-warning text-sm">
						The change was saved, but its database snapshot could not be verified. Back up the local
						research database before continuing.
					</div>{/if}
				{#if form?.message}<div role="alert" class="daisy-alert daisy-alert-error text-sm">
						{form.message}
					</div>{/if}
				<div class="max-h-80 space-y-3 overflow-y-auto" aria-live="polite">
					{#if data.messages.length === 0}
						<p class="text-sm opacity-60">
							No collection conversation yet. Try: “Add a hypothesis about whether…” or “Mark
							Recurring tracking risk by segment as investigating.”
						</p>
					{/if}
					{#each data.messages as entry (entry.message_id)}
						<div
							class={entry.role === 'user'
								? 'daisy-chat daisy-chat-end'
								: 'daisy-chat daisy-chat-start'}
						>
							<div class="daisy-chat-header text-xs">{entry.role === 'user' ? 'You' : 'Codex'}</div>
							<div class="daisy-chat-bubble max-w-full text-sm break-words whitespace-pre-wrap">
								{entry.content}
							</div>
						</div>
					{/each}
				</div>
				<form method="POST" class="space-y-2">
					<label for="collection-message" class="text-sm font-medium">Message</label>
					<textarea
						id="collection-message"
						name="message"
						bind:value={message}
						class="daisy-textarea w-full min-w-0"
						rows="4"
						maxlength="4000"
						required
						placeholder="What should change in the hypothesis collection?"
					></textarea>
					<button
						class="daisy-btn daisy-btn-primary w-full"
						type="submit"
						disabled={!message.trim()}>Send to Codex</button
					>
				</form>
				<p class="text-xs opacity-60">
					This starts a separate local Codex turn. New hypotheses begin as candidates with a draft
					overview; source-backed findings belong on their individual pages.
				</p>
			</div>
		</aside>
	</div>
</main>
