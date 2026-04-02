<script lang="ts">
	import frontendPerformanceHistory from '$lib/ai/frontendPerformanceHistory';
	import {
		debugMode,
		debugMode__viewBeatsOnDanceTreepage,
		debugMode__addPlaceholderAchievement,
		pauseInPracticePage,
		debugPauseDurationSecs,
		evaluation_GoodBadTrialThreshold,
		feedback_YellowThreshold,
		feedback_GreenThreshold,
		resetSettingsToDefault,
		pauseDurationMin,
		pauseDurationMax,
		stepMin,
		stepMax,
		useAIFeedback,
		evaluation_summarizeSubsections,
		evaluation_summarizeSubsectionsOptions,
		metric__3dskeletonsimilarity__badJointStdDeviationThreshold,
		poseEstimation__interFrameIdleTimeMs,
		useTextToSpeech,
		practiceActivities__enablePerformanceRecording,
		summaryFeedback_skeleton3d_mediumPerformanceThreshold,
		summaryFeedback_skeleton3d_goodPerformanceThreshold,
		danceVideoVolume
	} from '$lib/model/settings';
	import { lerp } from '$lib/utils/math';
	import type { User } from '@supabase/supabase-js';
	import { createEventDispatcher } from 'svelte';

	export let user: User | null = null;

	let dispatch = createEventDispatcher();

	// A little mechanism for making the step sizes for the debug pause duration slider
	// increase as the value increases. This is to make it easier to select a value
	// precisely when the value is small, and easier to select a value quickly when
	// the value is large.
	let pauseDurationStep = 0.1;
	$: pauseDurationStep =
		Math.round(
			10 * lerp($debugPauseDurationSecs, pauseDurationMin, pauseDurationMax, stepMin, stepMax, true)
		) / 10;

	const qijiaScoreMin = 0;
	const qijiaScoreMax = 5;

	function clearPerformanceHistory() {
		// if (!confirm('Are you sure you want to erase all performance history?')) {
		//     return;
		// }
		frontendPerformanceHistory.clearAllHistory();
	}
</script>

<section class="settingsPage">
	<div class="group">
		<h3>General Settings</h3>
		<div class="daisy-form-control">
			<label class="daisy-label cursor-pointer justify-center gap-2">
				<span class="daisy-label-text">Debug Mode</span>
				<input
					class="daisy-toggle daisy-toggle-primary"
					type="checkbox"
					bind:checked={$debugMode}
				/>
			</label>
		</div>
	</div>
	{#if $debugMode}
		<div class="daisy-collapse daisy-collapse-arrow bg-base-200">
			<input type="checkbox" />
			<div class="text-md daisy-collapse-title font-medium">Debug Settings</div>
			<div class="daisy-collapse-content">
				<div class="daisy-form-control">
					<label class="daisy-label cursor-pointer justify-center gap-2">
						<span class="daisy-label-text">View Beats on Dance Tree Page</span>
						<input
							class="daisy-checkbox"
							type="checkbox"
							bind:checked={$debugMode__viewBeatsOnDanceTreepage}
						/>
					</label>
				</div>
				<div class="daisy-form-control">
					<label class="daisy-label cursor-pointer justify-center gap-2">
						<span class="daisy-label-text">Add placeholder achievement</span>
						<input
							class="daisy-checkbox"
							type="checkbox"
							bind:checked={$debugMode__addPlaceholderAchievement}
						/>
					</label>
				</div>
			</div>
		</div>
	{/if}
	<div class="daisy-collapse daisy-collapse-arrow bg-base-200">
		<input type="checkbox" />
		<div class="text-md daisy-collapse-title font-medium">Practice Page</div>
		<div class="daisy-collapse-content">
			{#if $debugMode}
				<div>
					<label
						class="daisy-label justify-center gap-2"
						for="poseEstimation__interFrameIdleTimeMs"
					>
						<span class="daisy-label-text">Pose Estimation Inter-Frame Idle Time</span>
						<input
							class="daisy-input daisy-input-bordered min-w-24"
							type="number"
							name="poseEstimation__interFrameIdleTimeMs"
							bind:value={$poseEstimation__interFrameIdleTimeMs}
							min={-1}
							max={100}
							step={1}
						/>
					</label>
				</div>
				<div class="daisy-form-control">
					<label class="daisy-label cursor-pointer justify-center gap-2">
						<span class="daisy-label-text">Pause Midway through Playback</span>
						<input class="daisy-toggle" type="checkbox" bind:checked={$pauseInPracticePage} />
					</label>
				</div>
				<div class="daisy-form-control">
					<label class="daisy-label justify-center gap-2">
						<span class="daisy-label-text">Pause Duration (secs)</span>
						<input
							class="daisy-input daisy-input-bordered min-w-24"
							type="number"
							bind:value={$debugPauseDurationSecs}
						/>
					</label>
				</div>
			{/if}
			<div class="daisy-form-control">
				<label class="daisy-label cursor-pointer justify-center gap-2">
					<span class="daisy-label-text">Enable Record/Review Functionality</span>
					<input
						class="daisy-toggle"
						type="checkbox"
						bind:checked={$practiceActivities__enablePerformanceRecording}
					/>
				</label>
			</div>
			<div class="daisy-form-control">
				<label class="daisy-label justify-center gap-2">
					<span class="daisy-label-text"
						>Dance Video Volume <code
							>{($danceVideoVolume * 100).toFixed(0).padStart(3, '\u00A0')}%</code
						></span
					>
					<input
						class="daisy-range daisy-range-sm min-w-32"
						type="range"
						name="danceVideoVolume"
						bind:value={$danceVideoVolume}
						min={0}
						max={1}
						step={0.01}
					/>
				</label>
			</div>
		</div>
	</div>

	{#if $debugMode}
		<div class="daisy-collapse daisy-collapse-arrow bg-base-200">
			<input type="checkbox" />
			<div class="text-md daisy-collapse-title font-medium">Terminal Feedback</div>
			<div class="daisy-collapse-content">
				<div class="daisy-form-control">
					<label class="daisy-label cursor-pointer justify-center gap-2">
						<span class="daisy-label-text">Use AI Feedback</span>
						<input class="daisy-toggle" type="checkbox" bind:checked={$useAIFeedback} />
					</label>
				</div>
				<div class="daisy-form-control">
					<label class="daisy-label cursor-pointer justify-center gap-2">
						<span class="daisy-label-text">Use Text to Speech</span>
						<input class="daisy-toggle" type="checkbox" bind:checked={$useTextToSpeech} />
					</label>
				</div>
				<div class="daisy-form-control">
					<label class="daisy-label justify-center gap-2">
						<span class="daisy-label-text"
							>(Rule Based Feedback)<br />Good/Bad Trial Threshold (2D)</span
						>
						<input
							class="daisy-input daisy-input-bordered min-w-24"
							type="number"
							name="evaluation_GoodBadTrialThreshold"
							disabled={$useAIFeedback}
							bind:value={$evaluation_GoodBadTrialThreshold}
							min={qijiaScoreMin}
							max={qijiaScoreMax}
							step={0.1}
						/>
					</label>
				</div>
				<div class="daisy-form-control">
					<label
						>Evaluate Subsections
						<select
							class="daisy-select daisy-select-bordered"
							bind:value={$evaluation_summarizeSubsections}
						>
							{#each Object.entries(evaluation_summarizeSubsectionsOptions) as [optionValue, optionTitle]}
								<option value={optionValue}>{optionTitle}</option>
							{/each}
						</select>
					</label>
				</div>
			</div>
		</div>
		<div class="daisy-collapse daisy-collapse-arrow bg-base-200">
			<input type="checkbox" />
			<div class="text-md daisy-collapse-title font-medium">Metrics Parameters</div>
			<div class="daisy-collapse-content">
				<details>
					<summary>3D Skeleton Joint Angle Similarity</summary>
					<div class="controlGrid">
						<label for="metric__3dskeletonsimilarity__badJointStdDeviationThreshold"
							>'Troublsome Joint' Threshold</label
						>
						<input
							class="outlined thin"
							type="number"
							name="summaryFeedback_skeleton3d_mediumPerformanceThreshold"
							bind:value={$metric__3dskeletonsimilarity__badJointStdDeviationThreshold}
							min={0}
							max={3.0}
							step={0.05}
						/>
						<span class="note">
							Used to determine which joints get reported to the LLM as "troublesome joints"
						</span>

						<label for="summaryFeedback_skeleton3d_mediumPerformanceThreshold"
							>3D Angle - Yellow Threshold</label
						>
						<input
							class="outlined thin"
							type="number"
							name="summaryFeedback_skeleton3d_mediumPerformanceThreshold"
							bind:value={$summaryFeedback_skeleton3d_mediumPerformanceThreshold}
							min={0}
							max={1}
							step={0.01}
						/>
						<span class="note">This is used for bar coloring</span>

						<label for="summaryFeedback_skeleton3d_goodPerformanceThreshold"
							>3D Angle - Green Threshold</label
						>
						<input
							class="outlined thin"
							type="number"
							name="summaryFeedback_skeleton3d_goodPerformanceThreshold"
							bind:value={$summaryFeedback_skeleton3d_goodPerformanceThreshold}
							min={0}
							max={1}
							step={0.01}
						/>
						<span class="note">This is used for bar coloring</span>
					</div>
				</details>
				<details>
					<summary>2D Skeleton Vector Similarity (Qijia's Method)</summary>
					<div class="controlGrid">
						<label for="feedback_YellowThreshold">Yellow Threshold</label>
						<input
							class="outlined thin daisy-input daisy-input-xs"
							type="number"
							name="feedback_YellowThreshold"
							bind:value={$feedback_YellowThreshold}
							min={qijiaScoreMin}
							max={qijiaScoreMax}
							step={0.1}
						/>
						<span class="note">This is used for live feedback color coding</span>

						<label for="feedback_GreenThreshold">Green Threshold</label>
						<input
							class="outlined thin daisy-input daisy-input-xs"
							type="number"
							name="feedback_GreenThreshold"
							bind:value={$feedback_GreenThreshold}
							min={qijiaScoreMin}
							max={qijiaScoreMax}
							step={0.1}
						/>
						<span class="note">This is used for live feedback color coding</span>
					</div>
				</details>
			</div>
		</div>
		<div>
			<button
				class="daisy-btn"
				disabled={Object.keys($frontendPerformanceHistory).length === 0}
				on:click={clearPerformanceHistory}>Clear Performance History</button
			>
		</div>
	{/if}
	{#if user}
		<div class="group">
			<h3>Account</h3>
			<code class="text-base-content">{user.email}</code>
			<form method="post" action="/account?/signout">
				<div class="daisy-join">
					<button class="daisy-btn daisy-join-item" on:click={resetSettingsToDefault}
						>Reset Settings</button
					>
					<a
						tabindex="0"
						class="daisy-btn daisy-join-item"
						on:click={() => dispatch('navigate', '/account')}
						href="/account"
						aria-label="Account Page">Edit Account</a
					>
					<button class="daisy-btn daisy-btn-error daisy-join-item">Sign Out</button>
				</div>
			</form>
		</div>
	{/if}
</section>

<style lang="scss">
	.settingsPage {
		width: 100%;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: flex-start;
		height: var(--content_height);
		padding: 1rem;
		box-sizing: border-box;
		gap: 0.5rem;
	}
	div.group {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: flex-start;
		gap: 0.5rem;
		width: 100%;
		// border: 1px solid lightgray;
		padding: 1rem;
		box-sizing: border-box;

		& h3 {
			font-size: 1em;
			margin: 0;
			border-bottom: 1px solid lightgray;
		}
	}

	div.group > div,
	details > div {
		display: flex;
		flex-direction: row;
		align-items: center;
		gap: 0.5rem;
	}

	details {
		margin: 0.5em auto;
		text-align: center;
	}

	details summary {
		cursor: pointer;

		&:hover {
			text-decoration: underline;
		}
	}

	.note {
		font-size: 0.8em;
		color: gray;
		margin-top: -0.6em;
		margin-bottom: 0.25em;
		white-space: pre-line;
	}

	.controlGrid {
		font-size: 0.8em;
		margin: 0.5em auto;
		display: inline-grid;
		grid-template-columns: auto 1fr;
	}

	.controlGrid label {
		grid-column: 1;
		justify-self: flex-end;
		align-self: center;
	}
	.controlGrid input {
		grid-column: 2;
		justify-self: flex-start;
		align-self: center;
	}
	.controlGrid .note {
		grid-column: 1 / span 2;
	}

	input[type='number'] {
		width: 4em;
		font-size: 1em;
	}

	input[type='range'] {
		width: 7em;
	}
</style>
