<script lang="ts">
	import type { UserEvaluationRecorder, PerformanceEvaluationTrack } from '$lib/ai/Evaluation';

	type EvaluationRecord = Record<string, any>;
	export let evaluationRecorder: UserEvaluationRecorder<EvaluationRecord> | null = null;
	export let trackId: string | null = null;

	// evaluationRecorder?.tracks.get(trackId ?? '')?.evaluation['foo'].push(1);

	let reviewTrack: PerformanceEvaluationTrack<EvaluationRecord> | null = null;

	// Keep the reviewTrack updated
	$: {
		if (trackId) {
			reviewTrack = evaluationRecorder?.tracks.get(trackId) ?? null;
		} else {
			reviewTrack = null;
		}
	}
</script>

<div class="reviewPage"></div>

<style lang="scss">
</style>
