<script lang="ts">
	import { resolve } from '$app/paths';
	import type { ActionData, PageData } from './$types';
	let { data, form }: { data: PageData; form: ActionData | null } = $props();
	let message = $state('');
</script>

<svelte:head>
	<title>{data.hypothesis.title} · Research hypotheses</title>
	<meta name="description" content={data.hypothesis.question} />
</svelte:head>

<main class="mx-auto max-w-6xl space-y-8 px-4 py-8 lg:px-8">
	<header class="space-y-3">
		<a class="link link-primary text-sm" href={resolve('/research/hypothesis')}>← All hypotheses</a>
		<div class="flex flex-wrap items-start justify-between gap-3">
			<div class="space-y-2">
				<p class="text-primary text-xs font-bold tracking-[.16em] uppercase">Research hypothesis</p>
				<h1 class="text-3xl font-bold">{data.hypothesis.title}</h1>
				<p class="max-w-3xl text-base opacity-75">{data.hypothesis.question}</p>
				<a class="daisy-btn daisy-btn-primary mt-2" href="#conversation">Discuss with Codex ↓</a>
			</div>
			<span class="daisy-badge daisy-badge-outline">{data.status}</span>
		</div>
	</header>

	<div class="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,24rem)]">
		<div class="order-last space-y-7 lg:order-first">
			<section
				class="rounded-box border-base-300 space-y-4 border p-5"
				aria-labelledby="overview-heading"
			>
				<div>
					<h2 id="overview-heading" class="text-xl font-semibold">Hypothesis overview</h2>
					<p class="text-xs opacity-60">
						Opening prose from the lab log; updates there appear here.
					</p>
				</div>
				{#each data.overview.paragraphs as paragraph (paragraph)}
					<p class="text-sm leading-6">{paragraph}</p>
				{/each}
				<details class="text-sm">
					<summary class="link link-primary cursor-pointer">Read the full lab log entry</summary>
					<p class="mt-2 text-xs opacity-60">lab-log/{data.overview.source}</p>
					<pre
						class="bg-base-200 mt-2 max-h-96 overflow-auto rounded p-3 text-xs whitespace-pre-wrap">{data
							.overview.markdown}</pre>
				</details>
			</section>

			{#each data.hypothesis.sections as section (section.title)}
				<section class="rounded-box bg-base-200 space-y-2 p-5">
					<h2 class="text-lg font-semibold">{section.title}</h2>
					<p class="text-sm leading-6">{section.text}</p>
					{#if section.href}<a class="link link-primary text-sm" href={resolve(section.href)}
							>Open tool →</a
						>{/if}
				</section>
			{/each}

			<section class="space-y-3" aria-labelledby="findings-heading">
				<h2 id="findings-heading" class="text-xl font-semibold">Saved findings</h2>
				{#if data.findings.length === 0}
					<p class="rounded-box border-base-300 border p-4 text-sm opacity-70">
						No findings saved on this page yet. Ask the assistant to save a specific finding once
						its evidence and limitations are clear.
					</p>
				{:else}
					<ol class="space-y-3">
						{#each data.findings as finding (finding.event_id)}
							<li class="rounded-box border-base-300 border p-4">
								<p class="text-sm leading-6">{finding.value}</p>
								<time class="mt-2 block text-xs opacity-60" datetime={finding.created_at}
									>{new Date(finding.created_at).toLocaleString()}</time
								>
							</li>
						{/each}
					</ol>
				{/if}
			</section>
		</div>

		<aside
			id="conversation"
			class="order-first space-y-4 lg:sticky lg:top-6 lg:order-last lg:self-start"
			aria-labelledby="conversation-heading"
		>
			<div class="rounded-box border-base-300 space-y-4 border p-5">
				<div>
					<h2 id="conversation-heading" class="text-xl font-semibold">Discuss this hypothesis</h2>
					<p class="text-sm opacity-70">
						Ask the local Codex assistant to change its status, save a finding, or plan an
						investigation. Status changes need an explicit request.
					</p>
				</div>
				{#if data.backupWarning}<p class="daisy-alert daisy-alert-warning text-sm">
						The change was saved, but its database snapshot could not be verified. Back up the local
						research database before continuing.
					</p>{/if}
				{#if form?.message}<p class="daisy-alert daisy-alert-error text-sm">{form.message}</p>{/if}
				<div class="max-h-96 space-y-3 overflow-y-auto" aria-live="polite">
					{#if data.messages.length === 0}<p class="text-sm opacity-60">
							No conversation yet. For example: “Mark this as investigating and outline the next
							comparison.”
						</p>{/if}
					{#each data.messages as entry (entry.message_id)}
						<div
							class={entry.role === 'user'
								? 'rounded-box bg-primary/10 ml-5 p-3 text-sm'
								: 'rounded-box bg-base-200 mr-5 p-3 text-sm'}
						>
							<p class="mb-1 text-xs font-semibold opacity-70">
								{entry.role === 'user' ? 'You' : 'Codex'}
							</p>
							<p class="whitespace-pre-wrap">{entry.content}</p>
						</div>
					{/each}
				</div>
				<form method="POST" class="space-y-2">
					<label for="hypothesis-message" class="text-sm font-medium">Message</label>
					<textarea
						id="hypothesis-message"
						name="message"
						bind:value={message}
						class="daisy-textarea daisy-textarea-bordered w-full"
						rows="4"
						maxlength="4000"
						required
						placeholder="What should we investigate or update?"
					></textarea>
					<button
						class="daisy-btn daisy-btn-primary w-full"
						type="submit"
						disabled={!message.trim()}>Send to Codex</button
					>
				</form>
				<p class="text-xs opacity-60">
					The local assistant reads this overview and recent messages. It cannot run analyses or
					create tools from this panel yet; use a Codex task for those requests.
				</p>
			</div>
		</aside>
	</div>
</main>
