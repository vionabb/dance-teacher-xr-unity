<script lang="ts">
	import type { UserEvaluationRecorder } from '$lib/ai/Evaluation';

	type EvaluationRecord = Record<string, any>;
	export let evaluationRecorder: UserEvaluationRecorder<EvaluationRecord> | null = null;
	export let trackId: string | null = null;
</script>

<div class="reviewPage"></div>

<style lang="scss">
</style>
